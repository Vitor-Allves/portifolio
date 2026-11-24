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
- [x] 10. Documentação e testes finais — seções 5 a 9 abaixo.

## 5. Funcionalidades implementadas

Por item da especificação. "Onde" é a tela do CRM; o funcionamento
detalhado de cada uma está em `docs/crm.md` (Registro de alterações,
"Evolução v1.0").

| Item | O que foi entregue | Onde |
| --- | --- | --- |
| 2.1 Cadastros | Lead com outro telefone, potencial comercial e necessidade; empresa com telefone e e-mail; documentos e anexos no lead, na empresa e no cliente (tipo conferido pelo conteúdo, até 4 MB, arquivar sem apagar) | Contatos, Empresas, Clientes ativos |
| 2.2 Duplicidade | WhatsApp, e-mail, nome e CNPJ: aviso no formulário com responsável e situação, recusa ao salvar; segunda negociação com o mesmo lead ou empresa só com autorização do Gestor | Novo contato, painel do contato |
| 2.3 Diagnóstico | Ficha de diagnóstico comercial em versões, ligada à oportunidade | Painel do contato → Negócio |
| 3 Propostas | Número, itens do catálogo ou personalizados, descontos com limite e autorização, condições, validade, modelos, PDF, link público com visualização e aprovação/recusa online com evidências, versões congeladas com motivo e diferenças, 8 situações, expiração automática | Propostas, oportunidade |
| 3 Catálogo | Serviços com escopo, valor de referência, cobrança, prazo e condições | Personalização |
| 4 Funil | 10 etapas configuráveis (nome, cor, ordem, probabilidade), probabilidade por oportunidade, valor ponderado | Funil de vendas, Personalização |
| 5 Tabulação | Encerramento obrigatório em 4 grupos com motivo, observação, quem encerrou e data; oportunidade futura com tarefa de retomada; reabertura com justificativa; relatório | Funil, Relatórios |
| 6 Visibilidade | Comercial vê todos os contatos, oportunidades, clientes e histórico, interage só nos seus; conversas de outros fechadas; pedido de transferência com aprovação do Gestor | Todo o CRM, Transferências |
| 7 Automações | 16 regras configuráveis (prazos, responsáveis, ações), nenhuma envia mensagem; as 9 pedidas pela especificação cobertas | Automações |
| 8 Contratos | Contrato numerado com proposta de origem, condições, vencimento, vigência, renovação, cancelamento, responsáveis, documento assinado, PDF; "Formalizar contrato" a partir da proposta aprovada | Clientes ativos, Propostas |
| 9 Operação | Onboarding em 8 itens, entregáveis com prazo, satisfação (0 a 10) | Cliente → Operação |
| 10 Financeiro | Vendido, receitas, recorrente, contratado 12 meses, previsto ponderado, descontos, cancelamentos, perdas, parcelas, comissões por regras | Financeiro |
| 11 Comunicação | Mensagens de WhatsApp agendadas (texto ou modelo), com as regras de envio conferidas no horário; o resto já existia (histórico, modelos, campanhas, consentimento, descadastro, indicadores de entrega e resposta) | Conversas |
| 12 Produtividade | Leads trabalhados, contatos finalizados, propostas aprovadas, por serviço; por pessoa: atribuídos, follow-ups, aprovadas, perdas, ticket médio | Painel, Metas e produtividade |
| 13 Segurança | 2FA de uso único; exportar e anonimizar dados do titular (LGPD); auditoria de propostas, contratos, transferências, comissões e exportações (com o formato) | Painel do contato, Auditoria |
| 14 Relatórios | 15 relatórios com filtros, totais, planilha e PDF, nas regras de acesso do CRM | Relatórios |
| 15 Intelligence | Resultados por origem e por anúncio (o anúncio que o WhatsApp informa), além da ligação cliente ↔ Intelligence já existente | Relatórios, Clientes ativos |

## 6. Documentação técnica

- **Pilha:** sem mudança (Next.js 16 App Router, React 19, TypeScript,
  PostgreSQL/Neon via `pg`, Vercel). Nenhuma dependência nova.
