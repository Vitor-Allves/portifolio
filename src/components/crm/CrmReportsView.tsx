"use client";

import { useEffect, useState } from "react";
import { CLOSE_GROUPS, WON_RESULTS, closeGroupLabel, reasonGroup, type CloseGroup } from "@/lib/crm-catalog";
import { formatBRL, type CrmTeamMember } from "@/lib/crm-types";
import type { CrmTabulationReport } from "@/lib/crm-reports";
import { CRM_ALERT, CRM_FILTER, CRM_INPUT, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { PRESETS, dateTime, presetRange, shortDate, spDate, type Preset } from "./crm-format";
import { useCatalog } from "./crm-catalog-context";

const brl = (cents: number) => formatBRL(cents, { compact: true }) || "R$ 0";
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** Tone of each tabulação group: text and a solid swatch. */
const GROUP_TONE: Record<CloseGroup, { text: string; dot: string }> = {
  positivo: { text: "text-crm-green", dot: "bg-crm-green" },
  negativo: { text: "text-crm-red", dot: "bg-crm-red" },
  sem_conversao: { text: "text-crm-dim", dot: "bg-crm-line-strong" },
  futuro: { text: "text-crm-amber", dot: "bg-crm-amber" },
};

/** The reports this section offers (more join in the Relatórios module). */
const REPORTS = [
  {
    id: "tabulacao",
    label: "Tabulação comercial",
    hint: "Como cada oportunidade foi encerrada: resultado positivo, perda comercial, sem conversão ou oportunidade futura, por motivo e por vendedor.",
  },
] as const;

function GroupTile({ group, count, valueCents, share, active, onClick }: { group: CloseGroup; count: number; valueCents: number; share: number | null; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-2xl border bg-crm-card p-3.5 shadow-[var(--crm-shadow)] transition-colors ${active ? "border-crm-accent ring-1 ring-crm-accent/40" : "border-crm-line hover:border-crm-line-strong"}`}
    >
      <span className="flex items-center gap-2 text-[12px] text-crm-dim">
        <span className={`h-2 w-2 rounded-full ${GROUP_TONE[group].dot}`} aria-hidden="true" />
        {closeGroupLabel(group)}
      </span>
      <span className="mt-1 block text-[22px] font-semibold tabular-nums text-crm-text">{count}</span>
      <span className="block text-[11.5px] text-crm-faint tabular-nums">
        {valueCents > 0 ? brl(valueCents) : "sem valor"}
        {share !== null ? ` · ${pct(share)} dos encerramentos` : ""}
      </span>
    </button>
  );
}

function TabulationReport({
  team,
  currentUserId,
  seeAll,
  canExport,
  version,
  now,
  onOpenContact,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  seeAll: boolean;
  canExport: boolean;
  version: number;
  now: number;
  onOpenContact: (contactId: string) => void;
}) {
  const { options, label } = useCatalog();
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [owner, setOwner] = useState("all");
  const [source, setSource] = useState("all");
  const [service, setService] = useState("all");
  const [group, setGroup] = useState<CloseGroup | "all">("all");
  const [reason, setReason] = useState("all");
  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const q = new URLSearchParams({ from, to, owner, source, service, group, reason }).toString();
  const key = `${q}#${version}`;
  const [result, setResult] = useState<{ key: string; data: CrmTabulationReport | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/reports/tabulation/?${key.split("#")[0]}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { report?: CrmTabulationReport; error?: string } | null;
        if (!cancelled) setResult({ key, data: body?.report ?? null, error: res.ok ? null : (body?.error ?? "Não foi possível carregar o relatório.") });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reasonOptions =
    group === "positivo"
      ? options("won_reason")
      : options("lost_reason").filter((o) => group === "all" || reasonGroup(o) === group);
  const reasonText = (g: CloseGroup, id: string | null) => (id ? label(g === "positivo" ? "won_reason" : "lost_reason", id) : "Sem motivo informado");
  const d = result?.data ?? null;
  const closed = d ? d.groups.reduce((a, g) => a + g.count, 0) : 0;

  return (
    <section aria-label="Tabulação comercial" className="space-y-4">
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
            <input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="Data inicial" className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`} />
            <span className="text-[12px] text-crm-dim">até</span>
            <input type="date" value={custom[1]} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="Data final" className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`} />
          </>
        )}
        {seeAll && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Vendedor" className={CRM_FILTER}>
            <option value="all">Todos os vendedores</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === currentUserId ? " (você)" : ""}
              </option>
            ))}
          </select>
        )}
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origem" className={CRM_FILTER}>
          <option value="all">Todas as origens</option>
          {options("source").map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Serviço" className={CRM_FILTER}>
          <option value="all">Todos os serviços</option>
          {options("service").map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value as CloseGroup | "all");
            setReason("all");
          }}
          aria-label="Grupo"
          className={CRM_FILTER}
        >
          <option value="all">Todos os grupos</option>
          {CLOSE_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" className={CRM_FILTER}>
          <option value="all">Todos os motivos</option>
          {reasonOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-crm-faint" aria-live="polite">
          {shortDate(from)} a {shortDate(to)}
        </span>
        {canExport && (
          <span className="ml-auto flex items-center gap-3">
            <a href={`/api/crm/reports/tabulation/export/?${q}&format=csv`} download className={CRM_LINK_BTN}>
              Baixar planilha
            </a>
            <a href={`/api/crm/reports/tabulation/export/?${q}&format=pdf`} download className={CRM_LINK_BTN}>
              Baixar PDF
            </a>
          </span>
        )}
      </div>

      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!result && <p className="text-[12.5px] text-crm-dim">Carregando o relatório...</p>}
      {d && (
        <div className={`space-y-4 transition-opacity ${result?.key !== key ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" role="group" aria-label="Encerramentos por grupo">
            {d.groups.map((g) => (
              <GroupTile
                key={g.group}
                group={g.group}
                count={g.count}
                valueCents={g.valueCents}
                share={closed > 0 ? g.count / closed : null}
                active={group === g.group}
                onClick={() => {
                  setGroup(group === g.group ? "all" : g.group);
                  setReason("all");
                }}
              />
            ))}
          </div>
          <p className="text-[12px] text-crm-dim">
            {closed} {closed === 1 ? "oportunidade encerrada" : "oportunidades encerradas"} no período
            {d.results.length > 0 ? ` · ${d.results.map((r) => `${r.count} ${WON_RESULTS.find((w) => w.id === r.result)?.label.toLowerCase()}`).join(", ")}` : ""}
            {` · ${d.reopened} ${d.reopened === 1 ? "reaberta" : "reabertas"}`}
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden min-w-0">
              <h3 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">Por motivo</h3>
              {d.reasons.length === 0 ? (
                <p className="px-4 pb-4 text-[12.5px] text-crm-dim">Nenhum encerramento no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]" aria-label="Encerramentos por motivo">
                    <thead className="border-y border-crm-line">
                      <tr>
                        <th className={CRM_TH}>Motivo</th>
                        <th className={CRM_TH}>Grupo</th>
                        <th className={`${CRM_TH} text-right`}>Qtd.</th>
                        <th className={`${CRM_TH} text-right`}>Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-crm-line">
                      {d.reasons.map((r) => (
                        <tr key={`${r.group}:${r.reason}`}>
                          <td className={CRM_TD}>{reasonText(r.group, r.reason)}</td>
                          <td className={`${CRM_TD} whitespace-nowrap ${GROUP_TONE[r.group].text}`}>{closeGroupLabel(r.group)}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{r.count}</td>
                          <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>{r.valueCents > 0 ? brl(r.valueCents) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden min-w-0">
              <h3 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">{seeAll ? "Por vendedor" : "Seus encerramentos"}</h3>
              {d.people.length === 0 ? (
                <p className="px-4 pb-4 text-[12.5px] text-crm-dim">Nenhum encerramento no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]" aria-label="Encerramentos por vendedor">
                    <thead className="border-y border-crm-line">
                      <tr>
                        <th className={CRM_TH}>Vendedor</th>
                        <th className={`${CRM_TH} text-right`} title="Resultado positivo">
                          Posit.
                        </th>
                        <th className={`${CRM_TH} text-right`} title="Perda comercial">
                          Perda
                        </th>
                        <th className={`${CRM_TH} text-right`} title="Sem conversão">
                          Sem conv.
                        </th>
                        <th className={`${CRM_TH} text-right`} title="Oportunidade futura">
                          Futura
                        </th>
                        <th className={`${CRM_TH} text-right`} title="Positivos ÷ (positivos + perdas comerciais + sem conversão)">
                          Conversão
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-crm-line">
                      {d.people.map((p) => (
                        <tr key={p.ownerId ?? "none"}>
                          <th scope="row" className={`${CRM_TD} text-left font-semibold whitespace-nowrap ${p.ownerId === null ? "text-crm-dim font-normal" : ""}`}>
                            {p.name}
                          </th>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{p.positivo}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{p.negativo}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{p.sem_conversao}</td>
                          <td className={`${CRM_TD} text-right tabular-nums`}>{p.futuro}</td>
                          <td className={`${CRM_TD} text-right tabular-nums font-semibold`}>{pct(p.conversion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden">
            <h3 className="px-4 pt-3.5 pb-2 text-[13.5px] font-semibold">
              Encerramentos
              {d.total > d.rows.length && <span className="ml-2 text-[11.5px] font-normal text-crm-faint">mostrando {d.rows.length} de {d.total}</span>}
            </h3>
            {d.rows.length === 0 ? (
              <p className="px-4 pb-4 text-[12.5px] text-crm-dim">Nenhum encerramento com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" aria-label="Oportunidades encerradas">
                  <thead className="border-y border-crm-line">
                    <tr>
                      <th className={CRM_TH}>Encerrada</th>
                      <th className={CRM_TH}>Oportunidade</th>
                      <th className={CRM_TH}>Resultado</th>
                      <th className={CRM_TH}>Observação</th>
                      <th className={CRM_TH}>Responsável</th>
                      <th className={`${CRM_TH} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-crm-line">
                    {d.rows.map((r) => (
                      <tr key={r.id}>
                        <td className={`${CRM_TD} whitespace-nowrap text-crm-dim`}>{dateTime(r.closedAt)}</td>
                        <td className={`${CRM_TD} min-w-[180px]`}>
                          <button type="button" onClick={() => onOpenContact(r.contactId)} className="text-left font-semibold text-crm-text hover:text-crm-accent">
                            {r.title}
                          </button>
                          <span className="block text-[11.5px] text-crm-dim">
                            {r.contactName}
                            {r.service ? ` · ${label("service", r.service)}` : ""}
                            {` · ${label("source", r.source)}`}
                          </span>
                        </td>
                        <td className={`${CRM_TD} min-w-[170px]`}>
                          <span className={`font-medium ${GROUP_TONE[r.group].text}`}>
                            {r.group === "positivo" ? (WON_RESULTS.find((w) => w.id === r.wonResult)?.label ?? "Venda realizada") : closeGroupLabel(r.group)}
                          </span>
                          <span className="block text-[11.5px] text-crm-dim">
                            {reasonText(r.group, r.reason)}
                            {r.returnOn ? ` · retomar em ${shortDate(r.returnOn)}` : ""}
                          </span>
                        </td>
                        <td className={`${CRM_TD} min-w-[200px] text-crm-dim`}>{r.note ?? "—"}</td>
                        <td className={`${CRM_TD} whitespace-nowrap`}>
                          {r.ownerName ?? <span className="text-crm-faint">Sem responsável</span>}
                          {r.closedByName && r.closedByName !== r.ownerName ? <span className="block text-[11.5px] text-crm-faint">encerrada por {r.closedByName}</span> : null}
                        </td>
                        <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>{r.valueCents !== null ? brl(r.valueCents) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-crm-faint">
            Conta cada oportunidade encerrada no período pelo que foi registrado ao encerrar. Conversão = positivos ÷ (positivos + perdas comerciais + sem conversão); oportunidades futuras
            não contam como perda. Contatos arquivados ficam de fora, como no Painel. Encerramentos anteriores a esta versão ficaram como perda comercial ou sem conversão, conforme o
            motivo registrado.
          </p>
        </div>
      )}
    </section>
  );
}

/** Relatórios: reports with filters, on screen and as planilha / PDF (with "Exportar relatórios"). */
export default function CrmReportsView(props: {
  team: CrmTeamMember[];
  currentUserId: string;
  seeAll: boolean;
  canExport: boolean;
  version: number;
  now: number;
  onOpenContact: (contactId: string) => void;
}) {
  const [report, setReport] = useState<(typeof REPORTS)[number]["id"]>("tabulacao");
  const def = REPORTS.find((r) => r.id === report)!;
  return (
    <section aria-label="Relatórios" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={report} onChange={(e) => setReport(e.target.value as typeof report)} aria-label="Relatório" className={`${CRM_FILTER} !font-semibold`}>
          {REPORTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="text-[12.5px] text-crm-dim min-w-0">{def.hint}</p>
      </div>
      {report === "tabulacao" && <TabulationReport {...props} />}
    </section>
  );
}
