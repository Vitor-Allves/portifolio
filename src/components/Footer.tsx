import Link from "next/link";
import Logo from "./Logo";
import { NAV_ITEMS, ROUTES, SOCIAL, CONTACT } from "@/lib/site-config";

export default function Footer() {
  return (
    <footer className="lg-ft">
      <div className="lg-in-wide lg-ft-top">
        <div className="lg-brand">
          <Logo variant="white" className="lg-ftlogo !h-auto" />
          <p>
            Seu negócio, nosso compromisso.
            <br />
            Seu legado, nossa missão.
          </p>
        </div>

        <nav className="lg-ft-nav" aria-label="Rodapé">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="lg-ft-side">
          <Link href="/#contato" className="lg-btn lg-btn-metal">
            Vamos conversar
          </Link>
          <div className="lg-social">
            <a
              href={SOCIAL.instagramCompany}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram da Legado"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a
              href={SOCIAL.linkedinCompany}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn da Legado"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zM9 9h2.9v1.7h.1c.4-.8 1.4-1.9 3.2-1.9 3.4 0 4 2.2 4 5.1V21h-3v-6.2c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9z" />
              </svg>
            </a>
            <a
              href={`https://wa.me/${CONTACT.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp da Legado"
            >
              <svg viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="lg-copy">
        <div className="lg-in-wide">
          <span>© 2026 Legado Enterprise. Todos os direitos reservados.</span>
          <span className="lg-links">
            <Link href={ROUTES.intelligenceLogin}>Entrar no Intelligence</Link>
            <Link href={ROUTES.privacy}>Política de privacidade</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
