"use client";

// Personalização → Propostas: the largest discount a salesperson sends without
// a Gestor's authorization, and the proposal templates (texts, conditions,
// validity and the catalog services a new proposal starts with).

import { useEffect, useState } from "react";
import { PROPOSAL_BILLING_PERIODS, type CrmProposalTemplate } from "@/lib/crm-proposal-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { useCatalog } from "./crm-catalog-context";

type Run = (fn: () => Promise<string | null>, ok?: string) => Promise<boolean>;
type Draft = {
  id: string | null;
  name: string;
  validDays: string;
  billingPeriod: string;
  intro: string;
  paymentTerms: string;
  executionTerm: string;
  notes: string;
  serviceIds: string[];
};

const empty: Draft = {
  id: null,
  name: "",
  validDays: "15",
  billingPeriod: "mensal",
  intro: "",
  paymentTerms: "",
  executionTerm: "",
  notes: "",
  serviceIds: [],
};
const toDraft = (t: CrmProposalTemplate): Draft => ({
  id: t.id,
  name: t.name,
  validDays: String(t.validDays),
  billingPeriod: t.billingPeriod,
  intro: t.intro ?? "",
  paymentTerms: t.paymentTerms ?? "",
  executionTerm: t.executionTerm ?? "",
  notes: t.notes ?? "",
  serviceIds: t.serviceIds,
});

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  return ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.";
}

export default function CrmProposalSettings({ run }: { run: Run }) {
  const { options, label } = useCatalog();
  const [templates, setTemplates] = useState<CrmProposalTemplate[] | null>(null);
  const [limit, setLimit] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/proposal-templates/?archived=1")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { templates?: CrmProposalTemplate[]; discountLimitPct?: number } | null;
        if (cancelled) return;
        setTemplates(body?.templates ?? []);
        setLimit(String(body?.discountLimitPct ?? 10).replace(".", ","));
      })
      .catch(() => !cancelled && setTemplates([]));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const services = options("service");
  const reload = () => setVersion((v) => v + 1);

  async function saveTemplate() {
    if (!draft) return;
    const body = { ...draft, validDays: Number(draft.validDays) };
    const ok = await run(
      () => (draft.id ? send(`/api/crm/proposal-templates/${draft.id}/`, "PATCH", body) : send("/api/crm/proposal-templates/", "POST", body)),
      "Modelo salvo.",
    );
    if (ok) {
      setDraft(null);
      reload();
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Desconto máximo" className="rounded-2xl border border-crm-line bg-crm-card p-4 space-y-2">
        <h3 className="text-[14px] font-semibold">Desconto máximo sem autorização</h3>
        <p className="text-[12.5px] text-crm-dim">
          Acima deste percentual (sobre o valor bruto da proposta), a proposta só pode ser enviada depois que um Gestor autorizar o desconto.
        </p>
        {/* Only once the saved value is in: typing before it arrives would be overwritten by it. */}
        {templates === null ? (
          <p className="text-[12.5px] text-crm-dim">Carregando...</p>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              inputMode="decimal"
              aria-label="Desconto máximo (%)"
              className={`${CRM_INPUT} !w-24`}
            />
            <span className="text-[13px] text-crm-dim">%</span>
            <button
              type="button"
              onClick={() => void run(() => send("/api/crm/proposal-settings/", "PATCH", { discountLimitPct: limit }), "Desconto máximo salvo.").then(reload)}
              className={CRM_BTN_PRIMARY}
            >
              Salvar
            </button>
          </div>
        )}
      </section>

      <section aria-label="Modelos de proposta" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Modelos de proposta</h3>
          {!draft && (
            <button type="button" onClick={() => setDraft(empty)} className={CRM_LINK_BTN}>
              + Novo modelo
            </button>
          )}
        </div>
        <p className="text-[12.5px] text-crm-dim">
          Uma proposta nova pode começar de um modelo: a apresentação, as condições, a validade e os serviços do catálogo (com o valor de referência de cada
          um). Tudo continua editável na proposta.
        </p>
        {draft && (
          <div className="rounded-2xl border border-crm-line bg-crm-sunken p-4 space-y-3" role="form" aria-label={draft.id ? "Editar modelo" : "Novo modelo"}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_160px] gap-2">
              <label className="block">
                <span className={CRM_LABEL}>Nome</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-label="Nome do modelo"
                  className={`${CRM_INPUT} mt-1`}
                />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Validade (dias)</span>
                <input
                  value={draft.validDays}
                  onChange={(e) => setDraft({ ...draft, validDays: e.target.value })}
                  inputMode="numeric"
                  aria-label="Validade em dias"
                  className={`${CRM_INPUT} mt-1`}
                />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Cobrança</span>
                <select
                  value={draft.billingPeriod}
                  onChange={(e) => setDraft({ ...draft, billingPeriod: e.target.value })}
                  aria-label="Periodicidade do modelo"
                  className={`${CRM_INPUT} mt-1`}
                >
                  {PROPOSAL_BILLING_PERIODS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-1">
              <legend className={CRM_LABEL}>Serviços do catálogo</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {services.length === 0 && <p className="text-[12px] text-crm-dim">Cadastre serviços na aba Serviços.</p>}
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={draft.serviceIds.includes(s.id)}
                      onChange={(e) =>
                        setDraft({ ...draft, serviceIds: e.target.checked ? [...draft.serviceIds, s.id] : draft.serviceIds.filter((x) => x !== s.id) })
                      }
                      className="h-4 w-4 accent-[var(--crm-accent)]"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {(
              [
                ["intro", "Apresentação", 3],
                ["paymentTerms", "Condições de pagamento", 2],
                ["executionTerm", "Prazo de execução", 1],
                ["notes", "Observações comerciais", 2],
              ] as const
            ).map(([k, l, rows]) => (
              <label key={k} className="block">
                <span className={CRM_LABEL}>{l}</span>
                <textarea
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  rows={rows}
                  aria-label={`${l} do modelo`}
                  className={`${CRM_INPUT} mt-1 resize-y`}
                />
              </label>
            ))}
            <div className="flex items-center gap-2">
              <button type="button" disabled={!draft.name.trim()} onClick={() => void saveTemplate()} className={CRM_BTN_PRIMARY}>
                Salvar modelo
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {templates === null ? (
          <p className="text-[12.5px] text-crm-faint">Carregando...</p>
        ) : templates.length === 0 ? (
          !draft && <p className="text-[12.5px] text-crm-dim">Nenhum modelo ainda.</p>
        ) : (
          <ul className="divide-y divide-crm-line rounded-2xl border border-crm-line bg-crm-card">
            {templates.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${t.archivedAt ? "opacity-60" : ""}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium">
                    {t.name}
                    {t.archivedAt ? " (arquivado)" : ""}
                  </span>
                  <span className="block text-[11.5px] text-crm-faint">
                    {t.serviceIds.map((id) => label("service", id)).join(", ") || "sem serviços"} · validade {t.validDays} dias
                  </span>
                </span>
                {!t.archivedAt && (
                  <button type="button" onClick={() => setDraft(toDraft(t))} className={CRM_LINK_BTN}>
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => send(`/api/crm/proposal-templates/${t.id}/`, "PATCH", { archived: !t.archivedAt }),
                      t.archivedAt ? "Modelo reativado." : "Modelo arquivado.",
                    ).then(reload)
                  }
                  className="text-[12px] text-crm-dim hover:text-crm-text"
                >
                  {t.archivedAt ? "Reativar" : "Arquivar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
