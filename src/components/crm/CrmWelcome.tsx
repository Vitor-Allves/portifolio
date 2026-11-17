import { formatBRL, isClosedStage, type CrmDealCard, type CrmTask } from "@/lib/crm-types";
import { spDate, taskState } from "./crm-format";
import { Mascot } from "./crm-brand";
import { CRM_LABEL } from "./crm-styles";

const TZ = "America/Sao_Paulo";

function greeting(now: number): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Kpi({ label, value, tone, note, noteTone }: { label: string; value: number; tone?: string; note?: string | null; noteTone?: string }) {
  return (
    <div className="rounded-xl border border-crm-line bg-crm-sunken/70 px-3.5 py-2.5 min-w-0">
      <p className={`${CRM_LABEL} leading-snug`}>{label}</p>
      <p className={`mt-0.5 text-[24px] leading-none font-semibold tabular-nums ${tone ?? "text-crm-text"}`}>{value}</p>
      <p className={`mt-1 h-4 text-[11px] font-medium truncate ${noteTone ?? "text-crm-red"}`}>{note ?? ""}</p>
    </div>
  );
}

/** The day at a glance: greeting, tasks due and the funnel in numbers, with Titan and Legacy. */
export default function CrmWelcome({
  userName,
  deals,
  tasks,
  unread,
  now,
}: {
  userName: string;
  deals: CrmDealCard[];
  /** Pending tasks of the whole team. */
  tasks: CrmTask[];
  /** Unread WhatsApp messages across contacts. */
  unread: number;
  now: number;
}) {
  const month = spDate(now).slice(0, 7);
  const open = deals.filter((d) => !isClosedStage(d.stage));
  const openValue = open.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
  let dueToday = 0;
  let overdue = 0;
  for (const t of tasks) {
    const s = taskState(t.dueAt, t.allDay, now);
    if (s === "today") dueToday += 1;
    if (s === "overdue") overdue += 1;
  }
  const meetings = deals.filter((d) => d.stage === "reuniao").length;
  const won = deals.filter((d) => d.stage === "ganho" && d.closedAt && spDate(d.closedAt).startsWith(month));
  const wonValue = won.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);

  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;

  let summary: string;
  if (overdue > 0) summary = `${plural(overdue, "tarefa atrasada", "tarefas atrasadas")}: comece por ${overdue === 1 ? "ela" : "elas"}.`;
  else if (dueToday > 0) summary = `${plural(dueToday, "tarefa marcada", "tarefas marcadas")} para hoje.`;
  else summary = "Nenhuma tarefa pendente para hoje. Tudo em dia por aqui.";
  if (unread > 0) summary += ` ${plural(unread, "mensagem esperando", "mensagens esperando")} resposta.`;

  return (
    <section aria-label="Resumo do dia" className="crm-hero relative overflow-hidden rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)]">
      <div className="relative z-10 p-5 sm:p-6 md:pr-[300px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-crm-silver">{dateLabel}</p>
            <h2 className="crm-display mt-1 text-[22px] sm:text-[26px] leading-tight text-crm-text">
              {greeting(now)}, {firstName}
            </h2>
            <p className="mt-1.5 text-[13px] text-crm-dim">{summary}</p>
          </div>
          <Mascot name="legacyHello" decorative className="md:hidden h-20 w-auto -mb-2 shrink-0" />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 max-w-[780px]">
          <Kpi
            label="Negócios em aberto"
            value={open.length}
            note={openValue > 0 ? `${formatBRL(openValue, { compact: true })} no funil` : null}
            noteTone="text-crm-dim"
          />
          <Kpi label="Tarefas para hoje" value={dueToday + overdue} tone="text-crm-accent" note={overdue > 0 ? `${overdue} atrasada${overdue === 1 ? "" : "s"}` : null} />
          <Kpi label="Reuniões" value={meetings} tone="text-crm-violet" />
          <Kpi
            label="Ganhos no mês"
            value={won.length}
            tone="text-crm-green"
            note={wonValue > 0 ? formatBRL(wonValue, { compact: true }) : null}
            noteTone="text-crm-green"
          />
        </div>
      </div>
      <div className="hidden md:flex absolute bottom-0 right-6 items-end" aria-hidden="true">
        <Mascot name="titanWelcome" decorative priority className="h-[188px] w-auto relative z-[1]" />
        <Mascot name="legacyHello" decorative priority className="h-[196px] w-auto -ml-10" />
      </div>
    </section>
  );
}
