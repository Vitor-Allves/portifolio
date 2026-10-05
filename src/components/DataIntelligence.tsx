import Link from "next/link";
import { ROUTES } from "@/lib/site-config";

const FEATS = [
  {
    icon: "/site/home/icone-indicadores.webp",
    title: "Indicadores",
    text: "Investimento, alcance, cliques, conversas e o resultado principal de cada objetivo.",
  },
  {
    icon: "/site/home/icone-filtros.webp",
    title: "Filtros",
    text: "Por cliente, período, campanha, conjunto, objetivo e status.",
  },
  {
    icon: "/site/home/icone-relatorios.webp",
    title: "Relatórios",
    text: "Relatório em PDF, pronto para baixar.",
  },
];

export default function DataIntelligence() {
  return (
    <section className="lg-section lg-dark lg-section-border" id="intelligence" data-score="2">
      <div className="lg-in lg-int">
        <div>
          <span className="lg-eyebrow">Legado Intelligence</span>
          <h2 className="lg-h2 mt-3">Seus números, em um só lugar.</h2>
          <p className="lg-lead mt-4">
            Os clientes da Legado acompanham os indicadores das campanhas no Legado
            Intelligence, com filtros por conta, campanha e período, e relatórios prontos para
            baixar.
          </p>
          <div className="lg-feats mt-6">
            {FEATS.map((f) => (
              <div key={f.title} className="lg-feat">
                <img src={f.icon} alt="" width={56} height={56} loading="lazy" />
                <div>
                  <b>{f.title}</b>
                  <span>{f.text}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="lg-btns mt-6">
            <Link href={ROUTES.intelligenceLogin} className="lg-btn lg-btn-metal">
              Entrar no Intelligence
            </Link>
            <a href="#contato" className="lg-btn lg-btn-ghost">
              Quero ter acesso
            </a>
          </div>
        </div>

        <div className="lg-int-vis">
          <div className="lg-dash" aria-label="Tela de exemplo do Legado Intelligence">
            <div className="lg-row1">
              <b>Visão geral · Últimos 30 dias</b>
              <span className="lg-ex">Dados de exemplo</span>
            </div>
            <div className="lg-kpis">
              <div className="lg-kpi">
                <small>Investimento</small>
                <strong>R$ 3.250</strong>
                <em>+8% vs. anterior</em>
              </div>
              <div className="lg-kpi">
                <small>Conversas</small>
                <strong>418</strong>
                <em>+15% vs. anterior</em>
              </div>
              <div className="lg-kpi">
                <small>Custo por conversa</small>
                <strong>R$ 7,78</strong>
                <em>−6% vs. anterior</em>
              </div>
              <div className="lg-kpi">
                <small>Cliques no link</small>
                <strong>1.284</strong>
                <em>+11% vs. anterior</em>
              </div>
            </div>
            <div className="lg-obj">
              <span>Resultado principal · Mensagens</span>
              <strong>418 conversas</strong>
            </div>
          </div>
          <img
            className="lg-duo"
            src="/site/home/intelligence-dupla.webp"
            alt="Titan e Legacy de braços cruzados"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
