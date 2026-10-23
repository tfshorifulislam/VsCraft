import React from "react";
import {
  FileCode,
  Layers,
  Sparkles,
  CheckCircle2,
  Check,
  Zap,
  RotateCw,
} from "lucide-react";

export default function ProductShowcase() {
  return (
    <section id="features" className="landing-section bg-[var(--color-surface)]">
      <div className="landing-container">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="landing-eyebrow mb-3 sm:mb-4">
            <Layers className="w-3.5 h-3.5" />
            <span>Product Highlights</span>
          </div>
          <h2 className="landing-section-title">
            From first prompt to finished product.
          </h2>
          <p className="landing-paragraph mt-3 sm:mt-4">
            A developer workspace designed for clarity and speed. Everything you
            need to write, review, and preview web projects in one browser tab.
          </p>
        </div>

        {/* Feature Stories Container */}
        <div className="space-y-14 sm:space-y-20">
          {/* Story A: Code without friction (Text Left, Visual Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Story A Text */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-neutral-100 text-[var(--color-foreground)] text-xs font-mono font-medium">
                <FileCode className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>WORKSPACE CORE</span>
              </div>
              <h3 className="landing-card-title text-2xl sm:text-3xl">
                Code without friction
              </h3>
              <p className="landing-paragraph">
                A focused, browser-based development workspace. Organize complex
                projects with a clean interface that gets out of your way.
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  "Syntax highlighting across all your project files",
                  "Multiple files and tabs with instant switching",
                  "Full file explorer with nested folder hierarchies",
                  "Clean development environment without local setup fatigue",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                    <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Story A Visual */}
            <div className="lg:col-span-7">
              <div className="landing-card bg-[var(--color-code-background)] p-4 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                {/* Visual Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#222938] mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <span className="w-3 h-3 rounded-full bg-[var(--color-success)]/80" />
                    <span className="ml-2 text-xs font-mono text-neutral-400">
                      src/components/Header.tsx
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                    <span className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-[#1B2232] text-neutral-300">
                      TypeScript
                    </span>
                  </div>
                </div>

                {/* Split mini representation */}
                <div className="grid grid-cols-12 gap-3 font-mono text-xs">
                  {/* Mini File Tree */}
                  <div className="col-span-4 bg-[#141A26] p-3 rounded-[var(--radius-md)] border border-[#202838] space-y-2 select-none hidden sm:block">
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                      Files
                    </div>
                    <div className="text-neutral-400 space-y-1 text-[11px]">
                      <div className="text-neutral-200 font-medium">📁 components</div>
                      <div className="pl-3 text-[var(--color-success)]">📄 Header.tsx</div>
                      <div className="pl-3">📄 Button.tsx</div>
                      <div className="pl-3">📄 Card.tsx</div>
                      <div className="text-neutral-400">📁 hooks</div>
                      <div className="text-neutral-400">📄 package.json</div>
                    </div>
                  </div>

                  {/* Code Block */}
                  <div className="col-span-12 sm:col-span-8 bg-[#121622] p-4 rounded-[var(--radius-md)] border border-[#202838] overflow-x-auto text-[var(--color-code-foreground)]">
                    <pre className="text-xs font-mono leading-relaxed">
                      <code>
                        <span className="text-[var(--color-syntax-keyword)]">export function</span>{" "}
                        <span className="text-[var(--color-syntax-component)]">Header</span>(&#123; title &#125;) &#123;{"\n"}
                        {"  "}
                        <span className="text-[var(--color-syntax-keyword)]">return</span> ({"\n"}
                        {"    "}&lt;<span className="text-[var(--color-syntax-component)]">header</span>{" "}
                        <span className="text-[var(--color-syntax-prop)]">className</span>=
                        <span className="text-[var(--color-syntax-string)]">&quot;flex items-center&quot;</span>&gt;{"\n"}
                        {"      "}&lt;<span className="text-[var(--color-syntax-component)]">h1</span>&gt;&#123;title&#125;&lt;/
                        <span className="text-[var(--color-syntax-component)]">h1</span>&gt;{"\n"}
                        {"      "}&lt;<span className="text-[var(--color-syntax-component)]">StatusIndicator</span> /&gt;{"\n"}
                        {"    "}&lt;/<span className="text-[var(--color-syntax-component)]">header</span>&gt;{"\n"}
                        {"  "});{"\n"}
                        &#125;
                      </code>
                    </pre>
                    <div className="mt-4 pt-3 border-t border-[#202838] flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="text-[var(--color-success)] flex items-center gap-1">
                        <Check className="w-3 h-3" /> Clean AST Validated
                      </span>
                      <span>Ln 12, Col 4</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Story B: An AI that actually helps (Visual Left, Text Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Story B Visual (Alternating left position) */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="landing-card p-5 sm:p-7 shadow-xl space-y-4">
                {/* AI Review Header */}
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-primary)] flex items-center justify-center text-white">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
                        AI Code Modification Review
                      </h4>
                      <p className="text-xs landing-muted">
                        3 files proposed • 2 insertions, 1 deletion
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    Ready to Apply
                  </span>
                </div>

                {/* Diff Viewer Representation */}
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden font-mono text-xs">
                  <div className="bg-neutral-50 px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between text-neutral-600 text-[11px]">
                    <span className="font-semibold text-[var(--color-foreground)]">
                      src/lib/api.ts
                    </span>
                    <span className="landing-muted">Unified Diff</span>
                  </div>
                  <div className="p-3 bg-neutral-900 text-neutral-200 space-y-1">
                    <div className="text-neutral-500">@@ -14,4 +14,7 @@ async function fetchData()</div>
                    <div className="text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded-[var(--radius-sm)]">
                      - const response = await fetch(url);
                    </div>
                    <div className="text-[var(--color-success)] bg-emerald-950/40 px-2 py-0.5 rounded-[var(--radius-sm)]">
                      + const response = await fetchWithRetry(url, &#123; retries: 3 &#125;);
                    </div>
                    <div className="text-[var(--color-success)] bg-emerald-950/40 px-2 py-0.5 rounded-[var(--radius-sm)]">
                      + if (!response.ok) throw new APIError(response.statusText);
                    </div>
                  </div>
                </div>

                {/* AI Explanation & Actions */}
                <div className="bg-[var(--color-accent-soft)]/60 border border-[var(--color-accent)]/20 rounded-[var(--radius-lg)] p-3.5 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
                  <div className="text-xs text-[var(--color-foreground)] space-y-1">
                    <div className="font-semibold">AI Explanation:</div>
                    <p className="landing-muted leading-relaxed">
                      Replaced standard network call with automatic 3-step retry backoff and
                      explicit error handling to prevent unhandled promise rejections.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    className="landing-button-primary flex-1 !py-2 !px-4 text-xs font-semibold"
                  >
                    Accept Changes
                  </button>
                  <button
                    type="button"
                    className="landing-button-secondary !py-2 !px-4 text-xs font-medium"
                  >
                    View File Diff
                  </button>
                </div>
              </div>
            </div>

            {/* Story B Text (Right position) */}
            <div className="lg:col-span-5 order-1 lg:order-2 space-y-6">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-xs font-mono font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>INTELLIGENT CO-PILOT</span>
              </div>
              <h3 className="landing-card-title text-2xl sm:text-3xl">
                An AI that actually helps
              </h3>
              <p className="landing-paragraph">
                An AI assistant designed to help developers understand and improve
                their code without replacing human control.
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  "Ask questions about code and architectural patterns",
                  "Generate and edit multiple files across your workspace",
                  "Explain tricky runtime errors and suggest verified solutions",
                  "Review proposed changes line-by-line before applying them",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                    <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Story C: See your ideas come alive (Text Left, Visual Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Story C Text */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-emerald-50 text-[var(--color-success)] text-xs font-mono font-medium">
                <Zap className="w-3.5 h-3.5" />
                <span>LIVE FEEDBACK LOOP</span>
              </div>
              <h3 className="landing-card-title text-2xl sm:text-3xl">
                See your ideas come alive
              </h3>
              <p className="landing-paragraph">
                Keep development and visual feedback together in one workspace.
                No context-switching across external browser tabs.
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  "Live preview for supported web projects with instant hot-reload",
                  "Integrated terminal and standard console output",
                  "Complete build and test workflow directly inside the browser",
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                    <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Story C Visual */}
            <div className="lg:col-span-7">
              <div className="landing-card bg-neutral-900 p-4 sm:p-6 shadow-xl space-y-3 text-white border-neutral-800">
                {/* Browser address bar */}
                <div className="flex items-center justify-between bg-neutral-800 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-mono text-neutral-300">
                  <div className="flex items-center gap-2">
                    <RotateCw className="w-3 h-3 text-neutral-400" />
                    <span className="text-neutral-400">http://localhost:3000/dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                    <span className="text-[var(--color-success)] text-[11px]">Hot Reload Active</span>
                  </div>
                </div>

                {/* Rendered Live Website Mockup Box */}
                <div className="bg-[var(--color-surface)] text-[var(--color-foreground)] rounded-[var(--radius-md)] p-5 border border-[var(--color-border)] shadow-inner">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
                    <span className="font-bold text-sm text-[var(--color-foreground)]">
                      Analytics Dashboard
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-neutral-100 rounded-[var(--radius-sm)] landing-muted">
                      Live Preview
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2.5 rounded-[var(--radius-sm)] bg-neutral-50 border border-neutral-100">
                      <div className="text-[10px] landing-muted uppercase">Requests</div>
                      <div className="text-sm font-bold text-[var(--color-foreground)]">42.8k</div>
                    </div>
                    <div className="p-2.5 rounded-[var(--radius-sm)] bg-neutral-50 border border-neutral-100">
                      <div className="text-[10px] landing-muted uppercase">Latency</div>
                      <div className="text-sm font-bold text-[var(--color-success)]">18ms</div>
                    </div>
                    <div className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/20">
                      <div className="text-[10px] text-[var(--color-accent)] uppercase">Build</div>
                      <div className="text-sm font-bold text-[var(--color-accent)]">Turbo ✓</div>
                    </div>
                  </div>
                </div>

                {/* Terminal Log Output underneath */}
                <div className="bg-black/50 p-3 rounded-[var(--radius-md)] border border-neutral-800 font-mono text-[11px] text-neutral-400 space-y-1">
                  <div className="text-neutral-500"># Turbopack build log</div>
                  <div className="text-[var(--color-success)]">✓ Page reloaded: 1 component updated in 24ms</div>
                  <div className="text-neutral-300">○ Ready for user interaction</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
