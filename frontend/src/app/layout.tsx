import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import SmoothScroll from "@/components/SmoothScroll";
import { AuthProvider } from "@/components/Auth/AuthContext";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: {
    default: "Code Editor — AI-Powered Online IDE",
    template: "%s | Code Editor",
  },
  description:
    "Write, run, and debug code directly in your browser with an AI-powered online IDE. Build projects, fix bugs, and boost your productivity with an intelligent coding assistant.",
  applicationName: "Code Editor",
  keywords: [
    "online code editor",
    "AI code editor",
    "AI coding assistant",
    "online IDE",
    "web-based IDE",
    "code playground",
    "developer tools",
    "programming",
  ],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Code Editor — AI-Powered Online IDE",
    description:
      "Write, run, and debug code in your browser with an AI-powered coding assistant.",
    siteName: "Code Editor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Code Editor — AI-Powered Online IDE",
    description:
      "Your browser-based coding workspace with an intelligent AI assistant.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", inter.className, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </AuthProvider>
      </body>
    </html>
  );
}
