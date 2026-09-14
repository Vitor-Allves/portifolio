"use client";

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
      className={`flex items-center gap-2 text-[13px] px-4 py-2 rounded-full border transition-colors duration-200 disabled:opacity-60 disabled:cursor-wait ${
        checked
          ? "bg-navy-950 border-navy-950 text-white"
          : "bg-white border-navy-700/15 text-navy-700 hover:border-navy-600/40"
      }`}
    >
      <span
        className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors ${
          checked ? "bg-white/30" : "bg-navy-700/20"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-transform ${
            checked ? "translate-x-3 bg-white" : "translate-x-0.5 bg-navy-500"
          }`}
        />
      </span>
      Comparar período anterior
    </button>
  );
}
