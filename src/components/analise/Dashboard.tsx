"use client";

import { useState, useTransition } from "react";
import type { DashboardData, DatePreset } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import DateRangeFilter from "./DateRangeFilter";
import StatTile from "./StatTile";
import CampaignSpendChart from "./CampaignSpendChart";
import SpendTrendChart from "./SpendTrendChart";
import CampaignsTable from "./CampaignsTable";

type DashboardProps = {
  initialData: DashboardData;
};

export default function Dashboard({ initialData }: DashboardProps) {
  const [data, setData] = useState(initialData);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialData.datePreset);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDatePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meta-ads/campaigns/?date_preset=${preset}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Não foi possível carregar os dados.");
          return;
        }
        const next = (await res.json()) as DashboardData;
        setData(next);
      } catch {
        setError("Falha de conexão ao buscar os dados.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <DateRangeFilter value={datePreset} onChange={handleDatePresetChange} disabled={isPending} />
        <p className="text-xs text-navy-400">
          {data.accounts.length} conta{data.accounts.length === 1 ? "" : "s"} de anúncios
        </p>
      </div>

      {error && (
        <p className="mb-6 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div
        className={`transition-opacity duration-300 ${isPending ? "opacity-60" : "opacity-100"}`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Investimento total" value={formatCurrencyBRL(data.totals.spend)} />
          <StatTile label="Impressões" value={formatInteger(data.totals.impressions)} />
          <StatTile label="Cliques" value={formatInteger(data.totals.clicks)} />
          <StatTile
            label="CTR médio / CPC médio"
            value={`${formatPercent(data.totals.ctr)} · ${formatCurrencyBRL(data.totals.cpc)}`}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <CampaignSpendChart campaigns={data.campaigns} />
          <SpendTrendChart dailySpend={data.dailySpend} />
        </div>

        <CampaignsTable campaigns={data.campaigns} />
      </div>
    </div>
  );
}
