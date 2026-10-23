import type * as Monaco from "monaco-editor";
import expand from "emmet";

// Standard HTML tags for suggestion catalogs
export const COMMON_HTML_TAGS = [
  "div", "section", "span", "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "button", "a", "main", "article", "aside", "header", "footer", "nav",
  "form", "input", "textarea", "select", "option", "optgroup", "label",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "pre", "code", "blockquote", "strong", "em", "b", "i", "small", "mark", "time", "kbd",
  "img", "video", "audio", "source", "track", "canvas", "iframe", "figure", "figcaption",
  "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "text", "defs",
  "details", "summary", "dialog", "fieldset", "legend", "datalist", "output", "progress",
  "hr", "br", "Fragment", "Suspense"
];

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "import", "export", "from",
  "default", "class", "extends", "if", "else", "for", "while", "do",
  "switch", "case", "break", "continue", "new", "this", "super", "try",
  "catch", "finally", "throw", "typeof", "instanceof", "void", "delete",
  "in", "of", "async", "await", "yield", "null", "undefined", "true", "false",
  "interface", "type", "namespace", "as", "is", "keyof", "readonly"
]);

export type EmmetSyntax = "html" | "jsx" | "css";

export function getSyntaxForLanguage(languageId: string): EmmetSyntax {
  if (languageId === "css") return "css";
  if (languageId === "html") return "html";
  return "jsx"; // typescript, javascript, jsx, tsx
}

/**
 * Returns the snippet template for an HTML tag with cursor tab-stops placed between tags.
 */
export function getTagSnippet(tag: string, syntax: EmmetSyntax): string {
  const isJsx = syntax === "jsx";
  const tagLower = tag.toLowerCase();

  if (tag === "Fragment") {
    return "<>$0</>";
  }
  if (tagLower === "img") {
    return isJsx ? '<img src="$1" alt="$2" />$0' : '<img src="$1" alt="$2">$0';
  }
  if (tagLower === "input") {
    return isJsx ? '<input type="${1:text}" $0/>' : '<input type="${1:text}" $0>';
  }
  if (tagLower === "a") {
    return '<a href="$1">$0</a>';
  }
  if (tagLower === "form") {
    return '<form action="$1">$0</form>';
  }
  if (tagLower === "br") {
    return isJsx ? '<br />$0' : '<br>$0';
  }
  if (tagLower === "hr") {
    return isJsx ? '<hr />$0' : '<hr>$0';
  }
  if (VOID_ELEMENTS.has(tagLower)) {
    return isJsx ? `<${tag} $0/>` : `<${tag}$0>`;
  }
  return `<${tag}>$0</${tag}>`;
}

/**
 * Converts expanded markup with empty tags into snippet tabstops.
 */
