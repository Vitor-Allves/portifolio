"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

// Motor de movimento da home cinematográfica.
// - Sem movimento se o sistema pedir prefers-reduced-motion: o conteúdo já
//   vem renderizado no estado final (SSR), então nada fica escondido.
// - Desktop (mouse + tela larga): Lenis para o scroll suave, parallax leve
//   e o mockup 3D do Intelligence ligado ao scroll.
// - Mobile / toque: só revelação curta no scroll, sem Lenis e sem parallax,
//   para ficar leve no celular.
export default function CinMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const root = document.getElementById("cin-home");
    if (!root) return;

    const desktop = window.matchMedia(
      "(min-width: 900px) and (hover: hover) and (pointer: fine)",
    ).matches;

    const ctx = gsap.context(() => {
      // Revelação ao entrar na tela.
      gsap.utils.toArray<HTMLElement>("[data-cin-reveal]").forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: desktop ? 44 : 22,
          duration: desktop ? 1.4 : 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });

      // Números que contam ao rolar. O texto final já vem do servidor;
      // aqui ele volta a zero só quando a seção entra na tela.
      gsap.utils.toArray<HTMLElement>("[data-cin-count]").forEach((el) => {
        const to = Number(el.dataset.cinCount);
        const dec = Number(el.dataset.cinDec ?? 0);
        const fmt = (v: number) =>
          v.toLocaleString("pt-BR", {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec,
          });
        const state = { v: 0 };
        gsap.to(state, {
          v: to,
          duration: 2.2,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
          onStart: () => {
            el.textContent = fmt(0);
          },
          onUpdate: () => {
            el.textContent = fmt(state.v);
          },
          onComplete: () => {
            el.textContent = fmt(to);
          },
        });
      });

      if (desktop) {
        // Parallax leve nos elementos marcados com data-cin-parallax.
        gsap.utils.toArray<HTMLElement>("[data-cin-parallax]").forEach((el) => {
          gsap.to(el, {
            yPercent: Number(el.dataset.cinParallax),
            ease: "none",
            scrollTrigger: {
              trigger: el.parentElement,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });
        });

        // Mockup 3D do Legado Intelligence: abre de inclinado para reto.
        gsap.fromTo(
          "[data-cin-3d]",
          { rotateX: 22, rotateY: -18, y: 90 },
          {
            rotateX: 0,
            rotateY: 0,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-cin-3d]",
              start: "top 92%",
              end: "center 45%",
              scrub: true,
            },
          },
        );
      }
    }, root);

    let lenis: Lenis | undefined;
    const tick = (time: number) => lenis?.raf(time * 1000);

    if (desktop) {
      lenis = new Lenis({ duration: 1.2, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // Fontes e imagens mudam a altura das seções: recalcula os gatilhos.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ctx.revert();
      if (lenis) {
        gsap.ticker.remove(tick);
        lenis.destroy();
      }
    };
  }, []);

  return null;
}
