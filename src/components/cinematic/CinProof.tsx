// 2 · Prova: os 4 cases em números grandes que contam ao rolar.
// Números vindos do briefing (sem estimar faturamento de cliente).
// Os nomes dos clientes ficam de fora; só o tipo de operação aparece.
const CASES = [
  {
    to: 680,
    dec: 0,
    suffix: "x",
    label: "Retorno sobre o investimento",
    tag: "Consórcio",
    detail:
      "R$ 1.000 investidos e R$ 680 mil em vendas. 121 leads, 45 contatos e 4 vendas.",
  },
  {
    to: 56.9,
    dec: 1,
    suffix: "x",
    label: "Retorno em vendas (ROAS)",
    tag: "Vendas",
    detail:
      "R$ 1.154,59 investidos e R$ 65.694,12 em vendas. 21 compras, a R$ 54,98 cada.",
  },
  {
    to: 1261,
    dec: 0,
    suffix: "",
    label: "Conversas iniciadas",
    tag: "Grupo empresarial",
    detail:
      "R$ 6.402,06 investidos, a R$ 5,08 por conversa, de junho a setembro.",
  },
  {
    to: 227,
    dec: 0,
    suffix: "x",
    label: "Retorno em vendas (ROAS)",
    tag: "B2B · telhas ecológicas",
    detail:
      "R$ 339 investidos e R$ 77.254 em vendas em 15 dias. 16 vendas, ticket médio de R$ 4.828.",
  },
];

function formatNumber(value: number, dec: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export default function CinProof() {
  return (
    <section className="cin-sec cin-sec-dim" id="resultados" aria-labelledby="cin-proof-title">
      <div className="cin-sec-in">
        <span className="cin-eyebrow" data-cin-reveal>
          Resultados de campanhas anteriores
        </span>
        <h2 id="cin-proof-title" className="cin-h2" data-cin-reveal>
          Quatro operações. Quatro números.
        </h2>

        <div className="cin-cases">
          {CASES.map((c) => (
            <div key={c.tag} className="cin-case" data-cin-reveal>
              <p className="cin-num" aria-label={`${formatNumber(c.to, c.dec)}${c.suffix}`}>
                <span data-cin-count={c.to} data-cin-dec={c.dec} aria-hidden="true">
                  {formatNumber(c.to, c.dec)}
                </span>
                {c.suffix ? <small aria-hidden="true">{c.suffix}</small> : null}
              </p>
              <div className="cin-case-txt">
                <b>{c.label}</b>
                <span>{c.tag}</span>
                <p>{c.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="cin-disc">
          Resultados anteriores não garantem resultados futuros.
        </p>
      </div>
    </section>
  );
}
