"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: "What is this AI code editor?",
      answer:
        "It is a modern browser-based coding workspace equipped with an integrated AI assistant. It enables developers to create, edit, organize, and inspect multi-file code projects directly within the web browser without installing heavy local dependencies or runtime environments.",
    },
    {
      question: "Can I write different programming languages?",
      answer:
        "Yes. The editor provides syntax highlighting, bracket matching, and editing support for popular languages including JavaScript, TypeScript, Python, HTML & CSS, Java, C++, Go, and Rust. Tokenizers and syntax formatters are built into the editor interface.",
    },
    {
      question: "Is the AI assistant free?",
      answer:
        "Yes. Our starter tier provides free access to the AI coding assistant with generous standard usage limits. You can prompt the AI for code suggestions, bug explanations, and component generation without needing a paid subscription or credit card.",
    },
    {
      question: "Can AI edit multiple files?",
      answer:
        "Yes. The AI assistant understands overall project hierarchy and can generate or propose modifications across multiple files—such as scaffolding a component, updating stylesheets, and adjusting configuration—presenting all modifications as verifiable diffs before applying.",
    },
    {
      question: "Can I run projects in the browser?",
      answer:
        "For supported web projects (such as client-side JavaScript, TypeScript, and HTML/CSS applications), the editor provides an instant live browser preview alongside terminal build logs. Execution of server-side runtimes is conditional and depends on supported workspace backend environments.",
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="landing-section bg-[var(--color-surface-hover)] border-t border-[var(--color-border)]">
      <div className="landing-container max-w-4xl">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="landing-eyebrow mb-3 sm:mb-4 bg-white">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Got Questions?</span>
          </div>
          <h2 className="landing-section-title">
            Frequently Asked Questions
          </h2>
          <p className="landing-paragraph mt-3 sm:mt-4">
            Honest answers about the capabilities, supported languages, and
            features of our browser-based editor.
          </p>
        </div>

        {/* Accordion Container */}
        <div className="space-y-2.5 sm:space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="landing-card overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  id={`faq-btn-${idx}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${idx}`}
                  onClick={() => toggleFAQ(idx)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <span className="landing-card-title text-base sm:text-lg">
                    {faq.question}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "landing-muted"
                    }`}
                  >
                    <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${idx}`}
                    role="region"
                    aria-labelledby={`faq-btn-${idx}`}
                    className="px-6 pb-6 pt-1 landing-paragraph text-sm sm:text-base border-t border-[var(--color-border)]/50 animate-in fade-in-50 duration-150"
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
