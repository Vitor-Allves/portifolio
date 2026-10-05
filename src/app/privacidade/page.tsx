import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CONTACT, ROUTES } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como a Legado Enterprise coleta, usa e protege os dados pessoais de quem visita o site e preenche o formulário de contato.",
  alternates: { canonical: ROUTES.privacy },
  robots: { index: true, follow: true },
};

export default function PrivacidadePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="lg-section">
          <div className="lg-in" style={{ maxWidth: "800px" }}>
            <div className="lg-head">
              <span className="lg-eyebrow">Legal</span>
              <h1 className="lg-h2">Política de Privacidade</h1>
              <p className="lg-lead">Última atualização: outubro de 2026.</p>
            </div>

            <div className="grid gap-8 text-[15px] leading-relaxed text-muted">
              <p>
                Esta política explica como a Legado Enterprise coleta, usa, armazena e protege
                os dados pessoais de quem visita este site ou preenche o formulário de contato,
                em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 —
                LGPD).
              </p>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">1. Quem somos</h2>
                <p>
                  A Legado Enterprise é uma empresa de estratégia e marketing, controladora dos
                  dados pessoais tratados através deste site. Dúvidas sobre esta política podem
                  ser enviadas para{" "}
                  <a href={`mailto:${CONTACT.email}`} className="text-navy underline">
                    {CONTACT.email}
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">2. Quais dados coletamos</h2>
                <p className="mb-2">
                  Quando você preenche o formulário de contato, coletamos: nome, número de
                  WhatsApp, empresa, faixa de faturamento aproximado e principal objetivo
                  informado.
                </p>
                <p>
                  Também coletamos automaticamente dados de navegação (páginas visitadas,
                  dispositivo, origem do acesso) por meio de ferramentas de analytics e pixels
                  de anúncios, para entender o desempenho do site e das campanhas.
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">
                  3. Para que usamos esses dados
                </h2>
                <ul className="list-disc pl-5 grid gap-1">
                  <li>Responder ao seu contato pelo WhatsApp;</li>
                  <li>Entender o cenário da sua empresa antes de uma conversa comercial;</li>
                  <li>Medir e melhorar o desempenho do site e das campanhas de marketing;</li>
                  <li>Cumprir obrigações legais e regulatórias, quando aplicável.</li>
                </ul>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">
                  4. Com quem compartilhamos
                </h2>
                <p>
                  Os dados do formulário de contato são enviados diretamente pelo seu próprio
                  WhatsApp para a equipe da Legado — não há envio a servidores de terceiros
                  nessa etapa. Dados de navegação podem ser compartilhados com provedores de
                  analytics e plataformas de anúncios (como Meta/Facebook e Google), sempre
                  sob os termos de privacidade dessas plataformas.
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">
                  5. Clientes com acesso ao Legado Intelligence
                </h2>
                <p>
                  Para empresas que já são parceiras da Legado, os dados de campanhas e
                  indicadores são tratados dentro do Legado Intelligence, sob um acordo
                  comercial específico com cada cliente — essa política cobre apenas o site
                  público e o formulário de contato.
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">6. Seus direitos</h2>
                <p>
                  Nos termos da LGPD, você pode solicitar a qualquer momento: confirmação do
                  tratamento, acesso, correção, anonimização ou exclusão dos seus dados, e a
                  revogação do seu consentimento. Para exercer esses direitos, escreva para{" "}
                  <a href={`mailto:${CONTACT.email}`} className="text-navy underline">
                    {CONTACT.email}
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">
                  7. Armazenamento e segurança
                </h2>
                <p>
                  Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados
                  pessoais contra acesso não autorizado, perda ou uso indevido. Os dados são
                  mantidos apenas pelo tempo necessário às finalidades descritas nesta
                  política ou conforme exigido por lei.
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">8. Cookies</h2>
                <p>
                  Este site pode usar cookies e tecnologias semelhantes para lembrar
                  preferências e medir o desempenho de páginas e campanhas. Você pode gerenciar
                  ou bloquear cookies diretamente nas configurações do seu navegador.
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl text-navy mb-2">
                  9. Alterações nesta política
                </h2>
                <p>
                  Esta política pode ser atualizada periodicamente. A data da última
                  atualização estará sempre indicada no topo desta página.
                </p>
              </section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
