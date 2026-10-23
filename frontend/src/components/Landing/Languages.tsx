import React from "react";
import { Code2, Check } from "lucide-react";

interface LanguageItem {
  name: string;
  extension: string;
  color: string;
  bgLight: string;
  description: string;
  features: string[];
}

export default function Languages() {
  const languages: LanguageItem[] = [
    {
      name: "JavaScript",
      extension: ".js / .jsx",
      color: "#F7DF1E",
      bgLight: "#FEFCE8",
      description: "Modern ECMAScript, React JSX, and Node.js workspace tooling.",
      features: ["Syntax Highlighting", "Auto-Format", "ESNext"],
    },
    {
      name: "TypeScript",
      extension: ".ts / .tsx",
      color: "#3178C6",
      bgLight: "#EFF6FF",
      description: "Strict type diagnostics, interface hints, and TSX component support.",
      features: ["Type Checking", "IntelliSense", "TSX Support"],
    },
    {
      name: "Python",
      extension: ".py",
      color: "#3776AB",
      bgLight: "#F0F9FF",
      description: "Clean indentation guides, docstring rendering, and script editing.",
      features: ["Indentation Guides", "Syntax Parsing", "PEP8 Style"],
    },
    {
      name: "HTML & CSS",
      extension: ".html / .css",
      color: "#E34F26",
      bgLight: "#FFF7ED",
      description: "Semantic web tags, Tailwind CSS autocompletion, and live CSS updates.",
      features: ["Live Preview", "Tailwind Support", "DOM Tree"],
    },
    {
      name: "Java",
      extension: ".java",
      color: "#ED8B00",
      bgLight: "#FFFBEB",
      description: "Object-oriented class structures, package navigation, and method highlights.",
      features: ["Class Navigation", "OOP Highlighting", "Structure Map"],
    },
    {
      name: "C++",
      extension: ".cpp / .hpp",
      color: "#00599C",
      bgLight: "#F0FDF4",
      description: "Header file support, pointer notation, and algorithmic syntax styling.",
      features: ["Header Support", "Macro Highlighting", "Fast Tokenizer"],
    },
    {
      name: "Go",
      extension: ".go",
      color: "#00ADD8",
      bgLight: "#ECFEFF",
      description: "Goroutines, channel semantics, and idiomatic Go syntax formatting.",
      features: ["Gofmt Compliant", "Struct Parsing", "Interface Tags"],
    },
    {
      name: "Rust",
      extension: ".rs",
      color: "#DEA584",
      bgLight: "#FAF5FF",
      description: "Borrow checker keywords, trait syntax, and cargo file detection.",
      features: ["Trait Navigation", "Macro Tokens", "Cargo Support"],
    },
  ];

  return (
    <section id="languages" className="landing-section bg-[var(--color-surface)]">
      <div className="landing-container">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="landing-eyebrow mb-3 sm:mb-4">
            <Code2 className="w-3.5 h-3.5" />
            <span>Supported Languages</span>
          </div>
          <h2 className="landing-section-title">
            Your language. Your workflow.
          </h2>
          <p className="landing-paragraph mt-3 sm:mt-4">
            Engineered with dedicated syntax parsers, intelligent code folding,
            and formatting for the languages you build with every day.
          </p>
        </div>

        {/* 8 Language Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {languages.map((lang) => (
            <div
              key={lang.name}
              className="group landing-card p-5 sm:p-6 hover:border-[var(--color-primary)]/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                {/* Top Badge & Extension */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full inline-block shadow-2xs"
                      style={{ backgroundColor: lang.color }}
                      aria-hidden="true"
                    />
                    <h3 className="text-base font-bold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                      {lang.name}
                    </h3>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-[var(--radius-sm)] bg-neutral-100 text-neutral-600 font-medium">
                    {lang.extension}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm landing-muted leading-relaxed mb-4">
                  {lang.description}
                </p>
              </div>

              {/* Feature Pills */}
              <div className="pt-3 border-t border-[var(--color-border)] flex flex-wrap gap-1.5">
                {lang.features.map((feat, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]"
                  >
                    <Check className="w-2.5 h-2.5 text-[var(--color-primary)]" />
                    <span>{feat}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Technical Transparency Note */}
        <div className="mt-8 sm:mt-10 text-center text-xs landing-muted max-w-2xl mx-auto">
          Language syntax highlighting, bracket matching, and editor tooling are
          provided in-browser. Web projects (HTML, CSS, JavaScript, TypeScript)
          support live client-side preview execution.
        </div>
      </div>
    </section>
  );
}
