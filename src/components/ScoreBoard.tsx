"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const LABELS = ["15", "30", "40", "GAME"];

/**
 * Placar 15·30·40·GAME do cabeçalho. Avança conforme a seção com
 * data-score mais recente já cruzou 45% da altura da viewport — mesmo
 * algoritmo da simulação oficial (updateScore()). Cada página define suas
 * próprias seções data-score="0..3"; este componente só lê o DOM.
 */
export default function ScoreBoard() {
  const pathname = usePathname();
  const spanRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-score]"));
    if (!sections.length) return;

    function update() {
      const line = window.innerHeight * 0.45;
      let score = 0;
      sections.forEach((s) => {
        if (s.getBoundingClientRect().top < line) {
          score = Number(s.dataset.score);
        }
      });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        score = 3;
      }
      spanRefs.current.forEach((sp, i) => {
        if (!sp) return;
        sp.classList.toggle("lg-on", i === score);
        sp.classList.toggle("lg-done", i < score);
      });
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  return (
    <div className="lg-placar" aria-label="Placar da leitura">
      {LABELS.map((label, i) => (
        <span
          key={label}
          ref={(el) => {
            spanRefs.current[i] = el;
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
