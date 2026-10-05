const COLUMNS = [
  {
    icon: "/site/home/icone-entender.webp",
    title: "Entender",
    sub: "Antes de qualquer execução",
    items: [
      {
        b: "Estratégia e Planejamento",
        span: "Leitura do negócio, do mercado e dos objetivos antes de qualquer execução.",
      },
      {
        b: "Análise de Mercado",
        span: "Leitura de concorrência, comportamento e oportunidades reais.",
      },
      {
        b: "Posicionamento de Marca",
        span: "Clareza sobre o que a empresa representa e para quem ela realmente fala.",
      },
    ],
  },
  {
    icon: "/site/home/icone-atrair.webp",
    title: "Atrair",
    sub: "Captação ligada a metas comerciais",
    items: [
      {
        b: "Aquisição de Clientes",
        span: "Estruturas de captação conectadas diretamente a metas comerciais.",
      },
      {
        b: "Tráfego e Performance",
        span: "Canais pagos orientados por indicadores, não por volume de investimento.",
      },
      { b: "Geração de Demanda", span: "Interesse e autoridade antes da decisão de compra." },
      {
        b: "Conteúdo e Comunicação",
        span: "Mensagens consistentes com a estratégia em todos os canais.",
      },
    ],
  },
  {
    icon: "/site/home/icone-medir.webp",
    title: "Medir e evoluir",
    sub: "Dados como ferramenta de decisão",
    items: [
      {
        b: "Inteligência de Dados",
        span: "Indicadores tratados como ferramenta de decisão, não apenas relatório.",
      },
      {
        b: "E-mail Marketing",
        span: "Relacionamento e conversão como parte do funil de aquisição.",
      },
    ],
  },
];

export default function Solutions() {
  return (
    <section className="lg-section" id="solucoes" data-score="1">
      <div className="lg-in">
        <div className="lg-head">
          <span className="lg-eyebrow">Soluções</span>
          <h2 className="lg-h2">Uma estratégia. Diversos movimentos.</h2>
        </div>
        <div className="lg-sol">
          {COLUMNS.map((col) => (
            <div key={col.title} className="lg-sol-col lg-card-look">
              <div className="lg-top">
                <img src={col.icon} alt="" width={64} height={64} loading="lazy" />
                <div>
                  <h3>{col.title}</h3>
                  <span className="lg-sub">{col.sub}</span>
                </div>
              </div>
              <ul>
                {col.items.map((item) => (
                  <li key={item.b}>
                    <b>{item.b}</b>
                    <span>{item.span}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="lg-motto">A ferramenta nunca vem antes da estratégia.</p>
      </div>
    </section>
  );
}
