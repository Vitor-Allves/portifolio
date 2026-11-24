# CRM da Legado (`/crm`)

Ferramenta interna de prospecção e gestão comercial, só para a equipe (o
mesmo login do Intelligence; logins de clientes não entram). A configuração do
WhatsApp está em [`whatsapp-crm-setup.md`](./whatsapp-crm-setup.md).

## Como está montado

| Parte | Onde |
| --- | --- |
| Tela | `src/app/crm/page.tsx`, componentes em `src/components/crm/` |
| Dados (servidor) | `src/lib/crm.ts` (contatos, mensagens), `crm-deals.ts` (oportunidades), `crm-tasks.ts` (tarefas e atividades), `crm-companies.ts`, `crm-import.ts`, `crm-core.ts` (peças comuns) |
| Tipos e regras puras | `src/lib/crm-types.ts` (etapas, consentimento, telefone, chave de empresa, valores em R$) e `src/lib/crm-catalog.ts` (listas e etiquetas: tipos, valores iniciais, cores) |
| Personalização | `src/lib/crm-options.ts` (listas e etiquetas no banco, validação nas gravações) + tela `CrmSettingsView.tsx`; no cliente, `crm-catalog-context.tsx` entrega rótulos e listas a todas as telas |
| APIs | `src/app/api/crm/**` — todas exigem sessão da equipe e conferem o perfil do CRM (`src/lib/crm-auth.ts`, `crm-access.ts`) |
| Perfis | `src/lib/crm-permissions.ts` (tabela do que cada perfil pode) + `crm-access.ts` (checagem por registro e Equipe) |
| WhatsApp | `src/lib/whatsapp.ts` + webhook público assinado em `src/app/api/whatsapp/webhook/` |
| Banco | Postgres; tabelas `crm_*` criadas/migradas por `ensureSchema` em `src/lib/db.ts` (nunca a partir de uma prévia da Vercel) |
| Testes | `tests/` (ver `tests/README.md`), rodam em todo PR pela verificação automática |
| Segurança e continuidade | [`seguranca.md`](./seguranca.md) |

### Tabelas

- `crm_contacts` — o lead/contato: nome, WhatsApp, e-mail, cargo, empresa
  (`company_id`), segmento/cidade próprios (usados só quando não há empresa),
  origem, indicado por, responsável, consentimento (`consent_status`,
  `consent_source`, `consent_at`), descadastro (`opted_out_at`), arquivamento
  (`archived_at`) e de qual importação veio (`import_id`). A coluna `stage`
  acompanha a oportunidade principal do contato (a aberta mais recente).
  `next_action`/`next_action_at` são da versão antiga: ficam guardadas, mas a
  próxima ação agora é uma tarefa. Desde a v10: temperatura (`temperature`:
  frio, morno, quente), serviço de interesse (`service_interest`, da lista
  Serviços), data prevista de retorno (`return_at`) e decisor
  (`is_decision_maker`). Última interação (mensagem, nota ou tarefa
  concluída, a mais recente) e próxima atividade (a tarefa pendente mais
  próxima) são calculadas na leitura, não gravadas. Desde a v15: quem está
  atendendo a conversa do WhatsApp agora (`attendant_id`, `attendant_since`)
  — diferente do responsável pelo lead (carteira).
- `crm_deals` — oportunidades (os cards do funil): título, valor estimado em
  centavos (`value_cents`), etapa, responsável, previsão de fechamento, motivo e
  detalhe da perda, data em que entrou na etapa e em que fechou. Um contato
  pode ter várias. Desde a v10: serviço (`service`), valor negociado
  (`negotiated_cents`, o que vale um negócio ganho), origem própria
  (`source`, começa com a do contato), temperatura própria (vazia = a do
  contato), motivo e detalhe do ganho (`won_reason`, `won_note`). Desde a
  v21: probabilidade própria (`probability`, vazia = a da etapa) e a
  tabulação do encerramento — grupo (`close_group`: positivo, negativo,
  sem_conversao, futuro), resultado da venda (`won_result`), quem encerrou
  (`closed_by`, `closed_by_name`) e, para oportunidade futura, a data de
  retomar (`return_on`).
- `crm_tasks` — tarefas e atividades: tipo (lista de Personalização), título,
  data/hora (`all_day` = sem horário), responsável, oportunidade, conclusão
  com resultado, cancelamento. Desde a v13: descrição, prioridade
  (`priority`, lista de Personalização), situação (`status`: pendente, em
  andamento, concluída, cancelada; `done_at`/`canceled_at` guardam quando e
  quem), lembrete (`remind_minutes` antes, `remind_at`, `reminder_dismissed_at`)
  e empresa (`company_id`). `contact_id` pode ficar vazio: tarefa só de uma
  empresa, ou atividade interna (sem contato nem empresa).
- `crm_task_events` (v13) — o histórico de cada tarefa: criada, editada
  (quais campos), reagendada, responsável trocado, mudança de situação.
- `crm_automations` (v14) — as dez automações da especificação: situação
  (ativa, pausada, desativada — todas começam desativadas), parâmetros
  ajustáveis (`config`: prazo, responsável, tipo de tarefa, prioridade,
  dias, lembrete...; o padrão fica no código, `crm-automation-defs.ts`) e a
  última verificação diária. `crm_automation_runs` — uma linha por execução
  (feita, ignorada ou falha, com o detalhe); `(automação, dedupe_key)` é
  único, então a mesma automação nunca age duas vezes no mesmo lead,
  oportunidade ou tarefa. `crm_notifications` — os avisos no sino (lead
  atribuído, lead parado, interesse em campanha, contrato perto do fim),
  lidos ou não, por pessoa; `client_id` (v18) faz o aviso abrir o cliente.
- `crm_companies` — empresas; `name_key` é o nome normalizado (sem acento,
  caixa, pontuação e sufixos como LTDA/ME/S.A.) e é único, então "Clínica
  Ribeiro" e "clinica ribeiro ltda" são a mesma empresa. Desde a v10: razão
  social (`legal_name`; `name` é o nome fantasia), CNPJ (`cnpj`, 14
  caracteres sem pontuação, único quando preenchido), UF (`state`),
  endereço, responsável pela conta (`owner_id`) e situação comercial
  (`status`: prospecção, em negociação, cliente ativo, ex-cliente, inativa;
  vazia nas empresas que já existiam). `crm_company_tags` — etiquetas da
  empresa, com quem aplicou.
- `crm_messages` — conversa do WhatsApp; `crm_events` — histórico de cada
  contato (criação, etapa e responsável de cada oportunidade, oportunidades
  criadas/editadas, tarefas criadas/reagendadas/concluídas/canceladas,
  atividades registradas, notas, edições de campo, consentimento, descadastro,
  arquivamento).
- `crm_campaigns` — campanhas: nome, situação (rascunho, enviando, pausada,
  concluída, cancelada), modelo do WhatsApp e seu texto, de onde vem cada
  variável (`params`), filtros do público (`audience`), quem criou e quem
  disparou. `crm_campaign_recipients` — uma linha por contato da campanha
  (chave campanha + contato): na fila, enviada, falhou ou ficou de fora (com
  o motivo), id da mensagem no WhatsApp. `crm_messages.campaign_id` liga a
  mensagem enviada à campanha. Desde a v16, o `audience` também guarda o
  período de cadastro (`createdFrom`/`createdTo`, dias de Brasília) e quem
  foi tirado à mão daquela campanha (`exclude`, até 5.000 contatos).
  `crm_campaign_audiences` — públicos salvos: só os filtros, com nome (o
  mesmo nome, sem diferença de maiúsculas e acentos, substitui os filtros).
- `crm_clients` (v17) — clientes ativos: uma linha por empresa
  (`company_id` único), responsável, situação (onboarding, ativo, pausado,
  encerrado, com data e motivo do encerramento), cliente desde,
  observações e a oportunidade ganha de origem. `crm_contracts` — contratos
  do cliente: serviços (ids da lista Serviços), início, fim (vazio = sem
  prazo), valor em centavos, cobrança (mensal ou valor único), situação
  (vigente, encerrado, cancelado) e a oportunidade de origem (uma
  oportunidade vira no máximo um contrato: índice único em `deal_id`).
  `crm_client_events` — histórico de relacionamento do cliente (criação,
  situação, edições, contratos, anotações, acompanhamentos). Contratos e
  clientes nunca são apagados: encerre ou cancele.
  `crm_client_reports` (v18) — acompanhamento mensal: um por cliente por mês
  (`month` = primeiro dia do mês, único com o cliente), serviços realizados,
  atividades executadas, resultados, pontos de atenção, próximas ações,
  responsável pelo acompanhamento, quem atualizou e quando.