- **Banco:** 8 migrações, todas só acréscimos e executadas por
  `ensureSchema` (`src/lib/db.ts`), cada uma conferida pelo teste de banco
  (banco novo e banco atualizado ficam idênticos; dados existentes
  preservados):
  - v21 — funil configurável e tabulação;
  - v22 — solicitações de transferência;
  - v23 — cadastros, diagnóstico e documentos;
  - v24 — propostas, versões, aceites, modelos e configurações;
  - v25 — contratos ampliados, onboarding, entregáveis e satisfação;
  - v26 — regras de comissão e data de saída do contrato;
  - v27 — automações 11–16 e mensagens agendadas;
  - v28 — passo do 2FA e anonimização LGPD.
- **Regras no servidor:** toda rota `/api/crm` confere o perfil e as
  exceções da pessoa (`crm-access.ts`: `requireCap`, `requireContact`,
  `requireDeal`, `canSee`/`canAct`/`canSeeConversation`) — as telas só
  escondem o que o servidor já recusa.
- **Módulos novos** (`src/lib`): `crm-proposals*`, `crm-operations*`,
  `crm-finance*`, `crm-transfers`, `crm-diagnostics`, `crm-files`,
  `crm-scheduled-messages`, `crm-report-catalog*`, `crm-lgpd`, e as regras
  novas em `crm-automations`. Página pública: `src/app/proposta/[token]`.
- **Execução fora de uma ação de alguém:** `GET /api/cron/automations`
  (verificação diária) e `GET /api/cron/scheduled-messages`, ambos só com
  `Authorization: Bearer <CRON_SECRET>`; mensagens agendadas também saem
  pela consulta do sino de quem está com o CRM aberto (`after()`).
- **PDFs:** propostas, contratos, financeiro e relatórios pelo mesmo gerador
  (`crm-pdf.ts`, jsPDF), com a identidade da Legado.
- **Testes:** `tests/` (ver `tests/README.md`), rodados pelo CI em cada
  envio: tipos, lint, build e todas as suítes contra um Postgres de teste e
  uma API falsa da Meta/WhatsApp/Anthropic — nada sai para fora.

## 7. Relatório de testes

**Regressão final (24/11/2026, 20:22–20:30 UTC):** build de produção
(`next build` + `next start`, como no CI), banco de teste zerado e dados de
exemplo recarregados em cada suíte. **53 de 53 suítes passaram, 1.921
verificações**, nenhuma falha. Comando: `npm test` (ver `tests/README.md`).

| Grupo | Suítes | Situação |
| --- | --- | --- |
| Base anterior ao projeto (Fases 0–7: Painel, campanhas, personalização, campos, equipe e permissões, tarefas, automações 1–10, conversas, clientes, acompanhamento, relatórios do Painel, metas, mídia, IA, regressão geral) | 34 | Todas passaram — nada do que existia quebrou |
| Evolução v1.0 (funil e tabulação, transferências, cadastros, propostas, operação, financeiro, automações 11–16, mensagens agendadas, relatórios, segurança/LGPD) | 19 | Todas passaram |

- Cada módulo tem uma suíte de API (regras, permissões, validações, erros,
  auditoria) e uma de navegador (telas, celular, tema escuro, sem erro na
  página). Os números do Painel e dos relatórios são conferidos à mão
  contra os dados de exemplo (`dashboard-data`, `reports-api`).
- O teste de banco cria um banco do zero e atualiza bancos antigos versão a
  versão (v7 → v28) com dados dentro: a estrutura final é idêntica e nenhum
  dado se perde; cada migração da evolução tem sua conferência.
- Nenhum teste fala com serviços reais: WhatsApp, Meta e Anthropic são
  simulados; nenhuma mensagem real foi enviada.
- O CI do GitHub roda tipos, lint, build e todas as suítes a cada envio.
  Duas rodadas falharam no mesmo ponto (Personalização → Propostas): o
  campo "Desconto máximo" aparecia antes de carregar o valor salvo, e o
  carregamento podia apagar o que acabara de ser digitado. Corrigido (o
  campo só aparece depois de carregar); a falha foi reproduzida antes da
  correção e não ocorre depois.
