// Legado brand pieces for the CRM: the logo lockup and the mascots.
// Titan (lobo preto, o estrategista) e Legacy (lobo branco, o construtor)
// appear in the welcome band, the empty states and the "conquista" toast.

import Image from "next/image";

const MASCOTS = {
  titanWelcome: { src: "/mascots/titan-boasvindas.webp", width: 267, height: 400, alt: "Titan, mascote da Legado, dando boas-vindas" },
  titanLoading: { src: "/mascots/titan-carregando.webp", width: 267, height: 400, alt: "Titan, mascote da Legado, aguardando" },
  titanWin: { src: "/mascots/titan-conquista.webp", width: 281, height: 400, alt: "Titan, mascote da Legado, comemorando" },
  titanDoubt: { src: "/mascots/titan-duvida.webp", width: 281, height: 400, alt: "Titan, mascote da Legado, pensativo" },
  legacyHello: { src: "/mascots/legacy-ola.webp", width: 281, height: 400, alt: "Legacy, mascote da Legado, acenando" },
  legacyWin: { src: "/mascots/legacy-conquista.webp", width: 281, height: 400, alt: "Legacy, mascote da Legado, comemorando" },
  legacyDoubt: { src: "/mascots/legacy-duvida.webp", width: 281, height: 400, alt: "Legacy, mascote da Legado, pensativo" },
} as const;

export type MascotName = keyof typeof MASCOTS;

export function Mascot({
  name,
  className,
  decorative = false,
  priority = false,
}: {
  name: MascotName;
  /** Size it with a height class (e.g. "h-40 w-auto"). */
  className?: string;
  /** Purely ornamental next to text that already says it all. */
  decorative?: boolean;
  priority?: boolean;
}) {
  const m = MASCOTS[name];
  return (
    <Image
      src={m.src}
      width={m.width}
      height={m.height}
      alt={decorative ? "" : m.alt}
      priority={priority}
      draggable={false}
      className={`select-none pointer-events-none ${className ?? ""}`}
    />
  );
}

/** White mark + wordmark, for the black CRM header (same in both themes). */
export function LegadoLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/brand/crm/legado-mark-white.webp" width={161} height={112} alt="" priority className="h-7 w-auto" />
      <Image
        src="/brand/crm/legado-wordmark-white.webp"
        width={241}
        height={72}
        alt="Legado Enterprise"
        priority
        className="hidden sm:block h-[22px] w-auto"
      />
    </span>
  );
}
