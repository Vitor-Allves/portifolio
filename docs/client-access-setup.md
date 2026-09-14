# Acessos por cliente (painel /analise/admin)

Além da senha compartilhada da equipe (`ANALYTICS_DASHBOARD_PASSWORD`, que
enxerga todas as contas), dá para criar um login **exclusivo por cliente**,
restrito só às campanhas dele. Isso fica guardado num banco Postgres — sem
banco configurado, o painel de clientes mostra uma mensagem de "ainda não
configurado" em vez de quebrar, e a senha da equipe continua funcionando
normalmente.

## 1. Conectar um banco Postgres ao projeto

1. Abra o projeto na Vercel → aba **Storage**.
2. Clique em **Connect Database** → escolha um provedor de Postgres (ex:
   **Neon**, tem plano gratuito).
3. Confirme a criação e conecte aos ambientes **Production** e **Preview**.
4. Isso configura automaticamente a variável `DATABASE_URL` (ou
   `POSTGRES_URL`) no projeto — não precisa copiar nada manualmente.
5. Gere um novo deploy depois de conectar (mesma lógica de sempre: variável
   nova só vale a partir do próximo deploy).

A tabela usada (`client_access`) é criada sozinha na primeira vez que o
painel de admin é acessado — não precisa rodar nenhuma migração manual.

## 2. Criar um acesso para um cliente

1. Entre em `/analise` com a senha da equipe (acesso de administrador).
2. Clique em **Clientes** no cabeçalho (só aparece pra quem loga como
   administrador — um cliente não vê esse link).
3. Em **Novo acesso**: dê um nome pro cliente e marque a(s) conta(s) de
   anúncio que ele deve enxergar.
4. Opcional — **Restringir filtros, colunas e seções**: por padrão o cliente
   vê tudo que a conta dele tem direito (exceto a área de admin). Abrindo
   essa seção dá pra desmarcar filtros específicos (ex: Objetivo), colunas
   da tabela de Campanhas (ex: CPM) ou seções inteiras do menu (ex: Análises
   com IA, Relatórios) — o que for desmarcado simplesmente some da tela
   desse cliente. "Visão geral" nunca pode ser escondida, pra sempre ter
   algum lugar pro cliente cair ao entrar.
5. Clique em **Criar acesso** — a senha gerada aparece **uma única vez** na
   tela. Copie e envie pro cliente (WhatsApp, e-mail, etc.) — ela não fica
   salva em nenhum lugar visível depois disso, nem pra você.

As restrições de filtros/colunas/seções só podem ser definidas na criação do
acesso — não dá pra editar as de um cliente já criado depois (mesma
limitação que já existia para as contas de anúncio). Pra mudar, revogue o
acesso antigo e crie um novo.

## 3. Como o cliente acessa

O cliente usa a mesma URL de sempre (`/analise`) e a mesma tela de login —
só que com a senha que você gerou pra ele, em vez da senha da equipe. A
senha digitada é que decide o que a pessoa vê:

- Senha da equipe (`ANALYTICS_DASHBOARD_PASSWORD`) → vê tudo, com o filtro
  de clientes pra alternar entre contas.
- Senha de um cliente → vê só a(s) própria(s) conta(s), sem o filtro de
  clientes (não faz sentido pra quem só tem uma conta) e sem o link
  **Clientes** no cabeçalho.

Essa restrição é aplicada no servidor (não é só uma tela diferente) — os
dados de outras contas nunca chegam a ser enviados pro navegador do cliente.

## Revogar um acesso

Na mesma tela de **Clientes**, clique em **Revogar** ao lado do cliente (pede
confirmação). A senha para de funcionar imediatamente — sessões já abertas
continuam válidas até expirar (12h) ou até a pessoa sair e tentar entrar de
novo.

## Segurança

- As senhas de clientes nunca ficam salvas em texto puro — só um hash
  (scrypt). Nem você consegue ver a senha de novo depois de fechar a tela de
  criação; só dá para revogar e gerar uma nova.
- Cada sessão carrega, de forma assinada, quais contas ela pode ver — o
  filtro no navegador é só conveniência de interface; a real restrição
  acontece nas rotas do servidor antes de qualquer dado sair da Vercel.
