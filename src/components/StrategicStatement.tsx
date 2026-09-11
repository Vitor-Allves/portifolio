"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

const scattered = [
  { label: "Campanhas", x: "6%", y: "10%", rotate: -6 },
  { label: "Canais", x: "78%", y: "6%", rotate: 4 },
  { label: "Ferramentas", x: "14%", y: "68%", rotate: 5 },
  { label: "Conteúdo", x: "82%", y: "62%", rotate: -4 },
  { label: "Investimentos", x: "46%", y: "82%", rotate: 3 },
  { label: "Fornecedores", x: "50%", y: "4%", rotate: -3 },
];

const system = ["ESTRATÉGIA", "POSICIONAMENTO", "AQUISIÇÃO", "DADOS", "PERFORMANCE"];

export default function StrategicStatement() {
  return (
    <section className="relative bg-ice-50 py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-marble-ice" aria-hidden="true" />
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

        <div className="relative mt-24 h-[420px] sm:h-[460px]">
          {scattered.map((item, i) => (
            <motion.div
              key={item.label}
              style={{ x: "-50%", y: "-50%" }}
              initial={{ opacity: 0, left: item.x, top: item.y, rotate: item.rotate }}
              whileInView={{
                opacity: [0, 1, 1, 0],
                left: [item.x, item.x, `${18 + i * 16}%`, `${18 + i * 16}%`],
                top: [item.y, item.y, "42%", "42%"],
                rotate: [item.rotate, item.rotate, 0, 0],
              }}
              viewport={{ once: true, margin: "-20% 0px -20% 0px" }}
              transition={{
                duration: 2.6,
                ease: [0.16, 1, 0.3, 1],
                delay: i * 0.06,
              }}
              className="absolute rounded-full border border-navy-700/20 bg-white px-5 py-2.5 text-xs sm:text-sm tracking-[0.08em] uppercase text-navy-600 shadow-[0_10px_30px_-15px_rgba(15,30,51,0.35)]"
            >
              {item.label}
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-20% 0px -20% 0px" }}
            transition={{ delay: 1.9, duration: 0.6 }}
            className="absolute left-1/2 top-[42%] w-[92%] max-w-3xl -translate-x-1/2 -translate-y-1/2"
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-navy-700/40 to-transparent" />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
              {system.map((word, i) => (
                <span key={word} className="flex items-center gap-4">
                  <span className="rounded-full border border-navy-700 bg-navy-950 px-4 py-2 text-[11px] sm:text-xs tracking-[0.12em] text-silver-200">
                    {word}
                  </span>
                  {i < system.length - 1 && (
                    <span className="text-navy-400 text-xs">→</span>
                  )}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-10 text-center font-serif text-xl sm:text-2xl text-navy-800 max-w-2xl mx-auto">
            Quando tudo trabalha na mesma direção, marketing deixa de ser
            atividade e passa a ser estratégia de crescimento.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
