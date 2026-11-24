"use client";

import { useEffect, useState } from "react";
import { monthLabel, type CrmClientMedia, type CrmIntelligenceClient, type CrmMediaTotals } from "@/lib/crm-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { dateTime, shortDate } from "./crm-format";

const int = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));
const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

/** The month's media numbers, in the Intelligence's order and wording. */
const TILES: { key: keyof CrmMediaTotals; label: string; show: (t: CrmMediaTotals) => string; money?: boolean }[] = [
  { key: "spend", label: "Investimento", show: (t) => money(t.spend), money: true },
  { key: "impressions", label: "Impressões", show: (t) => int(t.impressions) },
  { key: "reach", label: "Alcance", show: (t) => int(t.reach) },
  { key: "clicks", label: "Cliques", show: (t) => int(t.clicks) },
  { key: "conversations", label: "Conversas", show: (t) => (t.conversations === null ? "Não disponível" : int(t.conversations)) },
  { key: "ctr", label: "CTR", show: (t) => pct(t.ctr) },
  { key: "cpc", label: "CPC", show: (t) => money(t.cpc), money: true },
  { key: "cpm", label: "CPM", show: (t) => money(t.cpm), money: true },
  { key: "costPerConversation", label: "Custo por conversa", show: (t) => (t.conversations === null ? "Não disponível" : money(t.costPerConversation)), money: true },
];

/**
 * Indicadores de mídia do mês, from the Legado Intelligence (the official
 * source): the link to the Intelligence client, "Sincronizar", the numbers
 * of the latest sync with where and when they came from, the campaigns, and
 * every sync of the month.
 */
