import Image from "next/image";

type FounderCardProps = {
  name: string;
  role: string;
  roleLong: string;
  initials: string;
  bio: string[];
  linkedin: string;
  instagram: string;
  imageSrc?: string;
  align?: "left" | "right";
};

export default function FounderCard({
  name,
  role,
  roleLong,
  initials,
  bio,
  linkedin,
  instagram,
  imageSrc,
  align = "left",
}: FounderCardProps) {
  return (
    <div
      className={`flex flex-col ${
        align === "right" ? "sm:items-end sm:text-right" : "sm:items-start sm:text-left"
      } items-center text-center gap-7`}
    >
      <div className="relative h-64 w-52 sm:h-72 sm:w-60 rounded-2xl overflow-hidden border border-navy-700/15 bg-navy-950">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={`Retrato de ${name}`}
            fill
            className="object-cover grayscale-[15%]"
            sizes="240px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-marble-navy bg-grid-lines">
            <span className="font-serif text-6xl text-silver-400/70">
              {initials}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
        <div className="absolute inset-0 border border-white/10 rounded-2xl" />
      </div>

      <div>
        <h3 className="font-serif text-2xl sm:text-3xl text-navy-950">{name}</h3>
        <p className="mt-1 text-[12px] tracking-[0.18em] uppercase text-navy-500">
          {role}
        </p>
        <p className="text-[11px] tracking-[0.14em] uppercase text-navy-400">
          {roleLong}
        </p>

        <div className="mt-5 space-y-3 max-w-sm">
          {bio.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              className="text-sm text-navy-700/85 font-light leading-relaxed"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <div
          className={`mt-6 flex gap-4 ${
            align === "right" ? "sm:justify-end" : "sm:justify-start"
          } justify-center`}
        >
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`LinkedIn de ${name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-700/25 text-navy-700 hover:bg-navy-700 hover:text-white transition-colors duration-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
            </svg>
          </a>
          <a
            href={instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Instagram de ${name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-700/25 text-navy-700 hover:bg-navy-700 hover:text-white transition-colors duration-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.43.4a4.9 4.9 0 0 1 1.77 1.15 4.9 4.9 0 0 1 1.15 1.77c.16.46.35 1.26.4 2.43.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.4 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.46.16-1.26.35-2.43.4-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.43-.4a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.16-.46-.35-1.26-.4-2.43C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.24-1.97.4-2.43a4.9 4.9 0 0 1 1.15-1.77A4.9 4.9 0 0 1 5.59 1.8c.46-.16 1.26-.35 2.43-.4C9.29 1.34 9.67 1.33 12 1.33Zm0 1.98c-3.15 0-3.51.01-4.75.07-.96.04-1.48.2-1.83.34-.46.18-.79.39-1.13.74-.35.34-.56.67-.74 1.13-.14.35-.3.87-.34 1.83-.06 1.24-.07 1.6-.07 4.75s.01 3.51.07 4.75c.04.96.2 1.48.34 1.83.18.46.39.79.74 1.13.34.35.67.56 1.13.74.35.14.87.3 1.83.34 1.24.06 1.6.07 4.75.07s3.51-.01 4.75-.07c.96-.04 1.48-.2 1.83-.34.46-.18.79-.39 1.13-.74.35-.34.56-.67.74-1.13.14-.35.3-.87.34-1.83.06-1.24.07-1.6.07-4.75s-.01-3.51-.07-4.75c-.04-.96-.2-1.48-.34-1.83a3 3 0 0 0-.74-1.13 3 3 0 0 0-1.13-.74c-.35-.14-.87-.3-1.83-.34-1.24-.06-1.6-.07-4.75-.07Zm0 3.38a5.44 5.44 0 1 1 0 10.88 5.44 5.44 0 0 1 0-10.88Zm0 1.98a3.46 3.46 0 1 0 0 6.92 3.46 3.46 0 0 0 0-6.92Zm5.66-2.2a1.27 1.27 0 1 1-2.55 0 1.27 1.27 0 0 1 2.55 0Z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