function convertMarkupToSnippet(expanded: string): string {
  const matches = (expanded.match(/><\//g) || []).length;
  if (matches === 1) {
    return expanded.replace(/><\//, ">$0</");
  }
  if (matches > 1) {
    let i = 1;
    return expanded.replace(/><\//g, () => `>\${${i++}}</`);
  }
  return expanded;
}

/**
 * Expands an Emmet abbreviation into a snippet with cursor / tab stop fields.
 */
export function expandEmmetAbbreviation(
  abbr: string,
  syntax: EmmetSyntax
): string | null {
  try {
    if (JS_KEYWORDS.has(abbr)) {
      return null;
    }

    const isStyle = syntax === "css";
    const expanded = expand(abbr, {
      syntax,
      type: isStyle ? "stylesheet" : "markup",
      options: {
        "output.field": (idx: number, ph: string) => (ph ? `\${${idx}:${ph}}` : `\${${idx}}`),
        "jsx.enabled": syntax === "jsx",
      },
    });

    if (expanded && expanded !== abbr) {
      return convertMarkupToSnippet(expanded);
    }
  } catch {
    // Invalid Emmet abbreviation syntax
  }
  return null;
}

/**
 * Scans backwards from the cursor column on a line to extract a candidate Emmet abbreviation.
 */
export function extractAbbreviation(
  lineText: string,
  cursorCol: number,
  syntax: EmmetSyntax = "jsx"
): { abbr: string; startColumn: number; endColumn: number; expanded: string } | null {
  const textBefore = lineText.substring(0, cursorCol - 1);
  if (!textBefore.trim()) return null;

  // 1. Comments and closing tags check
  if (
    textBefore.trim().startsWith("//") ||
    textBefore.trim().startsWith("/*") ||
    /<\/[a-zA-Z0-9_\-]*$/.test(textBefore)
  ) {
    return null;
  }

  // 2. Inside attributes check: <tag attr="...
  const lastOpen = textBefore.lastIndexOf("<");
  const lastClose = textBefore.lastIndexOf(">");
  if (lastOpen !== -1 && lastClose < lastOpen) {
    if (lastOpen < textBefore.length - 1 && !/<[a-zA-Z0-9_\-]+$/.test(textBefore)) {
      return null;
    }
  }

  // 3. Scan backwards to find abbreviation boundary
  let i = textBefore.length - 1;
  let inBrackets = 0; // [...]
  let inBraces = 0;   // {...}
  let inParens = 0;   // (...)

  while (i >= 0) {
    const ch = textBefore[i];
    if (ch === "]") inBrackets++;
    else if (ch === "[") {
      if (inBrackets > 0) inBrackets--;
      else break;
    } else if (ch === "}") inBraces++;
    else if (ch === "{") {
      if (inBraces > 0) inBraces--;
      else break;
    } else if (ch === ")") inParens++;
    else if (ch === "(") {
      if (inParens > 0) inParens--;
      else break;
    } else if (inBrackets === 0 && inBraces === 0 && inParens === 0) {
      if (/[\s"'=;,`$]/.test(ch)) {
        break;
      }
      if (ch === "<") {
        break;
      }
    }
    i--;
  }

  let candidate = textBefore.substring(i + 1).trim();
  // Strip leading symbols
  candidate = candidate.replace(/^[^a-zA-Z0-9_#.(]+/, "");

  if (!candidate || candidate.length < 1) return null;

  const expanded = expandEmmetAbbreviation(candidate, syntax);
  if (expanded) {
    return {
      abbr: candidate,
      startColumn: cursorCol - candidate.length,
      endColumn: cursorCol,
      expanded,
    };
  }

  return null;
}

let registeredDisposables: Monaco.IDisposable[] = [];

/**
 * Registers VS Code-style HTML, JSX, TSX, and CSS Emmet and Tag Completion providers.
 */
export function registerHtmlJsxTagCompletion(monaco: typeof Monaco): void {
  registeredDisposables.forEach((d) => d.dispose());
  registeredDisposables = [];

  const languages = [
    { id: "html", syntax: "html" as EmmetSyntax },
    { id: "typescript", syntax: "jsx" as EmmetSyntax },
    { id: "javascript", syntax: "jsx" as EmmetSyntax },
    { id: "css", syntax: "css" as EmmetSyntax },
  ];

  // 1. Configure Language Rules for multi-line tag splitting on Enter:
  // When cursor is inside <tag>|</tag> and Enter is pressed,
  // Monaco will automatically split and indent:
  // <tag>
  //     |
  // </tag>
  for (const { id: lang } of languages) {
    if (lang !== "css") {
      monaco.languages.setLanguageConfiguration(lang, {
        onEnterRules: [
          {
            // Matches: <tag ...> and </tag> (even with arrow functions or complex props)
            beforeText: /<([_a-zA-Z0-9]+)(?:\s+[^<]*?)?>$/,
            afterText: /^<\/([_a-zA-Z0-9]+)>/,
            action: {
              indentAction: monaco.languages.IndentAction.IndentOutdent,
            },
          },
          {
            // Matches: <> and </>
            beforeText: /<>$|(?:\s+<>)$/,
            afterText: /^<\/>/,
            action: {
              indentAction: monaco.languages.IndentAction.IndentOutdent,
            },
          },
        ],
      });
    }
  }

  // 2. Register Completion Item Provider
  for (const { id: lang, syntax } of languages) {
    const disposable = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ["<", "/", ".", ">", ":", "@", "#", "!"],

      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeCursor = lineContent.substring(0, position.column - 1);

        // Check if cursor is typing a closing tag: </...
        if (/<\/[a-zA-Z0-9_\-]*$/.test(textBeforeCursor)) {
          return { suggestions: [] };
        }

        // Check if cursor is inside comments
        const trimmedBefore = textBeforeCursor.trim();
        if (
          trimmedBefore.startsWith("//") ||
          trimmedBefore.startsWith("/*") ||
          trimmedBefore.startsWith("<!--")
        ) {
          return { suggestions: [] };
        }

        // Check if cursor is inside attribute strings: e.g. <div className="..."
        const lastOpenAngle = textBeforeCursor.lastIndexOf("<");
        const lastCloseAngle = textBeforeCursor.lastIndexOf(">");
        const hasOpeningBracket = lastOpenAngle !== -1 && lastCloseAngle < lastOpenAngle;

        const word = model.getWordUntilPosition(position);
        if (hasOpeningBracket && lastOpenAngle < word.startColumn - 2) {
          // Inside tag attributes, don't show tag completion
          return { suggestions: [] };
        }

        const suggestions: Monaco.languages.CompletionItem[] = [];

        // Check for compound Emmet abbreviation (e.g. div.container, ul>li*3, button.primary)
        const hasCompoundOperator = /[.#>+*\[\]{}]/.test(textBeforeCursor.slice(-30));
        if (hasCompoundOperator) {
          const extracted = extractAbbreviation(lineContent, position.column, syntax);
          if (extracted && /[.#>+*\[\]{}]/.test(extracted.abbr)) {
            const range = new monaco.Range(
              position.lineNumber,
              extracted.startColumn,
              position.lineNumber,
              extracted.endColumn
            );

            const previewClean = extracted.expanded
              .replace(/\$\{\d+(?::([^}]+))?\}/g, "$1")
              .replace(/\$\d+/g, "");

            suggestions.push({
              label: extracted.abbr,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              insertText: extracted.expanded,
              detail: "Emmet Abbreviation",
              documentation: {
                value: `**Emmet Abbreviation**\n\n\`\`\`${syntax === "css" ? "css" : "html"}\n${previewClean}\n\`\`\``,
              },
              range,
              sortText: "!00000_emmet",
              filterText: extracted.abbr,
              preselect: true,
            });
          }
        }

        // HTML and JSX/TSX tag catalog completions
        if (syntax !== "css") {
          const charBeforeWord = word.startColumn > 1 ? lineContent.charAt(word.startColumn - 2) : "";
          const startsWithAngle = charBeforeWord === "<";
          const replaceStartColumn = startsWithAngle ? word.startColumn - 1 : word.startColumn;
          const replaceEndColumn = position.column;

          const range = new monaco.Range(
            position.lineNumber,
            replaceStartColumn,
            position.lineNumber,
            replaceEndColumn
          );

          const currentWordLower = word.word.toLowerCase();

          for (const tag of COMMON_HTML_TAGS) {
            const tagLower = tag.toLowerCase();
            // Match tag if no word typed (e.g. user typed `<`) or tag starts with typed word
            if (!currentWordLower || tagLower.startsWith(currentWordLower)) {
              const snippetText = getTagSnippet(tag, syntax);
              const preview = snippetText
                .replace(/\$\{\d+(?::([^}]+))?\}/g, "$1")
                .replace(/\$\d+/g, "");

              const isExactMatch = currentWordLower === tagLower;
              const filterText = startsWithAngle ? `<${tag}` : tag;
              const label = startsWithAngle ? `<${tag}>` : tag;

              suggestions.push({
                label,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                insertText: snippetText,
                detail: preview,
                documentation: {
                  value: `**HTML \`<${tag}>\` Element**\n\n\`\`\`html\n${preview}\n\`\`\``,
                },
                range,
                sortText: isExactMatch ? `!0000_${tag}` : `!0001_${tag}`,
                filterText,
                preselect: isExactMatch,
              });
            }
          }

          // Dynamic support for custom React components (e.g. Card, Modal, Sidebar)
          if (word.word && /^[A-Z][a-zA-Z0-9]*$/.test(word.word) && !COMMON_HTML_TAGS.includes(word.word)) {
            const comp = word.word;
            suggestions.push({
              label: startsWithAngle ? `<${comp}>` : comp,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              insertText: `<${comp}>$0</${comp}>`,
              detail: `<${comp}>...</${comp}>`,
              documentation: {
                value: `**Component \`<${comp}>\`**\n\n\`\`\`tsx\n<${comp}>\n  $0\n</${comp}>\n\`\`\``,
              },
              range,
              sortText: `!0000_${comp}`,
              filterText: startsWithAngle ? `<${comp}` : comp,
              preselect: true,
            });

            suggestions.push({
              label: startsWithAngle ? `<${comp} />` : `${comp} /`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              insertText: `<${comp} $0/>`,
              detail: `<${comp} />`,
              documentation: {
                value: `**Self-closing \`<${comp} />\`**\n\n\`\`\`tsx\n<${comp} />\n\`\`\``,
              },
              range,
              sortText: `!0001_${comp}`,
              filterText: startsWithAngle ? `<${comp}` : comp,
            });
          }
        }

        return { suggestions };
      },
    });

    registeredDisposables.push(disposable);
  }
}

/**
 * Binds Tab key for Emmet expansion when the autocomplete suggestion widget is NOT visible.
 * If text before the cursor is a valid Emmet abbreviation (e.g. div.container, ul>li*3),
 * it expands it directly using Monaco's snippet controller.
 * Otherwise, it falls back to normal Tab indentation without recursion.
 */
export function setupEmmetTabExpansion(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
): Monaco.IDisposable {
  const command = editor.addCommand(
    monaco.KeyCode.Tab,
    () => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const syntax = getSyntaxForLanguage(model.getLanguageId());
      const extracted = extractAbbreviation(lineContent, position.column, syntax);

      if (extracted) {
        // Expand using Monaco's built-in snippet controller
        const snippetController = (
          editor as unknown as {
            getContribution: (id: string) => {
              insert?: (s: string, opts?: { range?: Monaco.Range; overwriteBefore?: number }) => void;
            };
          }
        ).getContribution("snippetController2");

        const range = new monaco.Range(
          position.lineNumber,
          extracted.startColumn,
          position.lineNumber,
          extracted.endColumn
        );

        if (snippetController?.insert) {
          snippetController.insert(extracted.expanded, { range });
          return;
        }

        // Fallback: execute edits and place cursor
        const cleanText = extracted.expanded
          .replace(/\$\{\d+(?::([^}]+))?\}/g, "$1")
          .replace(/\$\d+/g, "");
        editor.executeEdits("emmet-expand", [{ range, text: cleanText }]);
        return;
      }

      // Normal Tab indentation fallback (insert configured spaces or tab character)
      const tabSize = model.getOptions().tabSize || 2;
      const insertSpaces = model.getOptions().insertSpaces;
      const indentStr = insertSpaces ? " ".repeat(tabSize) : "\t";
      editor.trigger("keyboard", "type", { text: indentStr });
    },
    "!suggestWidgetVisible"
  );

  return {
    dispose: () => {
      // Disposed when editor unmounts
    },
  };
}

/**
 * Attaches automatic tag closing listener when user types `>` on an opening tag.
 */
export function setupAutoCloseTagOnTyping(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco
): Monaco.IDisposable {
  return editor.onDidChangeModelContent((event) => {
    for (const change of event.changes) {
      if (change.text === ">") {
        const model = editor.getModel();
        if (!model) continue;

        const position = editor.getPosition();
        if (!position) continue;

        const lineContent = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column);

        // Don't auto-close self-closing tags (/>) or closing tags (</...)
        if (textBefore.endsWith("/>") || /<\/[a-zA-Z0-9_\-]*>$/.test(textBefore)) {
          continue;
        }

        // Match opening tag ending with >
        const match = textBefore.match(/<([a-zA-Z][a-zA-Z0-9_\-]*)(?:\s+[^<>]*)?>$/);
        if (match) {
          const tagName = match[1];
          if (VOID_ELEMENTS.has(tagName.toLowerCase())) {
            continue;
          }

          const closingTag = `</${tagName}>`;
          editor.executeEdits("auto-close-tag", [
            {
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              ),
              text: closingTag,
            },
          ]);

          // Keep cursor between opening and closing tag
          editor.setPosition(position);
        }
      }
    }
  });
}
