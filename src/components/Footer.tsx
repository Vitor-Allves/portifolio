import Logo from "./Logo";
import { NAV_ITEMS, SOCIAL } from "@/lib/site-config";

export default function Footer() {
  return (
    <footer className="relative bg-navy-950 text-white border-t border-white/5">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-2">
            <Logo variant="light" />
            <p className="mt-6 font-serif text-lg text-silver-300 italic max-w-xs">
              Seu negócio, nosso compromisso.
              <br />
              Seu legado, nossa missão.
            </p>
          </div>

          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-5">
              Navegação
            </p>
            <ul className="space-y-3">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm text-silver-300 hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#"
                  className="text-sm text-silver-300 hover:text-white transition-colors"
                >
                  Política de Privacidade
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-silver-500 mb-5">
              Redes sociais
            </p>
            <ul className="space-y-3">
              <li>
                <a
                  href={SOCIAL.linkedinCompany}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-silver-300 hover:text-white transition-colors"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL.instagramCompany}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-silver-300 hover:text-white transition-colors"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/5 text-center text-xs text-silver-600">
          © 2026 Legado Enterprise. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
