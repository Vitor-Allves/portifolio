# CRM Legado — Projeto de Melhoria e Evolução v1.0 (24/11/2026)

Documento do projeto "fase única": auditoria feita antes de alterar o
sistema, decisões, ordem de construção e, ao final, a relação do que foi
implementado, os testes e as limitações. Complementa `docs/crm.md`
(funcionamento detalhado) e `docs/seguranca.md`.

## 1. Auditoria do sistema atual (antes das alterações)

**Arquitetura.** Um único app Next.js 16 (App Router) com o site, o Legado
Intelligence (`/intelligence`) e o CRM (`/crm`), no mesmo banco Postgres
(Neon) e no mesmo login (`internal_users`, 2FA, sessões revogáveis). O banco
evolui por versões em `src/lib/db.ts` (`ensureSchema`, v20 antes deste
projeto), só acrescentando; prévias da Vercel não alteram a estrutura.
Toda regra de acesso é aplicada nas rotas `/api/crm/*` (perfis
Administrador, Gestor, Comercial, Marketing + exceções por pessoa,
`crm-permissions.ts` / `crm-access.ts`).

**Integrações.** WhatsApp Cloud API (mensagens, modelos, webhook assinado,
campanhas); Meta Marketing API (indicadores de mídia, pelo mesmo código do
Intelligence); Anthropic (assistente de IA, opcional, desligado sem chave).
Execução agendada pronta (`/api/cron/automations`), mas desligada até haver
`CRON_SECRET` e o agendamento na Vercel.

**O que a especificação pede × o que existe:**

| Item | Situação antes | O que este projeto faz |
| --- | --- | --- |
| 2.1 Cadastros | Empresa com razão social, nome, CNPJ, endereço, segmento, responsável, situação, observações; contato com cargo, decisor, origem, temperatura, serviço de interesse, várias pessoas por empresa | Acrescenta potencial comercial, necessidade identificada, telefone/e-mail da empresa, telefone além do WhatsApp e **anexos** |
| 2.2 Duplicidade | Bloqueio por telefone, e-mail e CNPJ | Mostra o cadastro existente com responsável e situação; bloqueia segunda negociação independente sem autorização |
| 2.3 Diagnóstico | — | Novo (ficha com histórico) |
| 3 Propostas e catálogo | Serviços só como lista de nomes | Catálogo completo sobre a mesma lista + módulo de propostas completo |
| 4 Funil | 6 etapas fixas | 10 etapas configuráveis, probabilidade |
| 5 Tabulação | Motivo de perda/ganho opcional | Tabulação obrigatória em 4 grupos, reabertura, relatório |
| 6 Permissões | Comercial vê só os seus | Vê tudo, interage só nos seus; transferência por solicitação |
| 7 Automações | 10 regras (motor completo) | Novas regras sobre o mesmo motor |
| 8 Contratos | Contratos por cliente (serviços, vigência, valor, cobrança) | Número, proposta de origem, condições, renovação, responsáveis, documento |
| 9 Operação | Clientes ativos, acompanhamento mensal | Checklist de onboarding, entregáveis, satisfação |
| 10 Financeiro | Receita recorrente no Painel | Painel financeiro + comissões |
| 11 Comunicação | Quase tudo existe | Agendamento de mensagens; restrição por responsável |
| 12 Produtividade | Painel, metas e produtividade | Indicadores que faltam + comparação por serviço |
| 13 Segurança | 2FA, perfis, auditoria, sessões, arquivamento | Auditoria de propostas/contratos/transferências; ferramentas LGPD |
| 14 Relatórios | CSV do Painel e listas | Seção Relatórios com PDF e planilha |
| 15 Intelligence | Ligação cliente ↔ Intelligence e mídia (Fase 7) | Resultado comercial por origem e por anúncio |

## 2. Decisões tomadas (ajustáveis)

