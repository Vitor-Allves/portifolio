import Header from "@/components/Header";
import Hero from "@/components/Hero";
import About from "@/components/About";
import MatchPointLive from "@/components/MatchPointLive";
import Solutions from "@/components/Solutions";
import DataIntelligence from "@/components/DataIntelligence";
import CaseStudy from "@/components/CaseStudy";
import Manifesto from "@/components/Manifesto";
import Founders from "@/components/Founders";
import DuoTeaser from "@/components/DuoTeaser";
import ForWho from "@/components/ForWho";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <About />
        <MatchPointLive />
        <Solutions />
        <DataIntelligence />
        <CaseStudy />
        <Manifesto />
        <Founders />
        <DuoTeaser />
        <ForWho />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
