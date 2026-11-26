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
    <div className="min-h-screen bg-[#080C10] text-[#F4F8FA] antialiased selection:bg-[#74B8CC]/25 selection:text-white">
      <Navbar />
      <main>
        <Hero />
        <StackStrip />
        <TourGallery />
        <BentoGrid />
        <Comparison />
        <LocalDevSuite />
        <InstallSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
