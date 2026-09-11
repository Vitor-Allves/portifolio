import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StrategicStatement from "@/components/StrategicStatement";
import About from "@/components/About";
import MatchPoint from "@/components/MatchPoint";
import Solutions from "@/components/Solutions";
import DataIntelligence from "@/components/DataIntelligence";
import CaseStudy from "@/components/CaseStudy";
import Manifesto from "@/components/Manifesto";
import Founders from "@/components/Founders";
import Differentials from "@/components/Differentials";
import IdealClient from "@/components/IdealClient";
import FinalCTA from "@/components/FinalCTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <StrategicStatement />
        <About />
        <MatchPoint />
        <Solutions />
        <DataIntelligence />
        <CaseStudy />
        <Manifesto />
        <Founders />
        <Differentials />
        <IdealClient />
        <FinalCTA />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
