import { Router, Request, Response } from "express";
import { checkRateLimit, getClientIp } from "../services/rateLimit";

const router = Router();

interface FileContext {
  path: string;
  name: string;
  content: string;
  language: string;
}

interface RequestBody {
  prompt: string;
  provider?: "openai" | "anthropic" | "gemini";
  activeFile?: FileContext | null;
  relevantFiles?: FileContext[];
  history?: { role: string; content: string }[];
}

function sanitizeError(text: string, keys: (string | undefined)[]): string {
  let sanitized = text;
  for (const k of keys) {
    if (k && k.length > 5) {
      sanitized = sanitized.replaceAll(k, "[REDACTED]");
    }
  }
  return sanitized;
}

function extractDiffsAndText(rawText: string): {
  text: string;
  diffs: { filePath: string; summary: string; newContent: string }[];
} {
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    return { text: rawText, diffs: [] };
  }

  try {
    const parsedJson = JSON.parse(jsonMatch[1]);
    const diffs = Array.isArray(parsedJson.proposedDiffs)
      ? parsedJson.proposedDiffs
      : [];
    const textClean = rawText.replace(/```json\s*[\s\S]*?\s*```/, "").trim();
    return { text: textClean, diffs };
  } catch {
    return { text: rawText, diffs: [] };
  }
}

async function handleOpenAI(
  apiKey: string,
  prompt: string,
  activeFile: FileContext | null | undefined,
  relevantFiles: FileContext[],
  history: { role: string; content: string }[],
  res: Response
) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const systemPrompt = `You are Code Editor AI, an expert software developer assisting within a browser-based IDE.
When asked to modify, refactor, or generate code:
1. Provide a clear, concise explanation.
2. If files should be updated, provide your file changes in a JSON block at the very end of your response, formatted exactly like:
\`\`\`json
{
  "proposedDiffs": [
    {
      "filePath": "src/App.tsx",
      "summary": "Brief summary of changes",
      "newContent": "...complete new file content..."
    }
  ]
}
\`\`\`
Active file: ${activeFile ? `${activeFile.path} (${activeFile.language})` : "None"}
${
  activeFile?.content
    ? `\nActive file contents:\n\`\`\`\n${activeFile.content}\n\`\`\`\n`
    : ""
}
Relevant project files:
${relevantFiles
  .map((f) => `- ${f.path}\n\`\`\`\n${f.content.slice(0, 1000)}\n\`\`\``)
  .join("\n")}
`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content,
    })),
    { role: "user", content: prompt },
  ];

  const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    return res.status(apiRes.status).json({
      error: `OpenAI provider error (${apiRes.status}): ${sanitizeError(errText, [apiKey])}`,
    });
  }

  const data: any = await apiRes.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  const parsed = extractDiffsAndText(rawText);

  return res.json({
    configured: true,
    provider: "OpenAI (" + model + ")",
    content: parsed.text,
    proposedDiffs: parsed.diffs,
  });
}

async function handleAnthropic(
  apiKey: string,
  prompt: string,
  activeFile: FileContext | null | undefined,
  relevantFiles: FileContext[],
  history: { role: string; content: string }[],
  res: Response
) {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;

  const systemPrompt = `You are Code Editor AI, an expert developer in an online IDE.
If code modifications are requested, include proposed file diffs in a JSON block at the end:
\`\`\`json
{
  "proposedDiffs": [
    {
      "filePath": "${activeFile?.path || "src/App.tsx"}",
      "summary": "Brief summary",
      "newContent": "...complete new file content..."
    }
  ]
}
\`\`\`
Active file: ${activeFile ? activeFile.path : "None"}
${activeFile ? `\nContents:\n\`\`\`\n${activeFile.content}\n\`\`\`` : ""}
`;

  const messages = [
    ...history.slice(-4).map((h) => ({
      role: h.role === "assistant" ? "assistant" : ("user" as const),
      content: h.content,
    })),
    { role: "user" as const, content: prompt },
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (workspaceId) {
    headers["anthropic-workspace-id"] = workspaceId;
  }

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages,
      max_tokens: 4096,
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    return res.status(apiRes.status).json({
      error: `Anthropic provider error (${apiRes.status}): ${sanitizeError(errText, [apiKey, workspaceId])}`,
    });
  }

  const data: any = await apiRes.json();
  const rawText = data.content?.[0]?.text || "";
  const parsed = extractDiffsAndText(rawText);

  return res.json({
    configured: true,
    provider: "Anthropic (" + model + ")",
    content: parsed.text,
    proposedDiffs: parsed.diffs,
  });
}

async function handleGemini(
  apiKey: string,
  prompt: string,
  activeFile: FileContext | null | undefined,
  relevantFiles: FileContext[],
  history: { role: string; content: string }[],
  res: Response
) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const promptText = `You are Code Editor AI in an online IDE.
User prompt: ${prompt}
Active file: ${activeFile?.path || "None"}
${activeFile ? `Active file content:\n\`\`\`\n${activeFile.content}\n\`\`\`` : ""}
Relevant files:
${relevantFiles.map((f) => `- ${f.path}`).join("\n")}

Chat history context:
${history.map((h) => `${h.role}: ${h.content}`).join("\n")}

