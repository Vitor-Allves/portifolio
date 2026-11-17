import { FOUNDERS } from "@/lib/site-config";

// Fotos dos sócios: mesmo padrão de srcset já usado no FounderCard.
const WIDTHS = [480, 800, 1200, 1600];
const SIZES = "(max-width: 480px) 200px, 260px";

function srcSet(base: string, ext: "avif" | "webp") {
  return WIDTHS.map((w) => `/founders/${base}-${w}.${ext} ${w}w`).join(", ");
}

const PEOPLE = [FOUNDERS.vitor, FOUNDERS.joao];

// 6 · Quem faz: sócios e a dupla de mascotes.
export default function CinPeople() {
  return (
    <section className="cin-sec" id="sobre" aria-labelledby="cin-people-title">
      <div className="cin-sec-in">
        <span className="cin-eyebrow" data-cin-reveal>
          Quem faz
        </span>
        <h2 id="cin-people-title" className="cin-h2" data-cin-reveal>
          Dois sócios por trás de cada campanha.
        </h2>

        <div className="cin-people">
          {PEOPLE.map((p) => (
            <article key={p.name} className="cin-fd" data-cin-reveal>
              <div className="cin-fd-ph">
                <picture>
                  <source type="image/avif" srcSet={srcSet(p.imageBase, "avif")} sizes={SIZES} />
                  <source type="image/webp" srcSet={srcSet(p.imageBase, "webp")} sizes={SIZES} />
                  <img
                    src={`/founders/${p.imageBase}-800.webp`}
                    alt={`Retrato de ${p.name}`}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: p.imageObjectPosition }}
                  />
                </picture>
              </div>
              <div>
                <h3>{p.name}</h3>
                <span className="cin-role">{p.role}</span>
                <blockquote>&ldquo;{p.quote}&rdquo;</blockquote>
              </div>
            </article>
          ))}
        </div>

        <div className="cin-duo" data-cin-reveal>
          <img
            src="/site/home/dupla-titan-capitao.webp"
            alt="Titan com a raquete no ombro"
            loading="lazy"
            width={300}
            height={400}
          />
          <img
            src="/site/home/dupla-legacy-capitao.webp"
            alt="Legacy com a raquete no ombro"
            loading="lazy"
            width={300}
            height={400}
          />
        </div>
        <p className="cin-duo-cap" data-cin-reveal>
          Titan, o estrategista. Legacy, o construtor. Juntos, estratégia e execução lado a lado.
        </p>
      </div>
    </section>
  );
}
