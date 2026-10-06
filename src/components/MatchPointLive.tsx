"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Depth = "perto" | "fundo";

type PointDef = {
  score: string;
  stageNo: string;
  label: string;
  x: number;
  y: number;
  depth: Depth;
  objective: string;
  decide: string;
  anchor: string;
};

const POINTS: PointDef[] = [
  {
    score: "15",
    stageNo: "ETAPA 01",
    label: "Fundação Estratégica",
    x: 30,
    y: 70,
    depth: "perto",
    objective: "Entender o jogo antes de executar.",
    decide: "Para quem vender, o que oferecer e por onde começar.",
    anchor: "lg-st15",
  },
  {
    score: "30",
    stageNo: "ETAPA 02",
    label: "Validação de Mercado",
    x: 73,
    y: 64,
    depth: "fundo",
    objective: "Colocar hipóteses em contato com o mercado.",
    decide: "O que funciona no seu mercado e o que precisa mudar.",
    anchor: "lg-st30",
  },
  {
    score: "40",
    stageNo: "ETAPA 03",
    label: "Otimização Contínua",
    x: 33,
    y: 65,
    depth: "fundo",
    objective: "Usar dados para melhorar decisões.",
    decide: "Onde colocar mais esforço e investimento.",
    anchor: "lg-st40",
  },
  {
    score: "GAME",
    stageNo: "ETAPA 04",
    label: "Evolução Estratégica",
    x: 68,
    y: 70,
    depth: "perto",
    objective: "Transformar aprendizados em novos movimentos de crescimento.",
    decide: "Quais são os próximos movimentos de crescimento.",
    anchor: "lg-stgame",
  },
];

const LIGHTS = [
  { x: 3.5, y: 7.5 },
  { x: 18.5, y: 20.5 },
  { x: 81.5, y: 21 },
  { x: 95.5, y: 8 },
];

// Origem do saque (aprox., canto inferior esquerdo do palco, perto do Titan).
const SERVE = { x: 6, y: 93 };

const VB_W = 1916;
const VB_H = 821;
const ASPECT = VB_W / VB_H;

function toVb(pt: { x: number; y: number }) {
  return { x: (pt.x / 100) * VB_W, y: (pt.y / 100) * VB_H };
}

function quadPath(a: { x: number; y: number }, b: { x: number; y: number }, liftPct: number) {
  const A = toVb(a);
  const B = toVb(b);
  const midX = (A.x + B.x) / 2;
  const midY = (A.y + B.y) / 2;
  const cx = midX;
  const cy = midY - VB_H * liftPct;
  return { d: `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}`, start: A, end: B };
}

const FLIGHTS = [
  { from: SERVE, to: POINTS[0], start: 2000, dur: 900 },
  { from: POINTS[0], to: POINTS[1], start: 3100, dur: 900 },
  { from: POINTS[1], to: POINTS[2], start: 4200, dur: 900 },
  { from: POINTS[2], to: POINTS[3], start: 5300, dur: 900 },
];

