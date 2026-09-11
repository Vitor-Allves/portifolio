"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

const funnel = [
  { label: "Alcance", value: 100 },
  { label: "Interesse", value: 68 },
  { label: "Consideração", value: 41 },
  { label: "Conversão", value: 19 },
];

const metrics = [
  { label: "CAC", hint: "custo de aquisição" },
  { label: "ROAS", hint: "retorno sobre investimento" },
  { label: "Taxa de conversão", hint: "eficiência do funil" },
  { label: "Oportunidades", hint: "potencial identificado" },
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
          </div>

          <div className="lg:col-span-7">
            <Reveal delay={0.15}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-white/10 bg-navy-900/60 p-4"
                    >
                      <p className="text-[10px] tracking-[0.15em] uppercase text-silver-500">
                        {m.hint}
                      </p>
                      <p className="mt-2 font-serif text-lg sm:text-xl text-silver-100">
                        {m.label}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-5">
                  Funil de aquisição — leitura conceitual
                </p>
                <div className="space-y-4">
                  {funnel.map((step, i) => (
                    <div key={step.label}>
                      <div className="flex justify-between text-xs sm:text-sm text-silver-300 mb-1.5">
                        <span>{step.label}</span>
                        <span className="text-silver-500">{step.value}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${step.value}%` }}
                          viewport={{ once: true, margin: "-15% 0px" }}
                          transition={{
                            duration: 1.1,
                            delay: i * 0.15,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="h-full rounded-full bg-gradient-to-r from-silver-500 to-silver-200"
                        />
                      </div>
                    </div>
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
