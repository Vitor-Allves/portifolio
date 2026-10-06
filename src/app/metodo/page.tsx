import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JumpBoard from "@/components/JumpBoard";
import SceneParallax from "@/components/SceneParallax";
import CycleDiagram from "@/components/CycleDiagram";
import { ROUTES } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Match Point — O método da Legado",
  description:
    "Conheça o Match Point: o sistema da Legado Enterprise para conduzir empresas da fundação estratégica até a evolução contínua, ponto a ponto, como no tênis.",
  alternates: { canonical: ROUTES.metodo },
};

const WHY_CARDS = [
  {
    icon: "/site/geral/bola-tenis.webp",
    title: "Ponto a ponto",
    text: "O placar avança um ponto de cada vez. No crescimento de uma empresa também: cada etapa tem um objetivo claro antes da próxima.",
  },
  {
    icon: "/site/metodo/raquete-tenis.webp",
    title: "Cada ponto prepara o próximo",
    text: "O que se aprende numa etapa vira a base da seguinte. Nada é feito no escuro.",
  },
  {
    icon: "/site/metodo/trofeu.webp",
    title: "Depois do GAME, um novo game",
    text: "Fechar um ciclo não encerra o jogo. É o começo do próximo movimento de crescimento.",
  },
];

type SceneProps = {
  id: string;
  dataScore: number;
  reverse?: boolean;
  bg: string;
  num: string;
  game?: boolean;
  eyebrow: string;
  score: string;
  title: string;
  objective: string;
  body: string;
  chips: string[];
  diff: React.ReactNode;
  decide: string;
  mascot: string;
  mascotAlt: string;
};

