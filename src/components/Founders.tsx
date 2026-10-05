import FounderCard from "./FounderCard";
import { FOUNDERS } from "@/lib/site-config";

const PRINCIPLES = [
  {
    title: "Verdade nos números",
    text: "Mostramos o que aconteceu, inclusive o que não funcionou. Nenhum número sem contexto.",
  },
  {
    title: "O negócio do cliente primeiro",
    text: "Estratégia antes de ferramenta, sempre. Cada plano nasce da realidade de quem contrata.",
  },
  {
    title: "Construir para durar",
    text: "O nome é Legado: crescimento que fica, e não um pico de campanha.",
  },
  {
    title: "Pessoas antes de processos",
    text: "Por trás de cada estratégia existem pessoas, as do cliente e as nossas.",
  },
  {
    title: "A palavra",
    text: "Sinceridade e compromisso com o cliente. Falamos a verdade, mesmo quando ela não é a mais confortável, e cumprimos o que combinamos.",
    isNew: true,
  },
];

export default function Founders() {
  return (
    <section className="lg-section" id="sobre" data-score="2">
      <div className="lg-in">
        <div className="lg-head">
          <span className="lg-eyebrow">Princípios</span>
          <h2 className="lg-h2">O que a Legado não deixa de fora</h2>
        </div>
        <div className="lg-prs">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className={`lg-pr lg-card-look${p.isNew ? " lg-pr-new" : ""}`}>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
        <div className="lg-founders">
          <FounderCard
            name={FOUNDERS.vitor.shortName}
            role={FOUNDERS.vitor.role}
            quote={FOUNDERS.vitor.quote}
            initials={FOUNDERS.vitor.initials}
            imageBase={FOUNDERS.vitor.imageBase}
            imageObjectPosition={FOUNDERS.vitor.imageObjectPosition}
          />
          <FounderCard
            name={FOUNDERS.joao.shortName}
            role={FOUNDERS.joao.role}
            quote={FOUNDERS.joao.quote}
            initials={FOUNDERS.joao.initials}
            imageBase={FOUNDERS.joao.imageBase}
            imageObjectPosition={FOUNDERS.joao.imageObjectPosition}
          />
        </div>
      </div>
    </section>
  );
}
