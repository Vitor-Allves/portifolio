"use client";

import { useEffect, useRef } from "react";

export default function Hero() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = stageRef.current;
    if (!area) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const imgs = Array.from(area.querySelectorAll<HTMLElement>("[data-depth]"));

    function onMove(e: PointerEvent) {
      const r = area!.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      imgs.forEach((im) => {
        const d = Number(im.dataset.depth);
        im.style.transform = `translate(${dx * d}px, ${dy * d * 0.5}px)`;
      });
    }
    function onLeave() {
      imgs.forEach((im) => {
        im.style.transform = "";
      });
    }

    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);
    return () => {
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section className="lg-hero lg-dark" data-score="0">
      <svg
        className="absolute inset-x-0 bottom-0 h-[70%] w-full pointer-events-none"
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        fill="none"
        stroke="rgba(191,195,201,.16)"
        strokeWidth="1.5"
      >
        <path d="M0 400 L300 120 H900 L1200 400" />
        <path d="M150 400 L380 190 H820 L1050 400" />
        <path d="M600 120 V400" />
        <path d="M260 290 H940" />
      </svg>

      <div className="lg-in lg-hero-grid">
        <div className="lg-hero-text">
          <span className="lg-eyebrow">Estratégia · Inteligência · Crescimento</span>
          <h1>
            Empresas não precisam de mais ações.{" "}
            <em className="text-metal not-italic">Precisam saber onde agir.</em>
          </h1>
          <p className="lg-lead">
            Estratégia, posicionamento, aquisição e inteligência trabalhando juntos para
            transformar decisões em crescimento.
          </p>
          <div className="lg-btns">
            <a href="#contato" className="lg-btn lg-btn-metal">
              Vamos conversar
            </a>
            <a href="/metodo" className="lg-btn lg-btn-ghost">
              Conhecer o método
            </a>
          </div>
        </div>

        <div className="lg-stage" id="lg-stage" ref={stageRef}>
          <img
            src="/site/geral/logo-legado-branco.svg"
            alt="Legado Enterprise"
            className="lg-logo-big lg-hero-logo-intro"
          />
          <img
            className="lg-m lg-l"
            data-depth="10"
            src="/site/home/titan-apontando-logo.webp"
            alt="Titan apontando para o logo da Legado"
            width={420}
            height={560}
            loading="eager"
          />
          <img
            className="lg-m lg-r"
            data-depth="-10"
            src="/site/home/legacy-apontando-logo.webp"
            alt="Legacy apontando para o logo da Legado"
            width={420}
            height={560}
            loading="eager"
          />
          <div className="lg-floor" aria-hidden="true" />
        </div>
      </div>

      <div className="lg-strip">
        <div className="lg-in-wide">
          <span>Estratégia</span>
          <i>+</i>
          <span>Inteligência</span>
          <i>+</i>
          <span>Execução</span>
          <i>=</i>
          <b>Evolução</b>
        </div>
      </div>
    </section>
  );
}
