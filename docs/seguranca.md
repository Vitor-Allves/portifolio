# Segurança, arquitetura e continuidade (CRM + Intelligence)

Registro da auditoria técnica da Fase 0 (especificação-mestra v1.0) e das
regras que valem para todas as fases. Atualizar a cada fase.

## Arquitetura

| Parte | Como é |
| --- | --- |
| Aplicação | Next.js 16 (App Router), React 19, TypeScript. Um único projeto serve o site, o Intelligence (`/intelligence`) e o CRM (`/crm`). |
| Hospedagem | Vercel. As funções rodam em `iad1` (EUA). Prévias de cada branch/PR são publicadas automaticamente. |
| Banco | Postgres no Neon, acessado com `pg` (sem ORM), sempre com parâmetros (`$1`, `$2`…). CRM e Intelligence compartilham o banco e a tabela de usuários (`internal_users`). |
| Estrutura do banco | `ensureSchema` em `src/lib/db.ts`, em versões (`schema_migrations`). Cada versão só acrescenta; roda uma vez e grava a versão. |
| Integrações | Meta Ads (Intelligence, leitura), WhatsApp Business Platform (CRM; ainda sem número conectado em produção). |

## Autenticação

- Login por usuário e senha, compartilhado entre Intelligence e CRM.
- Senhas com **Argon2id** (`src/lib/password.ts`); hashes antigos (scrypt) são
  convertidos no próximo login correto.
- Sessão assinada (HMAC) em cookie `httpOnly`, `SameSite=Lax`, `Secure` em
  produção, válida por 12h. A cada requisição o servidor relê a conta: conta
  desativada, senha redefinida ou sessão encerrada perdem o acesso na hora
  (`session_version`).
- 2FA (TOTP) obrigatório para o **administrador geral** e, desde a Fase 2,
  para todo **Administrador do CRM**; segredo guardado criptografado
  (`src/lib/secret-crypto.ts`), com códigos de recuperação. Promover alguém
  sem 2FA a Administrador encerra as sessões dessa pessoa.
- Encerramento remoto de sessões: o Administrador do CRM desconecta uma
  pessoa de todos os dispositivos (`session_version`).
- Limite de tentativas de login por IP e por usuário (5/min). Hoje vale por
  instância do servidor (memória), não no conjunto: ver pendências.
- Recuperação de senha: feita pelo administrador (não há e-mail no sistema).

## Autorização

- `src/proxy.ts` só barra quem não tem sessão; a decisão real é feita no
  servidor, em cada rota (`src/lib/auth-context.ts`, `src/lib/crm-auth.ts`).
- CRM: perfis Administrador, Gestor, Comercial e Marketing
  (`src/lib/crm-permissions.ts`), conferidos em todas as rotas `/api/crm/**`.
  Desde a Fase 2, cada pessoa pode ter exceções por módulo e ação, aplicadas
  no servidor (`effectiveCapabilities`); "Usuários e permissões" só vem pelo
  perfil Administrador, nunca por exceção.
- Logins só do CRM (Analista sem empresas no Intelligence) são criados,
  redefinidos e desativados no CRM pelo Administrador, sempre confirmando a
  própria senha; os demais continuam com o administrador geral.
  Registro de outra pessoa, para o Comercial, responde como "não encontrado"
  (alterar o id na URL não expõe nada).
- Logins de clientes (Intelligence) nunca entram no CRM.

## Proteção técnica

- HTTPS (Vercel). Cabeçalhos: `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` (`next.config.ts`).
- SQL sempre parametrizado; nenhum HTML vindo de usuário é renderizado.
- Webhook do WhatsApp aceita só chamadas assinadas pela Meta.
- Segredos só em variáveis de ambiente da Vercel; nunca em código, logs ou
  respostas. Em testes, a URL da Meta pode apontar para um servidor falso
  (`WHATSAPP_GRAPH_BASE_URL`), o que é ignorado na Vercel.
- Dependências: `npm audit` sem falhas em 23/11/2026 (Next.js 16.4.6). A
  verificação automática (CI) roda em todo PR.

## Auditoria (registro de ações)

`audit_log` (visível ao administrador geral no Intelligence): acessos e 2FA,
criação/desativação de usuários (Intelligence e logins só do CRM), troca de
perfil e de permissões do CRM (antes → depois), cargo e departamento,
redefinição de senha, encerramento de sessões, importações, desfazer
importação, exportações, disparo/cancelamento/exclusão de campanhas. O
histórico de cada contato (`crm_events`) guarda quem mudou o quê e quando,
inclusive valores e etapas das oportunidades.

## Como as mudanças vão ao ar

1. Cada fase é um PR. A verificação automática (`.github/workflows/ci.yml`)
   roda tipos, lint, build e os testes de `tests/` (banco local descartável e
   Meta falsa; nunca o banco real nem mensagens reais).
