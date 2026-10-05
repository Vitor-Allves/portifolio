const CHECKS = [
  "Empresários buscando expansão.",
  "Empresas que já vendem e querem mais previsibilidade.",
  "Negócios que investem em marketing sem clareza estratégica.",
  "Empresas que precisam estruturar a aquisição de clientes.",
  "Gestores que querem decidir com base em dados.",
  "Empresas que precisam conectar marketing e comercial.",
];

export default function ForWho() {
  return (
    <section className="lg-section" id="paraquem" data-score="2">
      <div className="lg-in lg-forwho">
        <div>
          <div className="lg-head">
            <span className="lg-eyebrow">Para quem é a Legado</span>
            <h2 className="lg-h2">Para empresas que não querem só aparecer. Querem crescer.</h2>
          </div>
          <ul className="lg-checks">
            {CHECKS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>

        <div className="lg-cta lg-dark">
          <div className="lg-txt">
            <span className="lg-eyebrow">Próximo movimento</span>
            <h3>Qual é o próximo movimento da sua empresa?</h3>
            <p>Talvez você não precise fazer mais. Talvez precise entender melhor onde agir.</p>
            <div className="lg-btns">
              <a href="#contato" className="lg-btn lg-btn-metal">
                Vamos conversar
              </a>
            </div>
          </div>
          <img
            src="/site/home/legacy-apontando-voce.webp"
            alt="Legacy apontando para quem lê"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
