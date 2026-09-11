"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import { NAV_ITEMS } from "@/lib/site-config";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-navy-950/80 backdrop-blur-xl border-b border-white/5 py-3"
          : "bg-transparent py-6"
      }`}
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 flex items-center justify-between">
        <a href="#inicio" className="shrink-0" aria-label="Legado Enterprise — início">
          <Logo variant="light" />
        </a>

        <nav
          className="hidden lg:flex items-center gap-9"
          aria-label="Navegação principal"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] tracking-[0.14em] uppercase text-silver-300 hover:text-white transition-colors duration-300 relative after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-0 after:bg-silver-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href="#contato"
          className="hidden lg:inline-flex items-center gap-2 border border-silver-400/40 text-silver-200 text-[13px] tracking-[0.12em] uppercase px-5 py-2.5 rounded-full hover:bg-silver-400 hover:text-navy-950 hover:border-silver-400 transition-all duration-300"
        >
          Vamos conversar
        </a>

        <button
          type="button"
          className="lg:hidden text-silver-200 p-2"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path
                d="M6 6L20 20M20 6L6 20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : (
              <>
                <path d="M4 8H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M4 13H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M4 18H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 top-[64px] bg-navy-950/98 backdrop-blur-xl px-6 py-10 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="text-2xl font-serif text-silver-100 py-4 border-b border-white/5"
            >
              {item.label}
            </a>
          ))}
          <a
            href="#contato"
            onClick={() => setMenuOpen(false)}
            className="mt-8 text-center border border-silver-400/40 text-silver-100 text-sm tracking-[0.12em] uppercase px-5 py-4 rounded-full"
          >
            Vamos conversar
          </a>
        </div>
      )}
    </header>
  );
}
