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
      </main>
      {/* Resolution + Footer share a flex column capped at 100dvh - 5px —
          deliberately shorter than one full viewport by exactly 5px, so at
          max scroll a 5px sliver of Pitch's orange beat stays visible
          peeking above both, instead of guessing at natural section/footer
          heights ever happening to leave a gap on their own. Resolution
          absorbs the remaining space via flex-1; Footer keeps its natural
          height. Lives outside <main> (a plain block per AGENTS.md's
          flex-ancestor-breaks-GSAP-pin rule) so this flex wrapper is never
          an ancestor of Hero's pin:true ScrollTrigger section. */}
      <div className="flex min-h-[calc(100dvh-5px)] flex-col">
        <ResolutionSection />
        <Footer />
      </div>
    </>
  );
}
