const WIDTHS = [480, 800, 1200, 1600];
const CARD_SIZES = "(max-width: 640px) 160px, 220px";

type FounderCardProps = {
  name: string;
  role: string;
  quote: string;
  initials: string;
  imageBase?: string;
  imageObjectPosition?: string;
};

function srcSet(imageBase: string, ext: "avif" | "webp") {
  return WIDTHS.map((w) => `/founders/${imageBase}-${w}.${ext} ${w}w`).join(", ");
}

export default function FounderCard({
  name,
  role,
  quote,
  initials,
  imageBase,
  imageObjectPosition = "50% 10%",
}: FounderCardProps) {
  return (
    <article className="lg-fd lg-card-look">
      <div className="lg-ph">
        {imageBase ? (
          <picture>
            <source type="image/avif" srcSet={srcSet(imageBase, "avif")} sizes={CARD_SIZES} />
            <source type="image/webp" srcSet={srcSet(imageBase, "webp")} sizes={CARD_SIZES} />
            <img
              src={`/founders/${imageBase}-800.webp`}
              alt={`Retrato de ${name}`}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: imageObjectPosition }}
            />
          </picture>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-display text-4xl text-white/80">{initials}</span>
          </div>
        )}
      </div>
      <div>
        <h3>{name}</h3>
        <span className="lg-role">{role}</span>
        <blockquote>&ldquo;{quote}&rdquo;</blockquote>
      </div>
    </article>
  );
}
