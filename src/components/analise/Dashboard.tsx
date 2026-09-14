"use client";

import { useMemo, useState, useTransition } from "react";
import { m, type Variants } from "framer-motion";
import type { DashboardData, DatePreset } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import DateRangeFilter from "./DateRangeFilter";
import ClientFilter from "./ClientFilter";
import StatTile from "./StatTile";
import CampaignSpendChart from "./CampaignSpendChart";
import SpendTrendChart from "./SpendTrendChart";
import CampaignsTable from "./CampaignsTable";

type DashboardProps = {
  initialData: DashboardData;
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

function allAccountIds(data: DashboardData): Set<string> {
  return new Set(data.accounts.map((a) => a.id));
}

export default function Dashboard({ initialData }: DashboardProps) {
  const [data, setData] = useState(initialData);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialData.datePreset);
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => allAccountIds(initialData));
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
        setSelectedAccountIds(allAccountIds(next));
      } catch {
        setError("Falha de conexão ao buscar os dados.");
      }
    });
  }

  const filteredCampaigns = useMemo(
    () => data.campaigns.filter((c) => selectedAccountIds.has(c.accountId)),
    [data.campaigns, selectedAccountIds]
  );

  const filteredDailySpend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of data.dailySpend) {
      if (!selectedAccountIds.has(row.accountId)) continue;
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.spend);
    }
    return [...byDate.entries()]
      .map(([date, spend]) => ({ date, spend }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.dailySpend, selectedAccountIds]);

  const totals = useMemo(
    () =>
      filteredCampaigns.reduce(
        (acc, c) => ({
          spend: acc.spend + c.spend,
          impressions: acc.impressions + c.impressions,
          clicks: acc.clicks + c.clicks,
        }),
        { spend: 0, impressions: 0, clicks: 0 }
      ),
    [filteredCampaigns]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <DateRangeFilter value={datePreset} onChange={handleDatePresetChange} disabled={isPending} />
        {data.accounts.length > 1 && (
          <ClientFilter
            accounts={data.accounts}
            selectedIds={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />
        )}
      </div>

      {error && (
        <p className="mb-6 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div
        className={`transition-opacity duration-300 ${isPending ? "opacity-60" : "opacity-100"}`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Investimento total", value: formatCurrencyBRL(totals.spend) },
            { label: "Impressões", value: formatInteger(totals.impressions) },
            { label: "Cliques", value: formatInteger(totals.clicks) },
          ].map((tile, i) => (
            <m.div
              key={tile.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <StatTile label={tile.label} value={tile.value} />
            </m.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <m.div custom={3} initial="hidden" animate="visible" variants={fadeUp}>
            <CampaignSpendChart campaigns={filteredCampaigns} />
          </m.div>
          <m.div custom={4} initial="hidden" animate="visible" variants={fadeUp}>
            <SpendTrendChart dailySpend={filteredDailySpend} />
          </m.div>
        </div>

        <m.div custom={5} initial="hidden" animate="visible" variants={fadeUp}>
          <CampaignsTable campaigns={filteredCampaigns} />
        </m.div>
      </div>
    </div>
  );
}
