// 3 · Para quem é: uma ideia por tela, quatro perfis de empresa.
const PROFILES = [
  "Empresas que já vendem e querem mais previsibilidade no funil.",
  "Negócios com time comercial que precisa de contatos qualificados.",
  "Empresas que investem em tráfego pago e não sabem o que está funcionando.",
  "Empresas que querem decidir com números, não com achismo.",
];

export default function CinForWho() {
  return (
    <section className="cin-sec" id="paraquem" aria-labelledby="cin-who-title">
      <div className="cin-sec-in">
        <span className="cin-eyebrow" data-cin-reveal>
          Para quem é
        </span>
        <h2 id="cin-who-title" className="cin-h2" data-cin-reveal>
          Para quem precisa de demanda agora.
        </h2>

        <ul className="cin-list">
          {PROFILES.map((text, i) => (
            <li key={text} data-cin-reveal>
              <i aria-hidden="true">{String(i + 1).padStart(2, "0")}</i>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="cin-btns" data-cin-reveal>
          <a href="#contato" className="cin-btn cin-btn-ghost">
            Falar com a Legado
          </a>
        </div>
      </div>
    </section>
  );
}
