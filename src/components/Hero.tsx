"use client";

import { m } from "framer-motion";
import dynamic from "next/dynamic";
import { BRAND, CONTACT } from "@/lib/site-config";

const HeroField = dynamic(() => import("./HeroField"), { ssr: false });

const equationParts = ["ESTRATÉGIA", "INTELIGÊNCIA", "EXECUÇÃO"];

export default function Hero() {
  return (
    <section
      id="inicio"
      className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden bg-navy-950 text-white"
    >
      <div className="absolute inset-0 bg-marble-navy" />
      <div className="absolute inset-0 bg-grid-lines opacity-[0.35]" />
      <HeroField />
      <div
        className="absolute inset-0 bg-gradient-to-b from-navy-950/10 via-transparent to-navy-950"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[70vw] w-[70vw] -translate-x-1/2 rounded-full bg-navy-700/25 blur-[70px] sm:blur-[140px]"
        aria-hidden="true"
      />

      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, delay: 0.2 }}
        className="pointer-events-none absolute right-[2%] top-1/2 z-0 hidden w-[85vw] -translate-y-1/2 lg:block lg:right-[6%] lg:w-[38vw] xl:w-[34vw] xl:max-w-[720px]"
        aria-hidden="true"
      >
        {/* <picture>'s media-gated <source> keeps this asset out of the
            mobile/tablet network payload entirely, not just visually hidden. */}
        <picture>
          <source media="(min-width: 1024px)" srcSet={BRAND.logoWhite} />
          <img alt="" className="h-auto w-full opacity-100" />
        </picture>
      </m.div>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 lg:px-10 pt-28 pb-16">
        <m.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-[12px] sm:text-sm tracking-[0.35em] uppercase text-silver-400 mb-8"
        >
          Estratégia · Inteligência · Crescimento
        </m.p>

        <h1 className="font-serif text-balance text-[2.4rem] leading-[1.12] sm:text-6xl sm:leading-[1.1] lg:text-[5.2rem] lg:leading-[1.05] max-w-5xl">
          <m.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="block"
          >
            Empresas não precisam
          </m.span>
          <m.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="block"
          >
            de mais ações.
          </m.span>
          <m.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="block mt-2 sm:mt-3 text-silver-300 italic"
          >
            Precisam saber{" "}
            <span className="text-white not-italic relative">
              onde agir.
              <m.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-1 left-0 h-px w-full origin-left bg-silver-400/70"
              />
            </span>
          </m.span>
        </h1>

        <m.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-9 max-w-xl text-base sm:text-lg text-silver-300/90 font-light leading-relaxed"
        >
          Estratégia, posicionamento, aquisição e inteligência trabalhando na
          mesma direção para transformar decisões em crescimento.
        </m.p>

        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.95 }}
          className="mt-11 flex flex-col sm:flex-row gap-4"
        >
          <a
            href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(
              CONTACT.whatsappMessage
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-silver-300 text-navy-950 text-sm tracking-[0.1em] uppercase font-medium px-8 py-4 rounded-full hover:bg-white transition-colors duration-300"
          >
            Descubra seu próximo movimento
          </a>
          <a
            href="#legado"
            className="inline-flex items-center justify-center gap-2 border border-white/25 text-silver-100 text-sm tracking-[0.1em] uppercase px-8 py-4 rounded-full hover:border-white/60 transition-colors duration-300"
          >
            Conheça a Legado
          </a>
        </m.div>

        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.3 }}
          className="mt-20 flex flex-wrap items-center gap-x-3 gap-y-3 text-[11px] sm:text-xs tracking-[0.18em] uppercase text-silver-400"
        >
          {equationParts.map((part, i) => (
            <span key={part} className="flex items-center gap-3">
              <span className="text-silver-200">{part}</span>
              {i < equationParts.length - 1 && (
                <span className="text-silver-600">+</span>
              )}
            </span>
          ))}
          <span className="text-silver-600">=</span>
          <span className="text-white font-medium">EVOLUÇÃO</span>
        </m.div>
      </div>

      <div
        className="hidden sm:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-silver-500"
        aria-hidden="true"
      >
        <span className="text-[10px] tracking-[0.3em] uppercase">Role</span>
        <span className="h-10 w-px bg-gradient-to-b from-silver-400 to-transparent" />
      </div>
    </section>
  );
}