- **Etapas:** as atuais são renomeadas, sem regravar nenhum registro
  (os códigos internos continuam): Novo → Novo lead; Em conversa → Primeiro
  contato; Reunião agendada → Em qualificação; Proposta enviada (igual);
  Ganho → Venda fechada; Perdido → Venda perdida. Entram Diagnóstico
  realizado, Proposta em elaboração, Em negociação e Aguardando aprovação.
  O Administrador renomeia, reordena, define a probabilidade e cria ou
  arquiva etapas. "Reuniões" no Painel passa a contar as reuniões
  registradas nas tarefas (não existe mais a etapa "Reunião agendada").
- **Visibilidade:** o Comercial vê todos os contatos, empresas,
  oportunidades, clientes e o histórico comercial; só interage no que é seu
  (ou sem responsável, que pode assumir). Conversas de WhatsApp de leads de
  outros ficam fechadas por padrão (permissão própria). Gestor e
  Administrador seguem com controle total.
- **Anexos:** guardados no próprio banco, até 4 MB por arquivo (limite de
  envio da Vercel), só PDF, imagens e documentos de escritório; servidos
  apenas a quem vê o registro. Pode migrar para Vercel Blob depois.
- **Proposta pública:** `legadoenterprise.com.br/proposta/<código>`, código
  aleatório e revogável; "visualizada" só quando a página é de fato aberta
  num navegador (sinal enviado pela própria página; pré-visualizações de
  link e a equipe logada não contam). Aceite registra nome, e-mail,
  documento (opcional), versão, data, IP, navegador e a impressão digital
  (hash) do conteúdo aprovado. O envio ao cliente é registrado por quem
  envia (link copiado/WhatsApp/e-mail).
- **Comissões:** regras configuráveis (pessoa, serviço, modalidade,
  percentual e base de cálculo); o CRM calcula, não paga.
- **Automações diárias:** prontas; rodam quando o agendamento da Vercel
  (`CRON_SECRET`) for ligado, ou em "Rodar agora".
- **Mensagens agendadas:** saem no horário enquanto houver alguém com o CRM
  aberto (a consulta do sino confere as vencidas) e pelo agendamento da
  Vercel quando ligado; sem nenhum dos dois, saem quando alguém abrir o CRM.
  No horário, todas as regras de um envio são conferidas de novo.

## 3. Ordem de construção

1. Funil configurável e probabilidade.
2. Tabulação, reabertura e relatório.
3. Visibilidade compartilhada e transferências.
4. Cadastros, duplicidade, diagnóstico, anexos e catálogo de serviços.
5. Propostas (versões, PDF, link, aprovação).
6. Contratos, onboarding, entregáveis e satisfação.
7. Financeiro comercial e comissões.
8. Automações, agendamento de mensagens e indicadores.
9. Relatórios (PDF/planilha), origem × resultado, LGPD e 2FA.
10. Documentação final, relatório de testes, regressão completa.

## 4. Andamento

(atualizado a cada módulo)

- [x] 1. Funil — 10 etapas na Personalização (nome, cor, ordem,
  probabilidade), probabilidade da oportunidade, quadro e filtros lendo a
  lista; "Reuniões" do Painel pelas tarefas do tipo Reunião.
- [x] 2. Tabulação — obrigatória ao encerrar (4 grupos, motivo, observação,
  quem encerrou, data e tarefa de retomada da oportunidade futura),
  reabertura com justificativa, Relatórios → Tabulação comercial (tela,
  planilha e PDF).
- [x] 3. Visibilidade e transferências — Comercial vê tudo e trabalha no
  que é seu (servidor recusa o resto; conversas de outros fechadas), três
  permissões novas, pedido de transferência com aprovação do Gestor,
  Painel/metas/relatórios por pessoa só para quem gerencia.
