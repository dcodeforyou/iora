import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import Hero from "@/components/hero/Hero";
import AttentionSection from "@/components/attention/AttentionSection";
import ImpactSection from "@/components/impact/ImpactSection";
import ProofSection from "@/components/proof/ProofSection";
import PitchSection from "@/components/pitch/PitchSection";
import ResolutionSection from "@/components/resolution/ResolutionSection";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="bg-ink">
        <Hero />
        <AttentionSection />
        <ImpactSection />
        <ProofSection />
        <PitchSection />
        <ResolutionSection />
      </main>
      <Footer />
    </>
  );
}
