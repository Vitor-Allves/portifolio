// Replaces the old greeting + "Visão geral" mascot banners and the Resumo
// executivo block at the top of the Visão geral tab with one presentation
// banner for the Intelligence product itself. Static copy — nothing here
// reads from live data, so it never needs a loading/error state.

const PILLS = ["Indicadores", "Filtros", "Relatórios"];

export default function IntelligenceBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-[24px] px-6 py-7 sm:px-9 sm:py-8 min-h-[240px] sm:min-h-[260px] lg:min-h-[280px] max-h-[300px] flex items-center shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)]"
      style={{
        background: "linear-gradient(120deg, #FFFFFF 0%, #F1F4F8 45%, #D3DAE4 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(169,193,232,0.38), transparent)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, #ffffff 0px, #ffffff 1px, transparent 1px, transparent 14px)",
        }}
      />

      <div className="relative z-[1] flex w-full items-center justify-between gap-6">
        <div className="max-w-[560px]">
          <p className="text-[10.5px] tracking-[0.22em] uppercase text-[#6A727C] font-medium mb-2">
            Legado Intelligence
          </p>
          <h2 className="font-[var(--font-cinzel-intel)] font-semibold text-[22px] sm:text-[27px] leading-tight text-[#1F3A63]">
            Seus números, em um só lugar.
          </h2>
          <p className="mt-3 text-[13px] sm:text-[13.5px] leading-relaxed text-[#3C4450]">
            O Intelligence reúne os indicadores das suas campanhas, com filtros por conta, campanha e
            período, e relatórios prontos para baixar.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {PILLS.map((pill) => (
              <li
                key={pill}
                className="text-[11px] tracking-[0.04em] px-3 py-1.5 rounded-full bg-white border border-[#D9DEE5] text-[#3C4450]"
              >
                {pill}
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden sm:flex items-end shrink-0 self-end h-full max-h-[260px] -mb-7 sm:-mb-8">
          <img
            src="/mascots/dupla_pose_capa.png"
            alt=""
            aria-hidden="true"
            className="h-[190px] lg:h-[250px] w-auto object-contain object-bottom"
          />
        </div>
      </div>
    </div>
  );
}
