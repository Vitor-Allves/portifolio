"use client";

// Titan and Legacy, the Legado Intelligence mascots — Titan is the black
// wolf in a black suit, Legacy the white wolf in a navy suit, both without a
// tail. Source art lives in public/mascots/ as transparent PNGs re-encoded
// to WebP; never distort, crop the face, recolor or mirror these images —
// always render with object-fit: contain so the full pose stays intact.

export type MascotPose =
  | "titan-boasvindas"
  | "titan-indicadores"
  | "titan-relatorio"
  | "titan-acesso"
  | "titan-carregando"
  | "titan-duvida"
  | "titan-conquista"
  | "legacy-ola"
  | "legacy-duvida"
  | "legacy-conquista";

const MASCOT_SRC: Record<MascotPose, string> = {
  "titan-boasvindas": "/mascots/titan-boasvindas.webp",
  "titan-indicadores": "/mascots/titan-indicadores.webp",
  "titan-relatorio": "/mascots/titan-relatorio.webp",
  "titan-acesso": "/mascots/titan-acesso.webp",
  "titan-carregando": "/mascots/titan-carregando.webp",
  "titan-duvida": "/mascots/titan-duvida.webp",
  "titan-conquista": "/mascots/titan-conquista.webp",
  "legacy-ola": "/mascots/legacy-ola.webp",
  "legacy-duvida": "/mascots/legacy-duvida.webp",
  "legacy-conquista": "/mascots/legacy-conquista.webp",
};

/**
 * The opening banner every tab gets: a short line about what the tab shows
 * on the left, the tab's assigned mascot pose on the right (96–140px tall).
 * Hidden below 480px so the mascot never competes with filters/content on a
 * small screen — see the `.mascot-banner-img` rule in globals.css.
 */
export function MascotTabBanner({
  pose,
  alt,
  title,
  description,
  headingLevel: Heading = "h2",
  className = "",
}: {
  pose: MascotPose;
  alt: string;
  title: string;
  description?: string;
  headingLevel?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div
      className={`mb-5 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-intel-surface-1 px-5 py-4 animate-mascot-in ${className}`}
    >
      <div className="min-w-0">
        <Heading className="text-[15px] font-medium text-intel-text">{title}</Heading>
        {description && <p className="mt-1 text-[12.5px] text-intel-text-dim leading-relaxed">{description}</p>}
      </div>
      <img
        src={MASCOT_SRC[pose]}
        alt={alt}
        className="mascot-banner-img shrink-0 h-24 lg:h-[140px] w-auto object-contain"
      />
    </div>
  );
}

/**
 * Loading / empty / error / success moments: the mascot centered above the
 * message (160–200px tall, shrinking to 120px below 480px but never fully
 * hidden — see `.mascot-state-img` in globals.css).
 */
export function MascotState({
  pose,
  alt,
  message,
  tone = "neutral",
  secondaryPose,
  secondaryAlt,
  action,
  className = "",
}: {
  pose: MascotPose;
  alt: string;
  message: string;
  tone?: "neutral" | "error" | "success";
  /** Success confirmations pair Legacy and Titan side by side — pass the second pose/alt to render both. */
  secondaryPose?: MascotPose;
  secondaryAlt?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const textColor = tone === "error" ? "text-intel-red" : tone === "success" ? "text-intel-green" : "text-intel-text-dim";
  return (
    <div
      className={`flex flex-col items-center text-center py-8 px-4 animate-mascot-in ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex items-end justify-center gap-2">
        <img src={MASCOT_SRC[pose]} alt={alt} className="mascot-state-img h-[180px] w-auto object-contain" />
        {secondaryPose && (
          <img
            src={MASCOT_SRC[secondaryPose]}
            alt={secondaryAlt ?? ""}
            className="mascot-state-img h-[180px] w-auto object-contain"
          />
        )}
      </div>
      <p className={`mt-3 max-w-md text-[13.5px] leading-relaxed ${textColor}`}>{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
