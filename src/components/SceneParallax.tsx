"use client";

import { useEffect } from "react";

/**
 * Parallax diferencial de rolagem das cenas cinematográficas do /metodo
 * (fundo, número gigante e mascote em profundidades distintas via --p).
 * Porta 1:1 a lógica da simulação oficial.
 */
export default function SceneParallax() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lg-scene, .lg-finale"));
    if (!els.length) return;

    function update() {
      const vh = window.innerHeight;
      els.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (!r.height || r.bottom < -200 || r.top > vh + 200) return;
        const p = (r.top + r.height / 2 - vh / 2) / vh;
        s.style.setProperty("--p", Math.max(-1.2, Math.min(1.2, p)).toFixed(3));
      });
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return null;
}
