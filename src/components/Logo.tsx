import { BRAND } from "@/lib/site-config";

type LogoProps = {
  /** "light" = on a dark surface (header, footer, hero): the mark gets a
   * light plate behind it, since the file itself is drawn in dark ink.
   * "dark" = already on a light surface: render the file directly.
   * "onDark" = a dark surface where a plate would be wrong (e.g. the
   * Legado Intelligence dashboard's near-black background) — renders the
   * pre-made white-ink export directly, no plate. */
  variant?: "light" | "dark" | "onDark";
  /** "sm" = compact header lockup. "lg" = larger institutional placement,
   * e.g. the hero's first fold. */
  size?: "sm" | "lg";
  className?: string;
};

const IMAGE_SIZE = {
  sm: "h-12 sm:h-14",
  lg: "h-16 sm:h-20 lg:h-24",
};

const PLATE_PADDING = {
  sm: "px-2 py-1.5",
  lg: "px-4 py-3 sm:px-5 sm:py-3.5",
};

// This mark is never displayed past ~96px tall (the "lg" ceiling), so it's
// served from small pre-sized WebP variants instead of the 1024px master
// (195KB) that used to ship on every page load regardless of display size.
const DISPLAY_SIZES = {
  sm: "56px",
  lg: "96px",
};

export default function Logo({
  variant = "light",
  size = "sm",
  className = "",
}: LogoProps) {
  const image = (
    <picture>
      <img
        src={BRAND.logoSmall320}
        srcSet={`${BRAND.logoSmall160} 160w, ${BRAND.logoSmall320} 320w`}
        sizes={DISPLAY_SIZES[size]}
        alt="Legado Enterprise"
        width={320}
        height={320}
        className={`${IMAGE_SIZE[size]} w-auto object-contain`}
      />
    </picture>
  );

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

  if (variant === "dark") {
    return <span className={className}>{image}</span>;
  }

  return (
    <span
      className={`inline-flex items-center rounded-xl bg-white shadow-[0_2px_10px_-2px_rgba(4,7,12,0.35)] ${PLATE_PADDING[size]} ${className}`}
    >
      {image}
    </span>
  );
}
