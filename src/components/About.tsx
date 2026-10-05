const PILLARS = ["Estratégia", "Posicionamento", "Aquisição", "Comunicação", "Dados", "Performance"];

export default function About() {
  return (
    <section className="lg-section" id="legado" data-score="0">
      <div className="lg-in lg-who">
        <div className="lg-quote">
          Nós não começamos pelas ferramentas. Começamos pelo negócio.
          <span>Crescer não é fazer mais. É escolher o próximo movimento certo.</span>
        </div>
        <div className="lg-txt">
          <span className="lg-eyebrow">Quem é a Legado</span>
          <p>
            Muitas empresas acumulam campanhas, canais, ferramentas e fornecedores e continuam
            sem saber qual movimento realmente gera crescimento.
          </p>
          <p>
            A Legado Enterprise é uma empresa de estratégia e marketing. Cada projeto começa
            pela compreensão do negócio, do mercado, do cliente e dos objetivos. A partir dessa
            leitura, tudo passa a trabalhar na mesma direção:
          </p>
          <div className="lg-pillars">
            {PILLARS.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
