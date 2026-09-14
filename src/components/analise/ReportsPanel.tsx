"use client";

import type { CampaignInsight } from "@/lib/meta-ads-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, sumTotals } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";

type ReportsPanelProps = {
  campaigns: CampaignInsight[];
  periodLabel: string;
};

export default function ReportsPanel({ campaigns, periodLabel }: ReportsPanelProps) {
  const today = new Date().toISOString().slice(0, 10);

  function exportCampaigns() {
    const header = [
      "Campanha",
      "Conta",
      "Objetivo",
      "Status",
      "Investimento",
      "Impressões",
      "Cliques (todos)",
      "Cliques no link",
      "CTR",
      "CPC",
      "CPM",
      "Alcance",
    ];
    const rows = campaigns.map((c) => {
      const cCtr = ctr(c);
      const cCpc = cpc(c);
      const cCpm = cpm(c);
      return [
        c.campaignName,
        c.accountName,
        objectiveLabel(c.objective),
        statusLabel(c.status),
        formatCurrencyBRL(c.spend),
        formatInteger(c.impressions),
        formatInteger(c.clicks),
        formatInteger(c.linkClicks),
        cCtr === null ? "—" : formatPercent(cCtr),
        cCpc === null ? "—" : formatCurrencyBRL(cCpc),
        cCpm === null ? "—" : formatCurrencyBRL(cCpm),
        formatInteger(c.reach),
      ];
    });
    downloadCsv(`campanhas-${today}.csv`, [header, ...rows]);
  }

  function exportAccountSummary() {
    const byAccount = new Map<string, { name: string; campaigns: CampaignInsight[] }>();
    for (const c of campaigns) {
      const entry = byAccount.get(c.accountId) ?? { name: c.accountName, campaigns: [] };
      entry.campaigns.push(c);
      byAccount.set(c.accountId, entry);
    }

    const header = ["Conta", "Campanhas", "Investimento", "Impressões", "Cliques (todos)", "CTR", "CPC", "CPM"];
    const rows = [...byAccount.values()].map((entry) => {
      const totals = sumTotals(entry.campaigns);
      const cCtr = ctr(totals);
      const cCpc = cpc(totals);
      const cCpm = cpm(totals);
      return [
        entry.name,
        String(entry.campaigns.length),
        formatCurrencyBRL(totals.spend),
        formatInteger(totals.impressions),
        formatInteger(totals.clicks),
        cCtr === null ? "—" : formatPercent(cCtr),
        cCpc === null ? "—" : formatCurrencyBRL(cCpc),
        cCpm === null ? "—" : formatCurrencyBRL(cCpm),
      ];
    });
    downloadCsv(`resumo-por-conta-${today}.csv`, [header, ...rows]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <h3 className="text-sm font-medium text-navy-950 mb-1">Exportar dados do período</h3>
        <p className="text-[12px] text-navy-500 mb-5">
          Os arquivos refletem os filtros ativos no painel — {periodLabel}.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportCampaigns}
            disabled={campaigns.length === 0}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full bg-navy-950 text-white hover:bg-navy-800 transition-colors disabled:opacity-50"
          >
            Exportar campanhas (CSV)
          </button>
          <button
            type="button"
            onClick={exportAccountSummary}
            disabled={campaigns.length === 0}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full border border-navy-700/20 text-navy-700 hover:border-navy-600/40 transition-colors disabled:opacity-50"
          >
            Exportar resumo por conta (CSV)
          </button>
        </div>
        {campaigns.length === 0 && <p className="mt-3 text-[12px] text-navy-400">Sem campanhas no período para exportar.</p>}
      </div>

      <div className="rounded-2xl border border-navy-700/15 bg-silver-100/60 p-6">
        <p className="text-[13px] font-medium text-navy-950 mb-2">O que ainda depende de integração adicional</p>
        <ul className="text-[12px] text-navy-600 leading-relaxed list-disc pl-4 space-y-1">
          <li>Relatórios agendados por e-mail ou PDF automático — depende de um serviço de envio (ex.: e-mail transacional) ainda não configurado.</li>
          <li>Histórico de relatórios gerados anteriormente — depende de armazenamento dedicado a relatórios, além do banco de acessos de clientes já existente.</li>
        </ul>
      </div>
    </div>
  );
}
