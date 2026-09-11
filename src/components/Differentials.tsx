"use client";

import Reveal from "./Reveal";

const items = [
  {
    n: "01",
    title: "Método próprio",
    text: "Match Point conduz a estratégia através de etapas claras de evolução.",
  },
  {
    n: "02",
    title: "Estratégia personalizada",
    text: "Nenhuma empresa recebe uma estratégia simplesmente replicada de outro negócio.",
  },
  {
    n: "03",
    title: "Decisões orientadas por dados",
    text: "Dados deixam de ser relatórios e tornam-se ferramentas de decisão.",
  },
  {
    n: "04",
    title: "Visão de negócio",
    text: "Marketing é tratado como parte da estratégia empresarial.",
  },
  {
    n: "05",
    title: "Evolução contínua",
    text: "Testar. Aprender. Ajustar. Evoluir.",
  },
  {
    n: "06",
    title: "Transparência",
    text: "Clareza nas informações, expectativas, decisões e resultados.",
  },
];

export default function Differentials() {
  return (
    <section className="relative bg-ice-50 text-navy-950 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-marble-ice" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid-lines opacity-[0.4]" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="max-w-2xl mb-16">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Diferenciais
            </p>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl leading-[1.1]">
              Não é sobre fazer marketing.
            </h2>
            <p className="mt-3 font-serif text-3xl sm:text-4xl text-navy-600 italic">
              É sobre construir direção.
            </p>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-navy-700/10 rounded-2xl overflow-hidden">
          {items.map((item, i) => (
            <Reveal key={item.n} delay={(i % 3) * 0.08} className="bg-white">
              <div className="p-8 h-full min-h-[210px] flex flex-col justify-between hover:bg-ice-50 transition-colors duration-300">
                <span className="font-serif text-3xl text-navy-400/70">
                  {item.n}
                </span>
                <div>
                  <h3 className="font-serif text-xl sm:text-2xl text-navy-950 mt-6">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-navy-700/80 font-light leading-relaxed">
                    {item.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
