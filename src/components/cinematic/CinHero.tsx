// 1 · Hero: promessa em Cinzel e botão dourado de diagnóstico acima da dobra.
export default function CinHero() {
  return (
    <section className="cin-sec cin-hero" aria-labelledby="cin-hero-title">
      <div className="cin-spot" aria-hidden="true" />

      <div className="cin-sec-in cin-hero-in">
        <span className="cin-eyebrow" data-cin-reveal>
          Tráfego pago para times comerciais
        </span>
        <h1 id="cin-hero-title" className="cin-h1" data-cin-reveal>
          Demanda para o seu time comercial
        </h1>
        <p className="cin-lead" data-cin-reveal>
          Campanhas no Meta, Google e LinkedIn para colocar conversas qualificadas na frente do
          seu time. A verba de anúncio vai direto para as plataformas.
        </p>
        <div className="cin-btns" data-cin-reveal>
          <a href="#contato" className="cin-btn">
            Quero meu diagnóstico
          </a>
        </div>
      </div>

      <a href="#resultados" className="cin-cue">
        Role para ver
      </a>
    </section>
  );
}
