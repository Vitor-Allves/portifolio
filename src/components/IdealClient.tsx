"use client";

import Reveal from "./Reveal";

const profiles = [
  "Empresários buscando expansão.",
  "Empresas que já vendem, mas querem mais previsibilidade.",
  "Negócios que investem em marketing sem clareza estratégica.",
  "Empresas buscando estruturar aquisição.",
  "Gestores que desejam decisões orientadas por dados.",
  "Empresas que precisam conectar marketing e comercial.",
];

export default function IdealClient() {
  return (
    <section className="relative bg-ice-50 py-28 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="max-w-2xl mb-16">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Para quem é a Legado
            </p>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.1] text-navy-950">
              Para empresas que não querem apenas aparecer.
            </h2>
            <p className="mt-4 font-serif text-2xl sm:text-3xl text-navy-600 italic">
              Querem crescer.
            </p>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile, i) => (
            <Reveal key={profile} delay={(i % 3) * 0.08}>
              <div className="h-full rounded-xl border border-navy-700/15 bg-white p-6 flex items-start gap-4">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-600" />
                <p className="text-navy-800 font-light leading-relaxed">{profile}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mt-16 text-center font-serif text-xl sm:text-2xl text-navy-800 max-w-2xl mx-auto">
            Se crescimento está entre as suas prioridades, provavelmente
            temos algo para conversar.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
