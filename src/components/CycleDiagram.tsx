export default function CycleDiagram() {
  return (
    <div className="lg-cyc">
      <img className="lg-cyc-trofeu" src="/site/metodo/trofeu.webp" alt="Troféu" loading="lazy" />
      <svg viewBox="0 0 420 420" role="img" aria-label="Ciclo 15, 30, 40, GAME e de volta ao 15">
        <defs>
          <marker id="lg-arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#BFC3C9" />
          </marker>
        </defs>
        <circle cx="210" cy="210" r="150" fill="none" stroke="rgba(191,195,201,.25)" strokeWidth="2" />
        <g fill="none" stroke="#BFC3C9" strokeWidth="2.5" markerEnd="url(#lg-arw)">
          <path d="M252 66 A150 150 0 0 1 354 168" />
          <path d="M354 252 A150 150 0 0 1 252 354" />
          <path d="M168 354 A150 150 0 0 1 66 252" />
          <path d="M66 168 A150 150 0 0 1 168 66" />
        </g>
        <g fontFamily="Cinzel, Georgia, serif" fontWeight={600} textAnchor="middle">
          <circle cx="210" cy="60" r="38" fill="#152B4F" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x="210" y="70" fontSize="28" fill="#FFFFFF">15</text>
          <circle cx="360" cy="210" r="38" fill="#152B4F" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x="360" y="220" fontSize="28" fill="#FFFFFF">30</text>
          <circle cx="210" cy="360" r="38" fill="#152B4F" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x="210" y="370" fontSize="28" fill="#FFFFFF">40</text>
          <circle cx="60" cy="210" r="38" fill="#EEF1F5" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x="60" y="216" fontSize="16" fill="#1F3A63">GAME</text>
        </g>
      </svg>
    </div>
  );
}
