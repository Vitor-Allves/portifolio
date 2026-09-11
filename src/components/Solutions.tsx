"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Reveal from "./Reveal";

const solutions = [
  {
    title: "Estratégia e Planejamento",
    description:
      "Leitura do negócio, do mercado e dos objetivos antes de qualquer execução.",
  },
  {
    title: "Posicionamento de Marca",
    description:
      "Clareza sobre o que a empresa representa e para quem ela realmente fala.",
  },
  {
    title: "Aquisição de Clientes",
    description:
      "Estruturas de captação conectadas diretamente a metas comerciais.",
  },
  {
    title: "Tráfego e Performance",
    description:
      "Canais pagos orientados por indicadores, não por volume de investimento.",
  },
  {
    title: "Geração de Demanda",
    description:
      "Criação de interesse e autoridade antes da decisão de compra.",
  },
  {
    title: "Inteligência de Dados",
    description:
      "Indicadores tratados como ferramenta de decisão, não apenas relatório.",
  },
  {
    title: "Análise de Mercado",
    description:
      "Leitura de concorrência, comportamento e oportunidades reais.",
  },
  {
    title: "Conteúdo e Comunicação",
    description: "Mensagens consistentes com a estratégia em todos os canais.",
  },
  {
    title: "E-mail Marketing",
    description:
      "Relacionamento e conversão trabalhados como parte do funil de aquisição.",
  },
];

export default function Solutions() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="solucoes" className="relative bg-ice-50 py-28 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="max-w-2xl mb-16">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Soluções
            </p>
            <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.1] text-navy-950">
              Uma estratégia.
              <span className="block text-navy-600">Diversos movimentos.</span>
            </h2>
          </Reveal>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-navy-950/10 rounded-2xl overflow-hidden">
          {solutions.map((solution, i) => (
            <motion.button
              key={solution.title}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.6, delay: (i % 3) * 0.08 }}
              className="group relative bg-ice-50 p-8 text-left min-h-[190px] flex flex-col justify-between overflow-hidden"
            >
              <span className="text-[11px] tracking-[0.2em] text-navy-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-serif text-xl sm:text-2xl text-navy-950 mt-8 group-hover:text-navy-700 transition-colors">
                  {solution.title}
                </h3>
                <motion.p
                  initial={false}
                  animate={{
                    height: active === i ? "auto" : 0,
                    opacity: active === i ? 1 : 0,
                  }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-3 text-sm text-navy-700/80 font-light leading-relaxed overflow-hidden"
                >
                  {solution.description}
                </motion.p>
              </div>
              <span
                className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 bg-navy-700 transition-all duration-500 group-hover:w-full"
                aria-hidden="true"
              />
            </motion.button>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="mt-14 text-center font-serif text-xl sm:text-2xl text-navy-800">
            A ferramenta nunca vem antes da estratégia.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
