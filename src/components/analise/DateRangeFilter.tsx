import { DATE_PRESETS, type DatePreset } from "@/lib/meta-ads-types";

type DateRangeFilterProps = {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
  disabled?: boolean;
};

export default function DateRangeFilter({ value, onChange, disabled }: DateRangeFilterProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="flex flex-wrap gap-2 overflow-x-auto"
    >
      {DATE_PRESETS.map((preset) => {
        const selected = preset.value === value;
        return (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(preset.value)}
            className={`shrink-0 text-[13px] tracking-[0.06em] px-4 py-2 rounded-full border transition-colors duration-200 disabled:opacity-60 disabled:cursor-wait ${
              selected
                ? "bg-navy-950 border-navy-950 text-white"
                : "bg-white border-navy-700/15 text-navy-700 hover:border-navy-600/40"
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
