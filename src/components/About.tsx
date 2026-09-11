"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

const floatingWords = [
  "ESTRATÉGIA",
  "DADOS",
  "AQUISIÇÃO",
  "POSICIONAMENTO",
  "PERFORMANCE",
  "CRESCIMENTO",
];

export default function About() {
  return (
    <section
      id="legado"
      className="relative bg-white text-navy-950 py-28 sm:py-36 overflow-hidden"
    >
      <div className="absolute inset-0 bg-marble-ice" aria-hidden="true" />
      <div className="absolute inset-0 bg-grid-lines opacity-[0.4]" aria-hidden="true" />

      <div
        className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-6 overflow-hidden opacity-[0.05]"
        aria-hidden="true"
      >
        {floatingWords.map((word, i) => (
          <motion.div
            key={word}
            initial={{ x: i % 2 === 0 ? "-100%" : "100%" }}
            whileInView={{ x: i % 2 === 0 ? "0%" : "0%" }}
            viewport={{ once: true }}
            transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
            className="whitespace-nowrap font-serif text-[10vw] leading-none tracking-tight text-navy-700"
          >
            {word} — {word} — {word}
          </motion.div>
        ))}
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-6">
                Quem é a Legado
              </p>
              <h2 className="font-serif text-balance text-4xl sm:text-5xl leading-[1.12]">
                Nós não começamos
                <span className="block text-navy-600">pelas ferramentas.</span>
              </h2>
              <p className="mt-6 font-serif text-3xl sm:text-4xl text-navy-700 italic">
                Começamos pelo negócio.
              </p>
            </Reveal>
          </div>

          <div className="lg:col-span-7 lg:pt-3">
            <Reveal delay={0.15}>
              <p className="text-lg sm:text-xl text-navy-800/90 font-light leading-relaxed">
                A Legado Enterprise é uma empresa de estratégia e marketing
                voltada à construção de soluções capazes de gerar
                oportunidades comerciais e crescimento.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-6 text-base sm:text-lg text-navy-700/80 font-light leading-relaxed">
                Cada projeto começa pela compreensão do negócio, mercado,
                cliente, objetivos e oportunidades. A partir dessa leitura,
                estratégia, posicionamento, aquisição, comunicação, dados e
                performance passam a trabalhar na mesma direção.
              </p>
            </Reveal>

            <Reveal delay={0.45}>
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-px bg-navy-700/10 rounded-lg overflow-hidden">
                {[
                  "Estratégia",
                  "Posicionamento",
                  "Aquisição",
                  "Comunicação",
                  "Dados",
                  "Performance",
                ].map((tag) => (
                  <div
                    key={tag}
                    className="bg-ice-50 px-4 py-5 text-center text-[11px] sm:text-xs tracking-[0.12em] uppercase text-navy-700"
                  >
                    {tag}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
