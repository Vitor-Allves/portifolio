import Reveal from "./Reveal";
import ContactForm from "./ContactForm";

export default function Contact() {
  return (
    <section id="contato" className="relative bg-ice-50 py-28 sm:py-36">
      <div className="mx-auto max-w-4xl px-6 lg:px-10">
        <div className="text-center mb-14">
          <Reveal>
            <p className="text-[12px] tracking-[0.3em] uppercase text-navy-500 mb-5">
              Contato
            </p>
            <h2 className="font-serif text-balance text-3xl sm:text-4xl lg:text-5xl leading-[1.15] text-navy-950">
              Antes da estratégia, precisamos entender o cenário.
            </h2>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <ContactForm />
        </Reveal>
      </div>
    </section>
  );
}
