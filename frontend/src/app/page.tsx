import React from "react";
import Navbar from "@/components/Landing/Navbar";
import Hero from "@/components/Landing/Hero";
import CodeEditorMockup from "@/components/Landing/CodeEditorMockup";
import ProductShowcase from "@/components/Landing/ProductShowcase";
import AIAgent from "@/components/Landing/AIAgent";
import Languages from "@/components/Landing/Languages";
import HowItWorks from "@/components/Landing/HowItWorks";
import Pricing from "@/components/Landing/Pricing";
import FAQ from "@/components/Landing/FAQ";
import FinalCTA from "@/components/Landing/FinalCTA";
import Footer from "@/components/Landing/Footer";

export default function HomePage() {
  return (
    <div className="landing-page selection:bg-[var(--color-accent-soft)] selection:text-[var(--color-accent)]">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <CodeEditorMockup />
        <ProductShowcase />
        <AIAgent />
        <Languages />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
