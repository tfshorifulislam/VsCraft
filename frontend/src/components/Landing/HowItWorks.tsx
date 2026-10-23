import React from "react";
import {
  Sparkles,
  PlayCircle,
} from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Create your workspace",
      summary: "Start with a clean project workspace.",
      description:
        "Open a fresh project instantly in your browser. Organize directories, import templates, and start structuring your code without terminal configuration.",
      badge: "Zero Setup",
      mockup: (
        <div className="bg-neutral-900 rounded-[var(--radius-lg)] p-3 border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-neutral-400 text-[10px] pb-1 border-b border-neutral-800">
            <span>workspace-init</span>
            <span className="text-[var(--color-success)]">ready</span>
          </div>
          <div className="text-neutral-400">📁 src/</div>
          <div className="pl-3 text-sky-400">📄 App.tsx</div>
          <div className="pl-3 text-amber-400">📄 styles.css</div>
          <div className="text-neutral-400">📄 package.json</div>
        </div>
      ),
    },
    {
      number: "02",
      title: "Write code with AI",
      summary: "Use the assistant to explore ideas and improve code.",
      description:
        "Prompt the integrated AI assistant to write functions, scaffold components, or debug tricky issues. Inspect every proposed diff line-by-line before applying.",
      badge: "Smart Assistant",
      mockup: (
        <div className="bg-neutral-900 rounded-[var(--radius-lg)] p-3 border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1.5 shadow-inner">
          <div className="flex items-center gap-1.5 text-[var(--color-primary)] text-[10px] pb-1 border-b border-neutral-800">
            <Sparkles className="w-3 h-3" />
            <span>AI Code Generation</span>
          </div>
          <div className="text-neutral-400 italic">“Add responsive navigation”</div>
          <div className="text-[var(--color-success)] bg-emerald-950/40 px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[10px]">
            + export function Navbar() &#123; ... &#125;
          </div>
          <div className="text-neutral-400 text-[10px]">✓ 12 lines generated</div>
        </div>
      ),
    },
    {
      number: "03",
      title: "Run, preview, and improve",
      summary: "Review the output and iterate.",
      description:
        "See your changes take shape immediately in the integrated browser preview. Inspect console logs in the terminal, fine-tune details, and export your code.",
      badge: "Instant Feedback",
      mockup: (
        <div className="bg-neutral-900 rounded-[var(--radius-lg)] p-3 border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-neutral-400 text-[10px] pb-1 border-b border-neutral-800">
            <span className="flex items-center gap-1 text-[var(--color-success)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              Live Server :3000
            </span>
            <span className="text-neutral-400">Fast Reload</span>
          </div>
          <div className="bg-[var(--color-surface)] text-[var(--color-foreground)] p-2 rounded-[var(--radius-sm)] text-center font-sans">
            <div className="text-[10px] font-bold">Preview Ready</div>
            <div className="text-[9px] landing-muted">0 errors reported</div>
          </div>
          <div className="text-[var(--color-success)] text-[10px]">✓ Compiled in 28ms</div>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="landing-section bg-[var(--color-surface-hover)] border-t border-[var(--color-border)]">
      <div className="landing-container">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="landing-eyebrow mb-3 sm:mb-4 bg-white">
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Workflow Overview</span>
          </div>
          <h2 className="landing-section-title">
            From idea to working code.
          </h2>
          <p className="landing-paragraph mt-3 sm:mt-4">
            A frictionless development cycle designed to keep you focused on
            building, not configuring.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 relative">
          {steps.map((step) => (
            <div
              key={step.number}
              className="landing-card p-6 sm:p-7 flex flex-col justify-between"
            >
              <div>
                {/* Step number badge & header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl font-extrabold text-[var(--color-primary)]/30 font-mono">
                    {step.number}
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-[var(--radius-pill)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    {step.badge}
                  </span>
                </div>

                {/* Title & summaries */}
                <h3 className="landing-card-title text-lg sm:text-xl mb-1">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm font-medium text-[var(--color-primary)] mb-3">
                  {step.summary}
                </p>
                <p className="text-xs sm:text-sm landing-muted leading-relaxed mb-6">
                  {step.description}
                </p>
              </div>

              {/* Step visual illustration */}
              <div className="mt-auto pt-2">{step.mockup}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
