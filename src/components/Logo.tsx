import { BRAND } from "@/lib/site-config";

type LogoProps = {
  /** "navy" = ink-blue mark (logo-legado-azul.svg), for light/silver
   * surfaces — e.g. the v2 header. "white" = white mark
   * (logo-legado-branco.svg), for dark surfaces — e.g. footer, hero, login.
   * Both render the real SVG directly, full width/height, never boxed in a
   * plate (Parte 2 do briefing proíbe explicitamente a logo numa placa
   * branca). "onDark" is kept as-is for the existing Legado Intelligence
   * panel (Parte 10: o painel não muda) — do not repoint its asset. */
  variant?: "navy" | "white" | "onDark";
  size?: "sm" | "lg";
  className?: string;
};

const IMAGE_SIZE = {
  sm: "h-10 sm:h-12",
  lg: "h-16 sm:h-20 lg:h-24",
};

const ASSET = {
  navy: "/site/geral/logo-legado-azul.svg",
  white: "/site/geral/logo-legado-branco.svg",
};

export default function Logo({
  variant = "navy",
  size = "sm",
  className = "",
}: LogoProps) {
  if (variant === "onDark") {
    return (
      <img
        src={BRAND.logoWhite}
        alt="Legado Enterprise"
        width={320}
        height={320}
        className={`${IMAGE_SIZE[size]} w-auto object-contain ${className}`}
      />
    );
  }

  return (
    <img
      src={ASSET[variant]}
      alt="Legado Enterprise"
      width={320}
      height={320}
      className={`${IMAGE_SIZE[size]} w-auto object-contain ${className}`}
    />
  );
}