- Observado durante o desenvolvimento (não em produção): no modo de
  desenvolvimento, a primeira compilação de uma página às vezes passa do
  tempo limite de uma suíte de navegador; repetida, passa. No modo de
  produção isso não ocorre.

## 8. Critérios de aceite (item 17)

| # | Critério | Como foi conferido |
| --- | --- | --- |
| 1 | Módulos acessíveis e funcionais | Uma suíte de API e uma de navegador por módulo (`tests/README.md`); telas no celular e no tema escuro |
| 2 | Cadastros e relacionamentos | `cadastro-api/e2e`, `clients-api`, `operations-api` |
| 3 | Propostas em PDF | `proposals-api` (PDF da equipe e do cliente) |
| 4 | Aprovação online com evidências | `proposals-api/e2e` (nome, e-mail, documento, versão, IP, navegador, hash do conteúdo) |
| 5 | Versionamento preserva anteriores | `proposals-api` (versão enviada congelada; nova versão com motivo e diferenças) |
| 6 | Tabulação alimenta relatórios | `funnel-api`, `reports-api` (motivos de perda, funil) |
| 7 | Transferências exigem autorização | `transfers-api/e2e` |
| 8 | Vendedores veem todos, interagem nos seus | `transfers-api` (403 com explicação), `scheduled-messages-api`, `reports-api` |
| 9 | Gestores com controle global | `transfers-api`, `finance-api`, `reports-api` |
| 10 | Duplicidades identificadas | `cadastro-api/e2e` |
| 11 | Automações conforme configuração | `automations-api`, `automations-ev-api`, `client-followup-api` |
| 12 | Contratos e clientes integrados | `operations-api/e2e`, `finance-api` |
| 13 | Relatórios consistentes | `reports-api` (outubro igual ao Painel), `dashboard-data` (conferido à mão), `goals-api` (totais = Painel) |
| 14 | Auditoria | Exportações, propostas, contratos, transferências, comissões, automações e LGPD auditados (conferidos nas suítes de cada módulo) |
| 15 | Segurança e permissões testadas | `team-api`, `access-api`, `security-api` e as checagens de perfil de cada suíte |
| 16 | Dados existentes preservados | `schema` (atualização de cada versão com dados, sem perdas) |
| 17 | Regressão confirma o que existia | Todas as suítes anteriores ao projeto passam (seção 7) |

## 9. Limitações e pendências

**Dependem de decisões de infraestrutura (do responsável pelo projeto):**

- `CRON_SECRET` e o agendamento na Vercel: sem eles, as automações diárias
  rodam no "Rodar agora" e as mensagens agendadas saem quando alguém está
  com o CRM aberto (com ninguém, saem quando alguém abrir).
- Plano da Vercel (o Hobby é para uso não comercial e limita o agendamento
  a uma vez por dia).
- Backups e testes de recuperação: dependem do plano do Neon e de uma rotina
  própria (item 13 da especificação).
- Envio de e-mail (Resend + DNS do domínio): hoje a proposta "por e-mail" é
  registrada, mas o CRM não envia e-mails.
- Banco separado para as prévias da Vercel.
- Chave da Anthropic e política de privacidade para o assistente de IA
  (desligado sem a chave).
- Validação jurídica da LGPD (bases legais, retenção, registro das
  operações) e revisão de segurança independente.

**Do próprio sistema:**

- Financeiro e comissões são gerenciais: o CRM calcula, não fatura nem paga.
- Contrato assinado é um documento anexado (sem assinatura eletrônica
  integrada).
- Resultados por anúncio não trazem o investimento: ele fica no Legado
  Intelligence; cruzar pelo ID do anúncio é o próximo passo.
- Mensagem livre agendada só sai com a janela de 24h aberta no horário
  (regra do WhatsApp); para depois disso, modelo aprovado.
- Relatórios mostram e exportam até 1.000 linhas (o resumo conta todas).
- A anonimização mantém o aceite de proposta (comprova o contrato); se o
  titular escrever de novo, entra como contato novo.
- O limite de tentativas de login é por instância do servidor (um limite
  global pede Redis/Upstash).
