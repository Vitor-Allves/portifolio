import type { StrategicInsights } from "@/lib/strategic-insights";

type ExecutiveSummaryProps = {
  insights: StrategicInsights;
  compare: boolean;
};

// Every field here is read straight from the rule-based strategic-insights
// engine — never a new conclusion invented for this view. When comparison
// isn't on, "principal mudança" says so instead of guessing at one; an
// empty attention/action list says there's nothing flagged, not "tudo bem".
export default function ExecutiveSummary({ insights, compare }: ExecutiveSummaryProps) {
  const items: { label: string; text: string }[] = [
    {
      label: "Situação do período",
      text: insights.summary[0]?.text ?? "Sem dados suficientes para um resumo do período.",
    },
    {
      label: "Principal mudança",
      text: compare
        ? insights.changes[0]?.text ?? "Sem dados do período anterior para comparar."
        : "Comparação com o período anterior não está ativada — ative o filtro de comparação para ver a principal mudança.",
    },
    {
      label: "Ponto de atenção",
      text: insights.attention[0]?.text ?? "Nenhum ponto de atenção identificado nos dados do período.",
    },
    {
      label: "Próxima ação sugerida",
      text: insights.nextActions[0]?.text ?? "Sem sugestão automática para este período.",
    },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-sans text-[15px] font-semibold text-intel-text">Resumo executivo</h2>
        <span className="text-[11.5px] text-intel-text-dim">{insights.periodLabel}</span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <dt className="text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim mb-1.5">{item.label}</dt>
            <dd className="text-[13px] text-intel-text leading-relaxed">{item.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] leading-relaxed text-intel-text-dim/80">{insights.limitations}</p>
    </div>
  );
}
