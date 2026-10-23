import React from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowRight } from "lucide-react";

export default function Pricing() {
  const features = [
    "Browser-based code editing",
    "AI assistant with usage limits",
    "Basic project workspace",
    "Web preview where supported",
    "Multi-file project explorer & tab manager",
    "Syntax highlighting for 8+ major programming languages",
    "Integrated terminal and execution diagnostics",
  ];

  return (
    <section id="pricing" className="landing-section bg-[var(--color-surface)]">
      <div className="landing-container">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="landing-eyebrow mb-3 sm:mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Honest & Transparent</span>
          </div>
          <h2 className="landing-section-title">
            Everything you need to get started.
          </h2>
          <p className="landing-paragraph mt-3 sm:mt-4">
            Start coding immediately in your browser. All core editor tools and
            AI features are available with no upfront cost.
          </p>
        </div>

        {/* Single Free Plan Card */}
        <div className="landing-card max-w-lg mx-auto rounded-[var(--radius-2xl)] border-2 border-[var(--color-primary)]/30 shadow-xl overflow-hidden relative">
          {/* Top accent badge */}
          <div className="bg-[var(--color-primary)] text-white text-center py-2 text-xs font-semibold uppercase tracking-wider">
            Free Plan • Browser Workspace
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Price Header */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl sm:text-6xl font-extrabold text-[var(--color-foreground)] tracking-tight">
                  $0
                </span>
                <span className="text-sm font-medium landing-muted">
                  / free forever
                </span>
              </div>
              <p className="mt-2 text-sm landing-muted">
                Full access to our browser-based code editor and AI assistant.
              </p>
            </div>

            {/* Feature checklist */}
            <div className="space-y-3.5 pt-2 border-t border-[var(--color-border)]">
              <div className="text-xs font-semibold text-[var(--color-foreground)] uppercase tracking-wider">
                What&apos;s Included:
              </div>
              <ul className="space-y-3">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-[var(--color-foreground)]">
                    <div className="w-5 h-5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Button */}
            <div className="pt-2">
              <Link
                href="/projects"
                className="landing-button-primary w-full !py-3.5 text-base"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-center text-xs landing-muted mt-3">
                No credit card required • Instant access in your browser
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
