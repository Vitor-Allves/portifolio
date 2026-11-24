"use client";

import { useEffect, useMemo, useState } from "react";
import type { CrmEventKind, CrmPage, CrmTeamMember } from "@/lib/crm-types";
import { CRM_ACCESS_OPTIONS, CRM_PERMISSION_MODULES } from "@/lib/crm-permissions";
import { CRM_BTN_OUTLINE, CRM_FILTER, CRM_SEGMENT_TRACK, CRM_TD, CRM_TH, crmSegment } from "./crm-styles";
import { dateTime } from "./crm-format";
import { describeEvent } from "./crm-event-text";
import { useCatalog } from "./crm-catalog-context";

type AdminRow = {
  id: string;
  at: string;
  actorName: string;
  action: string;
  targetLabel: string | null;
  metadata: Record<string, unknown>;
};
type CommercialRow = { id: string; at: string; userName: string | null; kind: CrmEventKind; payload: Record<string, unknown>; contactId: string; contactName: string };

/** What each administrative action means, in the team's words. */
const ACTION_LABEL: Record<string, string> = {
  "crm.import": "Importou planilha",
  "crm.import_undo": "Desfez importação",
  "crm.export": "Exportou contatos",
  "crm.role_change": "Mudou o perfil",
  "crm.permission_change": "Mudou permissões",
  "crm.user_update": "Mudou cargo ou departamento",
  "crm.user_create": "Criou acesso (só CRM)",
  "crm.user_deactivate": "Desativou acesso",
  "crm.user_password_reset": "Gerou senha temporária",
  "crm.session_end": "Encerrou sessões",
  "crm.portfolio_assign": "Trocou responsável em lote",
  "crm.portfolio_transfer": "Transferiu carteira",
  "crm.campaign_send": "Disparou campanha",
  "crm.campaign_cancel": "Cancelou campanha",
  "crm.campaign_delete": "Excluiu campanha",
  "crm.catalog_change": "Mudou a Personalização",
  "crm.automation_change": "Mudou uma automação",
  "crm.automation_run": "Rodou a verificação diária",
  "crm.client_create": "Cadastrou cliente ativo",
  "crm.client_update": "Mudou cliente ativo",
  "crm.contract_change": "Mudou contrato de cliente",
  "crm.report_export": "Exportou relatório",
  "crm.goals_change": "Mudou as metas",
  "crm.intelligence_link": "Ligou cliente ao Intelligence",
  "crm.ai_request": "Pediu análise à IA",
  "crm.transfer_request": "Pediu transferência de lead",
  "crm.lgpd_export": "Exportou dados de titular (LGPD)",
  "crm.lgpd_anonymize": "Anonimizou titular (LGPD)",
  "crm.transfer_decision": "Decidiu transferência de lead",
  "crm.proposal_change": "Criou ou mudou proposta",
  "crm.proposal_send": "Registrou envio de proposta",
  "crm.proposal_status": "Mudou a situação de proposta",
  "crm.proposal_discount": "Autorizou desconto de proposta",
  "crm.proposal_link": "Mudou o link de proposta",
  "crm.proposal_settings": "Mudou modelos de proposta",
  "crm.commission_rule": "Mudou regra de comissão",
};

const AUTOMATION_STATUS_LABEL: Record<string, string> = { ativa: "ativa", pausada: "pausada", desativada: "desativada" };
const CONFIG_LABEL: Record<string, string> = {
  taskKind: "tipo de tarefa",
  title: "título",
  dueDays: "prazo",
  priority: "prioridade",
  owner: "responsável",
  fallbackOwnerId: "responsável quando o lead não tem",
  days: "dias",
  reminderMinutes: "lembrete",
  temperature: "temperatura",
  notifyOwner: "aviso ao responsável",
  sources: "origens",
};

const KIND_LABEL: Partial<Record<CrmEventKind, string>> = {
  stage: "Etapas",
  deal: "Oportunidades e valores",
  owner: "Responsáveis",
  edited: "Edição de dados",
  archived: "Arquivamentos",
  restored: "Restaurações",
  opt_out: "Descadastros",
  consent: "Consentimento",
};

const capLabel = Object.fromEntries(CRM_PERMISSION_MODULES.flatMap((m) => m.items.map((i) => [i.cap, i.label]))) as Record<string, string>;
const accessLabel = (v: unknown) => CRM_ACCESS_OPTIONS.find((o) => o.id === v)?.label ?? String(v ?? "—");

/** "1 contato", "3 contatos". */
const n = (v: unknown, one: string, many: string) => {
  const x = Number(v ?? 0);
  return `${x} ${x === 1 ? one : many}`;
};

