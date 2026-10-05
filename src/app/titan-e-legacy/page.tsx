import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DuoHero from "@/components/DuoHero";
import Carousel from "@/components/Carousel";
import { ROUTES } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Titan & Legacy — A dupla da Legado Enterprise",
  description:
    "Conheça Titan e Legacy, os dois lobos que representam o jeito Legado de trabalhar: estratégia e execução lado a lado, do primeiro saque ao match point.",
  alternates: { canonical: ROUTES.duo },
};

const TITAN_SLIDES = [
  { file: "01-titan-tenis-saque", caption: "No saque", alt: "Titan no saque" },
  { file: "02-titan-tenis-capitao", caption: "Capitão do time", alt: "Titan capitão do time" },
  { file: "03-titan-golaalta-bracos-cruzados", caption: "De gola alta", alt: "Titan de gola alta" },
  { file: "04-titan-palestrante", caption: "No palco", alt: "Titan no palco" },
  { file: "05-titan-smoking-trofeu", caption: "De smoking, com o troféu", alt: "Titan de smoking, com o troféu" },
  { file: "06-titan-colete-quadro", caption: "No quadro de estratégia", alt: "Titan no quadro de estratégia" },
  { file: "07-titan-golaalta-tablet", caption: "Com o tablet", alt: "Titan com o tablet" },
  { file: "08-titan-poltrona-cafe", caption: "Na poltrona", alt: "Titan na poltrona" },
  { file: "09-titan-casual-cafe-mochila", caption: "No dia a dia", alt: "Titan no dia a dia" },
  { file: "10-titan-apontando-cima", caption: "Apontando o caminho", alt: "Titan apontando o caminho" },
  { file: "11-titan-celular", caption: "Ao telefone", alt: "Titan ao telefone" },
  { file: "12-titan-colete-pensativo", caption: "Pensando o jogo", alt: "Titan pensando o jogo" },
  { file: "13-titan-smoking-gravata", caption: "De smoking", alt: "Titan de smoking" },
  { file: "14-titan-casual-selfie", caption: "Na selfie", alt: "Titan na selfie" },
].map((s) => ({ src: `/site/titan-e-legacy/titan/${s.file}.webp`, alt: s.alt, caption: s.caption }));

const LEGACY_SLIDES = [
  { file: "01-legacy-tenis-comemorando", caption: "Comemorando o ponto", alt: "Legacy comemorando o ponto" },
  { file: "02-legacy-tenis-capitao", caption: "Capitão do time", alt: "Legacy capitão do time" },
  { file: "03-legacy-blazer-apontando-voce", caption: "Apontando para você", alt: "Legacy apontando para você" },
  { file: "04-legacy-evento-microfone", caption: "No microfone", alt: "Legacy no microfone" },
  { file: "05-legacy-jeans-notebook", caption: "No notebook", alt: "Legacy no notebook" },
  { file: "06-legacy-trench-caminhando", caption: "A caminho", alt: "Legacy a caminho" },
  { file: "07-legacy-trico-megafone", caption: "No megafone", alt: "Legacy no megafone" },
  { file: "08-legacy-trico-pilha-pastas", caption: "Com as pastas", alt: "Legacy com as pastas" },
  { file: "09-legacy-evento-aplaudindo", caption: "Aplaudindo", alt: "Legacy aplaudindo" },
  { file: "10-legacy-jeans-comemorando", caption: "Comemorando", alt: "Legacy comemorando" },
  { file: "11-legacy-blazer-pensativo", caption: "Pensativo", alt: "Legacy pensativo" },
  { file: "12-legacy-trench-celular", caption: "No celular", alt: "Legacy no celular" },
].map((s) => ({ src: `/site/titan-e-legacy/legacy/${s.file}.webp`, alt: s.alt, caption: s.caption }));

const WOLVES = [
  {
    title: "Cada um tem um papel",
    text: "Na alcateia, ninguém faz tudo sozinho. Cada lobo sabe a sua função, e o grupo inteiro avança junto.",
  },
  {
    title: "Junto com o cliente",
    text: "A Legado trabalha ao lado de quem contrata, e não no lugar dele. A estratégia é construída a quatro mãos.",
  },
  {
    title: "Lealdade à alcateia",
    text: "Lobos protegem o grupo. Para a Legado, isso tem nome: a palavra. O que foi combinado é cumprido.",
  },
];

