"use client";

import { useEffect, useRef } from "react";

export default function DuoHero() {
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
    <div className="lg-dstage" ref={stageRef}>
      <div className="lg-spot2" aria-hidden="true" />
      <figure>
        <img
          data-depth="8"
          src="/site/titan-e-legacy/abertura-titan-smoking.webp"
          alt="Titan de smoking"
          loading="eager"
        />
        <figcaption>
          <b>TITAN</b>
          <span>O estrategista</span>
        </figcaption>
      </figure>
      <figure>
        <img
          data-depth="-8"
          src="/site/titan-e-legacy/abertura-legacy-sobretudo.webp"
          alt="Legacy de sobretudo"
          loading="eager"
        />
        <figcaption>
          <b>LEGACY</b>
          <span>O construtor de legado</span>
        </figcaption>
      </figure>
      <div className="lg-floor" aria-hidden="true" />
    </div>
  );
}
