import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CodeFigma — Browser Code Editor",
    template: "%s | CodeFigma",
  },
  description:
    "A Figma-style workspace with a VS Code-grade editor and a real terminal, running entirely in your browser.",
  applicationName: "CodeFigma",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
