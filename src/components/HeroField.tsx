"use client";

import { useEffect, useRef } from "react";

type Node = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
};

export default function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Below this width the node count is already at its floor, so the
    // O(n²) connecting-line pass is pure cost for very little visible
    // effect on a small screen — skip it there and just draw the dots.
    const isMobile = window.matchMedia("(max-width: 639px)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let raf = 0;
    let running = true;

    const COUNT_BASE = isMobile ? 36 : 70;

    function resize() {
      if (!canvas) return;
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(
        isMobile ? 18 : 28,
        Math.min(COUNT_BASE, Math.round((width * height) / 18000))
      );
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      }));
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      if (!isMobile) {
        const maxDist = Math.min(180, width / 6);

        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < maxDist) {
              const opacity = (1 - dist / maxDist) * 0.16;
              ctx.strokeStyle = `rgba(191, 195, 201, ${opacity})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      for (const n of nodes) {
        const r = 1 + n.z * 1.6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(191, 195, 201, ${0.25 + n.z * 0.35})`;
        ctx.fill();
      }

      if (!reduceMotion && running) {
        raf = requestAnimationFrame(draw);
      }
    }

    resize();
    draw();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    // Don't burn CPU/battery animating a canvas nobody is looking at.
    const onVisibility = () => {
      running = !document.hidden;
      if (running && !reduceMotion) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
