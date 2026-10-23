import React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import CodeEditorMockup from "./CodeEditorMockup";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-6 pb-8 sm:pt-10 sm:pb-12 lg:pt-14 lg:pb-14 bg-[var(--color-background)]">
      {/* Subtle ambient decorative lavender glow */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center overflow-hidden"
        aria-hidden="true"
      >
        <div className="w-[1000px] h-[480px] bg-gradient-to-b from-[var(--color-accent-soft)] via-[var(--color-accent-soft)]/40 to-transparent blur-3xl rounded-full opacity-80" />
      </div>

      <div className="landing-container">
        {/* Split Layout: ~45% Left Content, ~55% Right Visual */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-8 xl:gap-12 items-center">
          {/* Left Content Column (~45% on desktop: lg:col-span-5) */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left z-10">
            {/* Announcement Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[var(--radius-pill)] text-xs sm:text-sm font-medium bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-accent)]/20 shadow-xs mb-4 sm:mb-5 transition-all duration-200 hover:border-[var(--color-accent)]/40 hover:scale-[1.01]">
              <Sparkles className="w-3.5 h-3.5 fill-[var(--color-accent)]/20" />
              <span>Meet your new AI coding workspace</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[2.65rem] xl:text-[3.15rem] font-extrabold tracking-tight text-[var(--color-foreground)] leading-[1.12]">
              Your ideas deserve{" "}
              <span className="bg-gradient-to-r from-[var(--color-primary)] via-[#806BFA] to-[var(--color-primary)] bg-clip-text text-transparent inline-block">
                better code.
              </span>
            </h1>

            {/* Supporting Description */}
            <p className="landing-paragraph mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed text-[var(--color-muted-foreground)] max-w-xl">
              Write, build, and ship projects faster with an intelligent AI coding
              assistant built right into your workspace.
            </p>

            {/* CTA Buttons */}
            <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-center gap-3 sm:gap-3.5 w-full sm:w-auto justify-center lg:justify-start">
              <Link
                href="/projects"
                className="group landing-button-primary w-full sm:w-auto h-11 sm:h-12 px-6 shadow-md hover:shadow-lg shadow-[var(--color-primary)]/20"
              >
                <span>Start Coding Free</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="landing-button-secondary w-full sm:w-auto h-11 sm:h-12 px-6"
              >
                Explore Features
              </a>
            </div>

            {/* Trust Caption */}
            <p className="mt-5 sm:mt-6 text-xs sm:text-sm text-[var(--color-muted-foreground)] font-medium">
              Write code. Build projects. Let AI handle the busywork.
            </p>
          </div>

          {/* Right Visual Column (~55% on desktop: lg:col-span-7) */}
          <div className="lg:col-span-7 w-full relative">
            <CodeEditorMockup embeddedInHero />
          </div>
        </div>
      </div>
    </section>
  );
}
