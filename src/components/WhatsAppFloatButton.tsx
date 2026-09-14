"use client";

import { usePathname } from "next/navigation";
import { CONTACT } from "@/lib/site-config";

export default function WhatsAppFloatButton() {
  const pathname = usePathname();
  if (pathname?.startsWith("/analise")) return null;

  const href = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(
    CONTACT.whatsappMessage
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:scale-105 sm:bottom-6 sm:right-6"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.42 5.82c0 4.55-3.7 8.25-8.25 8.25a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.19-.31a8.17 8.17 0 0 1-1.26-4.39c0-4.55 3.7-8.25 8.25-8.25l-.01.01Zm-4.53 4.6c-.17 0-.44.06-.68.32-.23.26-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.76 2.82 4.36 3.85 2.16.85 2.6.68 3.07.64.47-.04 1.51-.62 1.72-1.21.21-.6.21-1.11.15-1.22-.06-.1-.23-.17-.47-.29-.24-.13-1.44-.71-1.66-.79-.22-.08-.39-.13-.55.13-.17.26-.63.79-.77.95-.14.17-.28.19-.52.06-.24-.13-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.68-.14-.26-.02-.4.11-.53.11-.11.26-.28.38-.42.13-.14.17-.24.26-.4.09-.16.04-.31-.02-.44-.06-.13-.55-1.35-.76-1.85-.2-.48-.4-.42-.55-.43-.14-.01-.31-.01-.48-.01Z" />
      </svg>
    </a>
  );
}