const WHERE = [
  { b: "No site", span: "Guiam a leitura do método, do Intelligence e do contato." },
  { b: "No Legado Intelligence", span: "Recebem você no login e acompanham cada aba do painel." },
  { b: "Nos relatórios", span: "Explicam o que cada número quer dizer, na versão simplificada." },
  { b: "No Instagram", span: "Estrelam as datas e os conteúdos da Legado." },
];

export default function TitanLegacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="lg-dhero lg-dark" data-score="0">
          <div className="lg-in">
            <span className="lg-eyebrow">A dupla da Legado</span>
            <h1>
              Titan <span>&amp;</span> Legacy
            </h1>
            <p className="lg-lead">
              Dois lobos, uma alcateia. Eles representam o jeito Legado de trabalhar: estratégia
              e execução lado a lado, do primeiro saque ao match point.
            </p>
            <DuoHero />
          </div>
        </section>

        <section className="lg-section" data-score="1">
          <div className="lg-in lg-char">
            <Carousel slides={TITAN_SLIDES} ariaLabel="Versões do Titan" />
            <div className="lg-txt">
              <span className="lg-eyebrow">Titan · lobo preto</span>
              <h2 className="lg-h2">O estrategista</h2>
              <p>
                Titan pensa o jogo antes do primeiro saque. Lê o cenário, escolhe onde atacar e
                não decide nada sem olhar os números.
              </p>
              <div className="lg-traits">
                <span>Visão de dono</span>
                <span>Decisão com dados</span>
                <span>Firmeza</span>
              </div>
              <p className="lg-inmp">
                No Match Point, é ele quem abre o jogo: diagnóstico, mercado e posicionamento, no
                15.
              </p>
            </div>
          </div>
        </section>

        <section className="lg-section lg-dark" data-score="2">
          <div className="lg-in lg-char lg-rev">
            <Carousel slides={LEGACY_SLIDES} ariaLabel="Versões do Legacy" />
            <div className="lg-txt">
              <span className="lg-eyebrow">Legacy · lobo branco</span>
              <h2 className="lg-h2">O construtor de legado</h2>
              <p>
                Legacy transforma a estratégia em movimento. Cuida das relações, mantém a
                constância e comemora cada ponto, porque cada ponto constrói o resultado que
                fica.
              </p>
              <div className="lg-traits">
                <span>Relacionamento</span>
                <span>Constância</span>
                <span>Execução</span>
              </div>
              <p className="lg-inmp">
                No Match Point, é ele quem fecha o ponto: evolução e novos movimentos, no GAME.
              </p>
              <p className="lg-galcap">
                De terno, de gola alta, de jeans ou de roupa de tênis: a dupla muda de roupa,
                nunca de caráter.
              </p>
            </div>
          </div>
        </section>

        <section
          className="lg-section lg-dark"
          data-score="2"
          style={{ background: "linear-gradient(180deg, #0B1526, #152B4F)" }}
        >
          <div className="lg-in">
            <div className="lg-head lg-head-center">
              <span className="lg-eyebrow">Por que lobos?</span>
              <h2 className="lg-h2">Ninguém caça sozinho</h2>
            </div>
            <div className="lg-wolves">
              {WOLVES.map((w) => (
                <div key={w.title} className="lg-wolf">
                  <h3>{w.title}</h3>
                  <p>{w.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lg-section" data-score="3">
          <div className="lg-in">
            <div className="lg-head">
              <span className="lg-eyebrow">Uma dupla de tênis</span>
              <h2 className="lg-h2">Um constrói o ponto. O outro fecha na rede.</h2>
              <p className="lg-lead">
                No tênis de duplas, um jogador trabalha do fundo da quadra e o outro finaliza
                junto à rede. Titan e Legacy jogam assim: um pensa o jogo, o outro executa, e os
                dois respondem pelo resultado.
              </p>
            </div>
            <div className="lg-where">
              {WHERE.map((w) => (
                <div key={w.b}>
                  <b>{w.b}</b>
                  <span>{w.span}</span>
                </div>
              ))}
            </div>
            <div className="lg-btns" style={{ marginTop: 28 }}>
              <Link href="/#contato" className="lg-btn lg-btn-navy">
                Quero jogar com a dupla
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
