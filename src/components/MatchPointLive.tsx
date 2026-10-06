"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";

type Etapa = {
  sc: string;
  nm: string;
  ob: string;
  dc: string;
  href: string;
};

const ETAPAS: Etapa[] = [
  {
    sc: "15",
    nm: "Fundação Estratégica",
    ob: "Entender o jogo antes de executar.",
    dc: "Para quem vender, o que oferecer e por onde começar.",
    href: "/metodo#etapa-15",
  },
  {
    sc: "30",
    nm: "Validação de Mercado",
    ob: "Colocar hipóteses em contato com o mercado.",
    dc: "O que funciona no seu mercado e o que precisa mudar.",
    href: "/metodo#etapa-30",
  },
  {
    sc: "40",
    nm: "Otimização Contínua",
    ob: "Usar dados para melhorar decisões.",
    dc: "Onde colocar mais esforço e investimento.",
    href: "/metodo#etapa-40",
  },
  {
    sc: "GAME",
    nm: "Evolução Estratégica",
    ob: "Transformar aprendizados em novos movimentos de crescimento.",
    dc: "Quais são os próximos movimentos de crescimento.",
    href: "/metodo#etapa-game",
  },
];

type Pt = [number, number];
type Flight = { a: Pt; b: Pt; c: Pt; path: SVGPathElement; len: number };

