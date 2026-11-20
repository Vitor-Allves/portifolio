# CRM da Legado (`/crm`)

Ferramenta interna de prospecção e gestão comercial, só para a equipe (o
mesmo login do Intelligence; logins de clientes não entram). A configuração do
WhatsApp está em [`whatsapp-crm-setup.md`](./whatsapp-crm-setup.md).

## Como está montado

| Parte | Onde |
| --- | --- |
| Tela | `src/app/crm/page.tsx`, componentes em `src/components/crm/` |
| Dados (servidor) | `src/lib/crm.ts` (contatos, mensagens), `crm-deals.ts` (oportunidades), `crm-tasks.ts` (tarefas e atividades), `crm-companies.ts`, `crm-import.ts`, `crm-core.ts` (peças comuns) |
| Tipos e regras puras | `src/lib/crm-types.ts` (etapas, origens, consentimento, telefone, chave de empresa, valores em R$, motivos de perda, tipos de tarefa) |
| APIs | `src/app/api/crm/**` — todas exigem sessão da equipe e conferem o perfil do CRM (`src/lib/crm-auth.ts`, `crm-access.ts`) |
| Perfis | `src/lib/crm-permissions.ts` (tabela do que cada perfil pode) + `crm-access.ts` (checagem por registro e Equipe) |
| WhatsApp | `src/lib/whatsapp.ts` + webhook público assinado em `src/app/api/whatsapp/webhook/` |
| Banco | Postgres; tabelas `crm_*` criadas/migradas por `ensureSchema` em `src/lib/db.ts` |

### Tabelas

- `crm_contacts` — o lead/contato: nome, WhatsApp, e-mail, cargo, empresa
  (`company_id`), segmento/cidade próprios (usados só quando não há empresa),
  origem, indicado por, responsável, consentimento (`consent_status`,
  `consent_source`, `consent_at`), descadastro (`opted_out_at`), arquivamento
  (`archived_at`) e de qual importação veio (`import_id`). A coluna `stage`
  acompanha a oportunidade principal do contato (a aberta mais recente).
  `next_action`/`next_action_at` são da versão antiga: ficam guardadas, mas a
  próxima ação agora é uma tarefa.
- `crm_deals` — oportunidades (os cards do funil): título, valor em centavos
  (`value_cents`), etapa, responsável, previsão de fechamento, motivo e
  detalhe da perda, data em que entrou na etapa e em que fechou. Um contato
  pode ter várias.
- `crm_tasks` — tarefas e atividades: tipo (ligação, reunião, WhatsApp,
  e-mail, tarefa), título, data/hora (`all_day` = sem horário), responsável,
  oportunidade, conclusão com resultado, cancelamento.
- `crm_companies` — empresas; `name_key` é o nome normalizado (sem acento,
  caixa, pontuação e sufixos como LTDA/ME/S.A.) e é único, então "Clínica
  Ribeiro" e "clinica ribeiro ltda" são a mesma empresa.
- `crm_messages` — conversa do WhatsApp; `crm_events` — histórico de cada
  contato (criação, etapa e responsável de cada oportunidade, oportunidades
  criadas/editadas, tarefas criadas/reagendadas/concluídas/canceladas,
  atividades registradas, notas, edições de campo, consentimento, descadastro,
  arquivamento).
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
  | Equipe (definir perfis) | sim | não | não | não |

  Lead de outra pessoa, para o Comercial, responde como "não encontrado".
  O Administrador geral do Intelligence é sempre Administrador do CRM; ninguém
  muda o próprio perfil. Quem nunca teve perfil definido segue o do
  Intelligence (administrador geral/administrador → Administrador, gestor →
  Gestor, analista → Comercial). Toda troca de perfil vai para a auditoria
  (`crm.role_change`, com de → para).

- **Sem duplicidade:** telefone (as duas grafias de celular BR, com e sem o 9)
  e e-mail (sem diferenciar maiúsculas) são únicos — no cadastro, na edição e
  na importação. Empresa é única pelo nome normalizado.
- **Nada se apaga pela tela:** contato sai do funil por *arquivamento*
  (reversível em Contatos → Arquivados). Um lead arquivado que escreve no
  WhatsApp volta sozinho.
- **Histórico:** toda alteração relevante entra no histórico do contato com
  quem fez e quando. Importações, desfazer importação e exportações também vão
  para o registro de auditoria (`audit_log`, visível ao administrador geral).
- **Consentimento e descadastro:** quem escreve primeiro no WhatsApp fica com
  consentimento "sim" (iniciou a conversa). Descadastrados ficam marcados e as
  campanhas (fase 5) vão pulá-los.
- **Perda com motivo:** uma oportunidade só vai para *Perdido* com o motivo
  (sem orçamento, escolheu outra empresa, parou de responder, sem perfil,
  adiou, outro) e um detalhe opcional. Reabrir limpa o motivo; tudo fica no
  histórico.
- **Horários em Brasília:** tarefas são gravadas no fuso de Brasília (-03:00);
  tarefa "dia todo" fica ao meio-dia para não mudar de dia em nenhum fuso.

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