export default function ClientMediaSection({ clientId, month, onLinkChanged }: { clientId: string; month: string; onLinkChanged: () => void }) {
  const key = `${clientId}#${month}`;
  const [result, setResult] = useState<{ key: string; media: CrmClientMedia | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [picking, setPicking] = useState<{ options: CrmIntelligenceClient[]; value: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const [id, m] = key.split("#");
    fetch(`/api/crm/clients/${id}/media/?month=${m}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { media?: CrmClientMedia; error?: string } | null;
        if (!cancelled) setResult({ key, media: body?.media ?? null, error: res.ok ? null : body?.error ?? "Não foi possível carregar os indicadores de mídia." });
      })
      .catch(() => !cancelled && setResult({ key, media: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const m = result?.key === key ? result.media : null;

  async function call(method: "POST" | "PUT", body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/crm/clients/${clientId}/media/`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { media?: CrmClientMedia; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !data?.media) {
      setMsg({ text: data?.error ?? "Não foi possível falar com o CRM agora.", error: true });
      return false;
    }
    // A link change answers with the current month; reload the one on screen.
    if (method === "PUT") {
      const again = await fetch(`/api/crm/clients/${clientId}/media/?month=${month}`).then((r) => r.json()).catch(() => null);
      setResult({ key, media: (again as { media?: CrmClientMedia } | null)?.media ?? data.media, error: null });
    } else setResult({ key, media: data.media, error: null });
    setMsg({ text: done, error: false });
    return true;
  }

  async function startPicking() {
    setMsg(null);
    const res = await fetch("/api/crm/intelligence/clients/").catch(() => null);
    const body = (await res?.json().catch(() => null)) as { clients?: CrmIntelligenceClient[]; error?: string } | null;
    if (!res?.ok || !body?.clients) return setMsg({ text: body?.error ?? "Não foi possível listar os clientes do Intelligence.", error: true });
    setPicking({ options: body.clients, value: m?.link?.clientAccessId ?? "" });
  }

  const latest = m?.latest ?? null;
  const moneyHidden = latest !== null && latest.totals.spend === null;
  return (
    <section aria-label="Indicadores de mídia" className="rounded-xl border border-crm-line bg-crm-sunken/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={`${CRM_LABEL} mr-auto`}>Indicadores de mídia · Legado Intelligence</h3>
        {m?.canSync && (
          <button type="button" disabled={busy} onClick={() => call("POST", { month }, `Números de ${monthLabel(month)} sincronizados.`)} className={CRM_BTN_PRIMARY}>
            {busy && !picking ? "Sincronizando..." : "Sincronizar"}
          </button>
        )}
      </div>

      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!m && !result?.error && <p className="text-[12px] text-crm-dim">Carregando...</p>}

      {m && (
        <>
          {picking ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-0 flex-1">
                <span className="block text-[11.5px] text-crm-dim mb-0.5">Cliente no Intelligence</span>
                <select value={picking.value} onChange={(e) => setPicking({ ...picking, value: e.target.value })} aria-label="Cliente no Intelligence" className={CRM_INPUT}>
                  <option value="">— Sem ligação —</option>
                  {picking.options.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.linkedClientId !== null && o.linkedClientId !== clientId}>
                      {o.label} · {o.accountCount} {o.accountCount === 1 ? "conta" : "contas"}
                      {o.linkedClientId && o.linkedClientId !== clientId ? ` (ligado a ${o.linkedClientName})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setPicking(null)} className={CRM_BTN_OUTLINE}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await call("PUT", { clientAccessId: picking.value || null }, picking.value ? "Cliente ligado ao Intelligence." : "Ligação desfeita.");
                  if (ok) {
                    setPicking(null);
                    onLinkChanged();
                  }
                }}
                className={CRM_BTN_PRIMARY}
              >
                Salvar ligação
              </button>
            </div>
          ) : (
            <p className="text-[12.5px] text-crm-dim">
              {m.link ? (
                <>
                  Cliente no Intelligence: <strong className="text-crm-text">{m.link.label}</strong> · {m.link.accountCount} {m.link.accountCount === 1 ? "conta de anúncio" : "contas de anúncio"}
                </>
              ) : (
                "Ainda não ligado a um cliente do Legado Intelligence."
              )}
              {m.canLink && (
                <button type="button" onClick={startPicking} className={`${CRM_LINK_BTN} ml-2`}>
                  {m.link ? "Trocar" : "Ligar ao Intelligence"}
                </button>
              )}
              {!m.link && !m.canLink && <span className="text-crm-faint"> Um Administrador ou Gestor faz a ligação.</span>}
            </p>
          )}

          {msg && (
            <p className={msg.error ? CRM_ALERT : "text-[12px] text-crm-green font-medium"} role={msg.error ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          {m.blocked && <p className="text-[12px] text-crm-amber">{m.blocked}</p>}

          {latest ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" role="list" aria-label={`Números de ${monthLabel(month)}`}>
                {TILES.map((tile) => (
                  <div key={tile.key} role="listitem" className="rounded-lg border border-crm-line bg-crm-card px-2.5 py-2 min-w-0">
                    <span className="block text-[11px] text-crm-dim truncate">{tile.label}</span>
                    <span className="block text-[15px] font-semibold tabular-nums truncate">{tile.money && moneyHidden ? "—" : tile.show(latest.totals)}</span>
                  </div>
                ))}
              </div>
              {moneyHidden && <p className="text-[11.5px] text-crm-faint">Seu perfil não vê o investimento e os custos.</p>}
              <p className="text-[11.5px] text-crm-faint">
                Fonte: {latest.source} · {latest.intelligenceClient} · {shortDate(latest.periodFrom)} a {shortDate(latest.periodTo)} · sincronizado por {latest.syncedByName ?? "—"} em{" "}
                {dateTime(latest.syncedAt)}. O Intelligence é a fonte oficial destes números.
              </p>
              {latest.missingAccounts.length > 0 && (
                <p className="text-[12px] text-crm-amber" role="note">
                  {latest.missingAccounts.length === 1 ? "Uma conta não pôde ser lida" : `${latest.missingAccounts.length} contas não puderam ser lidas`} nesta sincronização (
                  {latest.missingAccounts.join(", ")}): os números não a incluem.
                </p>
              )}
              {latest.campaigns.length > 0 && (
                <details className="rounded-lg border border-crm-line bg-crm-card">
                  <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold">Campanhas ({latest.campaigns.length})</summary>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]" aria-label="Campanhas do mês">
                      <thead className="border-y border-crm-line">
                        <tr>
                          <th className={CRM_TH}>Campanha</th>
                          <th className={CRM_TH}>Objetivo</th>
                          <th className={CRM_TH}>Status</th>
                          {!moneyHidden && <th className={`${CRM_TH} text-right`}>Investimento</th>}
                          <th className={`${CRM_TH} text-right`}>Impressões</th>
                          <th className={`${CRM_TH} text-right`}>Cliques</th>
                          <th className={`${CRM_TH} text-right`}>Conversas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-crm-line">
                        {latest.campaigns.map((c) => (
                          <tr key={c.id}>
                            <td className={`${CRM_TD} min-w-[10rem]`}>
                              {c.name}
                              <span className="block text-[11px] text-crm-faint">{c.accountName}</span>
                            </td>
                            <td className={`${CRM_TD} whitespace-nowrap`}>{objectiveLabel(c.objective)}</td>
                            <td className={`${CRM_TD} whitespace-nowrap`}>{statusLabel(c.status)}</td>
                            {!moneyHidden && <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>{money(c.spend)}</td>}
                            <td className={`${CRM_TD} text-right tabular-nums`}>{int(c.impressions)}</td>
                            <td className={`${CRM_TD} text-right tabular-nums`}>{int(c.clicks)}</td>
                            <td className={`${CRM_TD} text-right tabular-nums`}>{c.conversations === null ? "—" : int(c.conversations)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              {m.history.length > 1 && (
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-crm-dim">Sincronizações de {monthLabel(month)} ({m.history.length})</summary>
                  <ol className="mt-1 space-y-0.5 pl-4 list-disc text-crm-dim" aria-label="Histórico de sincronizações">
                    {m.history.map((h) => (
                      <li key={h.id}>
                        {dateTime(h.syncedAt)} · {h.syncedByName ?? "—"} · até {shortDate(h.periodTo)}
                        {h.partial ? " · parcial" : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ) : (
            m.link &&
            !m.blocked && <p className="text-[12px] text-crm-dim">Ainda não sincronizado em {monthLabel(month)}.{m.canSync ? " Use Sincronizar para buscar os números do mês." : ""}</p>
          )}
        </>
      )}
    </section>
  );
}
