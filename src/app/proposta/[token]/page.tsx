import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { getPublicProposal } from "@/lib/crm-proposals";
import { PROPOSAL_BILLING_PERIODS, lineNet, proposalStatusLabel } from "@/lib/crm-proposal-types";
import ProposalDecision from "./ProposalDecision";

export const dynamic = "force-dynamic";

// A proposal's page is private to whoever has the link: never indexed, and
// the link is not passed on to sites opened from it.
export const metadata: Metadata = {
  title: "Proposta comercial",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d: string) => d.split("-").reverse().join("/");
const when = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" }).format(new Date(iso));

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 bg-paper text-ink">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 pt-8 sm:pt-12 pb-28 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <Logo variant="navy" />
          <span className="text-[12px] uppercase tracking-[0.18em] text-muted">Proposta comercial</span>
        </header>
        {children}
        <footer className="pt-6 border-t border-line text-[12px] text-muted leading-relaxed">
          Legado Enterprise · Este link é pessoal: não o encaminhe a quem não deve ver a proposta. A aprovação online registra nome, e-mail, data, versão e o
          endereço de acesso, e não substitui o contrato quando ele for necessário.
        </footer>
      </div>
    </main>
  );
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await getPublicProposal(token);
  if (!p) {
    return (
      <Shell>
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h1 className="font-display text-2xl text-navy">Link indisponível</h1>
          <p className="mt-2 text-muted">Este link de proposta não existe mais ou foi desativado. Fale com a Legado para receber o link atual.</p>
        </section>
      </Shell>
    );
  }
  if (!p.content || p.version === null) {
    return (
      <Shell>
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h1 className="font-display text-2xl text-navy">{`Proposta nº ${p.number}`}</h1>
          <p className="mt-2 text-muted">
            {p.status === "cancelada" ? "Esta proposta foi cancelada." : "Esta proposta ainda não está disponível."} Fale com a Legado para mais informações.
          </p>
        </section>
      </Shell>
    );
  }
  const c = p.content;
  const period = PROPOSAL_BILLING_PERIODS.find((x) => x.id === c.billingPeriod)?.label ?? c.billingPeriod;
  const open = p.status === "enviada" || p.status === "visualizada" || p.status === "em_negociacao";
  return (
    <Shell>
      <section className="rounded-2xl border border-line bg-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] text-muted">{`Proposta nº ${p.number} · versão ${p.version}`}</p>
            <h1 className="mt-1 font-display text-[26px] sm:text-3xl leading-tight text-navy">{c.title}</h1>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-navy">{proposalStatusLabel(p.status)}</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
          <div>
            <dt className="text-muted text-[12px]">Para</dt>
            <dd>
              {c.client.contactName}
              {c.client.companyName ? ` · ${c.client.companyName}` : ""}
            </dd>
          </div>
          {c.ownerName && (
            <div>
              <dt className="text-muted text-[12px]">Responsável comercial</dt>
              <dd>{c.ownerName}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted text-[12px]">Emitida em</dt>
            <dd>{day(c.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-muted text-[12px]">Válida até</dt>
            <dd>{day(c.validUntil)}</dd>
          </div>
        </dl>
        {p.updating && (
          <p className="rounded-xl bg-pend-bg text-pend px-4 py-3 text-[14px]">
            A Legado está atualizando esta proposta. Você receberá a nova versão em breve; até lá, ela não pode ser respondida.
          </p>
        )}
        {p.status === "expirada" && (
          <p className="rounded-xl bg-pend-bg text-pend px-4 py-3 text-[14px]">
            {`Esta proposta expirou em ${day(c.validUntil)}. Fale com a Legado para receber uma nova.`}
          </p>
        )}
        {c.intro && <div className="text-[15px] leading-relaxed whitespace-pre-line">{c.intro}</div>}
      </section>

      <section aria-label="Serviços" className="rounded-2xl border border-line bg-card overflow-hidden">
        <h2 className="px-6 pt-5 pb-3 font-display text-xl text-navy">Serviços</h2>
        <ul className="divide-y divide-line">
          {c.items.map((i, n) => (
            <li key={n} className="px-6 py-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{i.name}</p>
                {i.description && <p className="text-[14px] text-muted whitespace-pre-line">{i.description}</p>}
                <p className="text-[13px] text-muted mt-1">
                  {i.quantity.toLocaleString("pt-BR")} × {money(i.unitCents)} · {i.billing === "mensal" ? "mensal" : "valor único"}
                  {i.discountCents ? ` · desconto de ${money(i.discountCents)}${i.discountPct !== null ? ` (${i.discountPct}%)` : ""}` : ""}
                </p>
              </div>
              <p className="sm:text-right font-semibold tabular-nums whitespace-nowrap">
                {money(lineNet(i))}
                {i.billing === "mensal" ? <span className="font-normal text-muted text-[13px]">/mês</span> : null}
              </p>
            </li>
          ))}
        </ul>
        <dl className="border-t border-line bg-paper/60 px-6 py-4 space-y-1.5 text-[14px]">
          {c.totals.discountCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Descontos</dt>
              <dd className="tabular-nums">− {money(c.totals.discountCents)}</dd>
            </div>
          )}
          {c.totals.monthlyCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Recorrente ({period.toLowerCase()})</dt>
              <dd className="tabular-nums">{money(c.totals.monthlyCents)} por mês</dd>
            </div>
          )}
          {c.totals.oneTimeCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Valor único</dt>
              <dd className="tabular-nums">{money(c.totals.oneTimeCents)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 pt-1.5 border-t border-line text-[16px] font-semibold text-navy">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(c.totals.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Condições" className="rounded-2xl border border-line bg-card p-6 space-y-2 text-[14px]">
        <h2 className="font-display text-xl text-navy">Condições</h2>
        {c.paymentTerms && (
          <p>
            <span className="text-muted">Pagamento: </span>
            <span className="whitespace-pre-line">{c.paymentTerms}</span>
          </p>
        )}
        {c.totals.monthlyCents > 0 && (
          <p>
            <span className="text-muted">Periodicidade de cobrança: </span>
            {period}
          </p>
        )}
        {c.dueDate && (
          <p>
            <span className="text-muted">Vencimento: </span>
            {day(c.dueDate)}
          </p>
        )}
        {c.executionTerm && (
          <p>
            <span className="text-muted">Prazo de execução: </span>
            {c.executionTerm}
          </p>
        )}
        {c.notes && <p className="whitespace-pre-line pt-1">{c.notes}</p>}
      </section>

      {p.decision ? (
        <section
          aria-label="Resposta"
          className={`rounded-2xl border p-6 text-[15px] ${p.decision.decision === "aprovada" ? "border-wa/40 bg-wa/5" : "border-line bg-card"}`}
        >
          <p className="font-semibold text-navy">{p.decision.decision === "aprovada" ? "Proposta aprovada" : "Proposta recusada"}</p>
          <p className="text-muted mt-1">
            {`Por ${p.decision.name} em ${when(p.decision.createdAt)} (versão ${p.decision.version}).`}
          </p>
        </section>
      ) : null}

      <ProposalDecision token={token} version={p.version} contentHash={p.contentHash ?? ""} canDecide={open && !p.updating} />
    </Shell>
  );
}