If you propose file changes, include them in a valid JSON block at the end:
\`\`\`json
{
  "proposedDiffs": [
    {
      "filePath": "${activeFile?.path || "src/App.tsx"}",
      "summary": "Summary of update",
      "newContent": "complete new content"
    }
  ]
}
\`\`\`
`;

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    return res.status(apiRes.status).json({
      error: `Gemini provider error (${apiRes.status}): ${sanitizeError(errText, [apiKey])}`,
    });
  }

  const data: any = await apiRes.json();
  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received";
  const parsed = extractDiffsAndText(rawText);

  return res.json({
    configured: true,
    provider: "Google Gemini (" + model + ")",
    content: parsed.text,
    proposedDiffs: parsed.diffs,
  });
}

function handleUnconfiguredKey(
  prompt: string,
  activeFile: FileContext | null | undefined,
  res: Response
) {
  const lower = prompt.toLowerCase();
  let explanation = "";
  const diffs: { filePath: string; summary: string; newContent: string }[] = [];

  if (activeFile && (lower.includes("explain") || lower.includes("what does this do"))) {
    explanation = `### Explanation for \`${activeFile.path}\`\n\nThis file is written in **${activeFile.language}** and contains **${activeFile.content.split("\n").length} lines**.\n\nKey highlights:\n- Defines component/module logic for the active project.\n- Handles client-side state and rendering.\n- Integrates with the browser-based live preview.\n\n*(Note: Live external AI provider key not configured. Add \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` in \`.env\` to connect Claude or GPT-4o).*`;
  } else if (
    activeFile &&
    (lower.includes("add") ||
      lower.includes("button") ||
      lower.includes("fix") ||
      lower.includes("refactor") ||
      lower.includes("style"))
  ) {
    explanation = `I've prepared a code modification for \`${activeFile.path}\` based on your instruction. Review the proposed diff below and click **Accept Changes** to apply it to your workspace.`;

    let updatedContent = activeFile.content;
    if (activeFile.name.endsWith(".tsx") || activeFile.name.endsWith(".jsx")) {
      if (!updatedContent.includes("Reset Counter")) {
        updatedContent = updatedContent.replace(
          /<\/div>\s*<\/div>\s*<div style=\{\{ background: "#ffffff"/,
          `  <button onClick={() => setCount(0)} style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontWeight: 600 }}>Reset</button>\n        </div>\n      </div>\n      <div style={{ background: "#ffffff"`
        );
      }
    } else if (activeFile.name.endsWith(".html")) {
      updatedContent = updatedContent.replace(
        /<\/div>\s*<\/body>/,
        `  <div style="margin-top: 1rem; padding: 0.5rem; background: #f3f0ff; color: #6c5ce7; border-radius: 8px; font-size: 0.85rem; text-align: center;">✦ Enhanced with Code Editor AI</div>\n  </div>\n</body>`
      );
    }

    diffs.push({
      filePath: activeFile.path,
      summary: `Updated ${activeFile.name} with requested enhancement`,
      newContent: updatedContent,
    });
  } else {
    explanation = `### AI Coding Assistant Ready\n\nI can assist you with:\n- **Explaining code:** Ask *"Explain this file"* to get architecture breakdown.\n- **Refactoring:** Ask to *"Add a reset button"* or *"Add responsive styling"*.\n- **Error diagnosis:** Ask *"How do I fix errors in terminal?"*\n\n> **Tip:** To enable live responses from Claude 3.5 or GPT-4o, set \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` in your \`.env\` file. Full diff review and file modification tools are currently active.`;
  }

  return res.json({
    configured: false,
    content: explanation,
    proposedDiffs: diffs,
    notice:
      "To connect live LLMs (OpenAI, Claude, or Gemini), define provider API keys in .env",
  });
}

// POST /api/ai
router.post("/", async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, {
      bucketName: "ai-completions",
      windowMs: 60_000,
      max: 20,
    });

    if (!rateCheck.success) {
      const retryAfterSec = Math.ceil(rateCheck.resetMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: `Too many AI requests. Please wait ${retryAfterSec} seconds before trying again.`,
      });
    }

    const body = req.body as RequestBody;
    const { prompt, provider, activeFile, relevantFiles = [], history = [] } = body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "A valid prompt is required." });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (provider === "openai") {
      if (!openaiKey) {
        return res.status(400).json({ error: "OpenAI is not configured. Please set OPENAI_API_KEY." });
      }
      return await handleOpenAI(openaiKey, prompt, activeFile, relevantFiles, history, res);
    }

    if (provider === "anthropic") {
      if (!anthropicKey) {
        return res.status(400).json({ error: "Anthropic is not configured. Please set ANTHROPIC_API_KEY." });
      }
      return await handleAnthropic(anthropicKey, prompt, activeFile, relevantFiles, history, res);
    }

    if (provider === "gemini") {
      if (!geminiKey) {
        return res.status(400).json({ error: "Gemini is not configured. Please set GEMINI_API_KEY." });
      }
      return await handleGemini(geminiKey, prompt, activeFile, relevantFiles, history, res);
    }

    if (geminiKey) {
      return await handleGemini(geminiKey, prompt, activeFile, relevantFiles, history, res);
    }

    if (openaiKey) {
      return await handleOpenAI(openaiKey, prompt, activeFile, relevantFiles, history, res);
    }

    if (anthropicKey) {
      return await handleAnthropic(anthropicKey, prompt, activeFile, relevantFiles, history, res);
    }

    return handleUnconfiguredKey(prompt, activeFile, res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal AI service error";
    console.error("AI API Error:", message);
    return res.status(500).json({ error: message });
  }
});

export default router;
