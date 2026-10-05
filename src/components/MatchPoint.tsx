"use client";

import { useEffect, useRef } from "react";

const POINTS = [
  { x: 23, y: 90.9, score: "15", label: "Fundação Estratégica" },
  { x: 76, y: 77.9, score: "30", label: "Validação de Mercado" },
  { x: 30, y: 65.8, score: "40", label: "Otimização Contínua" },
  { x: 68, y: 63.5, score: "GAME", label: "Evolução Estratégica" },
];

// Trajetória da bola: saque (fora de quadra) -> cada etiqueta, na ordem.
const BALL_PATH: [number, number][] = [
  [4, 104],
  [23, 90.9],
  [76, 77.9],
  [30, 65.8],
  [68, 63.5],
];

const FLY = 900;
const PAUSE = 700;
const END = 1900;

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function MatchPoint() {
  const ballRef = useRef<HTMLImageElement>(null);
  const pinRefs = useRef<Array<HTMLDivElement | null>>([]);
  const spotRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      pinRefs.current.forEach((p) => p?.classList.add("lg-on"));
      spotRefs.current.forEach((s) => s?.classList.add("lg-on"));
      return;
    }
    const ball = ballRef.current;
    if (!ball) return;
    ball.style.display = "block";

    let seg = 0;
    let t0: number | null = null;
    let wait = 0;
    let raf = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    function frame(ts: number) {
      if (t0 === null) t0 = ts;
      const el = ts - t0;
      if (el >= wait) {
        const p = Math.min(1, (el - wait) / FLY);
        const e = ease(p);
        const a = BALL_PATH[seg];
        const b = BALL_PATH[seg + 1];
        const x = a[0] + (b[0] - a[0]) * e;
        const y = a[1] + (b[1] - a[1]) * e - Math.sin(Math.PI * p) * 14;
        ball!.style.left = `${x}%`;
        ball!.style.top = `${y}%`;
        ball!.style.transform = `translate(-50%, -50%) scale(${1 + Math.sin(Math.PI * p) * 0.35})`;
        if (p >= 1) {
          pinRefs.current[seg]?.classList.add("lg-on");
          spotRefs.current[seg]?.classList.add("lg-on");
          seg++;
          t0 = ts;
          wait = PAUSE;
          if (seg >= BALL_PATH.length - 1) {
            seg = 0;
            wait = END;
            resetTimer = setTimeout(() => {
              pinRefs.current.forEach((pin) => pin?.classList.remove("lg-on"));
              spotRefs.current.forEach((s) => s?.classList.remove("lg-on"));
            }, END - 150);
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  return (
    <section className="lg-mp lg-dark" id="metodo" data-score="1">
      <div className="lg-cs-wrap">
        <div className="lg-cs-head">
          <span className="lg-eyebrow">Não acreditamos em fórmulas. Criamos um método.</span>
          <h2>Match Point</h2>
          <p>Ponto a ponto, como no tênis: cada etapa prepara a próxima.</p>
        </div>
        <div className="lg-clay-scroll">
          <div className="lg-clayscene">
            <img
              className="lg-cs-img"
              src="/site/home/match-point-quadra-saibro.webp"
              alt="Titan e Legacy apertando as mãos sobre a rede de uma quadra de saibro ao entardecer"
              loading="eager"
            />
            <div className="lg-cs-shade" aria-hidden="true" />
            {POINTS.map((pt, i) => (
              <span
                key={pt.score}
                className="lg-spot"
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                ref={(el) => {
                  spotRefs.current[i] = el;
                }}
                aria-hidden="true"
              />
            ))}
            {POINTS.map((pt, i) => (
              <div
                key={pt.score}
                className="lg-pin"
                style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
                <span className="lg-sc">{pt.score}</span>
                <b>{pt.label}</b>
              </div>
            ))}
            <img
              ref={ballRef}
              className="lg-ar-ball"
              src="/site/geral/bola-tenis.webp"
              alt=""
              aria-hidden="true"
            />
          </div>
        </div>
        <p className="lg-swipe">Deslize para acompanhar o ponto →</p>
        <ul className="lg-mp-list">
          {POINTS.map((pt) => (
            <li key={pt.score}>
              <span className="lg-sc">{pt.score}</span>
              <b>{pt.label}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="lg-in lg-mp-cta">
        <p>Cada movimento gera informação. Cada informação melhora a próxima decisão.</p>
        <a href="/metodo" className="lg-btn lg-btn-metal">
          Ver o método completo
        </a>
      </div>
    </section>
  );
}
