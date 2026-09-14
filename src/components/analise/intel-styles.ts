// Shared className fragments for the Legado Intelligence dark design system.
// Centralized so every filter/card/table/panel across the dashboard reads
// from the same surfaces, borders and transition timings instead of each
// component re-deriving its own slightly different shade of navy.

export const INTEL_CARD =
  "rounded-2xl border border-white/[0.07] bg-intel-surface-1 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]";

export const INTEL_CARD_HOVER =
  "transition-[border-color,background-color] duration-200 hover:border-white/[0.14] hover:bg-intel-surface-2";

export const INTEL_PILL_BASE =
  "flex items-center gap-2 text-[12.5px] px-3.5 py-2 rounded-full border transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait";

export const INTEL_PILL_INACTIVE =
  "bg-intel-surface-2 border-white/[0.08] text-intel-text-dim hover:border-white/20 hover:text-intel-text";

export const INTEL_PILL_ACTIVE = "bg-intel-cyan/[0.12] border-intel-cyan/40 text-intel-text";

export const INTEL_POPOVER =
  "rounded-xl border border-white/10 bg-intel-surface-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]";

export const INTEL_INPUT =
  "w-full rounded-lg border border-white/10 bg-intel-surface-1 px-3 py-2 text-[13px] text-intel-text placeholder:text-intel-text-dim/60 focus:border-intel-cyan/50 focus:outline-none transition-colors duration-200";

export const INTEL_LABEL = "text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim";

export const INTEL_CHIP =
  "flex items-center gap-1.5 text-[11.5px] px-3 py-1 rounded-full bg-intel-surface-2 border border-white/[0.08] text-intel-text-dim hover:border-white/20 hover:text-intel-text transition-colors duration-200";

export const INTEL_BADGE_TONES: Record<"ok" | "warning" | "pending" | "neutral", string> = {
  ok: "bg-intel-green/10 text-intel-green border border-intel-green/20",
  warning: "bg-amber-400/10 text-amber-300 border border-amber-400/20",
  pending: "bg-white/[0.06] text-intel-text-dim border border-white/10",
  neutral: "bg-intel-violet/10 text-intel-violet border border-intel-violet/20",
};
