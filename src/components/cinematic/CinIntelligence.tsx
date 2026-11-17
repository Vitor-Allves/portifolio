import Link from "next/link";
import { ROUTES } from "@/lib/site-config";

// 5 · Legado Intelligence como produto, com mockup 3D que abre com o scroll
// (o movimento 3D está no CinMotion; sem JS o mockup fica reto e legível).
export default function CinIntelligence() {
  return (
    <section className="cin-sec cin-sec-dim" id="intelligence" aria-labelledby="cin-int-title">
      <div className="cin-sec-in cin-int">
        <div>
          <span className="cin-eyebrow" data-cin-reveal>
            Produto · Legado Intelligence
          </span>
          <h2 id="cin-int-title" className="cin-h2" data-cin-reveal>
            Seus números, em um só lugar.
          </h2>
          <p className="cin-lead" data-cin-reveal>
            O painel que a Legado usa para acompanhar cada campanha, com o que importa para decidir
            e a comparação com o período anterior.
          </p>
          <ul className="cin-int-feats" data-cin-reveal>
            <li>
              <b>Indicadores:</b> investimento, alcance, cliques, conversas e custo por resultado.
            </li>
            <li>
              <b>Filtros:</b> por conta, campanha e período.
            </li>
            <li>
              <b>Relatório:</b> em PDF, pronto para baixar.
            </li>
          </ul>
          <div className="cin-btns" data-cin-reveal>
            <Link href={ROUTES.intelligenceLogin} className="cin-btn">
              Entrar no Intelligence
            </Link>
            <a href="#contato" className="cin-btn cin-btn-ghost">
              Quero ter acesso
            </a>
          </div>
        </div>

        <div className="cin-3d-wrap" data-cin-reveal>
          <div className="cin-3d" data-cin-3d aria-label="Tela de exemplo do Legado Intelligence">
            <div className="cin-3d-row">
              <b>Visão geral · últimos 30 dias</b>
              <small>Dados de exemplo</small>
            </div>
            <div className="cin-kpis">
              <div className="cin-kpi">
                <small>Investimento</small>
                <strong>R$ 3.250</strong>
                <em>+8% vs. anterior</em>
              </div>
              <div className="cin-kpi">
                <small>Conversas</small>
                <strong>418</strong>
                <em>+15% vs. anterior</em>
              </div>
              <div className="cin-kpi">
                <small>Custo por conversa</small>
                <strong>R$ 7,78</strong>
                <em>−6% vs. anterior</em>
              </div>
              <div className="cin-kpi">
                <small>Cliques no link</small>
                <strong>1.284</strong>
                <em>+11% vs. anterior</em>
              </div>
            </div>
            <div className="cin-obj">
              <span>Resultado principal · Mensagens</span>
              <strong>418 conversas</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
