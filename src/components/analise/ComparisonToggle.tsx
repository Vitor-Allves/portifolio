"use client";

import { INTEL_PILL_BASE, INTEL_PILL_INACTIVE, INTEL_PILL_ACTIVE } from "./intel-styles";

type ComparisonToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export default function ComparisonToggle({ checked, onChange, disabled }: ComparisonToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title="Compara com o mesmo período, um mês antes — mesmas datas de início e fim, deslocadas um mês para trás."
      className={`${INTEL_PILL_BASE} ${checked ? INTEL_PILL_ACTIVE : INTEL_PILL_INACTIVE}`}
    >
      <span
        className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-intel-cyan/30" : "bg-white/10"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-transform duration-200 ${
            checked ? "translate-x-3 bg-intel-cyan" : "translate-x-0.5 bg-intel-text-dim"
          }`}
        />
      </span>
      Comparar período anterior
    </button>
  );
}
