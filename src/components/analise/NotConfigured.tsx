type NotConfiguredProps = {
  reason: "config" | "api";
  detail?: string;
};

export default function NotConfigured({ reason, detail }: NotConfiguredProps) {
  return (
    <div className="min-h-screen bg-intel-ambient bg-intel-grid flex items-center justify-center px-6 py-16">
      <div className="rounded-2xl border border-white/[0.08] bg-intel-surface-1 p-10 sm:p-14 text-center max-w-xl">
        <p className="font-sans text-2xl font-semibold text-intel-text mb-3">
          {reason === "config"
            ? "Integração com a Meta ainda não configurada"
            : "Não foi possível carregar os dados agora"}
        </p>
        <p className="text-intel-text-dim leading-relaxed">
          {reason === "config" ? (
            <>
              Faltam as credenciais da Meta Marketing API nas variáveis de
              ambiente do projeto. Siga o passo a passo em{" "}
              <code className="text-sm bg-white/[0.06] px-1.5 py-0.5 rounded">
                docs/meta-ads-setup.md
              </code>{" "}
              para gerar o token do sistema e configurar o acesso.
            </>
          ) : (
            "A Meta API retornou um erro ao buscar as campanhas. Tente novamente em alguns minutos; se persistir, verifique o token de acesso e as permissões das contas de anúncio."
          )}
        </p>
        {detail && (
          <p className="mt-4 text-xs text-intel-text-dim/70 font-mono break-words">{detail}</p>
        )}
      </div>
    </div>
  );
}
