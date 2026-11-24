// The history line for a contact event ("Etapa de X: Novo → Ganho…"), shared
// by the contact panel, the Auditoria screen and each person's activity.

import { formatBRL, stageLabel, type CrmEvent } from "@/lib/crm-types";
import { TAG_VIA, WON_RESULTS, closeGroupLabel, isLostCloseGroup, isWonResult, type OptionKind } from "@/lib/crm-catalog";
import { shortDate, timeOfDay } from "./crm-format";

export function describeEvent(e: Pick<CrmEvent, "kind" | "payload">, label: (kind: OptionKind, id: string) => string): string {
  const p = e.payload;
  switch (e.kind) {
    case "created":
      if (p.via === "importacao") return `Contato importado da planilha "${String(p.fileName ?? "planilha")}"`;
      return p.via === "anuncio" ? "Contato criado por um anúncio de clique para o WhatsApp" : p.via === "whatsapp" ? "Contato criado ao mandar mensagem" : "Contato criado";
    case "stage":
      return `Etapa${p.dealTitle ? ` de "${String(p.dealTitle)}"` : ""}: ${stageLabel(String(p.from))} → ${stageLabel(String(p.to))}${
        p.auto ? " (automático, o lead respondeu)" : ""
      }${p.reopenReason ? ` · reaberta: ${String(p.reopenReason)}` : ""}${
        p.to === "perdido" && isLostCloseGroup(p.group) ? ` · ${closeGroupLabel(p.group)}` : ""
      }${p.lostReason ? ` · motivo: ${label("lost_reason", String(p.lostReason))}${p.lostNote ? ` (${String(p.lostNote)})` : ""}` : ""}${
        p.returnOn ? ` · retomar em ${String(p.returnOn).split("-").reverse().join("/")}` : ""
      }${p.to === "ganho" && isWonResult(p.wonResult) ? ` · ${WON_RESULTS.find((r) => r.id === p.wonResult)!.label}` : ""}${
        p.wonReason ? ` · motivo: ${label("won_reason", String(p.wonReason))}${p.wonNote ? ` (${String(p.wonNote)})` : ""}` : ""
      }${p.to === "ganho" && typeof p.valueCents === "number" ? ` · ${formatBRL(p.valueCents)}` : ""}`;
    case "owner":
      return `Responsável${p.dealTitle ? ` de "${String(p.dealTitle)}"` : ""}: ${p.from ?? "ninguém"} → ${p.to ?? "ninguém"}${p.via === "carteira" ? " (carteira)" : p.via === "transferencia" ? " (transferência aprovada)" : ""}`;
    case "transfer": {
      const who = `${p.from ? String(p.from) : "sem responsável"} → ${String(p.to ?? "")}`;
      if (p.action === "requested") return `Transferência pedida por ${String(p.requestedBy ?? "")} (${who}): ${String(p.reason ?? "")}`;
      if (p.action === "aprovada") return `Transferência aprovada (${who})${p.note ? `: ${String(p.note)}` : ""}`;
      if (p.action === "recusada") return `Transferência recusada (${who})${p.note ? `: ${String(p.note)}` : ""}`;
      return `Pedido de transferência cancelado (${who})`;
    }
    case "next_action":
      return p.text || p.at ? `Próxima ação: ${p.text ?? "sem descrição"}${p.at ? ` · ${shortDate(String(p.at))}` : ""}` : "Próxima ação removida";
    case "note":
      return String(p.text ?? "");
    case "edited": {
      const changes = Array.isArray(p.changes) ? (p.changes as { field: string; from: string | null; to: string | null }[]) : [];
      return changes.map((c) => `${c.field}: ${c.from ?? "vazio"} → ${c.to ?? "vazio"}`).join(" · ") || "Dados editados";
    }
    case "consent":
      return p.to === "sim" ? "Consentimento: aceitou ser contatado" : "Consentimento: não informado";
    case "opt_out":
      if (p.value && p.auto) return `Descadastrado automaticamente (respondeu "${typeof p.text === "string" ? p.text : "SAIR"}" no WhatsApp)`;
      return p.value ? "Marcado como descadastrado (não quer mais contato)" : "Descadastro removido";
    case "archived":
      return "Contato arquivado";
    case "restored":
      return p.auto ? "Voltou ao funil (mandou mensagem)" : "Contato restaurado";
    case "deal": {
      if (p.action === "created") return `Nova oportunidade: ${String(p.title)}${typeof p.valueCents === "number" ? ` · ${formatBRL(p.valueCents)}` : ""}`;
      const changes = Array.isArray(p.changes) ? (p.changes as { field: string; from: string | null; to: string | null }[]) : [];
      const show = (c: { field: string }, v: string | null) =>
        v === null
          ? "vazio"
          : c.field === "Valor" || c.field === "Valor negociado"
            ? formatBRL(Number(v))
            : c.field === "Previsão de fechamento"
              ? shortDate(v)
              : v;
      return `Oportunidade "${String(p.title)}": ${changes.map((c) => `${c.field} ${show(c, c.from)} → ${show(c, c.to)}`).join(" · ")}`;
    }
    case "task": {
      const what = `${label("task_kind", String(p.kind))}: ${String(p.title)}`;
      const when = typeof p.dueAt === "string" ? ` · ${shortDate(p.dueAt)}${p.allDay === false ? ` ${timeOfDay(p.dueAt)}` : ""}` : "";
      const result = p.result ? ` — ${String(p.result)}` : "";
      switch (p.action) {
        case "created":
          return `Tarefa agendada · ${what}${when}`;
        case "logged":
          return `Registrou ${what}${result}`;
        case "done":
          return `Concluiu ${what}${result}`;
        case "rescheduled":
          return `Reagendou ${what}${when || " · sem data"}`;
        case "reopened":
          return `Reabriu ${what}`;
        case "canceled":
          return `Cancelou ${what}`;
        default:
          return what;
      }
    }
    case "automation":
      return `Automação: ${String(p.text ?? "")}`;
    case "attendance":
      switch (p.action) {
        case "assumed":
          return `${String(p.to)} assumiu o atendimento${p.via === "resposta" ? " (ao responder)" : ""}`;
        case "takeover":
          return `${String(p.to)} assumiu o atendimento no lugar de ${String(p.from)}`;
        case "transferred":
          return `Atendimento transferido${p.from ? ` de ${String(p.from)}` : ""} para ${String(p.to)}`;
        case "ended":
          return `Atendimento encerrado${p.from ? ` (era de ${String(p.from)})` : ""}`;
        default:
          return "Atendimento";
      }
    case "tag": {
      const via = p.via && p.via !== "manual" ? ` (${TAG_VIA.find((v) => v.id === p.via)?.label ?? String(p.via)})` : "";
      return p.action === "removed" ? `Etiqueta removida: ${String(p.label)}` : `Etiqueta adicionada: ${String(p.label)}${via}`;
    }
  }
}
