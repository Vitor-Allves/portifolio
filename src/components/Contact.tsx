import ContactForm from "./ContactForm";

export default function Contact() {
  return (
    <section className="lg-section" id="contato" data-score="3">
      <div className="lg-in lg-contact">
        <div>
          <div className="lg-head">
            <span className="lg-eyebrow">Contato</span>
            <h2 className="lg-h2">Antes da estratégia, precisamos entender o cenário.</h2>
            <p className="lg-lead">
              Conte o básico sobre a sua empresa. A conversa começa a partir daí.
            </p>
          </div>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
