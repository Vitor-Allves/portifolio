"use client";

// One report of Relatórios (evolução v1.0, item 14) besides the Tabulação
// comercial: its filters, the summary, the table with totals and the
// planilha / PDF. Rows open their lead or client.

import { useEffect, useState } from "react";
import type { CrmTeamMember } from "@/lib/crm-types";
import { crmReportDef, reportCellText, type CrmReportId, type CrmReportResult } from "@/lib/crm-report-catalog-types";
import { CRM_ALERT, CRM_FILTER, CRM_INPUT, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { PRESETS, presetRange, shortDate, spDate, type Preset } from "./crm-format";
import { useCatalog } from "./crm-catalog-context";

export default function CrmReportTable({
  id,
  team,
  currentUserId,
  seeAll,
  canExport,
  version,
  now,
  onOpenContact,
  onOpenClient,
}: {
  id: CrmReportId;
  team: CrmTeamMember[];
  currentUserId: string;
  seeAll: boolean;
  canExport: boolean;
  version: number;
  now: number;
  onOpenContact: (contactId: string) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const def = crmReportDef(id);
  const { options } = useCatalog();
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [owner, setOwner] = useState("all");
  const [source, setSource] = useState("all");
  const [days, setDays] = useState("60");
  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const params = new URLSearchParams({ owner });
  if (def.period) {
    params.set("from", from);
    params.set("to", to);
  }
  if (def.source) params.set("source", source);
  if ("days" in def && def.days) params.set("days", days);
  const q = params.toString();
  const key = `${id}?${q}#${version}`;
  const [result, setResult] = useState<{ key: string; data: CrmReportResult | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const [path] = key.split("#");
    const [rid, query] = path.split("?");
    fetch(`/api/crm/reports/${rid}/?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { report?: CrmReportResult; error?: string } | null;
        if (!cancelled) setResult({ key, data: body?.report ?? null, error: res.ok ? null : (body?.error ?? "Não foi possível carregar o relatório.") });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const d = result?.data && result.data.id === id ? result.data : null;
  const numeric = (kind: string) => kind !== "text" && kind !== "date";
  // A row opens its lead / client from its first text column.
  const linkCol = d
    ? (d.linkColumn ??
      Math.max(
        0,
        d.columns.findIndex((c) => c.kind === "text"),
      ))
    : 0;

  return (
    <section aria-label={def.label} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {def.period && (
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Período" className={CRM_FILTER}>
            {PRESETS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {def.period && preset === "custom" && (
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
        {"days" in def && def.days && (
          <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Vencem em" className={CRM_FILTER}>
            {["15", "30", "60", "90", "180"].map((x) => (
              <option key={x} value={x}>
                Vencem em até {x} dias
              </option>
            ))}
          </select>
        )}
        {seeAll && id !== "campanhas" && (
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
        {def.source && (
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origem" className={CRM_FILTER}>
            <option value="all">Todas as origens</option>
            {options("source").map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {def.period && (
          <span className="text-[12px] text-crm-faint" aria-live="polite">
            {shortDate(from)} a {shortDate(to)}
          </span>
        )}
        {canExport && (
          <span className="ml-auto flex items-center gap-3">
            <a href={`/api/crm/reports/${id}/export/?${q}&format=csv`} download className={CRM_LINK_BTN}>
              Baixar planilha
            </a>
            <a href={`/api/crm/reports/${id}/export/?${q}&format=pdf`} download className={CRM_LINK_BTN}>
              Baixar PDF
            </a>
          </span>
        )}
      </div>

      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!result && <p className="text-[12.5px] text-crm-dim">Carregando o relatório...</p>}
      {d && (
        <div className={`space-y-4 transition-opacity ${result?.key !== key ? "opacity-60" : ""}`}>
          {!seeAll && <p className="text-[12px] text-crm-dim">Seus números: o relatório mostra o que é seu.</p>}
          {d.summary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2" role="group" aria-label="Resumo do relatório">
              {d.summary.map((x) => (
                <div key={x.label} className="rounded-2xl border border-crm-line bg-crm-card p-3.5 shadow-[var(--crm-shadow)]">
                  <span className="block text-[12px] text-crm-dim">{x.label}</span>
                  <span className="mt-1 block text-[20px] font-semibold tabular-nums text-crm-text">{reportCellText(x.kind, x.value, "print")}</span>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden min-w-0">
            {d.rows.length === 0 ? (
              <p className="px-4 py-6 text-[12.5px] text-crm-dim">Nada {def.period ? "no período" : "agora"} com estes filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" aria-label={`${def.label}: detalhe`}>
                  <thead className="border-b border-crm-line">
                    <tr>
                      {d.columns.map((c) => (
                        <th key={c.label} className={`${CRM_TH} !whitespace-normal leading-tight align-bottom ${numeric(c.kind) ? "text-right" : ""}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-crm-line">
                    {d.rows.map((r, i) => {
                      const open = r.contactId ? () => onOpenContact(r.contactId!) : r.clientId && onOpenClient ? () => onOpenClient(r.clientId!) : null;
                      return (
                        <tr key={i} className={open ? "hover:bg-crm-sunken" : ""}>
                          {r.cells.map((v, j) => (
                            <td
                              key={j}
                              className={`${CRM_TD} ${j === 0 ? "min-w-[9rem]" : ""} ${numeric(d.columns[j].kind) ? "text-right tabular-nums whitespace-nowrap" : ""} ${
                                d.columns[j].kind === "days" && typeof v === "number" && v < 0 ? "text-crm-red font-medium" : ""
                              }`}
                            >
                              {j === linkCol && open ? (
                                <button type="button" onClick={open} className="text-left font-medium text-crm-text hover:underline">
                                  {reportCellText(d.columns[j].kind, v, "print")}
                                </button>
                              ) : (
                                reportCellText(d.columns[j].kind, v, "print")
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  {d.totals && (
                    <tfoot className="border-t border-crm-line-strong">
                      <tr>
                        {d.totals.map((v, j) => (
                          <td key={j} className={`${CRM_TD} font-semibold ${numeric(d.columns[j].kind) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                            {v === null ? "" : reportCellText(d.columns[j].kind, v, "print")}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-crm-faint">
            {d.note}
            {d.truncated ? " A lista mostra as primeiras linhas; o resumo conta todas." : ""}
          </p>
        </div>
      )}
    </section>
  );
}
