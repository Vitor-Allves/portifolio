import type { CampaignInsight } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";

type CampaignsTableProps = {
  campaigns: CampaignInsight[];
};

const th = "text-left text-[11px] tracking-[0.1em] uppercase text-navy-500 font-medium py-2 px-3";
const thNum = `${th} text-right`;
const td = "py-2.5 px-3 text-[13px] text-navy-800 border-t border-navy-700/8";
const tdNum = `${td} text-right tabular-nums`;

export default function CampaignsTable({ campaigns }: CampaignsTableProps) {
  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6 overflow-x-auto">
      <h3 className="text-sm font-medium text-navy-950 mb-4">Todas as campanhas</h3>
      {campaigns.length === 0 ? (
        <p className="text-sm text-navy-500">Nenhuma campanha no período selecionado.</p>
      ) : (
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className={th}>Campanha</th>
              <th className={th}>Conta</th>
              <th className={thNum}>Investimento</th>
              <th className={thNum}>Impressões</th>
              <th className={thNum}>Cliques</th>
              <th className={thNum}>CTR</th>
              <th className={thNum}>CPC</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={`${c.accountId}-${c.campaignId}`}>
                <td className={td}>{c.campaignName}</td>
                <td className={td}>{c.accountName}</td>
                <td className={tdNum}>{formatCurrencyBRL(c.spend)}</td>
                <td className={tdNum}>{formatInteger(c.impressions)}</td>
                <td className={tdNum}>{formatInteger(c.clicks)}</td>
                <td className={tdNum}>{formatPercent(c.ctr)}</td>
                <td className={tdNum}>{formatCurrencyBRL(c.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
