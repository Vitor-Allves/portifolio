import "./home-cinematic.css";
import Header from "@/components/Header";
import MatchPointLive from "@/components/MatchPointLive";
import Footer from "@/components/Footer";
import CinMotion from "@/components/cinematic/CinMotion";
import CinHero from "@/components/cinematic/CinHero";
import CinProof from "@/components/cinematic/CinProof";
import CinForWho from "@/components/cinematic/CinForWho";
import CinIntelligence from "@/components/cinematic/CinIntelligence";
import CinPeople from "@/components/cinematic/CinPeople";
import CinFinalCta from "@/components/cinematic/CinFinalCta";

// Home na direção "escuro cinematográfico": cada bloco ocupa a tela inteira.
// Ordem: Hero → Prova → Para quem → Match Point → Intelligence → Quem faz → CTA final.
export default function Home() {
  return (
    <>
      <Header />
      <main id="cin-home" className="cin flex-1">
        <CinHero />
        <CinProof />
        <CinForWho />
        <MatchPointLive />
        <CinIntelligence />
        <CinPeople />
        <CinFinalCta />
      </main>
      <Footer />
      <CinMotion />
    </>
  );
}
