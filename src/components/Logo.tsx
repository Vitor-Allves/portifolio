import Image from "next/image";
import { BRAND } from "@/lib/site-config";

type LogoProps = {
  /** "light" = on a dark surface (header, footer): the mark gets a light
   * plate behind it, since the file itself is drawn in dark ink.
   * "dark" = already on a light surface: render the file directly. */
  variant?: "light" | "dark";
  className?: string;
};

export default function Logo({ variant = "light", className = "" }: LogoProps) {
  const image = (
    <Image
      src={BRAND.logo}
      alt="Legado Enterprise"
      width={512}
      height={512}
      priority
      className="h-12 sm:h-14 w-auto object-contain"
    />
  );

  if (variant === "dark") {
    return <span className={className}>{image}</span>;
  }

  return (
    <span
      className={`inline-flex items-center rounded-xl bg-white px-2 py-1.5 shadow-[0_2px_10px_-2px_rgba(4,7,12,0.35)] ${className}`}
    >
      {image}
    </span>
  );
}
