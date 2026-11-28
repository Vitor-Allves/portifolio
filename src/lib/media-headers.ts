// Headers for content that comes from outside (a WhatsApp lead's photo,
// audio or document; a file uploaded to a contact). Served from our own
// origin, an HTML or SVG file opened in the browser would run its scripts
// with the logged-in team member's session — anyone who messages the
// WhatsApp number could send one. So only raster images, audio and video are
// shown inline (that is what <img>/<audio>/<video> need); everything else is
// a download, and every response is sandboxed (no scripts, no same-origin
// access) even if a browser decided to render it anyway.

const INLINE_MIME = /^(image\/(jpeg|png|gif|webp|avif|bmp)|audio\/[a-z0-9.+-]+|video\/(mp4|webm|ogg|3gpp|quicktime))$/;

/** The bare, lowercased type of a Content-Type value ("Image/JPEG; x=y" → "image/jpeg"). */
export function bareMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

/** True when the type is safe to render inline from our origin. */
export function isInlineSafeMime(mime: string | null | undefined): boolean {
  return INLINE_MIME.test(bareMime(mime));
}

/** Content-Type / Disposition / sandbox headers for externally supplied bytes. */
export function untrustedContentHeaders(mime: string | null | undefined, filename: string): Record<string, string> {
  const inline = isInlineSafeMime(mime);
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "arquivo";
  return {
    // Never echo an unsafe type back: a download needs no real type.
    "Content-Type": inline ? bareMime(mime) : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  };
}