2. A prévia da Vercel **não altera a estrutura do banco de produção**
   (`schemaChangesAllowed` em `src/lib/db.ts`): só a publicação oficial faz
   isso. Uma prévia com banco próprio (branch do Neon) pode liberar com
   `ALLOW_SCHEMA_MIGRATIONS=1`.
3. Publicação só quando o responsável pede ("publica"). Antes de mudanças
   estruturais, backup (abaixo).

## Continuidade

**Hoje**
- Plano Free do Neon: restauração para qualquer momento das últimas ~6 horas.
- Exportação CSV de contatos pela tela; desfazer importação.

**Antes de entrarem dados reais (decisão pendente com a diretoria)**
- Neon pago (Launch: restauração de até 7 dias).
- Backup próprio diário criptografado fora do Neon, retenção de 30 diários e
  12 mensais, teste de restauração trimestral.
- Banco em São Paulo (`aws-sa-east-1`) e funções em `gru1`, se aprovado.
- Cópia do banco por prévia (integração Neon–Vercel) e prévias protegidas por
  login da Vercel.

**Restaurar (procedimento)**
1. No Neon, criar uma branch a partir do momento anterior ao problema.
2. Conferir os dados na branch.
3. Trocar `DATABASE_URL` de produção para a branch restaurada (ou restaurar a
   principal), publicar de novo e registrar o ocorrido.

## Resposta a incidentes

1. Conter: desativar o usuário envolvido / encerrar sessões (Intelligence →
   Acessos); trocar o segredo comprometido na Vercel (sessão, Meta, WhatsApp).
2. Avaliar: `audit_log`, histórico dos contatos e logs da Vercel.
3. Corrigir e publicar; restaurar dados se preciso (acima).
4. Registrar o incidente e, se houver dado pessoal afetado com risco aos
   titulares, avaliar comunicação à ANPD e aos titulares (LGPD art. 48).

## LGPD (rascunho, validar com o jurídico)

| Dado | Finalidade | Base legal provável |
| --- | --- | --- |
| Leads e contatos de empresas (nome, cargo, telefone, e-mail) | Prospecção e relacionamento comercial B2B | Legítimo interesse (art. 7º, IX), com descadastro sempre disponível |
| Mensagens e campanhas de WhatsApp | Comunicação comercial | Consentimento registrado no contato (`consent_status`, origem e data); "SAIR" descadastra na hora |
| Clientes ativos e contratos (Fase 5 nova) | Execução do contrato | Execução de contrato (art. 7º, V) |
| Usuários da equipe | Acesso e auditoria | Execução de contrato / legítimo interesse |

- Retenção: definir prazo para leads inativos (sugestão: anonimizar após 24
  meses sem interação, salvo cliente ativo).
- Direitos dos titulares: hoje é possível corrigir, arquivar e exportar pela
  tela; **falta** exportar tudo de um contato e anonimizar sob pedido.
- Transferência internacional: dados processados nos EUA (Vercel `iad1`) e
  na região do Neon; documentar ou mover para São Paulo.

## Achados da auditoria (Fase 0) e situação

| Achado | Gravidade | Situação |
| --- | --- | --- |
| Next.js 16.3.5 com falhas conhecidas (inclusive 3 críticas) | Crítica | **Corrigido**: 16.4.6 |
| Prévias da Vercel podiam alterar o banco de produção | Crítica | **Corrigido**: trava em `db.ts`; falta banco próprio para prévias (decisão de infraestrutura) |
| Outras dependências vulneráveis (`@vercel/functions`, `sharp`, `zod`…) | Alta | **Corrigido** (`npm audit` zerado) |
| Testes fora do repositório, sem verificação automática | Alta | **Corrigido**: `tests/` + CI |
| Sem execução agendada no servidor (automações, filas) | Alta | Pendente: decisão Vercel Pro ou alternativa |
| Plano Hobby da Vercel é para uso não comercial | Alta | Pendente: decisão de plano |
| 2FA não obrigatório para Administrador/Gestor do CRM | Média | **Corrigido** para Administradores (Fase 2); Gestor fica opcional |
| Código 2FA pode ser reutilizado dentro da mesma janela de 30s | Baixa | Pendente (guardar o último código aceito) |
| Limite de tentativas por instância, não global | Média | Pendente (exige Redis/Upstash) |
| Recuperação de senha só pelo administrador | Média | Depende do e-mail (Fase 4) |
| Backups dependentes do plano Free do Neon | Média | Pendente: decisão de plano + rotina própria |
| LGPD sem registro formal; sem exportar/anonimizar titular | Média | Rascunho acima; ferramenta planejada |
| Apagar contato apaga em cascata seu histórico | Baixa | Só "desfazer importação" apaga, e só contatos não trabalhados |
