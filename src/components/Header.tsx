"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ScoreBoard from "./ScoreBoard";
import { NAV_ITEMS, ROUTES } from "@/lib/site-config";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="lg-hd">
      <div className="lg-in-wide">
        <Link href="/" className="lg-hd-logo" aria-label="Legado Enterprise, início">
          <Logo variant="navy" />
        </Link>

        <nav className="lg-hd-nav" aria-label="Menu">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "lg-cur" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ScoreBoard />

        <Link href={ROUTES.intelligenceLogin} className="lg-hd-enter">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          <span>Entrar no Intelligence</span>
        </Link>

        <Link href="/#contato" className="lg-btn lg-btn-metal lg-hd-talk">
          Vamos conversar
        </Link>

        <button
          type="button"
          className="lg-burger"
          aria-expanded={menuOpen}
          aria-controls="lg-drawer"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {menuOpen ? (
              <path d="M1 1l16 12M17 1L1 13" strokeLinecap="round" />
            ) : (
              <path d="M1 1h16M1 7h16M1 13h16" strokeLinecap="round" />
            )}
          </svg>
        </button>

        {menuOpen && (
          <div id="lg-drawer" className="lg-drawer">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="lg-drawer-link"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="lg-btns">
              <Link
                href={ROUTES.intelligenceLogin}
                onClick={() => setMenuOpen(false)}
                className="lg-btn lg-btn-line"
              >
                Entrar no Intelligence
              </Link>
              <Link
                href="/#contato"
                onClick={() => setMenuOpen(false)}
                className="lg-btn lg-btn-navy"
              >
                Vamos conversar
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
