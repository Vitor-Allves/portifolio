// Shared className fragments for the CRM. Every color is a crm-* token, so
// each fragment works in both the light and the dark theme (see the CRM
// block at the end of src/app/globals.css).

import type { CrmStage } from "@/lib/crm-types";

export const CRM_INPUT =
  "w-full rounded-lg border border-crm-line bg-crm-card px-3 py-2 text-[13px] text-crm-text placeholder:text-crm-faint focus:border-crm-accent focus:outline-none transition-colors duration-200";

export const CRM_LABEL = "text-[10.5px] font-medium tracking-[0.1em] uppercase text-crm-faint";

export const CRM_POPOVER = "rounded-xl border border-crm-line bg-crm-raised shadow-[var(--crm-shadow-lg)]";

/** Main action: black in the light theme, white in the dark one. */
export const CRM_BTN_PRIMARY =
  "inline-flex items-center justify-center bg-crm-ink text-crm-on-ink text-[12.5px] font-semibold px-4 py-2 rounded-full hover:opacity-85 transition-opacity duration-200 disabled:opacity-40 disabled:cursor-not-allowed";

export const CRM_BTN_OUTLINE =
  "inline-flex items-center text-[12px] px-3 py-1.5 rounded-full border border-crm-line text-crm-dim hover:text-crm-text hover:border-crm-line-strong transition-colors duration-200";

export const CRM_LINK_BTN = "text-[12.5px] font-semibold text-crm-accent hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed";

export const CRM_ALERT = "rounded-lg border border-crm-red/30 bg-crm-red/[0.07] px-3 py-2 text-[12px] text-crm-red";

/** Segmented control: track + active/inactive option. */
export const CRM_SEGMENT_TRACK = "flex rounded-full border border-crm-line bg-crm-card p-0.5";
export function crmSegment(active: boolean): string {
  return `text-[12.5px] px-3.5 py-1.5 rounded-full transition-colors duration-200 ${
    active ? "bg-crm-ink text-crm-on-ink" : "text-crm-dim hover:text-crm-text"
  }`;
}

/** One color per funnel stage, used for the column dot and the stage pill. */
export const STAGE_DOT: Record<CrmStage, string> = {
  novo: "bg-crm-faint",
  conversa: "bg-crm-accent",
  reuniao: "bg-crm-violet",
  proposta: "bg-crm-amber",
  ganho: "bg-crm-green",
  perdido: "bg-crm-red",
};

/** Compact pill-shaped filter select/input for toolbars. */
export const CRM_FILTER = `${CRM_INPUT} !w-auto !rounded-full !py-1.5`;

export const CRM_TH = "px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-[0.08em] uppercase text-crm-faint whitespace-nowrap";
export const CRM_TD = "px-3 py-2.5 align-top";

/** Consent badge tones: accepted, unknown, opted out. */
export const CONSENT_BADGE = {
  sim: "bg-crm-green/10 text-crm-green border-crm-green/25",
  nao_informado: "bg-crm-sunken text-crm-dim border-crm-line",
  descadastrado: "bg-crm-red/10 text-crm-red border-crm-red/25",
} as const;

/** Small glyph per task kind (text, so it inherits color in both themes). */
export const TASK_KIND_ICON: Record<string, string> = {
  ligacao: "☎",
  reuniao: "◷",
  whatsapp: "✆",
  email: "✉",
  tarefa: "✓",
};