/** The details column: before → after and counts, without anything sensitive (audit_log never holds passwords). */
function details(r: AdminRow): string {
  const m = r.metadata;
  switch (r.action) {
    case "crm.role_change":
      return `${accessLabel(m.from)} → ${accessLabel(m.to)}`;
    case "crm.permission_change": {
      const to = (m.to ?? {}) as Record<string, boolean>;
      const from = (m.from ?? {}) as Record<string, boolean>;
      const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
      if (keys.length === 0) return "Voltou ao padrão do perfil";
      return keys
        .map((k) => `${to[k] === undefined ? "padrão" : to[k] ? "liberou" : "tirou"}: ${capLabel[k] ?? k}`)
        .join(" · ");
    }
    case "crm.portfolio_assign":
    case "crm.portfolio_transfer":
      return `${m.to ? `para ${String(m.to)} · ` : ""}${n(m.contacts, "contato", "contatos")}, ${n(m.deals, "oportunidade", "oportunidades")}, ${n(m.tasks, "tarefa", "tarefas")}${
        m.companies !== undefined ? `, ${n(m.companies, "empresa", "empresas")}` : ""
      }`;
    case "crm.export":
      return n(m.count, "contato", "contatos");
    case "crm.user_update":
      return [m.jobTitle, m.department].filter(Boolean).join(" · ") || "—";
    case "crm.automation_change": {
      const status = m.from !== m.to ? `${AUTOMATION_STATUS_LABEL[String(m.from)] ?? String(m.from)} → ${AUTOMATION_STATUS_LABEL[String(m.to)] ?? String(m.to)}` : "";
      const changed = Array.isArray(m.changed) ? `ajustou ${(m.changed as string[]).map((k) => CONFIG_LABEL[k] ?? k).join(", ")}` : "";
      return [status, changed].filter(Boolean).join(" · ") || "—";
    }
    case "crm.automation_run":
      return (
        Object.values(m as Record<string, { ok?: number; failed?: number }>)
          .map((v) => `${n(v.ok, "ação feita", "ações feitas")}${v.failed ? `, ${n(v.failed, "falha", "falhas")}` : ""}`)
          .join(" · ") || "nada ativo para rodar"
      );
    case "crm.lgpd_export":
      return `${n(m.messages, "mensagem", "mensagens")} · ${n(m.history, "registro", "registros")} · ${n(m.files, "documento", "documentos")}`;
    case "crm.lgpd_anonymize":
      return `${String(m.reason ?? "")} · ${n(m.messages, "mensagem limpa", "mensagens limpas")} · ${n(m.documents, "documento apagado", "documentos apagados")}`;
    case "crm.transfer_request":
      return `${String(m.contact ?? "")}: ${String(m.from ?? "sem responsável")} → ${String(m.to ?? "")} · ${String(m.reason ?? "")}`;
    case "crm.transfer_decision":
      return `${String(m.contact ?? "")}: ${m.status === "aprovada" ? "aprovada" : m.status === "recusada" ? "recusada" : String(m.status ?? "")} (${String(m.from ?? "sem responsável")} → ${String(m.to ?? "")}, pedida por ${String(m.requestedBy ?? "")})${m.note ? ` · ${String(m.note)}` : ""}`;
    case "crm.report_export":
      return `${String(m.what ?? "")}${m.format ? ` (${m.format === "pdf" ? "PDF" : "planilha"})` : ""}${m.from ? ` · ${String(m.from)} a ${String(m.to ?? "")}` : ""}${
        m.rows !== undefined ? ` · ${n(m.rows, "linha", "linhas")}` : ""
      }`;
    case "crm.ai_request":
      return `${String(m.kindLabel ?? m.kind ?? "")} · ${String(m.status ?? "")}${typeof m.outputTokens === "number" ? ` · ${m.inputTokens} + ${m.outputTokens} tokens` : ""}`;
    case "crm.intelligence_link":
      return m.to ? `${String(m.client ?? "")} → ${String(m.to)}` : `${String(m.client ?? "")}: ligação desfeita${m.from ? ` (era ${String(m.from)})` : ""}`;
    case "crm.goals_change":
      return `${String(m.monthLabel ?? m.month ?? "")} · ${n(m.changed, "meta alterada", "metas alteradas")}`;
    case "crm.client_create":
      return m.via === "oportunidade" ? "a partir de uma oportunidade ganha" : "a partir da empresa";
    case "crm.client_update":
      return [m.status ? `situação: ${String(m.status)}${m.reason ? ` (${String(m.reason)})` : ""}` : "", m.owner ? `responsável: ${String(m.owner)}` : ""].filter(Boolean).join(" · ") || "—";
    case "crm.contract_change":
      return m.action === "criado" ? `novo contrato · ${String(m.period ?? "")}` : `contrato editado: ${Array.isArray(m.fields) ? (m.fields as string[]).join(", ").toLowerCase() : ""}`;
    default: {
      const parts = Object.entries(m)
        .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${String(v)}`);
      return parts.join(" · ");
    }
  }
}

export default function CrmAuditView({ team, onOpenContact }: { team: CrmTeamMember[]; onOpenContact: (id: string) => void }) {
  const { label } = useCatalog();
  const [tab, setTab] = useState<"admin" | "comercial">("admin");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data: CrmPage<AdminRow | CommercialRow> | null; error: string | null } | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams({ tab, page: String(page) });
    if (actor) p.set("actor", actor);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (tab === "admin" && action) p.set("action", action);
    if (tab === "comercial" && kind) p.set("kind", kind);
    return p.toString();
  }, [tab, actor, action, kind, from, to, page]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/audit/?${params}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (CrmPage<AdminRow | CommercialRow> & { error?: string }) | null;
        if (cancelled) return;
        setResult(res.ok && data ? { key: params, data, error: null } : { key: params, data: null, error: data?.error ?? "Não foi possível carregar a auditoria." });
      })
      .catch(() => !cancelled && setResult({ key: params, data: null, error: "Não foi possível carregar a auditoria." }));
    return () => {
      cancelled = true;
    };
  }, [params]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const data = result?.data ?? null;
  const loading = result?.key !== params;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section aria-label="Auditoria" className="space-y-3 max-w-6xl">
      <div className={`${CRM_SEGMENT_TRACK} w-fit`} role="tablist">
        {(
          [
            ["admin", "Ações administrativas"],
            ["comercial", "Mudanças comerciais"],
          ] as const
        ).map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => reset(setTab)(id)} className={crmSegment(tab === id)}>
            {text}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={actor} onChange={(e) => reset(setActor)(e.target.value)} aria-label="Pessoa" className={CRM_FILTER}>
          <option value="">Todas as pessoas</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {tab === "admin" ? (
          <select value={action} onChange={(e) => reset(setAction)(e.target.value)} aria-label="Ação" className={`${CRM_FILTER} max-w-full`}>
            <option value="">Todas as ações</option>
            {Object.entries(ACTION_LABEL).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          <select value={kind} onChange={(e) => reset(setKind)(e.target.value)} aria-label="Tipo de mudança" className={CRM_FILTER}>
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABEL).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-crm-dim">
          De
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Desde" className={CRM_FILTER} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-crm-dim">
          até
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Até" className={CRM_FILTER} />
        </label>
      </div>

      {result?.error && <p className="text-[12.5px] text-crm-red">{result.error}</p>}
      <p className="text-[12px] text-crm-dim" aria-live="polite">
        {loading && !data ? "Carregando..." : `${(data?.total ?? 0).toLocaleString("pt-BR")} registro${data?.total === 1 ? "" : "s"}`}
      </p>

      {/* relative: keeps any visually-hidden content inside the scroll box on phones */}
      <div className={`relative rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
        <table className="w-full text-[12.5px]">
          <thead className="bg-crm-sunken border-b border-crm-line">
            <tr>
              <th className={CRM_TH}>Quando</th>
              <th className={CRM_TH}>Quem</th>
              <th className={CRM_TH}>{tab === "admin" ? "O quê" : "Contato"}</th>
              <th className={CRM_TH}>{tab === "admin" ? "Detalhes" : "Mudança"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={4} className={`${CRM_TD} text-crm-dim`}>
                  Nada registrado com esses filtros.
                </td>
              </tr>
            )}
            {tab === "admin"
              ? (data?.rows as AdminRow[] | undefined)?.map((r) => (
                  <tr key={r.id}>
                    <td className={`${CRM_TD} whitespace-nowrap text-crm-dim`}>{dateTime(r.at)}</td>
                    <td className={`${CRM_TD} whitespace-nowrap`}>{r.actorName}</td>
                    <td className={CRM_TD}>
                      <span className="font-semibold">{ACTION_LABEL[r.action] ?? r.action}</span>
                      {r.targetLabel && <span className="block text-[11.5px] text-crm-dim">{r.targetLabel}</span>}
                    </td>
                    <td className={`${CRM_TD} text-crm-dim min-w-[220px]`}>{details(r)}</td>
                  </tr>
                ))
              : (data?.rows as CommercialRow[] | undefined)?.map((r) => (
                  <tr key={r.id}>
                    <td className={`${CRM_TD} whitespace-nowrap text-crm-dim`}>{dateTime(r.at)}</td>
                    <td className={`${CRM_TD} whitespace-nowrap`}>{r.userName ?? "Sistema"}</td>
                    <td className={CRM_TD}>
                      <button type="button" onClick={() => onOpenContact(r.contactId)} className="text-left font-semibold text-crm-text hover:underline">
                        {r.contactName}
                      </button>
                    </td>
                    <td className={`${CRM_TD} text-crm-dim min-w-[260px]`}>{describeEvent(r, label)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-end gap-3 text-[12px] text-crm-dim">
          <span>
            Página {page} de {pages}
          </span>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
            ← Anterior
          </button>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
            Próxima →
          </button>
        </nav>
      )}
    </section>
  );
}
