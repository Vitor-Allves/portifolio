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
| `schema` | Banco criado do zero e bancos atualizados da v7 e da v12 ficam idênticos; dados existentes sobrevivem (tarefas ganham situação a partir do que estava gravado); prévia da Vercel não altera a estrutura |
| `dashboard-data` | Todos os números do Painel (Fase 4) para outubro/2026, conferidos à mão |
| `dashboard-e2e` | Painel no navegador: página inicial, filtros, Comercial vê só os seus, todas as seções abrem, tema escuro, celular |
| `campaigns-api` | Campanhas pela API: perfis, quem fica de fora, variáveis, "SAIR", envios simultâneos sem duplicar, entregue/lida/resposta, limite da Meta, cancelar, envio interrompido |
| `campaigns-e2e` | Campanhas no navegador: Marketing monta, Gestor envia, resultados, conversa marcada, tema escuro, celular |
| `catalog-api` | Personalização e etiquetas pela API: quem pode mudar, opção nova/arquivada nos formulários, valor antigo preservado, renomear segmento, etiquetas por perfil, filtro, exportação, importação com etiquetas e segmentos novos |
| `catalog-e2e` | Menu agrupado, tela de Personalização, etiqueta no painel do contato, filtro por etiqueta, card do funil, celular e tema escuro |
| `fields-api` | Entrega 2 pela API: CNPJ (inclusive alfanumérico), aviso de SSL, campos novos do contato e filtros, exigência por etapa (Proposta e Ganho), valor negociado no Painel, origem/temperatura da oportunidade, empresas (CNPJ único, situação, responsável por perfil, etiquetas, decisores), importação com CNPJ, exportação |
| `fields-e2e` | Entrega 2 no navegador: diálogo ao mover para Proposta e Ganho, card e filtros do funil, campos no painel do contato, lista de Contatos, empresa com CNPJ, celular e tema escuro |
| `team-api` | Fase 2 pela API: perfis iguais a antes, exceções valendo no servidor (exportar, ver todos, funil, arquivar), "Usuários e permissões" nunca por exceção, ninguém muda o próprio, cargo/departamento, login só do CRM (criar, primeiro acesso, senha nova, desativar) e auditoria |
| `team-e2e` | Fase 2 no navegador: exceção e cargo no painel da pessoa, nova pessoa com senha temporária, desativar, Departamentos na Personalização, exceção valendo para a pessoa, celular e tema escuro |
| `access-api` | Fase 2 · entrega 2 pela API: 2FA de Administrador no login, troca de responsável em lote (prévia, seleção, filtro, histórico), transferência de carteira (inclusive de quem foi desativado), atividade por pessoa, Auditoria (filtros), promoção a Administrador encerra sessões, encerrar sessões |
| `access-e2e` | Fase 2 · entrega 2 no navegador: trocar responsável em lote em Contatos, carteira e atividade no painel da pessoa, Auditoria (filtros, contato abre da linha), celular e tema escuro |
| `tasks-api` | Fase 3 · entrega 1 pela API: atividade interna e tarefa só de empresa, quem vê cada tarefa, lembretes (escolhas válidas, sino, dispensar, reagendar), janela e filtros da agenda, situação e histórico da tarefa, cancelar/reativar, cores e Prioridades na Personalização |
| `tasks-e2e` | Fase 3 · entrega 1 no navegador: agenda em dia/semana/mês com cor por tipo e filtro, formulário de tarefa (interna, de contato, de empresa), situação no histórico, filtros e abas de Tarefas, sino de lembretes, cor de tipo e Prioridades na Personalização, celular e tema escuro |
| `automations-api` | Fase 3 · entrega 2 pela API: só o Administrador mexe, tudo começa desligado, validação, cada automação (1, 2, 3, 4, 5, 6, 10) age uma vez só, falha registrada sem quebrar a ação da pessoa, pausar, Rodar agora e a rota da verificação diária com `CRON_SECRET` de teste, avisos (só a própria pessoa marca como lido), histórico e auditoria, nenhuma mensagem enviada |
| `automations-e2e` | Fase 3 · entrega 2 no navegador: tela Automações (dez regras, Fase 5 travadas, ativar, ajustar, Rodar agora, histórico com o contato), aviso no sino abre o lead, Auditoria, celular e tema escuro |
| `conversations-api` | Fase 4 · entrega 1 pela API: responder assume a conversa, a de outra pessoa é recusada (409, nada enviado) sem "assumir", duas respostas ao mesmo tempo só uma passa, transferir (aviso no sino; só para quem envia e vê o lead), encerrar, atendente desativado não bloqueia, filtros (aguardando, atendimento, etiqueta), tempo de resposta por pessoa e por perfil, histórico |
| `conversations-e2e` | Fase 4 · entrega 1 no navegador: faixa de tempo de resposta, Aguardando, responder assume, etiqueta de atendimento, transferir e aviso no sino de quem recebe, "Assumir e responder", + Tarefa e + Oportunidade, filtro de atendimento, celular e tema escuro |
| `campaign-audience-api` | Fase 4 · entrega 2 pela API: tirar pessoas à mão (prévia, lista paginada com busca, envio sem elas), quem não vê todos os leads só lista os seus, período de cadastro em dias de Brasília (datas inválidas ignoradas), públicos salvos (nome obrigatório, mesmo nome substitui, sem as exclusões, apagar), interessados (automação, "quente", quem pediu para sair não conta) |
| `campaign-audience-e2e` | Fase 4 · entrega 2 no navegador: lista de quem vai receber (buscar, tirar, incluir de volta), período de cadastro, salvar e reusar público, envio sem quem foi tirado, Interessados nos resultados e na lista, celular e tema escuro |
| `clients-api` | Fase 5 · entrega 1 pela API: quem vê e edita clientes (Comercial só os seus, Marketing sem valores, exceção que tira a tela), sugestões (oportunidades ganhas sem contrato, empresas marcadas), Tornar cliente pela oportunidade (sem empresa, não ganha, de outra pessoa, duas vezes, segunda oportunidade vira contrato) e pela empresa (dois cliques ao mesmo tempo), contratos (validação, vence em 30/60 dias, vencido, histórico sem valor para o Marketing), encerrar e reativar (empresa Ex-cliente / Cliente ativo), anotações e auditoria |
| `clients-e2e` | Fase 5 · entrega 1 no navegador: Prontos para virar cliente → Tornar cliente, contrato vindo da oportunidade, novo contrato com vencimento, situação e histórico, empresa ↔ cliente ↔ oportunidade, filtro de vencimento, Marketing sem valores e só leitura, Comercial só os seus, celular e tema escuro |
| `client-followup-api` | Fase 5 · entrega 2 pela API: acompanhamento mensal (validação, mês futuro, um por mês, só o que foi enviado muda, conflito quando outra pessoa salvou antes, histórico), visão do mês (pendentes primeiro, Comercial só os seus, quem já era cliente no mês), automação 7 (cliente em Onboarding + tarefa, contrato novo em cliente existente, sem empresa nada é criado, nada duas vezes), 8 (aviso que abre o cliente, uma vez por data de fim) e 9 (tarefa por cliente sem acompanhamento, uma por mês) |
| `client-followup-e2e` | Fase 5 · entrega 2 no navegador: Acompanhamento de clientes (resumo, pendente → atualizado, mês anterior), registrar este mês e o anterior na aba Acompanhamento, histórico, aviso de contrato no sino abre o cliente, "dia do mês" da automação 9, celular e tema escuro |
| `dashboard-reports-api` | Fase 6 · entrega 1 pela API: cada número do Painel tem a lista com os mesmos registros, filtros de origem, segmento e etapa, oportunidades paradas, receita recorrente contratada (Marketing sem valores), campanhas (só quem vê campanhas), exportação CSV (conteúdo, permissão, auditoria) e Comercial só com os próprios números |
| `dashboard-reports-e2e` | Fase 6 · entrega 1 no navegador: cartões clicáveis, lista do indicador abrindo o contato, filtros de origem e etapa, linha "Agora", exportação só para quem pode, celular e tema escuro |
| `regression` | Fases 1–3 e layout: webhook assinado, arrastar no funil, tarefa pelo painel, Conversas, Tarefas/Agenda/Contatos/Empresas, prévia de importação, perfis |

A rota da verificação diária só funciona com `CRON_SECRET`: o `tests/run.sh`
sobe o servidor de `automations-api` com um valor só de teste; nas outras
suítes ela fica desligada.

Dados de teste: `tests/fixtures/seed-base.ts` (usuários `vitor` Gestor,
`joao` Comercial, `admin` Administrador com 2FA de teste; senha
`crm-teste-123`; `tests/lib/helpers.mjs` gera o código) e
`seed-campaigns.ts` (usuária `maria` Marketing e contatos para as regras de
campanha). Só rodam contra o banco local de teste.

Ao criar uma fase nova: acrescente um conjunto em `tests/suites/` e registre
em `tests/run.sh`.
