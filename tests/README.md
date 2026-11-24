# Testes do CRM

Rodam sozinhos em todo PR (`.github/workflows/ci.yml`) e podem ser rodados à
mão. Usam um Postgres **local e descartável** e um servidor falso da Meta:
nunca tocam o banco real nem enviam mensagens de verdade.

```bash
npm run build                       # uma vez (os testes usam `next start`)
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/crm_test npm test
TEST_DATABASE_URL=... tests/run.sh campaigns-api       # um conjunto só
CRM_TEST_SERVER=dev tests/run.sh                       # com `next dev`
CRM_TEST_SHOTS=.crm-preview tests/run.sh campaigns-e2e # salva screenshots
```

Requisitos: Postgres local (usuário `postgres` sem senha), Node 20+ e o
Chromium do Playwright (`npx playwright install chromium`, ou
`PW_CHROMIUM_PATH` apontando para um Chromium já instalado).

| Conjunto | O que confere |
| --- | --- |
| `schema` | Banco criado do zero e banco atualizado da v7 ficam idênticos; dados existentes sobrevivem; prévia da Vercel não altera a estrutura |
| `dashboard-data` | Todos os números do Painel (Fase 4) para outubro/2026, conferidos à mão |
| `dashboard-e2e` | Painel no navegador: página inicial, filtros, Comercial vê só os seus, todas as seções abrem, tema escuro, celular |
| `campaigns-api` | Campanhas pela API: perfis, quem fica de fora, variáveis, "SAIR", envios simultâneos sem duplicar, entregue/lida/resposta, limite da Meta, cancelar, envio interrompido |
| `campaigns-e2e` | Campanhas no navegador: Marketing monta, Gestor envia, resultados, conversa marcada, tema escuro, celular |
| `catalog-api` | Personalização e etiquetas pela API: quem pode mudar, opção nova/arquivada nos formulários, valor antigo preservado, renomear segmento, etiquetas por perfil, filtro, exportação, importação com etiquetas e segmentos novos |
| `catalog-e2e` | Menu agrupado, tela de Personalização, etiqueta no painel do contato, filtro por etiqueta, card do funil, celular e tema escuro |
| `fields-api` | Entrega 2 pela API: CNPJ (inclusive alfanumérico), aviso de SSL, campos novos do contato e filtros, exigência por etapa (Proposta e Ganho), valor negociado no Painel, origem/temperatura da oportunidade, empresas (CNPJ único, situação, responsável por perfil, etiquetas, decisores), importação com CNPJ, exportação |
| `fields-e2e` | Entrega 2 no navegador: diálogo ao mover para Proposta e Ganho, card e filtros do funil, campos no painel do contato, lista de Contatos, empresa com CNPJ, celular e tema escuro |
| `regression` | Fases 1–3 e layout: webhook assinado, arrastar no funil, tarefa pelo painel, Conversas, Tarefas/Agenda/Contatos/Empresas, prévia de importação, perfis |

Dados de teste: `tests/fixtures/seed-base.ts` (usuários `vitor` Gestor,
`joao` Comercial, `admin` Administrador; senha `crm-teste-123`) e
`seed-campaigns.ts` (usuária `maria` Marketing e contatos para as regras de
campanha). Só rodam contra o banco local de teste.

Ao criar uma fase nova: acrescente um conjunto em `tests/suites/` e registre
em `tests/run.sh`.
