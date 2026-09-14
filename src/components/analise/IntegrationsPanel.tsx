function formatSyncTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type StatusTone = "ok" | "warning" | "pending";

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const classes =
    tone === "ok"
      ? "bg-emerald-700/10 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-600/10 text-amber-700"
        : "bg-navy-700/8 text-navy-500";
  return <span className={`text-[11px] tracking-[0.04em] uppercase px-2.5 py-1 rounded-full ${classes}`}>{label}</span>;
}

type IntegrationsPanelProps = {
  accountsCount: number;
  partialAccountsCount: number;
  generatedAt: string;
  dbConfigured: boolean;
};

export default function IntegrationsPanel({
  accountsCount,
  partialAccountsCount,
  generatedAt,
  dbConfigured,
}: IntegrationsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-medium text-navy-950">Meta Business Manager</h3>
          <StatusBadge
            tone={accountsCount > 0 && partialAccountsCount === 0 ? "ok" : accountsCount > 0 ? "warning" : "pending"}
            label={accountsCount > 0 && partialAccountsCount === 0 ? "Conectado" : accountsCount > 0 ? "Parcial" : "Sem contas"}
          />
        </div>
        <p className="text-[13px] text-navy-600 leading-relaxed">
          {accountsCount} conta(s) de anúncios acessíveis via System User configurado. Última sincronização em{" "}
          {formatSyncTime(generatedAt)}.
          {partialAccountsCount > 0 && ` ${partialAccountsCount} conta(s) falharam ao carregar na última consulta.`}
        </p>
        <p className="mt-2 text-[12px] text-navy-400">
          Configuração e troca de token em <code className="bg-silver-100 px-1.5 py-0.5 rounded">docs/meta-ads-setup.md</code>.
        </p>
      </div>

      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-medium text-navy-950">Banco de acessos de clientes</h3>
          <StatusBadge tone={dbConfigured ? "ok" : "pending"} label={dbConfigured ? "Conectado" : "Não configurado"} />
        </div>
        <p className="text-[13px] text-navy-600 leading-relaxed">
          {dbConfigured
            ? "Postgres conectado — os logins por cliente (criados no painel de administração) ficam guardados aqui, cada um restrito às contas de anúncio selecionadas."
            : "Sem banco Postgres conectado ainda. Sem ele, não é possível criar logins individuais por cliente."}
        </p>
        {!dbConfigured && (
          <p className="mt-2 text-[12px] text-navy-400">
            Passo a passo em <code className="bg-silver-100 px-1.5 py-0.5 rounded">docs/client-access-setup.md</code>.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-medium text-navy-950">IA generativa (leitura estratégica)</h3>
          <StatusBadge tone="pending" label="Não configurado" />
        </div>
        <p className="text-[13px] text-navy-600 leading-relaxed">
          A aba “Análises com IA” hoje usa um mecanismo automático baseado em regras estatísticas sobre os dados do
          painel — não há um modelo de IA generativa conectado. Para ativar uma leitura gerada por um modelo real, é
          necessário: uma chave de API do modelo escolhido guardada como variável de ambiente do servidor (nunca no
          navegador), uma rota de backend que monte o prompt a partir dos dados já filtrados e respeite as mesmas
          restrições de acesso por cliente, e orçamento aprovado para o custo por chamada.
        </p>
      </div>
    </div>
  );
}
