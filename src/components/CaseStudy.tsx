"use client";

import Reveal from "./Reveal";
import AnimatedCounter from "./AnimatedCounter";

const secondaryMetrics = [
  { label: "Compras", to: 21, decimals: 0, prefix: "", suffix: "" },
  { label: "Impressões", to: 164646, decimals: 0, prefix: "", suffix: "" },
  { label: "Alcance", to: 70329, decimals: 0, prefix: "", suffix: "" },
  { label: "Clicks", to: 1710, decimals: 0, prefix: "", suffix: "" },
  { label: "Custo por compra", to: 54.98, decimals: 2, prefix: "R$ ", suffix: "" },
];

export default function CaseStudy() {
  return (
    <section id="resultados" className="relative bg-ice-50 py-28 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="max-w-2xl mb-16">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Resultados
            </p>
            <p className="font-serif text-lg sm:text-xl text-navy-600 italic mb-2">
              É assim que medimos.
            </p>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.1] text-navy-950">
              Quando estratégia encontra execução.
            </h2>
            <p className="mt-4 font-serif text-2xl sm:text-3xl text-navy-600 italic">
              Um movimento precisa gerar resultado.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-2xl bg-navy-950 text-white p-8 sm:p-14">
            <div className="grid sm:grid-cols-3 gap-10 items-center">
              <div className="text-center sm:text-left">
                <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-3">
                  Investimento
                </p>
                <p className="font-serif text-3xl sm:text-4xl text-silver-300">
                  <AnimatedCounter to={1154.59} decimals={2} prefix="R$ " />
                </p>
              </div>

              <div className="flex justify-center text-silver-500" aria-hidden="true">
                <svg width="52" height="20" viewBox="0 0 52 20" fill="none">
                  <path
                    d="M0 10H48M48 10L38 2M48 10L38 18"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              </div>

              <div className="text-center sm:text-right">
                <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-3">
                  Total de vendas
                </p>
                <p className="font-serif text-4xl sm:text-5xl text-white">
                  <AnimatedCounter to={65694.12} decimals={2} prefix="R$ " />
                </p>
              </div>
            </div>

            <div className="mt-12 flex justify-center">
              <div className="rounded-full border border-silver-400/30 px-8 py-4 text-center">
                <p className="text-[11px] tracking-[0.25em] uppercase text-silver-500">
                  ROAS
                </p>
                <p className="font-serif text-3xl sm:text-4xl text-white">
                  <AnimatedCounter to={56.9} decimals={1} suffix="x" />
                </p>
              </div>
            </div>

            <div className="mt-14 grid grid-cols-2 sm:grid-cols-5 gap-6 border-t border-white/10 pt-10">
              {secondaryMetrics.map((m) => (
                <div key={m.label} className="text-center">
                  <p className="font-serif text-xl sm:text-2xl text-silver-200">
                    <AnimatedCounter
                      to={m.to}
                      decimals={m.decimals}
                      prefix={m.prefix}
                      suffix={m.suffix}
                    />
                  </p>
                  <p className="mt-2 text-[10px] sm:text-[11px] tracking-[0.14em] uppercase text-silver-500">
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <p className="mt-6 text-center text-xs text-navy-500/70 font-light max-w-xl mx-auto">
          Resultados de campanhas anteriores. Resultados anteriores não
          representam garantia de resultados futuros.
        </p>
      </div>
    </section>
  );
}
