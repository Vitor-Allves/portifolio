"use client";

// Financeiro comercial (evolução v1.0, item 10): what was sold, recurring and
// one-time revenue, what is contracted and forecast, the next charges,
// discounts, cancellations, lost revenue and commissions — plus the
// commission rules. Gerencial: calculated from the CRM, nothing is billed.

import { useEffect, useState } from "react";
import type { CrmCommissionRule, CrmFinance } from "@/lib/crm-finance-types";
import { formatBRL, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { PRESETS, presetRange, spDate, type Preset } from "./crm-format";
import { useCatalog } from "./crm-catalog-context";

const brl = (c: number) => formatBRL(c) || "R$ 0";
const day = (d: string) => d.split("-").reverse().join("/");
const monthLabel = (m: string) => {
  const t = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-crm-line bg-crm-card px-4 py-3">
      <p className={CRM_LABEL}>{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11.5px] text-crm-faint">{hint}</p>}
    </div>
  );
}

type RuleDraft = { id: string | null; name: string; userId: string; service: string; billing: string; percent: string; months: string };
const emptyRule: RuleDraft = { id: null, name: "", userId: "", service: "", billing: "", percent: "", months: "1" };

export default function CrmFinanceView({
  team,
  currentUserId,
  seeAll,
  canExport,
  canManageRules,
  version,
  now,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  seeAll: boolean;
  canExport: boolean;
  canManageRules: boolean;
  version: number;
  now: number;
}) {
  const { options, label } = useCatalog();
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [owner, setOwner] = useState("all");
  const [rulesVersion, setRulesVersion] = useState(0);
  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const q = new URLSearchParams({ from, to, owner }).toString();
  const key = `${q}#${version}#${rulesVersion}`;
  const [result, setResult] = useState<{ key: string; data: CrmFinance | null; error: string | null } | null>(null);
  const [rules, setRules] = useState<CrmCommissionRule[] | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/finance/?${key.split("#")[0]}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { finance?: CrmFinance; error?: string } | null;
        if (!cancelled) setResult({ key, data: body?.finance ?? null, error: res.ok ? null : (body?.error ?? "Não foi possível carregar o financeiro.") });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/commission-rules/")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { rules?: CrmCommissionRule[] } | null;
        if (!cancelled) setRules(body?.rules ?? []);
      })
      .catch(() => !cancelled && setRules([]));
    return () => {
      cancelled = true;
    };
  }, [rulesVersion]);

  async function saveRule(body: Record<string, unknown>, id: string | null) {
    const res = await fetch(id ? `/api/crm/commission-rules/${id}/` : "/api/crm/commission-rules/", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      setRuleError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar a regra.");
      return false;
    }
    setRuleError(null);
    setRulesVersion((v) => v + 1);
    return true;
  }

  const f = result?.data ?? null;
  const months = f ? [...new Set(f.installments.map((i) => i.month))] : [];
  const billingLabel = (b: string | null) => (b === "mensal" ? "mensalidades" : b === "unico" ? "valores únicos" : "mensal e único");

  return (
    <section aria-label="Financeiro comercial" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Período" className={CRM_FILTER}>
          {PRESETS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {preset === "custom" && (
          <>
            <input
              type="date"
              value={custom[0]}
              max={custom[1]}
              onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])}
              aria-label="Data inicial"
              className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
            />
            <span className="text-[12px] text-crm-dim">até</span>
            <input
              type="date"
              value={custom[1]}
              min={custom[0]}
              onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])}
              aria-label="Data final"
              className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
            />
          </>
        )}
        {seeAll && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Vendedor" className={CRM_FILTER}>
            <option value="all">Toda a equipe</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === currentUserId ? " (você)" : ""}
              </option>
            ))}
          </select>
        )}
        {canExport && (
          <span className="ml-auto flex gap-3">
            <a href={`/api/crm/finance/export/?${q}&format=csv`} className={CRM_LINK_BTN}>
              Baixar planilha
            </a>
            <a href={`/api/crm/finance/export/?${q}&format=pdf`} className={CRM_LINK_BTN}>
              Baixar PDF
            </a>
          </span>
        )}
      </div>
      {!seeAll && <p className="text-[12px] text-crm-faint">Seus números: vendas, contratos e comissões em que você é o responsável comercial.</p>}
      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!f ? (
        !result?.error && <p className="text-[12.5px] text-crm-faint">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="region" aria-label="Indicadores financeiros">
            <Tile label="Valor vendido" value={brl(f.sold.cents)} hint={`${f.sold.count} ${f.sold.count === 1 ? "venda" : "vendas"} no período`} />
            <Tile label="Nova receita mensal" value={brl(f.newMonthlyCents)} hint="contratos vendidos no período" />
            <Tile label="Serviços pontuais" value={brl(f.oneTimeCents)} hint="valores únicos vendidos no período" />
            <Tile
              label="Receita recorrente"
              value={`${brl(f.active.monthlyCents)}/mês`}
              hint={`${f.active.contracts} ${f.active.contracts === 1 ? "contrato ativo" : "contratos ativos"} hoje`}
            />
            <Tile label="Contratado (12 meses)" value={brl(f.contractedNext12Cents)} hint="mensalidades até o fim de cada contrato" />
            <Tile label="Previsto no funil" value={brl(f.pipeline.weightedCents)} hint={`ponderado pela probabilidade · bruto ${brl(f.pipeline.cents)}`} />
            <Tile
              label="Descontos"
              value={brl(f.discounts.cents)}
              hint={`${f.discounts.proposals} propostas aprovadas · média ${f.discounts.avgPct.toLocaleString("pt-BR")}%`}
            />
            <Tile label="Comissões" value={brl(f.commissions.totalCents)} hint="pelas regras abaixo" />
            <Tile label="Cancelamentos" value={String(f.cancellations.count)} hint={`${brl(f.cancellations.monthlyCents)}/mês que deixam de entrar`} />
            <Tile label="Perdido no funil" value={brl(f.lost.dealsCents)} hint={`${f.lost.deals} oportunidades perdidas (valor estimado)`} />
          </div>

          <section aria-label="Parcelas previstas" className="space-y-2">
            <h3 className={CRM_LABEL}>Parcelas previstas · próximos 6 meses</h3>
            {months.length === 0 ? (
              <p className="text-[12.5px] text-crm-dim">Nenhuma cobrança prevista pelos contratos vigentes.</p>
            ) : (
              <ul className="divide-y divide-crm-line rounded-2xl border border-crm-line bg-crm-card">
                {months.map((m) => {
                  const items = f.installments.filter((i) => i.month === m);
                  const total = items.reduce((a, i) => a + i.cents, 0);
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        onClick={() => setOpenMonth(openMonth === m ? null : m)}
                        aria-expanded={openMonth === m}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-crm-hover"
                      >
                        <span className="flex-1 text-[13px] font-medium">{monthLabel(m)}</span>
                        <span className="text-[12px] text-crm-faint">{`${items.length} ${items.length === 1 ? "parcela" : "parcelas"}`}</span>
                        <span className="text-[13px] font-semibold tabular-nums">{brl(total)}</span>
                      </button>
                      {openMonth === m && (
                        <ul className="px-4 pb-3 space-y-1 text-[12.5px]">
                          {items.map((i, n) => (
                            <li key={n} className="flex gap-2">
                              <span className="flex-1">{`${i.clientName} · contrato nº ${String(i.contractNumber).padStart(4, "0")} · ${i.kind === "mensal" ? "mensalidade" : "valor único"}`}</span>
                              <span className="tabular-nums">{brl(i.cents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Comissões" className="space-y-2">
            <h3 className={CRM_LABEL}>Comissões do período</h3>
            {f.commissions.rows.length === 0 ? (
              <p className="text-[12.5px] text-crm-dim">Nenhum contrato vendido no período.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {f.commissions.bySeller.map((b) => (
                    <span key={b.sellerId ?? "none"} className="rounded-full border border-crm-line bg-crm-card px-3 py-1 text-[12.5px]">
                      {`${b.sellerName ?? "Sem responsável"}: ${brl(b.commissionCents)} (${b.contracts})`}
                    </span>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-crm-line bg-crm-card">
                  <table className="w-full text-[12.5px]">
                    <thead className="border-b border-crm-line">
                      <tr>
                        <th className={CRM_TH}>Contrato</th>
                        <th className={CRM_TH}>Cliente</th>
                        <th className={CRM_TH}>Vendedor</th>
                        <th className={`${CRM_TH} text-right`}>Mensal</th>
                        <th className={`${CRM_TH} text-right`}>Único</th>
                        <th className={CRM_TH}>Regra</th>
                        <th className={`${CRM_TH} text-right`}>Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-crm-line">
                      {f.commissions.rows.map((r) => (
                        <tr key={r.contractId}>
                          <td className={`${CRM_TD} tabular-nums`}>{String(r.contractNumber).padStart(4, "0")}</td>
                          <td className={CRM_TD}>
                            {r.clientName}
                            <span className="block text-[11px] text-crm-faint">{`vendido em ${day(r.soldOn)}`}</span>
                          </td>
                          <td className={CRM_TD}>{r.sellerName ?? "—"}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{r.monthlyCents ? brl(r.monthlyCents) : "—"}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{r.oneTimeCents ? brl(r.oneTimeCents) : "—"}</td>
                          <td className={`${CRM_TD} text-crm-dim`}>{[r.monthlyRule, r.oneTimeRule].filter(Boolean).join(" + ") || "Sem regra"}</td>
                          <td className={`${CRM_TD} text-right tabular-nums font-semibold`}>{brl(r.commissionCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {f.cancellations.rows.length > 0 && (
            <section aria-label="Cancelamentos" className="space-y-2">
              <h3 className={CRM_LABEL}>Cancelamentos e encerramentos</h3>
              <ul className="space-y-1 text-[12.5px]">
                {f.cancellations.rows.map((c) => (
                  <li key={c.contractNumber} className="flex gap-2">
                    <span className="flex-1">{`${c.clientName} · contrato nº ${String(c.contractNumber).padStart(4, "0")} · ${c.status === "cancelado" ? "cancelado" : "encerrado"} em ${day(c.on)}`}</span>
                    <span className="tabular-nums">{c.monthlyCents ? `${brl(c.monthlyCents)}/mês` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section aria-label="Regras de comissão" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={CRM_LABEL}>Regras de comissão</h3>
          {canManageRules && !draft && (
            <button type="button" onClick={() => setDraft(emptyRule)} className={CRM_LINK_BTN}>
              + Nova regra
            </button>
          )}
        </div>
        <p className="text-[12px] text-crm-faint">
          Vale a regra mais específica: por vendedor, depois por serviço, depois por modalidade. Mensalidades: percentual × valor mensal × número de
          mensalidades; valores únicos: percentual × valor.
        </p>
        {ruleError && <p className={CRM_ALERT}>{ruleError}</p>}
        {draft && (
          <div className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2" role="form" aria-label={draft.id ? "Editar regra" : "Nova regra"}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Nome da regra"
                aria-label="Nome da regra"
                className={`${CRM_INPUT} col-span-2 sm:col-span-3`}
              />
              <select
                value={draft.userId}
                onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
                aria-label="Vendedor da regra"
                className={CRM_INPUT}
              >
                <option value="">Todos os vendedores</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={draft.service}
                onChange={(e) => setDraft({ ...draft, service: e.target.value })}
                aria-label="Serviço da regra"
                className={CRM_INPUT}
              >
                <option value="">Todos os serviços</option>
                {options("service").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={draft.billing}
                onChange={(e) => setDraft({ ...draft, billing: e.target.value })}
                aria-label="Modalidade da regra"
                className={CRM_INPUT}
              >
                <option value="">Mensal e único</option>
                <option value="mensal">Mensalidades</option>
                <option value="unico">Valores únicos</option>
              </select>
              <label className="block">
                <span className={CRM_LABEL}>Percentual</span>
                <input
                  value={draft.percent}
                  onChange={(e) => setDraft({ ...draft, percent: e.target.value })}
                  inputMode="decimal"
                  placeholder="10"
                  aria-label="Percentual da comissão"
                  className={`${CRM_INPUT} mt-1`}
                />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Mensalidades</span>
                <input
                  value={draft.months}
                  onChange={(e) => setDraft({ ...draft, months: e.target.value })}
                  inputMode="numeric"
                  aria-label="Mensalidades que contam"
                  className={`${CRM_INPUT} mt-1`}
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!draft.name.trim() || !draft.percent}
                onClick={async () => {
                  const ok = await saveRule(
                    {
                      name: draft.name,
                      userId: draft.userId || null,
                      service: draft.service || null,
                      billing: draft.billing || null,
                      percent: draft.percent,
                      months: Number(draft.months) || 1,
                    },
                    draft.id,
                  );
                  if (ok) setDraft(null);
                }}
                className={CRM_BTN_PRIMARY}
              >
                Salvar regra
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {rules === null ? null : rules.length === 0 ? (
          !draft && <p className="text-[12.5px] text-crm-dim">Nenhuma regra ainda: sem regra, a comissão é zero.</p>
        ) : (
          <ul className="divide-y divide-crm-line rounded-2xl border border-crm-line bg-crm-card" aria-label="Lista de regras de comissão">
            {rules.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${r.archivedAt ? "opacity-60" : ""}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium">{`${r.name}${r.archivedAt ? " (arquivada)" : ""}`}</span>
                  <span className="block text-[11.5px] text-crm-faint">
                    {`${r.percent.toLocaleString("pt-BR")}% · ${r.userName ?? "todos os vendedores"} · ${r.service ? label("service", r.service) : "todos os serviços"} · ${billingLabel(r.billing)}${r.billing !== "unico" ? ` · ${r.months} ${r.months === 1 ? "mensalidade" : "mensalidades"}` : ""}`}
                  </span>
                </span>
                {canManageRules && (
                  <>
                    {!r.archivedAt && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: r.id,
                            name: r.name,
                            userId: r.userId ?? "",
                            service: r.service ?? "",
                            billing: r.billing ?? "",
                            percent: String(r.percent),
                            months: String(r.months),
                          })
                        }
                        className={CRM_LINK_BTN}
                      >
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveRule({ archived: !r.archivedAt }, r.id)}
                      className="text-[12px] text-crm-dim hover:text-crm-text"
                    >
                      {r.archivedAt ? "Reativar" : "Arquivar"}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