- [x] 4. Cadastros — outro telefone, potencial comercial e necessidade no
  lead; telefone e e-mail na empresa; duplicidade (WhatsApp, e-mail, nome e
  CNPJ da empresa) avisada no formulário e recusada ao salvar com quem é o
  responsável e a situação; segunda negociação com o mesmo lead ou empresa
  só com autorização do Gestor (fica no histórico); diagnóstico comercial
  em versões; documentos e anexos (lead, empresa, cliente ativo); catálogo
  de serviços com escopo, valor de referência, cobrança, prazo e condições.
- [x] 5. Propostas — número sequencial, ligada à oportunidade (lead,
  empresa, responsável), serviços do catálogo ou personalizados com
  quantidade, valor e desconto (R$ ou %), totais mensal/único, condições,
  validade e vencimento; modelos na Personalização; desconto acima do limite
  só com autorização do Gestor; registro de envio (link, WhatsApp, e-mail,
  PDF, reunião); PDF com a identidade da Legado; link público com
  visualização confirmada pela página e aprovação/recusa online com
  evidências; versão enviada congelada (alterar cria a próxima, com motivo e
  diferenças); 8 situações, expiração automática; tela Propostas.
- [x] 6. Contratos e operação — contrato numerado (os existentes numerados
  pela ordem de criação), proposta de origem, condições de pagamento, dia de
  vencimento, prazo de vigência (calcula o vencimento), renovação, regras de
  cancelamento, responsáveis comercial e operacional, documento assinado e
  PDF para assinatura; "Formalizar contrato" na proposta aprovada registra a
  venda, cria o cliente e o contrato e começa o onboarding; aba Operação do
  cliente com checklist de onboarding (8 itens), entregáveis e satisfação.
- [x] 7. Financeiro e comissões — tela Financeiro (Gestão): valor vendido,
  nova receita mensal, serviços pontuais, receita recorrente e contratos
  ativos, contratado para 12 meses, previsto no funil (ponderado), descontos,
  cancelamentos, perdido no funil, parcelas dos próximos 6 meses e comissões
  por contrato e por vendedor, com planilha/PDF; regras de comissão por
  vendedor, serviço e modalidade (a mais específica vale).
- [x] 8a. Automações e agendamento — seis automações novas (11 proposta
  perto do vencimento, 12 retorno agendado, 13 diagnóstico realizado, 14
  oportunidade sem responsável, 15 transferência solicitada, 16 proposta
  aprovada), com prazos, responsáveis e ações configuráveis; mensagens de
  WhatsApp agendadas (texto ou modelo), canceláveis, com as regras de envio
  conferidas de novo no horário e o motivo quando não saem.
- [x] 8b. Indicadores — Painel com leads trabalhados, contatos finalizados
  e propostas aprovadas (cada um com a lista), comparação por serviço;
  produtividade por pessoa com atribuídos, trabalhados, follow-ups,
  aprovadas, perdidos e ticket médio. Já existiam: leads recebidos,
  propostas enviadas, vendas, perdas, conversão, ticket médio, receita
  recorrente, pipeline, negociações paradas, reuniões, atividades, tarefas
  atrasadas e comparação por vendedor, período e origem.
- [x] 9a. Relatórios — 14 relatórios novos na seção Relatórios (funil,
  vendas por período e por vendedor, propostas enviadas/aprovadas e
  expiradas, motivos de perda, produtividade, clientes ativos, contratos a
  vencer, receita recorrente, comissões, resultados por origem, por anúncio
  e das campanhas), com filtros, totais, planilha e PDF, nas mesmas regras de
  acesso do resto do CRM.
- [x] 9b. Segurança e LGPD — código 2FA de uso único; dados do titular
  (exportar tudo e anonimizar a pedido, com motivo, senha e auditoria).
  Já existiam: 2FA de Administrador, perfis e exceções, restrição por
  responsável, auditoria (alterações, transferências, propostas, contratos,
  exportações), encerrar sessões, arquivamento em vez de exclusão.
- [ ] 10. Documentação e testes finais
