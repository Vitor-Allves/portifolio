type NotConfiguredProps = {
  reason: "config" | "api";
  detail?: string;
};

export default function NotConfigured({ reason, detail }: NotConfiguredProps) {
  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-16">
      <div className="rounded-2xl border border-navy-700/15 bg-white p-10 sm:p-14 text-center max-w-xl mx-auto">
        <p className="font-serif text-2xl text-navy-950 mb-3">
          {reason === "config"
            ? "Integração com a Meta ainda não configurada"
            : "Não foi possível carregar os dados agora"}
        </p>
        <p className="text-navy-700/80 font-light leading-relaxed">
          {reason === "config" ? (
            <>
              Faltam as credenciais da Meta Marketing API nas variáveis de
              ambiente do projeto. Siga o passo a passo em{" "}
              <code className="text-sm bg-silver-100 px-1.5 py-0.5 rounded">
                docs/meta-ads-setup.md
              </code>{" "}
              para gerar o token do sistema e configurar o acesso.
            </>
          ) : (
            "A Meta API retornou um erro ao buscar as campanhas. Tente novamente em alguns minutos; se persistir, verifique o token de acesso e as permissões das contas de anúncio."
          )}
        </p>
        {detail && (
          <p className="mt-4 text-xs text-navy-400 font-mono break-words">{detail}</p>
        )}
      </div>
    </div>
  );
}
