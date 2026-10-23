import React from "react";
import Link from "next/link";
import { Code2, ExternalLink } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[var(--color-surface)] border-t border-[var(--color-border)] landing-muted text-sm">
      <div className="landing-container py-8 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Info Column */}
          <div className="col-span-2 space-y-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-[var(--radius-md)] w-fit"
            >
              <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-primary)] flex items-center justify-center text-white">
                <Code2 className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-lg font-bold tracking-tight text-[var(--color-foreground)]">
                Code Editor
              </span>
            </Link>
            <p className="text-xs sm:text-sm landing-muted max-w-sm leading-relaxed">
              An intelligent, browser-based coding workspace designed for modern
              developers. Write, explore, and ship projects with AI assistance.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs landing-muted">
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)] inline-block" />
              <span>All systems operational</span>
            </div>
          </div>

          {/* Links Column 1: Product */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-foreground)] mb-3">
              Product
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="#editor-demo"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Code Editor
                </a>
              </li>
              <li>
                <a
                  href="#ai-agent"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  AI Assistant
                </a>
              </li>
              <li>
                <a
                  href="#languages"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Supported Languages
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Links Column 2: Features & Docs */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-foreground)] mb-3">
              Features
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="#features"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Multi-file Editing
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Live Preview
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Documentation
                </a>
              </li>
            </ul>
          </div>

          {/* Links Column 3: Legal & GitHub */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-foreground)] mb-3">
              Community & Legal
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-[var(--color-foreground)] transition-colors"
                >
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3 text-neutral-400" />
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="hover:text-[var(--color-foreground)] transition-colors"
                >
                  FAQ
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs landing-muted">
          <p>© 2026 Code Editor. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Built for developers with modern web standards.
          </p>
        </div>
      </div>
    </footer>
  );
}
