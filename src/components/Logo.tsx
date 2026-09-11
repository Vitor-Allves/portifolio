import Image from "next/image";
import { BRAND } from "@/lib/site-config";

type LogoProps = {
  /** "light" = on a dark surface (header, footer, hero): the mark gets a
   * light plate behind it, since the file itself is drawn in dark ink.
   * "dark" = already on a light surface: render the file directly. */
  variant?: "light" | "dark";
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

export default function Logo({
  variant = "light",
  size = "sm",
  className = "",
}: LogoProps) {
  const image = (
    <Image
      src={BRAND.logo}
      alt="Legado Enterprise"
      width={512}
      height={512}
      priority
      className={`${IMAGE_SIZE[size]} w-auto object-contain`}
    />
  );

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
