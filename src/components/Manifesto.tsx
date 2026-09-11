"use client";

import Reveal from "./Reveal";

const lines = [
  "Mais campanha não significa mais crescimento.",
  "Mais ferramenta não significa mais estratégia.",
  "Mais investimento não significa mais resultado.",
];

export default function Manifesto() {
  return (
    <section className="relative bg-navy-950 text-white py-32 sm:py-44 overflow-hidden">
      <div className="absolute inset-0 bg-marble-navy" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-6 lg:px-10 flex flex-col items-center gap-7 text-center">
        {lines.map((line, i) => (
          <Reveal key={line} delay={i * 0.18} y={16}>
            <p className="font-serif text-xl sm:text-2xl lg:text-3xl text-silver-400/90">
              {line}
            </p>
          </Reveal>
        ))}

        <div className="h-16 sm:h-20" aria-hidden="true" />

        <Reveal delay={0.15} y={16}>
          <p className="font-serif text-3xl sm:text-4xl lg:text-5xl text-white">
            Clareza muda o jogo.
          </p>
        </Reveal>

        <Reveal delay={0.35} y={16}>
          <p className="mt-4 text-sm sm:text-base tracking-[0.14em] uppercase text-silver-500">
            É por isso que a Legado existe.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
