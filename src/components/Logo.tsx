"use client";

import { useState } from "react";
import Image from "next/image";
import { BRAND } from "@/lib/site-config";

type LogoProps = {
  /** "light" = mark suited for a dark background (header, footer). */
  variant?: "light" | "dark";
  className?: string;
};

export default function Logo({ variant = "light", className = "" }: LogoProps) {
  const src = variant === "light" ? BRAND.logoLight : BRAND.logoDark;
  const [failed, setFailed] = useState(false);
  const ink = variant === "light" ? "#F8F9FB" : "#0A1526";

  if (failed) {
    // Official mark not present yet at this path — plain wordmark so the
    // header never shows a broken-image icon while it's added.
    return (
      <span
        className={`font-serif tracking-[0.2em] uppercase text-sm sm:text-base ${className}`}
        style={{ color: ink }}
      >
        Legado <span className="opacity-70">Enterprise</span>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt="Legado Enterprise"
      width={180}
      height={56}
      priority
      className={`h-9 sm:h-10 w-auto object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
