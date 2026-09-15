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
      ? "bg-intel-green/10 text-intel-green border-intel-green/20"
      : tone === "warning"
        ? "bg-amber-400/10 text-amber-300 border-amber-400/20"
        : "bg-white/[0.05] text-intel-text-dim border-white/10";
  return <span className={`text-[11px] tracking-[0.04em] uppercase px-2.5 py-1 rounded-full border ${classes}`}>{label}</span>;
}

type IntegrationsPanelProps = {
  accountsCount: number;
  partialAccountsCount: number;
  generatedAt: string;
  dbConfigured: boolean;
  /** Internal Legado viewer (admin or analyst) — sees setup/infra detail (System User, Postgres, docs paths). A client only needs a plain connection status. */
  isInternal: boolean;
};

export default function IntegrationsPanel({
  accountsCount,
  partialAccountsCount,
  generatedAt,
  dbConfigured,
  isInternal,
}: IntegrationsPanelProps) {
  if (!isInternal) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[13px] font-medium text-intel-text">Conexão com seus dados</h3>
          <StatusBadge
            tone={accountsCount > 0 && partialAccountsCount === 0 ? "ok" : accountsCount > 0 ? "warning" : "pending"}
            label={accountsCount > 0 && partialAccountsCount === 0 ? "Conectado" : accountsCount > 0 ? "Parcial" : "Indisponível"}
          />
        </div>
        <p className="text-[13px] text-intel-text-dim leading-relaxed">
          Última atualização em {formatSyncTime(generatedAt)}.
          {partialAccountsCount > 0 && " Parte dos dados não pôde ser atualizada agora — tente novamente em instantes."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[13px] font-medium text-intel-text">Meta Business Manager</h3>
          <StatusBadge
            tone={accountsCount > 0 && partialAccountsCount === 0 ? "ok" : accountsCount > 0 ? "warning" : "pending"}
            label={accountsCount > 0 && partialAccountsCount === 0 ? "Conectado" : accountsCount > 0 ? "Parcial" : "Sem contas"}
          />
        </div>
        <p className="text-[13px] text-intel-text-dim leading-relaxed">
          {accountsCount} conta(s) de anúncios acessíveis via System User configurado. Última sincronização em{" "}
          {formatSyncTime(generatedAt)}.
          {partialAccountsCount > 0 && ` ${partialAccountsCount} conta(s) falharam ao carregar na última consulta.`}
        </p>
        <p className="mt-2 text-[12px] text-intel-text-dim/70">
          Configuração e troca de token em <code className="bg-white/[0.06] px-1.5 py-0.5 rounded">docs/meta-ads-setup.md</code>.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[13px] font-medium text-intel-text">Banco de acessos de clientes</h3>
          <StatusBadge tone={dbConfigured ? "ok" : "pending"} label={dbConfigured ? "Conectado" : "Não configurado"} />
        </div>
        <p className="text-[13px] text-intel-text-dim leading-relaxed">
          {dbConfigured
            ? "Postgres conectado — os logins por cliente (criados no painel de administração) ficam guardados aqui, cada um restrito às contas de anúncio selecionadas."
            : "Sem banco Postgres conectado ainda. Sem ele, não é possível criar logins individuais por cliente."}
        </p>
        {!dbConfigured && (
          <p className="mt-2 text-[12px] text-intel-text-dim/70">
            Passo a passo em <code className="bg-white/[0.06] px-1.5 py-0.5 rounded">docs/client-access-setup.md</code>.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-[13px] font-medium text-intel-text">IA generativa (Análises estratégicas)</h3>
          <StatusBadge tone="pending" label="Não configurado" />
        </div>
        <p className="text-[13px] text-intel-text-dim leading-relaxed">
          A aba “Análises estratégicas” hoje usa um mecanismo de regras estatísticas sobre os dados já calculados pelo
          painel — não há um modelo de IA generativa conectado, e nada nesta tela é apresentado como se tivesse sido
          escrito por um. Para ativar uma leitura gerada por um modelo real, mantendo o mesmo motor de cálculo (o
          modelo interpreta os números, nunca os recalcula), é necessário:
        </p>
        <ul className="mt-2 text-[12.5px] text-intel-text-dim leading-relaxed list-disc pl-4 space-y-1">
          <li>Uma conta com o provedor escolhido e sua chave de API guardada só como variável de ambiente do servidor (ex.: <code className="bg-white/[0.06] px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>) — nunca no navegador, nunca em código versionado.</li>
          <li>Uma rota de backend dedicada que monte o prompt a partir dos totais já calculados pelo servidor (nunca deixe o modelo recalcular métricas), valide a sessão do cliente autenticado e restrinja o prompt aos dados que essa sessão já pode ver.</li>
          <li>Limite de uso por sessão/cliente e tratamento de erro que, em caso de falha do provedor, volte automaticamente para a análise estatística em vez de travar a tela — nunca apresentando a leitura por regras como se tivesse vindo do modelo.</li>
          <li>Leitura da documentação oficial do provedor escolhido antes de implementar (formato de prompt, limites de contexto e de uso, política de retenção de dados).</li>
        </ul>
      </div>
    </div>
  );
}
