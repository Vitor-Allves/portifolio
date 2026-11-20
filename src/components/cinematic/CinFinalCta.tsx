import ContactForm from "@/components/ContactForm";
import { CONTACT, waLink } from "@/lib/site-config";

// 7 · CTA final sobre imagem escurecida, com o formulário curto preservado
// e a opção de WhatsApp.
export default function CinFinalCta() {
  return (
    <section className="cin-sec cin-final" id="contato" aria-labelledby="cin-final-title">
      <div className="cin-final-bg" aria-hidden="true" />

      <div className="cin-sec-in cin-final-grid">
        <div>
          <span className="cin-eyebrow" data-cin-reveal>
            Contato
          </span>
          <h2 id="cin-final-title" className="cin-h2" data-cin-reveal>
            Vamos entender onde está a demanda da sua empresa.
          </h2>
          <p className="cin-lead" data-cin-reveal>
            Conte o básico sobre a sua empresa. A conversa começa a partir daí.
          </p>
          <div className="cin-btns cin-wa" data-cin-reveal>
            <a
              href={waLink(CONTACT.whatsappMessage)}
              className="cin-btn cin-btn-ghost"
              target="_blank"
              rel="noopener noreferrer"
            >
              Falar pelo WhatsApp
            </a>
          </div>
        </div>

        <div className="cin-form" data-cin-reveal>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
