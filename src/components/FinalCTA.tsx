"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";
import { CONTACT } from "@/lib/site-config";

export default function FinalCTA() {
  return (
    <section className="relative bg-navy-950 text-white py-32 sm:py-44 overflow-hidden">
      <div className="absolute inset-0 bg-marble-navy" aria-hidden="true" />
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-1/2 left-0 h-px w-full origin-left bg-gradient-to-r from-transparent via-silver-400/50 to-transparent"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-6 lg:px-10 text-center">
        <Reveal>
          <h2 className="font-serif text-balance text-4xl sm:text-5xl lg:text-6xl leading-[1.12]">
            Qual é o próximo movimento da sua empresa?
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-8 text-lg sm:text-xl text-silver-400 font-light leading-relaxed">
            Talvez você não precise fazer mais.
            <br />
            Talvez precise entender melhor onde agir.
          </p>
        </Reveal>
        <Reveal delay={0.3}>
          <a
            href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(
              CONTACT.whatsappMessage
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-12 inline-flex items-center justify-center gap-3 bg-silver-300 text-navy-950 text-sm sm:text-base tracking-[0.12em] uppercase font-medium px-10 py-5 rounded-full hover:bg-white transition-colors duration-300"
          >
            Vamos conversar
          </a>
        </Reveal>
      </div>
    </section>
  );
}
