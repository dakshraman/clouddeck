import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { StackStrip } from "@/components/StackStrip";
import { BentoGrid } from "@/components/BentoGrid";
import { Comparison } from "@/components/Comparison";
import { LocalDevSuite } from "@/components/LocalDevSuite";
import { TourGallery } from "@/components/TourGallery";
import { InstallSection } from "@/components/InstallSection";
import { FaqSection } from "@/components/FaqSection";
import { CtaSection } from "@/components/CtaSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAF7F5] text-[#14242B] antialiased">
      <Navbar />
      <main>
        <Hero />
        <StackStrip />
        <BentoGrid />
        <Comparison />
        <LocalDevSuite />
        <TourGallery />
        <InstallSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

