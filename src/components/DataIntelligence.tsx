"use client";

import Reveal from "./Reveal";

const funnel = ["Alcance", "Interesse", "Consideração", "Conversão"];

const metrics = [
  { label: "CAC", hint: "Custo de aquisição" },
  { label: "ROAS", hint: "Retorno sobre investimento" },
  { label: "Conversão", hint: "Eficiência do funil" },
  { label: "Oportunidades", hint: "Potencial identificado" },
];

export default function DataIntelligence() {
  return (
    <section className="relative bg-navy-950 text-white py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-marble-navy" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid-lines opacity-20" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid lg:grid-cols-12 gap-14 items-center">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="text-[12px] tracking-[0.3em] uppercase text-silver-500 mb-6">
                Inteligência de dados
              </p>
              <h2 className="font-serif text-balance text-4xl sm:text-5xl leading-[1.12]">
                Opinião inicia
                <span className="block text-silver-400">uma hipótese.</span>
              </h2>
              <p className="mt-3 font-serif text-2xl sm:text-3xl text-silver-200 italic">
                Dados definem o próximo movimento.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-7 text-silver-400/90 font-light leading-relaxed max-w-md">
                As decisões da Legado são acompanhadas por indicadores reais
                de mercado e performance, permitindo validar estratégias,
                identificar oportunidades e concentrar esforços no que
                apresenta maior potencial.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-10 font-serif text-lg sm:text-xl text-silver-300 italic">
                É assim que pensamos.
              </p>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <Reveal delay={0.15}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8">
                <p className="text-[10px] tracking-[0.2em] uppercase text-silver-500 mb-4">
                  Indicadores acompanhados durante a estratégia
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-white/10 bg-navy-900/60 p-4"
                    >
                      <p className="font-serif text-lg sm:text-xl text-silver-100">
                        {m.label}
                      </p>
                      <p className="mt-1.5 text-[10px] sm:text-[11px] tracking-[0.04em] text-silver-500">
                        {m.hint}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-5">
                  Representação do fluxo de análise
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {funnel.map((step, i) => (
                    <span key={step} className="flex items-center gap-3">
                      <span className="rounded-full border border-white/15 px-4 py-2 text-xs sm:text-sm tracking-[0.05em] text-silver-200">
                        {step}
                      </span>
                      {i < funnel.length - 1 && (
                        <span className="text-silver-600 text-xs">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
