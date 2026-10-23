"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, X, Code2, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/Auth/AuthContext";

export default function Navbar() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Product", href: "#editor-demo" },
    { name: "Features", href: "#features" },
    { name: "AI Agent", href: "#ai-agent" },
    { name: "Languages", href: "#languages" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Pricing", href: "#pricing" },
    { name: "Documentation", href: "#faq" },
  ];

  const handleLinkClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[var(--color-surface)]/95 backdrop-blur-sm border-b border-[var(--color-border)] transition-colors">
      <div className="landing-container h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-[var(--radius-md)]"
        >
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-primary)] flex items-center justify-center text-white shadow-xs transition-transform group-hover:scale-105">
            <Code2 className="w-4 h-4 stroke-[2.5]" />
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--color-foreground)]">
            Code Editor
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-sm font-medium landing-muted hover:text-[var(--color-foreground)] px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {link.name}
            </a>
          ))}
        </nav>

        {/* Desktop CTA actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Link
              href="/projects"
              className="landing-button-primary !py-2 !px-4 text-xs sm:text-sm"
            >
              <span>Workspace Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium landing-muted hover:text-[var(--color-foreground)] px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="landing-button-primary !py-2 !px-4 text-xs sm:text-sm"
              >
                <span>Start Coding Free</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-[var(--radius-md)] landing-muted hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-2 pb-6 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={handleLinkClick}
                className="text-sm font-medium landing-muted hover:text-[var(--color-foreground)] px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>
          <div className="pt-4 border-t border-[var(--color-border)] flex flex-col gap-2">
            {user ? (
              <Link
                href="/projects"
                onClick={handleLinkClick}
                className="w-full text-center landing-button-primary !py-2.5"
              >
                Workspace Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={handleLinkClick}
                  className="w-full text-center text-sm font-medium landing-muted hover:text-[var(--color-foreground)] py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  onClick={handleLinkClick}
                  className="w-full text-center landing-button-primary !py-2.5"
                >
                  Start Coding Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
