const METRICS = [
  { value: "21", label: "Compras" },
  { value: "R$ 54,98", label: "Custo por compra" },
  { value: "164.646", label: "Impressões" },
  { value: "70.329", label: "Pessoas alcançadas" },
  { value: "1.710", label: "Cliques", wide: true },
];

export default function CaseStudy() {
  return (
    <section className="lg-section" id="resultados" data-score="2">
      <div className="lg-in">
        <div className="lg-head">
          <span className="lg-eyebrow">Resultados</span>
          <h2 className="lg-h2">Quando estratégia encontra execução.</h2>
        </div>
        <div className="lg-case lg-card-look">
          <div className="lg-case-l">
            <p className="lg-big">
              R$ 1.154,59 investidos.
              <br />
              R$ 65.694,12 em vendas.
            </p>
            <p className="lg-roas">
              Para cada <b>R$ 1</b> investido, voltaram <b>R$ 56,90</b> em vendas (ROAS de
              56,9x).
            </p>
          </div>
          <div className="lg-case-r">
            {METRICS.map((m) => (
              <div key={m.label} className={`lg-met${m.wide ? " lg-met-wide" : ""}`}>
                <strong className="tabular-nums">{m.value}</strong>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="lg-disc">
          Resultados de campanhas anteriores. Resultados anteriores não representam garantia de
          resultados futuros.
        </p>
      </div>
    </section>
  );
}
