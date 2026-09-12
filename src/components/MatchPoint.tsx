"use client";

import { useRef, useState } from "react";
import { m, useScroll, useTransform, useMotionValueEvent } from "framer-motion";

const stages = [
  {
    score: "15",
    title: "Fundação Estratégica",
    goal: "Entender o jogo antes de executar.",
    items: ["Diagnóstico", "Mercado", "ICP", "Oferta", "Posicionamento", "Plano de aquisição"],
  },
  {
    score: "30",
    title: "Validação de Mercado",
    goal: "Colocar hipóteses em contato com o mercado.",
    items: ["Implementação", "Testes", "Campanhas", "Leitura de mercado", "Validação", "Otimizações"],
  },
  {
    score: "40",
    title: "Otimização Contínua",
    goal: "Usar dados para melhorar decisões.",
    items: ["Performance", "Inteligência de dados", "Análise de indicadores", "Otimização", "Plano de evolução"],
  },
  {
    score: "GAME",
    title: "Evolução Estratégica",
    goal: "Transformar aprendizados em novos movimentos de crescimento.",
    items: ["Gestão estratégica", "Crescimento", "Novas oportunidades", "Expansão", "Revisões estratégicas"],
  },
];

export default function MatchPoint() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const ballX = useTransform(scrollYProgress, [0, 1], ["2%", "98%"]);
  const lineScale = scrollYProgress;

  // Discrete, state-driven crossfade (plain CSS transition) rather than
  // binding opacity directly to the scroll progress value: browsers try to
  // hardware-accelerate a style prop bound straight to a scroll-linked
  // motion value via the Web Animations API, which produced incorrect,
  // stuck-looking results across several stages here.
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(stages.length - 1, Math.max(0, Math.floor(v * stages.length)));
    setActive(idx);
  });

  return (
    <section id="match-point" ref={sectionRef} className="relative h-[400vh] bg-navy-950">
      <div className="sticky top-[88px] h-[calc(100svh-88px)] overflow-hidden flex flex-col justify-center text-white">
        <div className="absolute inset-0 bg-marble-navy" aria-hidden="true" />
        <div className="absolute inset-0 bg-grid-lines opacity-20" aria-hidden="true" />

        <div className="relative mx-auto w-full max-w-[1400px] px-6 lg:px-10">
          <div className="text-center mb-5 sm:mb-7">
            <p className="text-[12px] tracking-[0.3em] uppercase text-silver-500">
              Não acreditamos em fórmulas. Criamos um método.
            </p>
            <h2 className="mt-2 font-serif text-4xl sm:text-5xl lg:text-6xl tracking-[0.08em]">
              MATCH POINT
            </h2>
            <p className="mt-2 max-w-xl mx-auto text-sm sm:text-base text-silver-400 font-light">
              O sistema estratégico da Legado para conduzir empresas da
              compreensão do cenário atual até um processo contínuo de
              evolução.
            </p>
          </div>

          <div className="relative h-[300px] sm:h-[260px]">
            {stages.map((stage, i) => (
              <div
                key={stage.title}
                data-stage-index={i}
                aria-hidden={active !== i}
                className={`absolute inset-0 flex flex-col sm:flex-row items-center gap-4 sm:gap-10 transition-opacity duration-700 ease-out ${
                  active === i ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <div className="shrink-0 flex flex-col items-center sm:items-start">
                  <span className="font-serif text-[3.5rem] sm:text-[5.5rem] leading-none text-silver-300/90">
                    {stage.score}
                  </span>
                  <span className="mt-1 text-[11px] tracking-[0.25em] uppercase text-silver-500">
                    Etapa {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="text-center sm:text-left">
                  <h3 className="font-serif text-xl sm:text-2xl lg:text-3xl text-white">
                    {stage.title}
                  </h3>
                  <p className="mt-1.5 text-silver-400 text-sm sm:text-base max-w-md">
                    Objetivo: {stage.goal}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                    {stage.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] sm:text-xs tracking-[0.05em] text-silver-300"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-4 sm:mt-6">
            <div className="relative h-px w-full bg-white/10 overflow-hidden rounded-full">
              <m.div
                style={{ scaleX: lineScale }}
                className="absolute inset-y-0 left-0 w-full origin-left bg-silver-400"
              />
            </div>
            <m.div
              style={{ left: ballX }}
              className="absolute -top-1.5 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-[0_0_16px_2px_rgba(255,255,255,0.4)]"
              aria-hidden="true"
            />
            <div className="mt-3 flex justify-between text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-silver-600">
              <span>Cenário atual</span>
              <span>Evolução contínua</span>
            </div>
          </div>

          <p className="mt-4 sm:mt-6 text-center font-serif text-base sm:text-lg text-silver-300 max-w-lg mx-auto">
            Cada movimento gera informação. Cada informação melhora a
            próxima decisão.
          </p>

          <div className="mt-4 flex justify-center">
            <a
              href="#solucoes"
              className="inline-flex items-center gap-2 border border-silver-400/40 text-silver-200 text-xs sm:text-sm tracking-[0.12em] uppercase px-6 py-3 rounded-full hover:bg-silver-400 hover:text-navy-950 hover:border-silver-400 transition-all duration-300"
            >
              Quero conhecer o Match Point
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