function Scene(p: SceneProps) {
  return (
    <section
      className={`lg-scene lg-dark${p.reverse ? " lg-right" : ""}`}
      id={p.id}
      data-score={p.dataScore}
    >
      <img className="lg-sc-bg" src={p.bg} alt="" loading="lazy" />
      <div className="lg-sc-shade" aria-hidden="true" />
      <span className={`lg-sc-num${p.game ? " lg-game" : ""}`} aria-hidden="true">
        {p.num}
      </span>
      <div className="lg-in lg-sc-grid">
        <div className="lg-sc-txt">
          <span className="lg-eyebrow">{p.eyebrow}</span>
          <span className="lg-sc-score">{p.score}</span>
          <h2>{p.title}</h2>
          <p className="lg-obj">{p.objective}</p>
          <p className="lg-body">{p.body}</p>
          <div className="lg-chips">
            {p.chips.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="lg-diff">
            <small>Por que somos diferentes</small>
            <span>{p.diff}</span>
          </div>
          <div className="lg-decide">
            <small>O que você decide aqui</small>
            <span>{p.decide}</span>
          </div>
        </div>
      </div>
      <img className="lg-sc-m" src={p.mascot} alt={p.mascotAlt} loading="lazy" />
    </section>
  );
}

export default function MetodoPage() {
  return (
    <>
      <Header />
      <SceneParallax />
      <main className="flex-1">
        <section className="lg-mhero lg-dark" data-score="0">
          <img
            className="lg-mh-bg"
            src="/site/metodo/abertura-estadio-noite.webp"
            alt="Estádio de tênis iluminado à noite"
            loading="eager"
          />
          <div className="lg-mh-shade" aria-hidden="true" />
          <div className="lg-in">
            <span className="lg-eyebrow">O método da Legado</span>
            <h1>Match Point</h1>
            <p className="lg-lead">
              O sistema da Legado para conduzir empresas da compreensão do cenário atual até um
              processo contínuo de evolução. Ponto a ponto, como no tênis.
            </p>
            <JumpBoard />
          </div>
        </section>

        <div className="lg-netbar" aria-hidden="true" />

        <section className="lg-section" data-score="0">
          <div className="lg-in lg-why-wrap">
            <div className="lg-why-left">
              <div className="lg-head">
                <span className="lg-eyebrow">Por que o placar do tênis?</span>
                <h2 className="lg-h2">Ninguém fecha um game com um golpe só.</h2>
              </div>
              <img
                className="lg-why-placar"
                src="/site/metodo/placar-tenis.webp"
                alt="Placar de tênis marcando 15, 30, 40 e GAME"
                loading="lazy"
              />
            </div>
            <div className="lg-why">
              {WHY_CARDS.map((c) => (
                <div key={c.title}>
                  <img src={c.icon} alt="" width={64} height={64} loading="lazy" />
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Scene
          id="etapa-15"
          dataScore={0}
          bg="/site/metodo/etapa-15-fundacao.webp"
          num="15"
          eyebrow="Etapa 01 · Fundação"
          score="15"
          title="Fundação Estratégica"
          objective="Entender o jogo antes de executar."
          body="Antes de qualquer anúncio, a Legado lê o negócio: o mercado, quem é o cliente ideal, o que a empresa oferece e como ela se posiciona. Dessa leitura sai o plano de aquisição."
          chips={["Diagnóstico", "Mercado", "ICP", "Oferta", "Posicionamento", "Plano de aquisição"]}
          diff="Estratégia personalizada: nenhuma empresa recebe uma estratégia simplesmente replicada de outro negócio."
          decide="Para quem vender, o que oferecer e por onde começar."
          mascot="/site/metodo/etapa-15-titan-capitao.webp"
          mascotAlt="Titan com a raquete no ombro, pronto para o jogo"
        />

        <Scene
          id="etapa-30"
          dataScore={1}
          reverse
          bg="/site/metodo/etapa-30-validacao.webp"
          num="30"
          eyebrow="Etapa 02 · Validação"
          score="30"
          title="Validação de Mercado"
          objective="Colocar hipóteses em contato com o mercado."
          body="O plano vai para a quadra. Campanhas e testes mostram o que o mercado responde de verdade, e o que não funciona é ajustado rápido."
          chips={["Implementação", "Testes", "Campanhas", "Leitura de mercado", "Validação", "Otimizações"]}
          diff="Evolução contínua: testar, aprender, ajustar e evoluir, em vez de apostar tudo de uma vez."
          decide="O que funciona no seu mercado e o que precisa mudar."
          mascot="/site/metodo/etapa-30-legacy-voleio.webp"
          mascotAlt="Legacy no voleio, junto à rede"
        />

        <Scene
          id="etapa-40"
          dataScore={2}
          bg="/site/metodo/etapa-40-otimizacao.webp"
          num="40"
          eyebrow="Etapa 03 · Otimização"
          score="40"
          title="Otimização Contínua"
          objective="Usar dados para melhorar decisões."
          body="Com números reais na mesa, cada real investido passa a ser acompanhado. Os indicadores mostram onde vale colocar mais esforço e onde cortar."
          chips={["Performance", "Inteligência de dados", "Análise de indicadores", "Otimização", "Plano de evolução"]}
          diff={
            <>
              Decisões orientadas por dados, com transparência: o cliente acompanha os
              indicadores no{" "}
              <Link href={ROUTES.intelligenceLogin} className="underline">
                Legado Intelligence
              </Link>
              .
            </>
          }
          decide="Onde colocar mais esforço e investimento."
          mascot="/site/metodo/etapa-40-titan-tablet.webp"
          mascotAlt="Titan analisando os números no tablet"
        />

        <Scene
          id="etapa-game"
          dataScore={3}
          reverse
          game
          bg="/site/metodo/etapa-game-evolucao.webp"
          num="GAME"
          eyebrow="Etapa 04 · Evolução"
          score="GAME"
          title="Evolução Estratégica"
          objective="Transformar aprendizados em novos movimentos de crescimento."
          body="O que foi aprendido vira estratégia: novas oportunidades, expansão e revisões periódicas do plano. Um game fechado é o começo do próximo."
          chips={["Gestão estratégica", "Crescimento", "Novas oportunidades", "Expansão", "Revisões estratégicas"]}
          diff="Método próprio: o Match Point conduz a estratégia por etapas claras, e cada game fechado abre o próximo."
          decide="Quais são os próximos movimentos de crescimento."
          mascot="/site/metodo/etapa-game-legacy-comemorando.webp"
          mascotAlt="Legacy comemorando o ponto"
        />

        <section className="lg-section lg-dark" data-score="3">
          <div className="lg-in lg-cycle">
            <div className="lg-head">
              <span className="lg-eyebrow">Evolução contínua</span>
              <h2 className="lg-h2">
                Cada movimento gera informação. Cada informação melhora a próxima decisão.
              </h2>
              <p className="lg-lead">
                Depois do GAME, o ciclo recomeça com o que foi aprendido. É assim que o
                crescimento deixa de depender de sorte.
              </p>
            </div>
            <CycleDiagram />
          </div>
        </section>

        <section className="lg-finale lg-dark" data-score="3">
          <div className="lg-fn-shade" aria-hidden="true" />
          <img
            className="lg-fn-t"
            src="/site/metodo/etapa-15-titan-capitao.webp"
            alt="Titan com a raquete no ombro"
            loading="lazy"
          />
          <img
            className="lg-fn-l"
            src="/site/metodo/etapa-game-legacy-comemorando.webp"
            alt="Legacy comemorando"
            loading="lazy"
          />
          <div className="lg-in lg-fn-txt">
            <span className="lg-eyebrow">Próximo movimento</span>
            <h2>Em que ponto está a sua empresa?</h2>
            <p className="lg-lead">Uma conversa basta para descobrir por onde começar.</p>
            <div className="lg-btns" style={{ justifyContent: "center" }}>
              <Link href="/#contato" className="lg-btn lg-btn-metal">
                Vamos conversar
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
