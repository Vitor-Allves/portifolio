# CRM da Legado (`/crm`)

Ferramenta interna de prospecção e gestão comercial, só para a equipe (o
mesmo login do Intelligence; logins de clientes não entram). A configuração do
WhatsApp está em [`whatsapp-crm-setup.md`](./whatsapp-crm-setup.md).

## Como está montado

| Parte | Onde |
| --- | --- |
| Tela | `src/app/crm/page.tsx`, componentes em `src/components/crm/` |
| Dados (servidor) | `src/lib/crm.ts` (contatos, mensagens), `crm-companies.ts`, `crm-import.ts`, `crm-core.ts` (peças comuns) |
| Tipos e regras puras | `src/lib/crm-types.ts` (etapas, origens, consentimento, telefone, chave de empresa) |
| APIs | `src/app/api/crm/**` — todas exigem sessão da equipe (`src/lib/crm-auth.ts`) |
| WhatsApp | `src/lib/whatsapp.ts` + webhook público assinado em `src/app/api/whatsapp/webhook/` |
| Banco | Postgres; tabelas `crm_*` criadas/migradas por `ensureSchema` em `src/lib/db.ts` |

### Tabelas

- `crm_contacts` — o lead/contato: nome, WhatsApp, e-mail, cargo, empresa
  (`company_id`), segmento/cidade próprios (usados só quando não há empresa),
  origem, indicado por, responsável, etapa do funil, próxima ação,
  consentimento (`consent_status`, `consent_source`, `consent_at`),
  descadastro (`opted_out_at`), arquivamento (`archived_at`) e de qual
  importação veio (`import_id`).
- `crm_companies` — empresas; `name_key` é o nome normalizado (sem acento,
  caixa, pontuação e sufixos como LTDA/ME/S.A.) e é único, então "Clínica
  Ribeiro" e "clinica ribeiro ltda" são a mesma empresa.
- `crm_messages` — conversa do WhatsApp; `crm_events` — histórico de cada
  contato (criação, etapa, responsável, próxima ação, notas, edições de campo,
  consentimento, descadastro, arquivamento).
- `crm_imports` — cada importação de planilha (quem, quando, contagens, se foi
  desfeita). `crm_quick_replies` — respostas rápidas.

### Regras que o sistema garante

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

## Backups e recuperação

1. **Antes de cada fase ir ao ar**, criar uma cópia do banco no provedor
   (Neon → *Branches* → *Create branch* a partir de `main`, ou um snapshot no
   painel). Se algo der errado, a cópia é o ponto de restauração.
2. **Migrações só acrescentam:** nenhuma coluna ou tabela existente é
   removida; dados antigos continuam onde estavam (ex.: o texto antigo de
   empresa em `crm_contacts.company` foi mantido).
3. **Exportar CSV** (aba Contatos) gera uma cópia legível da base a qualquer
   momento, respeitando os filtros da tela.
4. **Importação errada:** em Importar planilha → Importações recentes →
   *Desfazer*. Remove só os contatos que aquela importação criou **e que
   ninguém mexeu depois** (sem mensagem, sem mudança de etapa/campo); os
   trabalhados ficam e são informados.

## Registro de alterações

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

- Funil Kanban com 6 etapas, aba Hoje, painel do contato com conversa do
  WhatsApp (janela de 24h, modelos aprovados, respostas rápidas), notas e
  histórico, temas claro/escuro, mascotes e logo da Legado.
