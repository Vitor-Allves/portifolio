"use client";

import Reveal from "./Reveal";
import FounderCard from "./FounderCard";
import { FOUNDERS } from "@/lib/site-config";

export default function Founders() {
  return (
    <section id="socios" className="relative bg-ice-50 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-marble-ice" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Sócios
            </p>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.1] text-navy-950">
              Por trás da estratégia existem pessoas.
            </h2>
            <p className="mt-4 font-serif text-2xl sm:text-3xl text-navy-600 italic">
              Duas perspectivas. Uma direção.
            </p>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 gap-16 sm:gap-10 items-start relative">
          <FounderCard {...FOUNDERS.joao} name={FOUNDERS.joao.shortName} align="right" />
          <FounderCard {...FOUNDERS.vitor} name={FOUNDERS.vitor.shortName} align="left" />
        </div>

        <div className="mt-14 flex justify-center">
          <span className="rounded-full border border-navy-700/25 bg-white px-5 py-2.5 text-[11px] tracking-[0.16em] uppercase text-navy-600 whitespace-nowrap">
            Estratégia + Execução
          </span>
        </div>
      </div>
    </section>
  );
}