- `crm_goals` (v19) — metas do mês: uma por mês (`month` = primeiro dia),
  pessoa (`user_id`; vazio = a equipe) e indicador (`metric`: leads,
  reuniões, propostas, ganhos ou valor vendido), com o alvo (`target`, uma
  contagem ou centavos) e quem mudou por último. Único em (mês, pessoa,
  indicador). O realizado nunca é gravado: é contado na hora, com as mesmas
  definições do Painel.
- `crm_clients.client_access_id` (v20) — o cliente do Legado Intelligence
  (`client_access`) a que o cliente ativo está ligado; no máximo um cliente
  ativo por cliente do Intelligence (índice único).
  `crm_media_syncs` (v20) — cada sincronização dos indicadores de mídia de
  um cliente ativo, nunca sobrescrita: cliente, cliente do Intelligence (id
  e nome na hora), mês de referência e dias cobertos, fonte (`meta_ads`),
  contas de anúncio lidas e as que falharam, totais (investimento,
  impressões, alcance, cliques, conversas, CTR, CPC, CPM, custo por
  conversa), campanhas (id, nome, objetivo, status e números), quem
  sincronizou e quando.
- `crm_options` — as listas editáveis (Personalização): origens, segmentos,
  serviços, motivos de perda e de ganho, tipos de tarefa, departamentos e
  prioridades. Tipos de tarefa e prioridades têm cor (`color`, v13), usada na
  agenda e nos selos. Chave `(kind, id)`;
  o código (`id`) nunca muda depois de usado; arquivar (`archived_at`) tira
  dos formulários sem mexer nos registros. `locked` marca a opção que o
  sistema usa quando nada se aplica ("Outro", "Tarefa", "Média"), que não se arquiva.
  Segmentos ficam como texto nos registros; renomear um segmento renomeia
  nas empresas e contatos que o usam.
- `crm_tags` (categoria Origem/Ação/Classificação, cor, descrição,
  arquivamento) e `crm_contact_tags` (qual contato tem qual etiqueta, quem
  aplicou e por onde: manual, importação, campanha, automação). Etiqueta não
  se apaga, só se arquiva; quem já tem continua com ela.
- `internal_users` (a mesma conta do Intelligence) guarda, para o CRM: o
  perfil (`crm_role`), as exceções individuais de permissão
  (`crm_permissions`, só o que difere do perfil), cargo (`crm_job_title`) e
  departamento (`crm_department`, da lista Departamentos). Desde a v11.
- `crm_imports` — cada importação de planilha (quem, quando, contagens, se foi
  desfeita). `crm_quick_replies` — respostas rápidas.

### Regras que o sistema garante

