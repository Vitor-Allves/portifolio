"use client";

const STAGES = [
  { id: "lg-st15", score: "15", label: "Fundação" },
  { id: "lg-st30", score: "30", label: "Validação" },
  { id: "lg-st40", score: "40", label: "Otimização" },
  { id: "lg-stgame", score: "GAME", label: "Evolução" },
];

export default function JumpBoard() {
  function jump(id: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <nav className="lg-board" aria-label="Etapas do método">
      {STAGES.map((s) => (
        <button key={s.id} type="button" onClick={() => jump(s.id)}>
          <b>{s.score}</b>
          <span>{s.label}</span>
        </button>
      ))}
    </nav>
  );
}
