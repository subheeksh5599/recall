import Header from "@/components/landing/Header";
import TheOrderBookSection from "@/components/landing/TheOrderBookSection";
import EnforcedByOneSection from "@/components/landing/EnforcedByOneSection";
import SnipersLoseFairSection from "@/components/landing/SnipersLoseFairSection";
import FairFillsForSection from "@/components/landing/FairFillsForSection";
import WhyMonadMakesSection from "@/components/landing/WhyMonadMakesSection";
import WhereTheGuaranteeSection from "@/components/landing/WhereTheGuaranteeSection";
import WhyOrderBooksSection from "@/components/landing/WhyOrderBooksSection";
import EveryAttackHasSection from "@/components/landing/EveryAttackHasSection";
import TheLastCancelSection from "@/components/landing/TheLastCancelSection";
import Footer from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="theme-light">
      <div className="theme-light min-h-screen w-full px-2 bg-background-alt text-black" id="layout">
        <Header />
        <main className="relative mx-auto flex max-w-wide flex-col gap-2">
          <TheOrderBookSection />
        <EnforcedByOneSection />
        <SnipersLoseFairSection />
        <FairFillsForSection />
        <WhyMonadMakesSection />
        <WhereTheGuaranteeSection />
        <WhyOrderBooksSection />
        <EveryAttackHasSection />
        <TheLastCancelSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
