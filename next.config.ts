import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Baseline hardening headers on every response. frame-ancestors 'none'
  // (plus the legacy X-Frame-Options fallback for older browsers) stops the
  // login page and admin panel from being embedded in a hidden iframe on an
  // attacker-controlled page (clickjacking) — nothing here needs framing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Bytes that come from outside (a WhatsApp lead's media, a file
        // attached to a contact): a later rule wins, so these get a
        // sandboxed policy instead of the one above — even if a browser
        // rendered an HTML/SVG file, it would run in a sandbox with no
        // scripts and no access to the team's session (see media-headers.ts).
        source: "/api/crm/(media|files)/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