- **Perfis do CRM** (coluna `internal_users.crm_role`, separada do perfil do
  Intelligence): Administrador, Gestor, Comercial, Marketing ou Sem acesso.
  O servidor confere o perfil em toda rota; a tela só esconde o que não pode.

  | | Administrador | Gestor | Comercial | Marketing |
  |---|---|---|---|---|
  | O que vê | tudo | tudo | só os próprios leads e os sem responsável | tudo |
  | Funil, oportunidades e tarefas | edita | edita | edita os seus | só vê |
  | WhatsApp e respostas rápidas | envia | envia | envia (nos seus) | só vê |
  | Trocar responsável | qualquer um | qualquer um | só assumir sem dono / soltar o seu | não |
  | Contatos, empresas, notas, consentimento, arquivar | sim | sim | nos seus | sim |
  | Importar / desfazer importação | sim | sim | não | sim |
  | Exportar CSV | sim | sim | não | sim |
  | Campanhas: montar rascunho e ver resultados | sim | sim | não | sim |
  | Campanhas: disparar, pausar, cancelar | sim | sim | não | não |
  | Etiquetas nos contatos | sim | sim | nos seus | sim |
  | Empresas: dados, CNPJ, situação, etiquetas | sim | sim | sim | sim |
  | Empresas: responsável pela conta | qualquer um | qualquer um | só assumir sem dono / soltar a sua | não |
  | Automações: ligar, ajustar, rodar, histórico | sim | não | não | não |
  | Personalização (listas e etiquetas) | sim | não | não | não |
  | Arquivar e restaurar contatos | sim | sim | nos seus | sim |
  | Usuários e permissões (perfis, exceções, cargos, logins só CRM) | sim | não | não | não |
  | Trocar responsável em lote (Contatos) | sim | sim | não | não |
  | Transferir a carteira de uma pessoa, encerrar sessões, Auditoria | sim | não | não | não |

  Lead de outra pessoa, para o Comercial, responde como "não encontrado".
  O Administrador geral do Intelligence é sempre Administrador do CRM; ninguém
  muda o próprio perfil. Quem nunca teve perfil definido segue o do
  Intelligence (administrador geral/administrador → Administrador, gestor →
  Gestor, analista → Comercial). Toda troca de perfil vai para a auditoria
  (`crm.role_change`, com de → para).

  **Permissões por módulo e ação (Fase 2):** a tabela acima é o padrão de
  cada perfil. O Administrador pode abrir exceções para uma pessoa (liberar
  ou tirar uma permissão), em Usuários e permissões. Valem no servidor, na
  próxima ação da pessoa, e vão para a auditoria (`crm.permission_change`,
  com antes → depois). "Usuários e permissões" nunca vira exceção: só o
  perfil Administrador dá esse poder. Ninguém muda as próprias permissões; o
  Administrador geral tem todas. Dependências: disparar campanhas exige ver
  campanhas; arquivar e importar exigem editar contatos; editar clientes e
  ver valores de contrato exigem ver os clientes ativos.

  **Exportar relatórios (Fase 6):** Administrador, Gestor e Marketing (o
  Comercial vê o próprio Painel, sem exportar). Vale para o Painel, as listas
  dos indicadores, as metas e a produtividade.

  **Definir metas (Fase 6):** Administrador e Gestor. Quem vê todos os leads
  vê as metas e a produtividade de todos; o Comercial vê só a própria linha.

  **Clientes ativos (Fase 5):** ver — Administrador, Gestor, Marketing e
  Comercial (este só os clientes de que é responsável e os sem
  responsável); criar e editar — Administrador, Gestor e Comercial (nos
  seus); ver valores dos contratos — todos menos Marketing. Sem essa
  permissão o servidor não manda os valores (nem na lista, nem no
  histórico).

  **Legado Intelligence (Fase 7):** ligar um cliente ativo ao cliente do
  Intelligence — Administrador e Gestor ("Ligar clientes ativos ao Legado
  Intelligence"). Sincronizar os indicadores de mídia — quem edita o
  cliente. Em tudo isso vale também o acesso da pessoa no Intelligence: só
  liga, sincroniza ou vê os números quem lá vê todas as contas de anúncio do
  cliente. Investimento e custos seguem "ver valores".

  **Assistente de IA (Fase 7):** "Pedir resumos e análises ao assistente de
  IA" — Administrador e Gestor por padrão; outros perfis por exceção. Só
  funciona com a IA configurada no servidor (`ANTHROPIC_API_KEY`).

  **Logins só do CRM:** o Administrador do CRM cria o acesso de quem só usa o
  CRM (perfil "Analista" no Intelligence, sem nenhuma empresa: lá não vê
  nada; ao entrar, vai direto para o CRM). A senha temporária aparece uma vez
  e a pessoa cria a própria no primeiro acesso. Criar, gerar senha nova e
  desativar pedem a senha de quem está administrando e vão para a auditoria
  (`crm.user_create`, `crm.user_password_reset`, `crm.user_deactivate`; a
  senha nunca é gravada no registro). Quem também usa o Intelligence continua
  sendo gerenciado lá, pelo administrador geral. Desativar não apaga nada:
  leads, tarefas e histórico continuam com o nome da pessoa.

  **2FA para Administradores do CRM:** desde a Fase 2, entrar como
  Administrador do CRM pede o código do aplicativo autenticador (como já era
  para o administrador geral); quem ainda não tem cadastra no próximo login.
  Promover alguém sem 2FA a Administrador encerra as sessões dessa pessoa,
  para o cadastro acontecer na hora. Um Administrador com sessão antiga e
  sem 2FA vê um aviso para sair e cadastrar.

  **Carteiras:** quem pode trocar o responsável de qualquer lead (Gestor,
  Administrador) seleciona contatos na lista (ou usa todos os do filtro, até
  5.000) e escolhe o novo responsável; dá para levar junto as oportunidades
  abertas e as tarefas pendentes. Antes de confirmar, a tela mostra quanto
  vai mudar. O Administrador transfere a carteira inteira de uma pessoa
  (contatos, oportunidades abertas em qualquer contato, tarefas pendentes e
  contas de empresa) no painel dela. Cada contato e oportunidade movidos
  ganham uma linha no histórico ("carteira"), e a operação vai para a
  auditoria (`crm.portfolio_assign`, `crm.portfolio_transfer`). Filtro
  "Responsável desativado" acha leads de quem saiu.

  **Auditoria** (Administrador): ações administrativas do CRM (perfis,
  permissões, acessos, sessões, importações, exportações, campanhas,
  Personalização, carteiras), com antes → depois, e mudanças comerciais nos
  registros (etapas, valores, responsáveis, edições, arquivamentos,
  descadastros), por pessoa e período. No painel de cada pessoa: atividade
  (mensagens enviadas, notas, tarefas concluídas, mudanças de etapa, ganhos)
  e as últimas ações. **Encerrar sessões** desconecta a pessoa de todos os
  dispositivos (`crm.session_end`).

- **Sem duplicidade:** telefone (as duas grafias de celular BR, com e sem o 9)
  e e-mail (sem diferenciar maiúsculas) são únicos — no cadastro, na edição e
  na importação. Empresa é única pelo nome normalizado e pelo CNPJ. O CNPJ é
  validado pelos dígitos verificadores, inclusive o CNPJ alfanumérico (a
  partir de julho de 2026). Na importação, um CNPJ já cadastrado liga o
  contato àquela empresa, seja qual for o nome na planilha; nome de empresa
  já cadastrada com outro CNPJ vira erro na linha.
- **Nada se apaga pela tela:** contato sai do funil por *arquivamento*
  (reversível em Contatos → Arquivados). Um lead arquivado que escreve no
  WhatsApp volta sozinho.
- **Histórico:** toda alteração relevante entra no histórico do contato com
  quem fez e quando. Importações, desfazer importação e exportações também vão
  para o registro de auditoria (`audit_log`, visível ao administrador geral).
- **Consentimento e descadastro:** quem escreve primeiro no WhatsApp fica com
  consentimento "sim" (iniciou a conversa). Quem responde só "SAIR" (ou
  "parar", "stop", "cancelar", "descadastrar", "não quero receber"…, como
  mensagem inteira) é descadastrado na hora e recebe uma confirmação; fica no
  histórico como automático. Descadastrados não recebem campanhas.
- **Campanhas só para quem pode receber:** recebe quem aceitou contato, não se
  descadastrou, não está arquivado e tem WhatsApp. A regra é aplicada quando o
  envio começa **e de novo antes de cada mensagem** (quem pediu para sair no
  meio do envio é pulado). Cada contato recebe a mesma campanha no máximo uma
  vez, mesmo com dois envios ao mesmo tempo. Um envio interrompido no meio
  (queda da função) é marcado como "falhou — confira na conversa", nunca
  reenviado às cegas. Se a Meta limitar o número, a campanha pausa sozinha.
  Quem foi tirado à mão não entra na campanha (nem como "ficou de fora").
- **Painel (indicadores):** cada número é definido uma vez (`crm-dashboard.ts`,
  `SETS`) e a lista que abre ao clicar nele usa a mesma definição, então
  número e lista sempre batem. Origem e segmento filtram leads,
  oportunidades e tarefas (a oportunidade usa a própria origem, senão a do
  contato; o segmento é o da empresa, senão o do contato); a etapa filtra só
  o que está aberto agora (funil, abertas, paradas). "Paradas" = abertas, na
  mesma etapa há 7 dias, sem mensagem nem tarefa concluída nesse tempo.
  "Valor vendido" = negociado nas oportunidades ganhas; "receita recorrente
  contratada" = soma mensal dos contratos vigentes dos clientes ativos; o CRM
  não controla faturamento emitido nem valor recebido e diz isso na tela e no
  CSV. Campanhas entram pelo início do envio e não se dividem por pessoa,
  origem ou segmento (só para quem vê campanhas). Exportar (CSV) exige a
  permissão "Exportar relatórios" e vai para a auditoria
  (`crm.report_export`).
- **Metas e produtividade (Gestão):** metas mensais da equipe e de cada
  pessoa em leads cadastrados, reuniões, propostas, negócios ganhos e valor
  vendido. O realizado de uma pessoa é o do Painel filtrado por ela; o da
  equipe é o do Painel sem filtro (inclui o que não tem responsável), então
  as linhas sempre somam o Painel. Em branco ou 0 = sem meta. A tela mostra
  o ritmo esperado (parte do mês já decorrida) e diz se cada meta está no
  ritmo, abaixo, batida ou não batida; dá para copiar as metas do mês
  anterior antes de salvar. Cada alteração vai para a auditoria
  (`crm.goals_change`, com quantas metas mudaram). Produtividade por pessoa
  num período: os números do Painel por responsável, tarefas concluídas e
  atrasadas agora, conversas atendidas no WhatsApp e tempo médio de
  resposta (de quem respondeu; campanhas não contam; horas corridas) e
  última atividade, com a linha da equipe. Contatos arquivados ficam de
  fora, como no Painel. O Painel mostra as metas do mês corrente de quem ele
  está mostrando (equipe, a pessoa escolhida ou o próprio Comercial).
- **Indicadores de mídia (Legado Intelligence):** o CRM e o Intelligence são
  o mesmo sistema (mesmo banco e login); o cliente do Intelligence é o
  `client_access` com as contas de anúncio da Meta. Na aba Acompanhamento do
  cliente ativo, "Sincronizar" lê o mês na API de Marketing da Meta do mesmo
  jeito que o Intelligence (`getDashboardData` + `metrics.ts`: taxas a partir
  dos totais somados; alcance = o alcance deduplicado de cada conta, somado)
  e guarda uma sincronização nova — o mês corrente vai até hoje; mês que não
  começou é recusado; uma segunda sincronização em menos de 1 minuto devolve
  a anterior. Conta que falha fica de fora e é nomeada (sincronização
  parcial); se nenhuma conta pode ser lida, nada é gravado. Só leitura na
  Meta, com a mesma chave do Intelligence; o Intelligence continua sendo a
  fonte oficial e a tela diz isso. Ligar, trocar ou desfazer a ligação fica
  no histórico do cliente e na auditoria (`crm.intelligence_link`); desfazer
  mantém as sincronizações já feitas.
- **Assistente de IA:** três análises — resumo do lead (botão "Resumo" no
  painel do contato), resumo executivo do Painel (com a comparação com o
  período anterior, oportunidades paradas e produtividade) e relatório
  mensal do cliente (aba Acompanhamento). Cada uma mostra três partes
  separadas: **Dados do CRM** (lidos com as mesmas regras das telas: o
  Comercial só o que é seu, Marketing sem valores, mídia só com acesso no
  Intelligence), **Cálculos do sistema** (com a fórmula) e, só quando a
  pessoa pede, a **Leitura da IA**, marcada como gerada por IA. Os dados e
  cálculos funcionam sem IA. A IA (Claude Opus 5.5, da Anthropic, com
  fallback do próprio servidor da Anthropic se o pedido for recusado)
  recebe só os dados e cálculos daquela análise, sem telefones nem e-mails,
  com a instrução de não inventar nem recalcular números e de tratar
  mensagens de leads como dado, nunca como instrução. O texto da IA não é
  salvo. Limite: 30 pedidos por pessoa a cada 24 horas. Cada pedido vai
  para a auditoria (`crm.ai_request`: tipo, resultado e tokens, nunca o
  conteúdo). Recusa ou falha da IA aparecem como aviso e os dados ficam.
  Para ligar: criar `ANTHROPIC_API_KEY` nas variáveis de ambiente da
  Vercel (nunca no código nem no chat); cada pedido tem custo na conta da
  Anthropic.
- **Acompanhamento mensal:** um por cliente por mês, só de mês que já
  começou; precisa de pelo menos um campo. Salvar por cima do que outra
  pessoa salvou enquanto você editava é recusado (409) em vez de apagar o
  trabalho dela. Mês novo começa com os serviços dos contratos vigentes.
  "Acompanhamento de clientes" mostra quem era cliente no mês (já tinha
  começado e não estava encerrado antes dele), os pendentes primeiro.
- **Clientes ativos:** nada vira cliente sozinho — só pelo botão Tornar
  cliente (na oportunidade ganha, na empresa ou em "Prontos para virar
  cliente") ou pela automação 7, se o Administrador ligá-la. Uma empresa tem no máximo um cliente, e uma oportunidade vira
  no máximo um contrato, mesmo com dois cliques ao mesmo tempo. De uma
  oportunidade ganha vêm a empresa, o responsável, a data, o serviço e o
  valor negociado (primeiro contrato); se a empresa já é cliente, vira um
  contrato novo dela. Virar cliente põe a empresa em "Cliente ativo";
  encerrar pede o motivo, encerra os contratos vigentes e põe a empresa em
  "Ex-cliente"; reativar volta para "Cliente ativo". "Vence em" conta dias
  de Brasília até o fim do contrato vigente.
  **Interessado** = respondeu e a automação "Resposta de campanha" registrou
  a resposta, ou respondeu e está "quente"; quem pediu para sair depois de
  receber nunca conta.
- **Etapas do funil (v21):** lista da Personalização (`crm_options`,
  `kind = 'stage'`), com nome, cor, ordem e probabilidade de fechamento
  (`meta.probability`). Padrão: Novo lead 5%, Primeiro contato 10%, Em
  qualificação 20%, Diagnóstico realizado 35%, Proposta em elaboração 45%,
  Proposta enviada 55%, Em negociação 70%, Aguardando aprovação 85%, Venda
  fechada 100%, Venda perdida 0%. Os códigos antigos foram mantidos
  (`novo`, `conversa`, `reuniao`, `proposta`, `ganho`, `perdido`): só o nome
  mudou, nenhum registro foi regravado. Novo lead, Venda fechada e Venda
  perdida são fixas (não arquivam; Novo lead fica sempre primeiro e as duas
  de encerramento, por último); uma etapa só é arquivada sem oportunidades
  nela. Só o Administrador mexe nas etapas; tudo vai para a auditoria.
- **Exigência que cresce com a etapa:** o cadastro inicial continua rápido
  (nada é obrigatório até a proposta). *Proposta em elaboração* pede o
  serviço; *Proposta enviada*, *Em negociação* e *Aguardando aprovação*,
  serviço e valor estimado; *Venda fechada*, serviço, valor negociado e
  motivo. Etapas criadas pelo Administrador não pedem nada a mais. O
  servidor recusa o movimento sem esses dados (a tela pergunta antes de
  mover) e não deixa apagar um campo que a etapa atual exige. Oportunidades
  que já estavam nessas etapas antes da v10 continuam como estão. Movimentos
  automáticos (o lead respondeu → *Primeiro contato*) não passam pela
  exigência. No Painel, negócio ganho vale o valor negociado (ou o estimado).
- **Tabulação obrigatória (v21):** encerrar sempre registra quem encerrou e
  quando. *Venda fechada* pede o resultado (venda realizada ou proposta
  aprovada), o motivo e uma observação. *Venda perdida* pede o tipo de
  encerramento — perda comercial, sem conversão (não chegou a negociar) ou
  oportunidade futura —, o motivo daquele grupo (cada motivo tem o seu
  grupo, na Personalização) e uma observação; a oportunidade futura pede
  também a data para retomar e cria a tarefa "Retomar: …" na agenda do
  responsável. No Painel e nas metas, "perdidos" são as perdas comerciais e
  os sem conversão (a oportunidade futura não conta como perda); conversão =
  ganhos ÷ (ganhos + perdidos).
- **Reabertura com justificativa:** tirar uma oportunidade de Venda fechada
  ou Venda perdida (inclusive trocar uma pela outra) exige a justificativa,
  que fica no histórico junto com o encerramento anterior. Reabrir limpa a
  tabulação da oportunidade.
- **Horários em Brasília:** tarefas são gravadas no fuso de Brasília (-03:00);
  tarefa "dia todo" fica ao meio-dia para não mudar de dia em nenhum fuso.
- **Quem vê cada tarefa:** a tarefa segue o registro a que pertence — o
  responsável do contato; sem contato, o da empresa; atividade interna, o
  responsável da própria tarefa. O Comercial vê as dos seus registros e as
  de registros sem responsável; não cria tarefa em empresa da carteira de
  outra pessoa.
- **Lembretes:** só dentro do CRM (o sino no topo, que confere a cada minuto
  com o CRM aberto); nada vai por WhatsApp ou e-mail. Escolhas: na hora,
  15 min, 1 h ou 1 dia antes; tarefa de dia todo: no dia ou na véspera, às
  8h. Reagendar faz o lembrete valer de novo; concluir ou cancelar tira do
  sino. Dispensar o próprio lembrete não exige poder editar o funil.
- **Atendimento das conversas** (`crm-conversations.ts`): responder uma
  conversa sem atendimento faz a pessoa assumir; responder uma que outra
  pessoa atende é recusado (409, nada é enviado) até a pessoa clicar em
  "Assumir e responder". A tomada é atômica (trava do contato), então duas
  pessoas respondendo ao mesmo tempo uma conversa livre não conseguem as
  duas. Transferir só para quem envia WhatsApp e vê o lead; quem recebe é
  avisado no sino. Encerrar/transferir: quem atende ou quem pode trocar
  responsáveis (Gestor, Administrador). Quem foi desativado não segura
  conversa. Campanhas não assumem atendimento. Tudo fica no histórico do
  contato.
- **Tempo de resposta**: da primeira mensagem do contato depois do nosso
  silêncio até a nossa primeira resposta que não é de campanha, em horas
  corridas (não horário comercial), 7 ou 30 dias; o Comercial vê os números
  dos leads que enxerga. "Aguardando" = a mensagem mais recente é do contato.
  Mensagem recebida na hora é gravada com o horário de chegada (o WhatsApp
  manda o horário só em segundos); reentregas atrasadas mantêm o horário do
  WhatsApp.
- **Automações** (`crm-automations.ts`): nenhuma envia mensagem — criam
  tarefas, lembretes, linhas no histórico ("Automação") e avisos no sino. As
  de evento (1 novo lead, 2 lead atribuído, 4 reunião agendada, 5 proposta
  enviada, 10 resposta de campanha) rodam logo depois que a ação de quem
  disparou é gravada; se a automação falhar, a ação da pessoa continua
  valendo e a falha aparece no histórico de execuções (e pode acontecer de
  novo no próximo evento). As de tempo (3 lead sem movimentação, 6 lead sem
  resposta) rodam na verificação diária: `GET /api/cron/automations`, que só
  aceita o cabeçalho `Authorization: Bearer <CRON_SECRET>` (sem a variável,
  fica desligada), ou no botão "Rodar agora" do Administrador; cada
  verificação trata até 100 registros por automação. Importações de
  planilha não criam tarefa de primeiro contato; troca de responsável em
  lote gera um aviso só por pessoa; uma resposta "SAIR" não conta como
  interesse; mensagem de campanha não conta como "nossa última mensagem"
  na automação 6. Clientes ativos (Fase 5): a 7 (oportunidade ganha) cadastra
  o cliente em Onboarding com a oportunidade como contrato e cria a tarefa de
  onboarding na empresa para o responsável pelo cliente (empresa que já é
  cliente ganha só o contrato novo; contato sem empresa: nada é criado e a
  execução diz por quê); a 8 avisa no sino o responsável pelo cliente
  quando um contrato vigente termina nos próximos X dias (uma vez por data
  de fim); a 9, a partir do dia X do mês, cria a tarefa de atualização para
  cliente em Onboarding ou Ativo sem o acompanhamento do mês (uma por mês).
  As 8 e 9 rodam na verificação diária, como a 3 e a 6.
- **Situação da tarefa:** cancelada só volta reativada (pendente); concluir
  pede o resultado (opcional). Tudo entra no histórico da tarefa e, quando
  há contato, no histórico do contato.

## Backups e recuperação

1. **Antes de cada fase ir ao ar**, criar uma cópia do banco no provedor
   (Neon → *Branches* → *Create branch* a partir de `main`, ou um snapshot no
   painel). Se algo der errado, a cópia é o ponto de restauração.
2. **Atualização do banco em etapas:** cada nova versão (v5, v6, v7…) roda só
   se o banco ainda não a tem e grava a versão assim que termina. Assim o
   primeiro acesso depois de publicar faz só os comandos novos (antes refazia
   a cadeia inteira, ~80 comandos, e passava do limite de 10s da Vercel), e
   uma atualização interrompida continua de onde parou.
3. **Migrações só acrescentam:** nenhuma coluna ou tabela existente é
   removida; dados antigos continuam onde estavam (ex.: o texto antigo de
   empresa em `crm_contacts.company` foi mantido).
4. **Exportar CSV** (aba Contatos) gera uma cópia legível da base a qualquer
   momento, respeitando os filtros da tela.
5. **Importação errada:** em Importar planilha → Importações recentes →
   *Desfazer*. Remove só os contatos que aquela importação criou **e que
   ninguém mexeu depois** (sem mensagem, sem mudança de etapa/campo, sem
   tarefa), junto com as oportunidades criadas pela importação; os
   trabalhados ficam e são informados.

## Registro de alterações

### Evolução v1.0 — funil configurável, tabulação e relatório de tabulação (schema v21)

- **Funil de 10 etapas** editável na Personalização (nome, cor, ordem,
  probabilidade, criar e arquivar), com os códigos antigos mantidos. O
  quadro, os filtros, o Painel, as campanhas e as exportações leem a lista.
- **Probabilidade** por etapa e própria da oportunidade (campo na aba
  Negócio; vazio = a da etapa); aparece no card e no topo de cada coluna.
- **Tabulação obrigatória** ao encerrar e **reabertura com justificativa**
  (ver "Regras que o sistema garante"); motivos de encerramento com grupo
  (16 motivos da especificação; os seis antigos renomeados só onde ninguém
  tinha renomeado).
- **Relatórios → Tabulação comercial:** por grupo, motivo e vendedor, com a
  lista dos encerramentos; filtros de período, vendedor, origem, serviço,
  grupo e motivo; planilha (CSV) e PDF com a identidade da Legado
  (`src/lib/crm-pdf.ts`), com a permissão "Exportar relatórios" e registro na
  auditoria. O Comercial vê só os próprios encerramentos.
- **Painel:** "Reuniões agendadas" passa a contar as tarefas do tipo Reunião
  do período (não existe mais a etapa "Reunião agendada").
- Banco v21: `crm_options.meta`, etapas e motivos semeados,
  `crm_deals.probability`, `won_result`, `close_group`, `closed_by`,
  `closed_by_name`, `return_on` (encerramentos antigos recebem o grupo do
  motivo registrado; nada é inventado).
- Testes: `funnel-api` e `funnel-e2e`; `schema` cobre v20 → v21.

### Especificação-mestra v1.0 — Fase 7, entrega 2: assistente de IA

- **Resumo do lead**, **resumo executivo do Painel** e **relatório mensal do
  cliente**, cada um com Dados do CRM, Cálculos do sistema e Leitura da IA
  separados (especificação, módulo 18).
- A IA só entra quando configurada (`ANTHROPIC_API_KEY` na Vercel) e para
  quem tem a nova permissão "Pedir resumos e análises ao assistente de IA"
  (Administrador e Gestor por padrão); sem ela, as análises mostram os
  dados e os cálculos.
- A IA recebe só o que a pessoa pode ver, sem telefones nem e-mails; limite
  de 30 pedidos por pessoa a cada 24 horas; cada pedido na auditoria
  (`crm.ai_request`), sem o conteúdo.
- Dependência nova: `@anthropic-ai/sdk`. `CRM_AI_BASE_URL` aponta para uma
  API falsa só nos testes (ignorado na Vercel).
- Sem mudança no banco.
- Testes: `ai-api` (sem chave: dados e cálculos, nada enviado; com chave:
  quando chama, o que envia e o que não envia, permissões, recusa, falha,
  auditoria e limite) e `ai-e2e` (Painel, contato e cliente, Comercial sem
  IA, celular e tema escuro).

### Especificação-mestra v1.0 — Fase 7, entrega 1: indicadores de mídia do Legado Intelligence (schema v20)

- **Clientes ativos ligados ao Intelligence:** Administrador e Gestor ligam
  cada cliente ativo ao seu cliente no Legado Intelligence (nova permissão
  "Ligar clientes ativos ao Legado Intelligence"); um cliente do
  Intelligence para um cliente ativo; ligação no histórico e na auditoria.
- **Indicadores de mídia no Acompanhamento:** "Sincronizar" busca o mês
  (investimento, impressões, alcance, cliques, conversas, CTR, CPC, CPM,
  custo por conversa e as campanhas com objetivo e status) do mesmo jeito
  que o Intelligence, com fonte, período e data na tela; cada
  sincronização fica no histórico do mês.
- **Acesso:** ninguém vê pelo CRM mais do que veria no Intelligence (as
  contas de anúncio da pessoa precisam cobrir as do cliente); investimento e
  custos só para quem vê valores.
- `meta-ads.ts`: `META_GRAPH_BASE_URL` aponta para uma Meta falsa só nos
  testes (ignorado na Vercel, como o `WHATSAPP_GRAPH_BASE_URL`).
- Banco v20: coluna `crm_clients.client_access_id` e tabela
  `crm_media_syncs` (nada muda nos dados existentes).
- Testes: `media-api` (ligar, sincronizar, números iguais aos da API do
  Intelligence, histórico, contas que falham, quem vê o quê) e `media-e2e`
  (ligar e sincronizar pela tela, outubro e o mês corrente, campanhas,
  histórico, Marketing sem valores, celular e tema escuro); `schema` na
  v20.

### Especificação-mestra v1.0 — Fase 6, entrega 2: metas e produtividade (schema v19)

- **Nova seção "Metas e produtividade"** no grupo Gestão do menu, para todos
  os perfis (o Comercial vê só a própria linha).
- **Metas mensais** da equipe e de cada pessoa: leads, reuniões, propostas,
  negócios ganhos e valor vendido, com progresso, ritmo esperado do mês e
  situação (no ritmo, abaixo do ritmo, batida, não batida). Só
  Administrador e Gestor definem (nova permissão "Definir metas"); copiar
  do mês anterior; cada mudança na auditoria (`crm.goals_change`).
- **Produtividade por pessoa** no período: leads, reuniões, propostas,
  ganhos, valor vendido, conversão, tarefas feitas e atrasadas, conversas
  atendidas, tempo médio de resposta e última atividade, com o total da
  equipe igual ao do Painel.
- **Painel:** cartão com as metas do mês de quem ele mostra.
- **Exportar CSV** das metas e da produtividade ("Exportar relatórios",
  com auditoria).
- Banco v19: tabela nova `crm_goals` (nada muda nos dados existentes; começa
  sem metas).
- Testes: `goals-api` (realizado = Painel, definir/remover/validar metas,
  quem define e quem vê, produtividade com conversas e tempo de resposta,
  exportação) e `goals-e2e` (definir metas, progresso, copiar do mês
  anterior, cartão no Painel, Comercial, celular e tema escuro); `schema`
  na v19.

### Especificação-mestra v1.0 — Fase 6, entrega 1: Painel aprimorado e relatórios

- **Filtros novos no Painel:** origem, segmento e etapa (além de período e
  responsável).
- **Indicadores novos:** linha "Agora" com oportunidades abertas,
  oportunidades paradas (7+ dias sem movimento), follow-ups e tarefas
  atrasados, tarefas para hoje e receita recorrente contratada; bloco
  "Desempenho das campanhas" (enviadas, entregues, lidas, responderam,
  interessados, oportunidades).
- **Clicar no indicador** abre a lista dos registros que ele contou (leads,
  oportunidades, tarefas, clientes, campanhas); cada linha abre o registro.
- **Exportar CSV** do Painel e de cada lista, com a nova permissão "Exportar
  relatórios" e registro na auditoria.
- Correção: o gráfico "semana a semana" derrubava a página quando o período
  mudava com o mouse sobre uma barra que deixava de existir.
- Sem mudança no banco.
- Testes: `dashboard-reports-api` (cada número = sua lista, filtros,
  receita recorrente, campanhas, exportação, Comercial só o seu) e
  `dashboard-reports-e2e`; `dashboard-e2e` adaptado aos cartões clicáveis.

### Especificação-mestra v1.0 — Fase 5, entrega 2: acompanhamento mensal e automações 7, 8, 9 (schema v18)

- **Acompanhamento de clientes** (nova seção em Operação): o mês (setas),
  quantos clientes já têm o acompanhamento registrado, pendentes primeiro,
  com quem atualizou e os pontos de atenção; filtro Pendentes/Atualizados.
- **Painel do cliente em abas:** Cliente (dados e contratos),
  Acompanhamento (mês de referência, serviços realizados, atividades,
  resultados, pontos de atenção, próximas ações, responsável; histórico de
  todos os meses) e Histórico.
- **Automações 7, 8 e 9** liberadas (começam desligadas): onboarding na
  oportunidade ganha, aviso de contrato perto do fim (o aviso no sino abre o
  cliente) e tarefa para cliente sem acompanhamento do mês (novo ajuste
  "a partir do dia do mês").
- Banco v18: só acréscimos (`crm_client_reports`, `crm_notifications.client_id`).
- Testes: `client-followup-api` e `client-followup-e2e`; `automations-*`,
  `clients-e2e` e schema atualizados.

### Especificação-mestra v1.0 — Fase 5, entrega 1: clientes ativos (schema v17)

- **Clientes ativos** (nova seção em Operação): lista com situação,
  responsável, serviços, valor mensal dos contratos vigentes e o próximo
  vencimento; filtros por situação, responsável, serviço e vencimento
  (até 30 / 60 dias, vencido); busca.
- **Prontos para virar cliente:** oportunidades ganhas sem contrato (últimos
  180 dias) e empresas marcadas "Cliente ativo" sem cadastro, com um botão.
- **Painel do cliente:** situação (Onboarding, Ativo, Pausado, Encerrado com
  motivo), responsável, cliente desde, observações, contatos decisores,
  etiquetas da empresa, contratos (serviços, vigência, valor, cobrança,
  situação, observações) e o histórico de relacionamento com "Registrar no
  histórico".
- **Tornar cliente** também na oportunidade ganha (aba Negócio e tarefas) e no
  painel da empresa; "Ver cliente" / "Abrir cliente" quando já é.
- **Permissões:** novo módulo "Clientes ativos" (ver, criar e editar, ver
  valores), com exceções individuais. Auditoria: cliente criado, situação
  e responsável, contratos criados e editados.
- Banco v17: só acréscimos (`crm_clients`, `crm_contracts`,
  `crm_client_events`), vazios — nenhum cliente é criado na migração.
- Testes: `clients-api` (inclui dois cliques ao mesmo tempo) e `clients-e2e`.

### Especificação-mestra v1.0 — Fase 4, entrega 2: campanhas (schema v16)

- **Quem vai receber:** a lista de quem o filtro alcança (busca por nome,
  empresa ou telefone), com **Tirar** e **Incluir de volta** por pessoa; o
  resumo mostra "Tirados por você". Vale só para aquela campanha e fica
  salvo no rascunho.
- **Período de cadastro:** "Cadastrado a partir de" / "até", em dias de
  Brasília.
- **Públicos salvos:** salvar os filtros com um nome e reusar em outra
  campanha; apagar quando não servir mais.
- **Resultados:** novo número "Interessados" (e "Sim · interessado" por
  pessoa, "N interessados" na lista de campanhas), além de responderam e
  viraram oportunidade; aviso de quantos foram tirados à mão.
- O envio continua com a página aberta (sem fila no servidor) até a decisão
  sobre infraestrutura (Vercel Pro ou agendador externo). Agendamento,
  e-mail e fila ficam para depois dessa decisão.
- Banco v16: só acréscimos (tabela `crm_campaign_audiences`).
- Testes: `campaign-audience-api` e `campaign-audience-e2e`.

### Especificação-mestra v1.0 — Fase 4, entrega 1: conversas (schema v15)

- **Atendimento:** quem está atendendo cada conversa, desde quando;
  Assumir, Transferir (com aviso no sino de quem recebe) e Encerrar.
  Responder uma conversa livre assume; responder a de outra pessoa pede
  "Assumir e responder" — nunca duas pessoas respondendo sem saber.
- **Etiquetas de atendimento** (nova categoria na Personalização: Aguardando
  cliente, Dúvida, Suporte, Reclamação, Urgente), direto na conversa e na
  lista.
- **Filtros:** Aguardando (nossa resposta), atendimento (meus, sem
  atendimento, de uma pessoa), etiqueta — além de etapa, responsável e não
  lidas.
- **Tempo de resposta:** "Aguardando · X" em cada conversa; resposta média
  da equipe e por pessoa (7/30 dias) e quantas aguardam agora.
- **Atalhos na conversa:** + Tarefa (formulário de tarefa no contato) e
  + Oportunidade.
- Banco v15: só acréscimos (`crm_contacts.attendant_id`/`attendant_since`,
  índices, etiquetas de atendimento).
- Testes: `conversations-api` (inclui duas respostas simultâneas) e
  `conversations-e2e`.

### Especificação-mestra v1.0 — Fase 3, entrega 2: automações (schema v14)

- **Automações** (nova seção em Administração, perfil Administrador; nova
  permissão "Automações"): as dez da especificação com gatilho, condição,
  ação, prazo, responsável e situação; ativar, pausar, desativar e ajustar;
  histórico de execuções e falhas, com o contato a um clique.
- Funcionando já: 1 novo lead → tarefa de primeiro contato; 2 lead
  atribuído → aviso ao responsável; 4 reunião agendada → lembrete; 5
  proposta enviada → follow-up; 10 resposta de campanha → histórico,
  temperatura e aviso. 3 lead sem movimentação → alerta e 6 lead sem
  resposta → tarefa rodam na verificação diária ou em "Rodar agora".
  7, 8 e 9 aparecem como "Disponível na Fase 5".
- **Avisos no sino**, junto dos lembretes, com "Marcar como lido".
- Todas começam **desativadas**: nada muda para a equipe até o
  Administrador ligar.
- Banco v14: só tabelas novas (`crm_automations`, `crm_automation_runs`,
  `crm_notifications`).
- Verificação diária automática: rota pronta e protegida por `CRON_SECRET`;
  o agendamento na Vercel depende de aprovação (ver segurança).
- Testes: `automations-api` e `automations-e2e`.

### Especificação-mestra v1.0 — Fase 3, entrega 1: tarefas e agenda (schema v13)

- **Tarefa completa:** título, descrição, tipo, prioridade, situação
  (pendente, em andamento, concluída, cancelada), data e horário, lembrete,
  responsável, contato *ou* empresa *ou* atividade interna, oportunidade e
  histórico próprio. Um só formulário abre de Agenda, Tarefas, do painel da
  empresa e (em "Detalhes") do painel do contato, com atalho para o registro.
- **Agenda em dia, semana e mês**, filtro por pessoa e por tipo, cada tarefa
  na cor do tipo; "+" em cada dia para criar ali.
- **Tarefas:** filtros por tipo e prioridade, abas Pendentes / Em andamento /
  Concluídas, "+ Nova tarefa".
- **Lembretes no sino** do topo do CRM (só dentro do CRM) e contagem das
  tarefas atrasadas.
- **Personalização:** os tipos de tarefa da especificação (primeiro contato,
  follow-up, preparação e envio de proposta, retorno comercial,
  acompanhamento de cliente, atividade interna) entram depois dos que já
  existiam; nova lista **Prioridades** (Alta, Média, Baixa); cor por tipo e
  por prioridade.
- Banco v13: só acréscimos (colunas em `crm_tasks` e `crm_options`, tabela
  `crm_task_events`); `crm_tasks.contact_id` deixa de ser obrigatório. As
  tarefas existentes ficam como estão, com a situação tirada do que já estava
  gravado (concluída/cancelada/pendente) e prioridade Média.
- Painel: tarefas sem contato (atividades internas, de empresa) entram nas
  contagens.
- Testes: `tasks-api` e `tasks-e2e`; `schema` agora também sobe um banco da
  v12 com tarefas para a v13.

### Especificação-mestra v1.0 — Fase 2, entrega 2: carteiras, auditoria e acesso (schema v12)

- **Carteiras:** trocar responsável em lote na lista de Contatos (seleção ou
  filtro, com prévia do que muda, levando oportunidades abertas e tarefas
  pendentes); transferir a carteira inteira de uma pessoa no painel dela;
  filtro "Responsável desativado".
- **Auditoria** (nova seção em Administração): ações administrativas e
  mudanças comerciais, com filtros por pessoa, ação/tipo e período; o
  contato abre direto da linha.
- **Produtividade e histórico por pessoa** no painel de Usuários e
  permissões (7, 30 ou 90 dias).
- **2FA obrigatório para Administradores do CRM** no login; aviso para quem
  ainda não cadastrou.
- **Encerrar sessões** de uma pessoa à distância (Administrador, confirmando
  a própria senha).
- Banco v12: só índices em `crm_events` (por data e por pessoa).
- Testes: `access-api` e `access-e2e`; o Administrador dos testes entra com
  2FA (código gerado a partir de um segredo só de teste).

### Especificação-mestra v1.0 — Fase 2, entrega 1: usuários e permissões (schema v11)

- **Usuários e permissões** (Administrador): para cada pessoa, perfil,
  cargo, departamento, situação (ativa ou desativada) e exceções de
  permissão por módulo e ação (contatos e empresas, funil/tarefas/carteiras,
  conversas, campanhas, administração). Os quatro perfis viram o padrão e
  reproduzem exatamente o que cada um podia antes.
- Permissão nova "Arquivar e restaurar contatos" (Excluir), separada de
  editar; todos os perfis continuam com ela.
- **Logins só do CRM** criados pelo Administrador do CRM, com senha
  temporária mostrada uma vez; gerar senha nova e desativar, sempre
  confirmando a senha de quem administra.
- **Departamentos** viram uma lista da Personalização (Comercial, Marketing,
  Operação, Atendimento, Diretoria, editável).
- Personalização passa a contar também o uso de serviços, motivos de ganho,
  departamentos e etiquetas de empresas.
- Banco v11: só acrescenta colunas em `internal_users`; ninguém começa com
  exceções.
- Testes: `team-api` e `team-e2e` em `tests/`.

### Especificação-mestra v1.0 — Fase 1, entrega 2: campos de contatos, empresas e oportunidades (schema v10)

- **Contatos:** temperatura (frio, morno, quente), serviço de interesse (da
  lista Serviços da Personalização), data prevista de retorno e "decisor na
  empresa". Última interação e próxima atividade aparecem calculadas no
  painel e na lista (coluna Acompanhamento). Filtros novos: temperatura,
  serviço de interesse e retorno (atrasado / próximos 7 dias). O formulário
  de novo contato ganhou temperatura e serviço de interesse, e o segmento
  passou a usar a lista da Personalização. Exportação com as colunas novas.
- **Empresas:** nome fantasia e razão social, CNPJ validado e único, UF,
  endereço, responsável pela conta, situação comercial, etiquetas, decisores
  (os contatos marcados) e todas as oportunidades dos contatos da empresa.
  Lista com situação e responsável; filtros por situação, responsável
  ("minhas contas"), UF e etiqueta; busca também por razão social e CNPJ.
- **Oportunidades:** serviço, valor estimado e valor negociado, origem e
  temperatura próprias, motivo do ganho. Card do funil com temperatura,
  serviço, valor negociado e motivo do ganho; total da coluna Ganho pelo
  valor negociado. Filtros novos no funil: temperatura e período (data de
  entrada: 7, 30, 90 dias ou este mês).
- **Exigência que cresce com a etapa:** ver "Regras que o sistema garante".
  Diálogo ao arrastar para Proposta (quando falta algo) e sempre para Ganho.
- **Importação:** coluna CNPJ (reconhecida sozinha) para ligar à empresa
  certa e evitar empresa duplicada; CNPJ inválido é erro na linha.
- **Banco v10:** só acrescenta colunas e a tabela `crm_company_tags`; o único
  preenchimento automático copia a origem do contato para as oportunidades
  dele. Nenhuma empresa recebe situação ou CNPJ inventados.
- **Aviso de SSL do Postgres:** a conexão passa a pedir `sslmode=verify-full`
  explicitamente quando a URL traz `require`/`prefer`/`verify-ca` (o mesmo
  comportamento de hoje: certificado e servidor conferidos), o que tira o
  aviso que aparecia nos registros a cada início de função.
- Testes: `fields-api` e `fields-e2e` em `tests/`.

### Especificação-mestra v1.0 — Fase 1, entrega 1: Personalização, etiquetas e menu (schema v9)

- **Personalização do CRM** (só Administrador): origens, segmentos,
  serviços, motivos de perda, motivos de ganho e tipos de tarefa saem do
  código e vão para o banco. Criar, renomear, descrever, ordenar, arquivar e
  reativar; a tela mostra quantos registros usam cada opção. As opções de
  antes continuam com os mesmos códigos ("Anúncio" passou a "Tráfego pago";
  entrou "Prospecção manual"); os segmentos já usados viraram a lista.
  Motivos de ganho começam com sugestões editáveis; Serviços começa vazio.
- **Etiquetas** em três categorias (Origem, Ação, Classificação), com cor e
  descrição: no painel do contato (aba Detalhes), nas linhas de Contatos, nos
  cards do funil, no filtro de Contatos, no público das Campanhas e na
  exportação. Registra quem aplicou e por onde; aplicar/remover entra no
  histórico. Temperatura (frio/morno/quente) será um campo (entrega 2), não
  etiqueta.
- **Importação**: coluna "Etiquetas" (nomes separados por vírgula; os que não
  existem são avisados e ignorados), origem reconhecida pelas opções
  cadastradas, segmentos novos entram na lista. Desfazer importação continua
  funcionando.
- **Menu agrupado**: Visão geral, Comercial, Operação, Administração. "Funil"
  virou "Funil de vendas"; "Equipe" virou "Usuários e permissões".
- Validação no servidor: só se grava opção ativa (ou a que o registro já
  tem); segmento precisa estar na lista. Auditoria `crm.catalog_change` em
  toda mudança da Personalização.
- Testes: `catalog-api` e `catalog-e2e` em `tests/`.

### Especificação-mestra v1.0 — Fase 0: segurança e base técnica

- Auditoria técnica completa registrada em [`seguranca.md`](./seguranca.md)
  (arquitetura, autenticação, permissões, riscos, LGPD, continuidade).
- Next.js 16.3.5 → 16.4.6 e dependências corrigidas (`npm audit` zerado).
- Prévias da Vercel não alteram mais a estrutura do banco de produção; só a
  publicação oficial (`schemaChangesAllowed` em `src/lib/db.ts`).
- Testes no repositório (`tests/`) e verificação automática em todo PR
  (`.github/workflows/ci.yml`): tipos, lint, build e 6 conjuntos de testes.
- Corrigido o único erro de lint antigo (`IntelligenceSidebar.tsx`), sem
  mudar o comportamento.
- Nada muda na tela.

### Fase 5 — Campanhas (schema v8)

- Nova seção **Campanhas** no menu (Administrador, Gestor e Marketing).
- Montagem em 3 passos na mesma tela: nome e público (etapa, origem,
  responsável, segmento, cidade), mensagem (modelo aprovado pela Meta; cada
  variável vem do primeiro nome, nome, empresa ou responsável do contato, com
  texto reserva, ou de um texto fixo) e revisão. Ao lado, ao vivo: quantos vão
  receber, quem fica de fora e por quê, e como a mensagem chega para os
  primeiros contatos.
- **Só WhatsApp, só "enviar agora"** (sem agendamento por enquanto). O envio
  roda com a página aberta, em lotes de ~5 s (`POST
  /api/crm/campaigns/[id]/send` com `batch`), com barra de progresso, pausar,
  continuar e cancelar. Fechar a página para o envio; ao reabrir aparece
  "Continuar envio".
- Marketing monta e salva rascunhos; **só Administrador e Gestor disparam**.
  Sem intervalo mínimo entre campanhas para a mesma pessoa.
- Resultados por campanha: enviadas, entregues, lidas, responderam (até 3
  dias), viraram oportunidade (até 30 dias), pediram para sair, falharam e
  ficaram de fora, e a lista de cada contato com a situação. A mensagem
  aparece na conversa do contato como "Campanha · nome".
- Descadastro automático por "SAIR" no webhook (a assinatura da Meta continua
  obrigatória).
- Auditoria: `crm.campaign_send` (com quantos receberam e ficaram de fora),
  `crm.campaign_cancel`, `crm.campaign_delete`.
- Banco v8 só acrescenta: tabelas `crm_campaigns` e `crm_campaign_recipients`
  e a coluna `crm_messages.campaign_id`.
- Testes locais usam um servidor falso da Meta (`WHATSAPP_GRAPH_BASE_URL`,
  ignorado em produção).

### Fase 4 — Painel de indicadores

- **Painel** é a nova página inicial do CRM (primeiro item do menu), com a
  faixa de boas-vindas no topo.
- Filtros de período (este mês, mês passado, 7/30/90 dias, este ano ou datas
  livres) e de responsável. O Comercial vê só os próprios números (regra no
  servidor, mesmo pedindo os de outra pessoa).
- Indicadores do período, cada um comparado com o mesmo número de dias logo
  antes: novos leads, novas oportunidades, reuniões e propostas (oportunidades
  que entraram nessas etapas), ganhos e perdidos (quantidade e R$), conversão
  (ganhos ÷ fechados), ticket médio, tempo médio até ganhar e tarefas
  concluídas.
- Gráficos: funil agora (quantidade e valor por etapa), novos leads × ganhos
  semana a semana (mês a mês acima de 92 dias, com opção de tabela), motivos
  de perda e origem dos leads com quantos viraram ganho.
- Tabela por pessoa: em aberto, ganhos, perdidos, conversão, tarefas feitas e
  atrasadas, última atividade; inclui "Sem responsável" quando há trabalho
  sem dono.
- Só lê dados (`src/lib/crm-dashboard.ts`, `GET /api/crm/dashboard`); sem
  mudança no banco. Contatos arquivados ficam fora, como no funil.

### Fase 3 — Usuários e permissões (schema v7)

- Perfis do CRM (Administrador, Gestor, Comercial, Marketing, Sem acesso) com
  as regras acima, aplicadas no servidor em todas as rotas `/api/crm/**`
  (lista, detalhe e cada alteração) e refletidas na tela.
- Seção **Equipe** no menu (só Administrador): perfil de cada pessoa, com
  registro na auditoria. Login, senha e desativação continuam no Intelligence.
- O menu mostra o perfil de quem está usando; quem está "Sem acesso" vê uma
  mensagem em vez do CRM.
- **Migração:** só acrescenta `internal_users.crm_role`, preenchida a partir
  do perfil do Intelligence. Nenhum dado de contatos, oportunidades ou tarefas
  muda.

### Layout com menu lateral e aba Conversas

- **Menu lateral** (azul Legado) com as seções Funil, Conversas, Tarefas,
  Agenda, Contatos e Empresas. Cada uma traz uma linha dizendo para que
  serve, contadores (conversas não lidas, tarefas de hoje/atrasadas) e uma
  dica com o Titan ou o Legacy. Recolhe para só os ícones (fica lembrado no
  navegador) e vira um menu de gaveta no celular.
- O topo de cada página mostra o nome da seção e o que se faz nela, com o
  botão **+ Novo contato**.
- Aba **Conversas**: todas as conversas do WhatsApp, da mais recente para a
  mais antiga, com a **etiqueta da etapa** de cada oportunidade do lead no
  funil, não lidas, janela de 24h, responsável e "Você:" quando a última
  mensagem foi nossa. Filtros: busca, não lidas, etapa e responsável. No
  computador a conversa abre ao lado da lista (com etapa, oportunidades e
  tarefas); no celular, em tela cheia. API: `GET /api/crm/conversations`.
- No funil, arrastar um card até a borda rola o quadro, para alcançar as
  colunas que ficam fora da tela.
- Sem mudança no banco.

### Fase 2 — Funil com oportunidades, tarefas e agenda (schema v6)

- O funil agora mostra **oportunidades**: valor em R$, responsável, previsão
  de fechamento, próxima tarefa e mensagens não lidas no card; cada coluna
  mostra a quantidade e o **total em R$**. Ganhos e perdidos ficam visíveis
  por 30 dias no quadro (continuam no histórico e nos filtros de Contatos).
- Arrastar para **Perdido** pede o motivo; arrastar para **Ganho** comemora.
- Um contato pode ter **várias oportunidades** (ex.: duas unidades). O painel
  do contato ganhou a aba **Negócio e tarefas**: lista de oportunidades,
  edição de título/valor/previsão, nova oportunidade, agendar tarefa (tipo,
  data, horário, responsável) e **registrar o que já aconteceu** (ligação,
  reunião etc. com o resultado).
- Aba **Tarefas** (substitui "Hoje"): mensagens sem resposta, atrasadas, hoje,
  próximos 7 dias, mais adiante e sem data; filtro por responsável; concluir
  com um clique.
- Aba **Agenda**: semana de segunda a domingo com as tarefas e atividades de
  cada dia, navegação entre semanas e filtro por responsável.
- Novo contato e importação criam a oportunidade no funil (opção marcada por
  padrão; dá para desmarcar). Lead que chega pelo WhatsApp também ganha a sua,
  e a resposta dele move para *Em conversa* como antes.
- Faixa de boas-vindas: negócios em aberto (com valor no funil), tarefas para
  hoje/atrasadas, reuniões e ganhos do mês (com valor).
- **Migração:** cada contato virou uma oportunidade com a mesma etapa,
  responsável e datas (título = empresa ou nome); cada "próxima ação" virou
  uma tarefa. Nenhuma coluna antiga foi apagada; a migração pode rodar de novo
  sem duplicar nada. As telas e APIs antigas (mudar etapa/próxima ação pelo
  contato) continuam funcionando e passam pela oportunidade principal.

### Fase 1 — Leads, contatos e empresas (schema v5)

- Empresas como cadastro próprio, com tela **Empresas** (busca, filtros,
  contagem de contatos/no funil/ganhos) e painel para editar nome, segmento,
  cidade, site e observações. Os nomes de empresa já digitados viraram
  empresas na migração.
- Contato ganhou e-mail, cargo, segmento, cidade (da empresa quando houver),
  consentimento com data, descadastro e arquivamento. WhatsApp passou a ser
  opcional quando há e-mail.
- Tela **Contatos**: lista paginada com busca (nome, e-mail, empresa,
  telefone), filtros (etapa, responsável, origem, segmento, cidade,
  consentimento, arquivados), ordenação e exportação CSV.
- **Importação de planilhas** (.xlsx e .csv do Excel/Google Planilhas):
  mapeamento de colunas com sugestão automática, prévia com novos /
  duplicados / erros antes de gravar, padrões de origem, responsável e
  consentimento, histórico e desfazer. Até 5.000 linhas por vez.
- Cores alinhadas à identidade: azul institucional #1F3A63, prata #BFC3C9 e
  branco, nos temas claro e escuro.

### Base (schema v4)

- Funil Kanban com 6 etapas (um card por contato), aba Hoje, painel do contato com conversa do
  WhatsApp (janela de 24h, modelos aprovados, respostas rápidas), notas e
  histórico, temas claro/escuro, mascotes e logo da Legado.
