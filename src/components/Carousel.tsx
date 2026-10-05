"use client";

import { useEffect, useRef, useState } from "react";

type Slide = { src: string; alt: string; caption: string };

export default function Carousel({
  slides,
  ariaLabel,
}: {
  slides: Slide[];
  ariaLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const holdRef = useRef(false);

  function go(next: number) {
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => {
      if (!holdRef.current) setIndex((i) => (i + 1) % slides.length);
    }, 2600);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div
      className="lg-car"
      aria-roledescription="carrossel"
      aria-label={ariaLabel}
      onMouseEnter={() => {
        holdRef.current = true;
      }}
      onMouseLeave={() => {
        holdRef.current = false;
      }}
    >
      <div className="lg-car-stage">
        {slides.map((s, i) => (
          <figure key={s.src} className={`lg-slide${i === index ? " lg-on" : ""}`}>
            <img
              src={s.src}
              alt={s.alt}
              loading={i === 0 ? "eager" : "lazy"}
              aria-hidden={i === index ? undefined : true}
            />
            <figcaption>{s.caption}</figcaption>
          </figure>
        ))}
      </div>
      <div className="lg-car-ctl">
        <button
          type="button"
          className="lg-arr"
          aria-label="Versão anterior"
          onClick={() => {
            holdRef.current = true;
            go(index - 1);
          }}
        >
          ‹
        </button>
        <div className="lg-dots">
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Versão ${i + 1}`}
              aria-current={i === index}
              onClick={() => {
                holdRef.current = true;
                go(i);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="lg-arr"
          aria-label="Próxima versão"
          onClick={() => {
            holdRef.current = true;
            go(index + 1);
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
