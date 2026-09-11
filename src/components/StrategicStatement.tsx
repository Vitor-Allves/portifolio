"use client";

import Reveal from "./Reveal";

export default function StrategicStatement() {
  return (
    <section className="relative bg-ice-50 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-marble-ice" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid-lines opacity-[0.4]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="max-w-3xl">
          <Reveal>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.1] text-navy-950">
              Crescer não é fazer mais.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <h3 className="font-serif text-balance text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-navy-600 mt-3">
              É saber exatamente onde agir.
            </h3>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="mt-8 max-w-xl text-navy-700/80 text-base sm:text-lg font-light leading-relaxed">
              Muitas empresas acumulam campanhas, canais, ferramentas, conteúdo,
              investimentos e fornecedores — e continuam sem clareza sobre qual
              movimento realmente gera crescimento.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <div className="mt-16 h-px w-full max-w-3xl bg-gradient-to-r from-navy-700/30 via-navy-700/10 to-transparent" />
        </Reveal>

        <Reveal delay={0.3}>
          <p className="mt-16 font-serif text-xl sm:text-2xl lg:text-3xl text-navy-800 max-w-2xl">
            Quando tudo trabalha na mesma direção, marketing deixa de ser
            atividade e passa a ser estratégia de crescimento.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