const GAME_START = 6400;
const FINAL_START = 7400;
const TOTAL_MS = 8000;

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function MatchPointLive() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLImageElement>(null);
  const titanRef = useRef<HTMLImageElement>(null);
  const legacyRef = useRef<HTMLImageElement>(null);
  const flareRefs = useRef<Array<HTMLDivElement | null>>([]);
  const numRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ringRefs = useRef<Array<HTMLDivElement | null>>([]);
  const beamRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const tickRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [started, setStarted] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [ariaScore, setAriaScore] = useState("");

  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const reduceMotionRef = useRef(false);
  const manualStripRef = useRef(false);

  const layout = useCallback(() => {
    const sec = sectionRef.current;
    const stage = stageRef.current;
    if (!sec || !stage) return;
    const r = sec.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.max(r.width, r.height * ASPECT);
    const h = w / ASPECT;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.setProperty("--mpl-w", `${w}px`);
    if (window.matchMedia("(max-width: 900px)").matches && !manualStripRef.current) {
      const targetLeft = (POINTS[0].x / 100) * w - r.width / 2;
      sec.scrollLeft = Math.max(0, targetLeft);
    }
  }, []);

  useEffect(() => {
    layout();
    const ro = new ResizeObserver(() => layout());
    if (sectionRef.current) ro.observe(sectionRef.current);
    window.addEventListener("resize", layout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", layout);
    };
  }, [layout]);

  // No mobile, a faixa acompanha a bola horizontalmente, a menos que a
  // pessoa já tenha tocado/rolado manualmente.
  const followStripToBall = useCallback((xPercentOfStage: number) => {
    const sec = sectionRef.current;
    const stage = stageRef.current;
    if (!sec || !stage) return;
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    if (manualStripRef.current) return;
    const stageW = stage.getBoundingClientRect().width;
    const target = (xPercentOfStage / 100) * stageW - sec.getBoundingClientRect().width / 2;
    sec.scrollLeft = Math.max(0, target);
  }, []);

  const lightPoint = useCallback((i: number) => {
    numRefs.current[i]?.classList.add("lg-mpl-lit");
    ringRefs.current[i]?.classList.add("lg-mpl-ring-pulse");
    beamRefs.current[i]?.classList.add("lg-mpl-in");
    cardTriggerRefs.current[i]?.classList.add("lg-mpl-in");
    const key = POINTS[i].score;
    setAriaScore(key);
    tickRefs.current.forEach((el, k) => {
      if (!el) return;
      el.classList.toggle("lg-on", k === i);
      el.classList.toggle("lg-done", k < i);
    });
  }, []);

  const applyFinalState = useCallback(() => {
    titleRef.current?.classList.add("lg-mpl-title-in");
    flareRefs.current.forEach((el) => el?.classList.add("lg-mpl-in"));
    titanRef.current?.classList.add("lg-mpl-in");
    legacyRef.current?.classList.add("lg-mpl-in");
    POINTS.forEach((_, i) => lightPoint(i));
    pathRefs.current.forEach((p) => {
      if (!p) return;
      p.classList.add("lg-mpl-trail-in", "lg-mpl-trail-rest");
      p.style.strokeDashoffset = "0";
    });
    badgeRef.current?.classList.add("lg-mpl-in");
    finalRef.current?.classList.add("lg-mpl-in");
    if (ballRef.current) ballRef.current.style.display = "none";
  }, [lightPoint]);

  const runFlight = useCallback(
    (flightIndex: number, atMs: number) => {
      const f = FLIGHTS[flightIndex];
      const path = pathRefs.current[flightIndex];
      const ball = ballRef.current;
      if (!path || !ball) return;
      const p = Math.min(1, Math.max(0, (atMs - f.start) / f.dur));
      const e = ease(p);
      const len = path.getTotalLength();
      const pos = path.getPointAtLength(len * e);
      ball.style.display = "block";
      const xPct = (pos.x / VB_W) * 100;
      ball.style.left = `${xPct}%`;
      ball.style.top = `${(pos.y / VB_H) * 100}%`;
      const hop = Math.sin(Math.PI * e) * 0.35;
      ball.style.transform = `translate(-50%, -50%) scale(${1 + hop})`;
      path.classList.add("lg-mpl-trail-in");
      path.style.strokeDashoffset = `${len * (1 - e)}`;
      followStripToBall(xPct);
      if (p >= 1 && !firedRef.current.has(`flight-${flightIndex}`)) {
        firedRef.current.add(`flight-${flightIndex}`);
        lightPoint(flightIndex);
        path.classList.add("lg-mpl-trail-rest");
      }
    },
    [lightPoint, followStripToBall]
  );

  const frameRef = useRef<(ts: number) => void>(() => {});

  const frame = useCallback(
    (ts: number) => {
      if (pausedRef.current) {
        lastTsRef.current = ts;
        rafRef.current = requestAnimationFrame(frameRef.current);
        return;
      }
      if (lastTsRef.current === null) lastTsRef.current = ts;
      elapsedRef.current += ts - lastTsRef.current;
      lastTsRef.current = ts;
      const t = elapsedRef.current;

      if (t >= 0 && !firedRef.current.has("lights")) {
        firedRef.current.add("lights");
        const stage = stageRef.current;
        if (stage) {
          stage.style.transition = "filter 1.2s ease";
          stage.style.filter = "brightness(1)";
        }
        LIGHTS.forEach((_, i) => {
          setTimeout(() => flareRefs.current[i]?.classList.add("lg-mpl-in"), i * 120);
        });
      }
      if (t >= 600 && !firedRef.current.has("title")) {
        firedRef.current.add("title");
        titleRef.current?.classList.add("lg-mpl-title-in");
      }
      if (t >= 1400 && !firedRef.current.has("titan")) {
        firedRef.current.add("titan");
        titanRef.current?.classList.add("lg-mpl-in");
      }

      FLIGHTS.forEach((f, i) => {
        if (t >= f.start && t <= f.start + f.dur + 20) runFlight(i, t);
      });

      if (t >= GAME_START && !firedRef.current.has("game")) {
        firedRef.current.add("game");
        flashRef.current?.classList.add("lg-mpl-flash-in");
        setTimeout(() => flashRef.current?.classList.remove("lg-mpl-flash-in"), 420);
        legacyRef.current?.classList.add("lg-mpl-in");
        badgeRef.current?.classList.add("lg-mpl-in", "lg-mpl-pulse-twice");
        numRefs.current.forEach((el) => {
          el?.classList.add("lg-mpl-flash-all");
          setTimeout(() => el?.classList.remove("lg-mpl-flash-all"), 650);
        });
      }
      if (t >= FINAL_START && !firedRef.current.has("final")) {
        firedRef.current.add("final");
        finalRef.current?.classList.add("lg-mpl-in");
      }

      if (t >= TOTAL_MS) {
        pathRefs.current.forEach((p) => p?.classList.add("lg-mpl-trail-rest"));
        if (ballRef.current) ballRef.current.style.display = "none";
        setStarted(true);
        sectionRef.current?.classList.remove("lg-mpl-intro");
        return;
      }
      rafRef.current = requestAnimationFrame(frameRef.current);
    },
    [runFlight]
  );

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  const beginIntro = useCallback(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    firedRef.current = new Set();
    elapsedRef.current = 0;
    lastTsRef.current = null;
    pausedRef.current = false;
    sec.classList.add("lg-mpl-intro");
    POINTS.forEach((_, i) => {
      numRefs.current[i]?.classList.remove("lg-mpl-lit");
      beamRefs.current[i]?.classList.remove("lg-mpl-in");
      cardTriggerRefs.current[i]?.classList.remove("lg-mpl-in");
    });
    tickRefs.current.forEach((el) => el?.classList.remove("lg-on", "lg-done"));
    pathRefs.current.forEach((p) => {
      if (!p) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.classList.remove("lg-mpl-trail-in", "lg-mpl-trail-rest");
    });
    titleRef.current?.classList.remove("lg-mpl-title-in");
    titanRef.current?.classList.remove("lg-mpl-in");
    legacyRef.current?.classList.remove("lg-mpl-in");
    flareRefs.current.forEach((el) => el?.classList.remove("lg-mpl-in"));
    badgeRef.current?.classList.remove("lg-mpl-in", "lg-mpl-pulse-twice");
    finalRef.current?.classList.remove("lg-mpl-in");
    if (stageRef.current) {
      stageRef.current.style.transition = "none";
      stageRef.current.style.filter = "brightness(.35)";
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduceMotionRef.current = reduce;
    if (reduce) {
      applyFinalState();
      return;
    }
    const sec = sectionRef.current;
    if (!sec) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4 && !started) {
            beginIntro();
          }
        });
      },
      { threshold: [0, 0.4, 1] }
    );
    io.observe(sec);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Parallax sutil do palco e dos mascotes com o cursor.
  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec || reduceMotionRef.current) return;
    function onMove(e: PointerEvent) {
      const r = sec!.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      if (stageRef.current) stageRef.current.style.translate = `calc(-50% + ${dx * 6}px) calc(-50% + ${dy * 6}px)`;
      if (titanRef.current) titanRef.current.style.transform = `translate(${dx * -12}px, ${dy * -12}px)`;
      if (legacyRef.current) legacyRef.current.style.transform = `translate(${dx * 12}px, ${dy * -12}px)`;
    }
    sec.addEventListener("pointermove", onMove);
    return () => sec.removeEventListener("pointermove", onMove);
  }, []);

  // Mobile: a faixa (a própria seção, com overflow-x) acompanha a bola
  // sozinha, mas para de seguir assim que a pessoa toca/rola na mão.
  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;
    function onTouch() {
      manualStripRef.current = true;
    }
    sec.addEventListener("touchstart", onTouch, { passive: true });
    sec.addEventListener("wheel", onTouch, { passive: true });
    return () => {
      sec.removeEventListener("touchstart", onTouch);
      sec.removeEventListener("wheel", onTouch);
    };
  }, []);

  function openCard(i: number) {
    setActiveCard(i);
    pausedRef.current = true;
  }
  function closeCard() {
    setActiveCard(null);
    pausedRef.current = false;
  }

  return (
    <section className="lg-mpl" id="metodo" data-score="1" ref={sectionRef}>
      <div className="lg-mpl-stage" ref={stageRef}>
        <img
          className="lg-mpl-photo"
          src="/site/home/match-point-quadra-concreto.webp"
          alt="Quadra de tênis iluminada à noite, vista a partir da rede"
          width={1916}
          height={821}
          fetchPriority="high"
          loading="eager"
        />
        <div className="lg-mpl-veil" aria-hidden="true" />
        <div className="lg-mpl-vignette" aria-hidden="true" />
        <div className="lg-mpl-flash" ref={flashRef} aria-hidden="true" />

        {LIGHTS.map((l, i) => (
          <div
            key={i}
            className="lg-mpl-flare"
            style={{ left: `${l.x}%`, top: `${l.y}%` }}
            ref={(el) => {
              flareRefs.current[i] = el;
            }}
            aria-hidden="true"
          />
        ))}

        <svg className="lg-mpl-rallysvg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
          {FLIGHTS.map((f, i) => {
            const { d } = quadPath(f.from, f.to, 0.16);
            return (
              <path
                key={i}
                d={d}
                className="lg-mpl-trail"
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
              />
            );
          })}
        </svg>

        <img className="lg-mpl-ball" ref={ballRef} src="/site/geral/bola-tenis.webp" alt="" aria-hidden="true" loading="lazy" />

        {POINTS.map((p, i) => (
          <div key={p.score} className={`lg-mpl-point lg-mpl-point-${p.depth}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <div
              className="lg-mpl-ring"
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              aria-hidden="true"
            />
            <div
              className="lg-mpl-num"
              ref={(el) => {
                numRefs.current[i] = el;
              }}
            >
              <svg className="lg-mpl-num-outline" viewBox="0 0 100 60" aria-hidden="true">
                <rect x="3" y="3" width="94" height="54" rx="3" />
              </svg>
              <span className={p.score === "GAME" ? "lg-mpl-num-game" : ""}>{p.score}</span>
            </div>
            <div
              className="lg-mpl-beam"
              ref={(el) => {
                beamRefs.current[i] = el;
              }}
            >
              <button
                type="button"
                className="lg-mpl-tag"
                aria-label={`${p.score}, ${p.label}: ver detalhes`}
                aria-expanded={activeCard === i}
                onMouseEnter={() => openCard(i)}
                onMouseLeave={closeCard}
                onFocus={() => openCard(i)}
                onBlur={closeCard}
                onClick={() => (activeCard === i ? closeCard() : openCard(i))}
                ref={(el) => {
                  cardTriggerRefs.current[i] = el;
                }}
              >
                <small>{p.stageNo}</small>
                <span>{p.label}</span>
              </button>
              {activeCard === i && (
                <div className={`lg-mpl-detail ${p.x > 50 ? "lg-mpl-detail-left" : "lg-mpl-detail-right"}`} role="dialog">
                  <small>
                    {p.score} · {p.stageNo}
                  </small>
                  <strong>{p.objective}</strong>
                  <p>
                    <b>O que você decide aqui</b> {p.decide}
                  </p>
                  <Link href={`/metodo#${p.anchor}`}>Ver a etapa →</Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="lg-mpl-head">
        <span className="lg-eyebrow">Não acreditamos em fórmulas. Criamos um método.</span>
        <h2 ref={titleRef} className="lg-mpl-title">
          Match Point
        </h2>
        <p>Ponto a ponto, como no tênis: cada etapa prepara a próxima.</p>
      </div>

      <img
        className="lg-mpl-titan"
        ref={titanRef}
        src="/site/titan-e-legacy/titan/01-titan-tenis-saque.webp"
        alt="Titan sacando"
        loading="lazy"
      />
      <img
        className="lg-mpl-legacy"
        ref={legacyRef}
        src="/site/metodo/etapa-game-legacy-comemorando.webp"
        alt="Legacy comemorando o ponto"
        loading="lazy"
      />

      <div className="lg-mpl-ticker">
        <b>LEGADO</b>
        {POINTS.map((p, i) => (
          <span
            key={p.score}
            ref={(el) => {
              tickRefs.current[i] = el;
            }}
          >
            {p.score}
          </span>
        ))}
        <span className="lg-mpl-badge" ref={badgeRef}>
          MATCH POINT
        </span>
      </div>
      <span className="sr-only" aria-live="polite">
        {ariaScore}
      </span>

      <div className="lg-mpl-final" ref={finalRef}>
        <p>Cada movimento gera informação. Cada informação melhora a próxima decisão.</p>
        <Link href="/metodo" className="lg-btn lg-btn-metal">
          Ver o método completo
        </Link>
      </div>

      {started && (
        <button type="button" className="lg-mpl-replay" onClick={beginIntro}>
          ↻ Ver o ponto de novo
        </button>
      )}

      <p className="lg-mpl-swipe-hint">Deslize para acompanhar o ponto →</p>
    </section>
  );
}
