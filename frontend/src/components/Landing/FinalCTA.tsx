import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="landing-section bg-[var(--color-surface)] overflow-hidden">
      <div className="landing-container">
        <div className="relative landing-card bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/25 p-6 sm:p-10 lg:p-12 text-center overflow-hidden shadow-lg rounded-[var(--radius-2xl)]">
          {/* Subtle Ambient Decorative Circles */}
          <div
            className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[var(--color-accent)]/15 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-3xl mx-auto space-y-4 sm:space-y-5">
            <div className="landing-eyebrow bg-white">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              <span>Ready When You Are</span>
            </div>

            <h2 className="landing-section-title text-3xl sm:text-4xl lg:text-5xl leading-tight">
              Your next great project starts here.
            </h2>

            <p className="landing-paragraph max-w-2xl mx-auto">
              Write, build, and ship code faster with an intelligent AI assistant
              built right into your browser. No downloads or installations required.
            </p>

            <div className="pt-2 sm:pt-3 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/projects"
                className="landing-button-primary w-full sm:w-auto text-base !py-3 !px-7"
              >
                <span>Start Coding Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#editor-demo"
                className="landing-button-secondary w-full sm:w-auto text-base !py-3 !px-6"
              >
                Explore Interactive Demo
              </a>
            </div>

            {/* Trust badges */}
            <div className="pt-4 sm:pt-5 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm landing-muted">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                Free forever tier
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                Zero local setup
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                No credit card needed
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