export default function MatchPointLive() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;

    let alive = true;
    const cleanupFns: Array<() => void> = [];

    const stage = sec.querySelector<HTMLElement>("#mp2Stage");
    const scroller = sec.querySelector<HTMLElement>("#mp2Scroll");
    const ball = sec.querySelector<HTMLElement>("#mp2Ball");
    const trails = sec.querySelector<SVGGElement>(".mp2-trails");
    const pts = Array.from(sec.querySelectorAll<HTMLButtonElement>(".mp2-pt"));
    const cells = Array.from(sec.querySelectorAll<HTMLElement>(".mp2-cell"));
    const replay = sec.querySelector<HTMLButtonElement>("#mp2Replay");
    const card = sec.querySelector<HTMLElement>("#mp2Card");
    if (!stage || !scroller || !ball || !trails || !replay || !card || pts.length !== 4) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const VB: [number, number] = [1916, 821];
    const START: Pt = [3.2, 51];

    const P: Pt[] = pts.map((p) => [
      parseFloat(p.style.getPropertyValue("--x")),
      parseFloat(p.style.getPropertyValue("--y")),
    ]);

    const flights: Flight[] = [];
    let prev: Pt = START;
    P.forEach((b) => {
      const a = prev;
      const c: Pt = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 16];
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M" +
          (a[0] * VB[0]) / 100 +
          " " +
          (a[1] * VB[1]) / 100 +
          " Q" +
          (c[0] * VB[0]) / 100 +
          " " +
          (c[1] * VB[1]) / 100 +
          " " +
          (b[0] * VB[0]) / 100 +
          " " +
          (b[1] * VB[1]) / 100
      );
      trails.appendChild(path);
      const len = path.getTotalLength();
      flights.push({ a, b, c, path, len });
      prev = b;
    });

    function q(f: Flight, t: number): Pt {
      const u = 1 - t;
      return [
        u * u * f.a[0] + 2 * u * t * f.c[0] + t * t * f.b[0],
        u * u * f.a[1] + 2 * u * t * f.c[1] + t * t * f.b[1],
      ];
    }

    const FLY = 900;
    const GAP = 350;
    const T0 = 2000;
    const landAt = flights.map((_, i) => T0 + i * (FLY + GAP) + FLY);
    const END = landAt[3] + 750;

    let clock = 0;
    let last: number | null = null;
    let running = false;
    let paused = false;
    let fired: Record<string, number> = {};
    let userScrolled = false;
    let rafId = 0;

    function setCells(k: number) {
      cells.forEach((c, j) => {
        c.classList.toggle("is-on", j === k);
        c.classList.toggle("is-done", j < k);
      });
    }

    function land(k: number) {
      const p = pts[k];
      p.classList.add("is-lit");
      p.classList.remove("is-hit");
      void p.offsetWidth;
      p.classList.add("is-hit");
      flights[k].path.classList.add("is-old");
      setCells(k);
      if (k === 3) {
        sec!.classList.add("is-game", "is-legacy", "is-flash");
        sec!.classList.remove("is-sheen");
        void sec!.offsetWidth;
        sec!.classList.add("is-sheen");
      }
    }

    function once(key: string, fn: () => void) {
      if (!fired[key]) {
        fired[key] = 1;
        fn();
      }
    }

    function follow(xPct: number) {
      if (userScrolled || scroller!.scrollWidth <= scroller!.clientWidth + 2) return;
      const x = (stage!.offsetWidth * xPct) / 100 - scroller!.clientWidth / 2;
      scroller!.scrollLeft = Math.max(0, x);
    }

    function frame(ts: number) {
      if (!alive || !running) return;
      if (last === null) last = ts;
      const dt = ts - last;
      last = ts;
      if (!paused) clock += dt;
      if (clock >= 0) once("on", () => sec!.classList.add("is-on"));
      if (clock >= 600) once("title", () => sec!.classList.add("is-title"));
      if (clock >= 1500) once("sheen", () => sec!.classList.add("is-sheen"));
      if (clock >= 1400) once("titan", () => sec!.classList.add("is-titan"));
      let flying = false;
      flights.forEach((f, i) => {
        const s = T0 + i * (FLY + GAP);
        if (clock >= s && clock < s + FLY) {
          flying = true;
          const t = (clock - s) / FLY;
          const pt = q(f, t);
          ball!.style.left = pt[0] + "%";
          ball!.style.top = pt[1] + "%";
          ball!.style.opacity = "1";
          ball!.style.transform = `translate(-50%, -50%) scale(${1 + Math.sin(Math.PI * t) * 0.35})`;
          f.path.style.opacity = "1";
          f.path.style.strokeDashoffset = String(f.len * (1 - t));
          follow(pt[0]);
        }
        if (clock >= s + FLY) {
          once("land" + i, () => {
            f.path.style.strokeDashoffset = "0";
            land(i);
          });
        }
      });
      if (!flying && clock > T0) {
        let lastLanded = -1;
        landAt.forEach((t, i) => {
          if (clock >= t) lastLanded = i;
        });
        if (lastLanded >= 0) {
          const b = P[lastLanded];
          ball!.style.left = b[0] + "%";
          ball!.style.top = b[1] + "%";
          ball!.style.transform = "translate(-50%, -50%) scale(1)";
        }
      }
      if (clock >= END) {
        once("end", () => {
          ball!.style.opacity = "0";
          sec!.classList.add("is-done");
          sec!.classList.remove("is-flash");
          replay!.hidden = false;
        });
        running = false;
        return;
      }
      rafId = requestAnimationFrame(frame);
    }

    let openIdx = -1;

    function closeCard() {
      card!.hidden = true;
      if (openIdx >= 0) pts[openIdx].classList.remove("is-open");
      openIdx = -1;
      paused = false;
    }

    function openCard(i: number) {
      if (!pts[i].classList.contains("is-lit")) return;
      if (openIdx >= 0) pts[openIdx].classList.remove("is-open");
      openIdx = i;
      paused = true;
      pts[i].classList.add("is-open");
      const e = ETAPAS[i];
      card!.querySelector(".mp2-card-sc")!.textContent = e.sc;
      card!.querySelector(".mp2-card-nm")!.textContent = e.nm;
      card!.querySelector(".mp2-card-ob")!.textContent = e.ob;
      card!.querySelector(".mp2-card-dc span")!.textContent = e.dc;
      card!.querySelector(".mp2-card-lk")!.setAttribute("href", e.href);
      card!.hidden = false;
      const W = stage!.offsetWidth;
      const H = stage!.offsetHeight;
      const cw = card!.offsetWidth;
      const ch = card!.offsetHeight;
      const x = (W * P[i][0]) / 100;
      const tag = pts[i].querySelector(".mp2-tag")!.getBoundingClientRect();
      const st = stage!.getBoundingClientRect();
      let top = tag.top - st.top - ch - 10;
      if (top < 8) top = tag.bottom - st.top + 10;
      card!.style.left = Math.max(8, Math.min(W - cw - 8, x - cw / 2)) + "px";
      card!.style.top = Math.max(8, Math.min(H - ch - 8, top)) + "px";
    }

    function reset() {
      clock = 0;
      last = null;
      fired = {};
      paused = false;
      userScrolled = false;
      sec!.classList.remove("is-on", "is-title", "is-sheen", "is-titan", "is-legacy", "is-game", "is-flash", "is-done");
      pts.forEach((p) => p.classList.remove("is-lit", "is-hit", "is-open"));
      flights.forEach((f) => {
        f.path.classList.remove("is-old");
        f.path.style.opacity = "0";
        f.path.style.strokeDasharray = String(f.len);
        f.path.style.strokeDashoffset = String(f.len);
      });
      cells.forEach((c) => c.classList.remove("is-on", "is-done"));
      ball!.style.opacity = "0";
      replay!.hidden = true;
      closeCard();
    }

    function play() {
      reset();
      void sec!.offsetWidth;
      running = true;
      rafId = requestAnimationFrame(frame);
    }

    function finalState() {
      sec!.classList.add("is-on", "is-title", "is-titan", "is-legacy", "is-game", "is-done");
      pts.forEach((p) => p.classList.add("is-lit"));
      flights.forEach((f) => {
        f.path.style.strokeDasharray = String(f.len);
        f.path.style.strokeDashoffset = "0";
        f.path.style.opacity = "0.25";
      });
      setCells(3);
    }

    const onMouseEnterFns: Array<() => void> = [];
    const onClickFns: Array<(ev: MouseEvent) => void> = [];
    pts.forEach((p, i) => {
      const onEnter = () => openCard(i);
      const onClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        if (openIdx === i) closeCard();
        else openCard(i);
      };
      p.addEventListener("mouseenter", onEnter);
      p.addEventListener("click", onClick);
      onMouseEnterFns.push(onEnter);
      onClickFns.push(onClick);
      cleanupFns.push(() => {
        p.removeEventListener("mouseenter", onEnter);
        p.removeEventListener("click", onClick);
      });
    });

    const onStageLeave = () => closeCard();
    stage.addEventListener("mouseleave", onStageLeave);
    cleanupFns.push(() => stage.removeEventListener("mouseleave", onStageLeave));

    const onCardEnter = () => {
      paused = true;
    };
    card.addEventListener("mouseenter", onCardEnter);
    cleanupFns.push(() => card.removeEventListener("mouseenter", onCardEnter));

    const onKeydown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeCard();
    };
    document.addEventListener("keydown", onKeydown);
    cleanupFns.push(() => document.removeEventListener("keydown", onKeydown));

    const onDocClick = (ev: MouseEvent) => {
      if (openIdx >= 0 && !card!.contains(ev.target as Node)) closeCard();
    };
    document.addEventListener("click", onDocClick);
    cleanupFns.push(() => document.removeEventListener("click", onDocClick));

    const onScrollerStart = () => {
      userScrolled = true;
    };
    ["touchstart", "wheel", "pointerdown"].forEach((ev) => {
      scroller.addEventListener(ev, onScrollerStart, { passive: true });
      cleanupFns.push(() => scroller.removeEventListener(ev, onScrollerStart));
    });

    let onPointerMove: ((ev: PointerEvent) => void) | null = null;
    if (!reduce) {
      onPointerMove = (ev: PointerEvent) => {
        const r = stage.getBoundingClientRect();
        sec!.style.setProperty("--px", (((ev.clientX - r.left) / r.width) - 0.5).toFixed(3));
        sec!.style.setProperty("--py", (((ev.clientY - r.top) / r.height) - 0.5).toFixed(3));
      };
      stage.addEventListener("pointermove", onPointerMove);
      cleanupFns.push(() => stage.removeEventListener("pointermove", onPointerMove!));
    }

    const onReplayClick = () => {
      if (!reduce) play();
    };
    replay.addEventListener("click", onReplayClick);
    cleanupFns.push(() => replay.removeEventListener("click", onReplayClick));

    reset();
    let io: IntersectionObserver | null = null;
    if (reduce) {
      finalState();
    } else if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && e.intersectionRatio >= 0.4) {
              io!.disconnect();
              play();
            }
          });
        },
        { threshold: [0.4] }
      );
      io.observe(scroller);
    } else {
      play();
    }

    return () => {
      alive = false;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (io) io.disconnect();
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return (
    <section id="metodo" className="mp2" data-score="1" aria-labelledby="mp2-title" ref={sectionRef}>
      <div className="mp2-head">
        <span className="mp2-eyebrow">Não acreditamos em fórmulas. Criamos um método.</span>
        <h2 id="mp2-title" className="mp2-title">
          Match Point
        </h2>
        <p className="mp2-sub">Ponto a ponto, como no tênis: cada etapa prepara a próxima.</p>
      </div>

      <div className="mp2-scroll" id="mp2Scroll">
        <div className="mp2-stage" id="mp2Stage">
          <img
            className="mp2-photo"
            src="/site/home/match-point-quadra-concreto.webp"
            alt="Quadra de tênis iluminada à noite, vista a partir da rede"
            width={1916}
            height={821}
            fetchPriority="high"
          />
          <div className="mp2-veil" aria-hidden="true" />
          <span className="mp2-light" style={{ "--x": "3.5%", "--y": "7.5%", "--d": "0ms" } as CSSProperties} aria-hidden="true" />
          <span className="mp2-light" style={{ "--x": "95.5%", "--y": "8%", "--d": "120ms" } as CSSProperties} aria-hidden="true" />
          <span className="mp2-light" style={{ "--x": "18.5%", "--y": "20.5%", "--d": "240ms" } as CSSProperties} aria-hidden="true" />
          <span className="mp2-light" style={{ "--x": "81.5%", "--y": "21%", "--d": "360ms" } as CSSProperties} aria-hidden="true" />

          <svg className="mp2-svg" viewBox="0 0 1916 821" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="mp2Glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g className="mp2-trails" fill="none" stroke="#E4F25C" strokeWidth={3} strokeLinecap="round" filter="url(#mp2Glow)" />
          </svg>

          <button
            type="button"
            className="mp2-pt"
            data-i="0"
            style={{ "--x": "22%", "--y": "76%", "--stem": "4.6cqw" } as CSSProperties}
            aria-label="15, Fundação Estratégica: ver detalhes"
          >
            <span className="mp2-mark" />
            <span className="mp2-stem" />
            <span className="mp2-tag">
              <b>15</b>
              <span>
                <small>Etapa 01</small>Fundação Estratégica
              </span>
            </span>
          </button>
          <button
            type="button"
            className="mp2-pt"
            data-i="1"
            style={{ "--x": "68%", "--y": "66%", "--stem": "3.6cqw" } as CSSProperties}
            aria-label="30, Validação de Mercado: ver detalhes"
          >
            <span className="mp2-mark" />
            <span className="mp2-stem" />
            <span className="mp2-tag">
              <b>30</b>
              <span>
                <small>Etapa 02</small>Validação de Mercado
              </span>
            </span>
          </button>
          <button
            type="button"
            className="mp2-pt"
            data-i="2"
            style={{ "--x": "33%", "--y": "65%", "--stem": "3.6cqw" } as CSSProperties}
            aria-label="40, Otimização Contínua: ver detalhes"
          >
            <span className="mp2-mark" />
            <span className="mp2-stem" />
            <span className="mp2-tag">
              <b>40</b>
              <span>
                <small>Etapa 03</small>Otimização Contínua
              </span>
            </span>
          </button>
          <button
            type="button"
            className="mp2-pt"
            data-i="3"
            style={{ "--x": "76%", "--y": "76%", "--stem": "4.6cqw" } as CSSProperties}
            aria-label="GAME, Evolução Estratégica: ver detalhes"
          >
            <span className="mp2-mark" />
            <span className="mp2-stem" />
            <span className="mp2-tag">
              <b>GAME</b>
              <span>
                <small>Etapa 04</small>Evolução Estratégica
              </span>
            </span>
          </button>

          <img className="mp2-ball" id="mp2Ball" src="/site/geral/bola-tenis.webp" alt="" aria-hidden="true" />
          <img className="mp2-titan" src="/site/titan-e-legacy/titan/01-titan-tenis-saque.webp" alt="Titan sacando" loading="lazy" />
          <img className="mp2-legacy" src="/site/metodo/etapa-game-legacy-comemorando.webp" alt="Legacy comemorando o ponto" loading="lazy" />
          <div className="mp2-flash" aria-hidden="true" />

          <div className="mp2-card" id="mp2Card" role="dialog" aria-live="polite" hidden>
            <b className="mp2-card-sc" />
            <strong className="mp2-card-nm" />
            <p className="mp2-card-ob" />
            <p className="mp2-card-dc">
              <small>O que você decide aqui</small>
              <span />
            </p>
            <a className="mp2-card-lk" href="/metodo">
              Ver a etapa →
            </a>
          </div>
        </div>
      </div>
      <p className="mp2-swipe">Deslize para acompanhar o ponto →</p>

      <div className="mp2-foot">
        <div className="mp2-board" aria-live="polite">
          <span className="mp2-board-lg">LEGADO</span>
          <span className="mp2-cell">15</span>
          <span className="mp2-cell">30</span>
          <span className="mp2-cell">40</span>
          <span className="mp2-cell mp2-cell-g">GAME</span>
          <span className="mp2-badge">Match Point</span>
        </div>
        <Link className="mp2-btn" href="/metodo">
          Ver o método completo
        </Link>
        <button type="button" className="mp2-replay" id="mp2Replay" hidden>
          ↻ Ver o ponto de novo
        </button>
      </div>
    </section>
  );
}
