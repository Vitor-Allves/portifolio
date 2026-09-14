# Acessos por cliente e por pessoa (painel /analise/admin)

Além da senha compartilhada da equipe (`ANALYTICS_DASHBOARD_PASSWORD`, que
continua funcionando como login de administrador de reserva — útil pra
nunca ficar trancado fora), dá pra criar logins individuais de dois tipos:

- **Por cliente**: um ou mais logins nomeados por cliente, cada um restrito
  só às campanhas daquele cliente. Várias pessoas do mesmo cliente não
  precisam mais compartilhar uma única senha — cada uma tem a sua, e dá pra
  revogar uma pessoa sem afetar as outras do mesmo cliente.
- **Da equipe Legado**: um login nomeado por pessoa do time, com nível de
  acesso próprio — **Administrador** (gerencia clientes e a equipe) ou
  **Analista** (só visualiza os painéis, sem acesso à área de admin).

Isso tudo fica guardado num banco Postgres — sem banco configurado, o painel
de admin mostra uma mensagem de "ainda não configurado" em vez de quebrar, e
a senha da equipe (`ANALYTICS_DASHBOARD_PASSWORD`) continua funcionando
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

As tabelas usadas (`client_access`, `client_access_users`, `internal_users`)
são criadas sozinhas na primeira vez que o painel de admin é acessado — não
precisa rodar nenhuma migração manual.

## 2. Criar um acesso para um cliente

1. Entre em `/analise` com a senha da equipe (acesso de administrador).
2. Clique em **Clientes** no cabeçalho (só aparece pra quem loga como
   administrador — nem cliente, nem analista veem esse link).
3. Em **Novo acesso**: dê um nome pro cliente e marque a(s) conta(s) de
   anúncio que ele deve enxergar. Isso cria o cliente com um primeiro login
   (nomeado com o próprio nome do cliente).
4. Opcional — **Restringir filtros, colunas e seções**: por padrão o cliente
   vê tudo que a conta dele tem direito (exceto a área de admin). Abrindo
   essa seção dá pra desmarcar filtros específicos (ex: Objetivo), colunas
   da tabela de Campanhas (ex: CPM) ou seções inteiras do menu (ex: Análises
   com IA, Relatórios) — o que for desmarcado simplesmente some da tela
   desse cliente. "Visão geral" nunca pode ser escondida, pra sempre ter
   algum lugar pro cliente cair ao entrar. Essas restrições valem pra
   qualquer pessoa logada nesse cliente, não por pessoa individualmente.
5. Clique em **Criar acesso** — a senha gerada aparece **uma única vez** na
   tela. Copie e envie pro cliente (WhatsApp, e-mail, etc.) — ela não fica
   salva em nenhum lugar visível depois disso, nem pra você.
6. Pra dar acesso a mais gente do mesmo cliente, clique em "N pessoa(s)" na
   linha do cliente pra expandir, dê um nome e clique em **+ Adicionar**.
   Cada pessoa recebe sua própria senha (mesma regra: aparece uma vez só) e
   pode ser revogada individualmente sem afetar as outras.

As restrições de filtros/colunas/seções só podem ser definidas na criação do
cliente — não dá pra editar as de um cliente já criado depois (mesma
limitação que já existia para as contas de anúncio). Pra mudar, revogue o
acesso antigo e crie um novo.

## 3. Criar um login para a equipe Legado

Na mesma página, abaixo de **Clientes com acesso**, tem a seção **Equipe
Legado**:

1. Preencha nome, e-mail e escolha o nível — **Administrador** (gerencia
   clientes e a equipe, igual à senha compartilhada) ou **Analista** (só
   visualiza os painéis, com acesso a todas as contas, mas sem chegar na
   área de admin).
2. Clique em **Criar login** — a senha gerada aparece uma única vez, copie e
   envie pra pessoa.
3. Pra entrar com esse login, a pessoa preenche o **e-mail** além da senha
   na tela de `/analise/login` (o campo de e-mail fica em branco pra
   clientes e pra quem usa a senha compartilhada).

## 4. Como cada tipo de login acessa

Todo mundo usa a mesma URL (`/analise`) e a mesma tela de login — o que
diferencia é o que foi preenchido:

- Login da equipe (e-mail + senha) → **Administrador** vê tudo e tem acesso
  à área de admin; **Analista** vê tudo mas não tem acesso à área de admin.
- Senha da equipe (`ANALYTICS_DASHBOARD_PASSWORD`, sem e-mail) → equivale a
  um Administrador, sempre disponível mesmo que o banco não esteja
  configurado ou todo mundo tenha sido revogado por engano.
- Senha de um cliente (sem e-mail) → vê só a(s) própria(s) conta(s), sem o
  filtro de clientes (não faz sentido pra quem só tem uma conta) e sem o
  link **Clientes** no cabeçalho.

Essa restrição é aplicada no servidor (não é só uma tela diferente) — os
dados de outras contas nunca chegam a ser enviados pro navegador do cliente.

## Revogar um acesso

- **Cliente inteiro**: na tela de **Clientes**, clique em **Revogar** na
  linha do cliente (pede confirmação) — derruba o cliente e todas as
  pessoas dele de uma vez.
- **Uma pessoa de um cliente**: expanda o cliente ("N pessoa(s)") e clique
  em **Revogar** ao lado do nome dela — as outras pessoas do mesmo cliente
  continuam com acesso normal.
- **Pessoa da equipe**: na seção **Equipe Legado**, clique em **Revogar** na
  linha da pessoa.

Em todos os casos a senha para de funcionar imediatamente — sessões já
abertas continuam válidas até expirar (12h) ou até a pessoa sair e tentar
entrar de novo.

## Segurança

- Nenhuma senha fica salva em texto puro — só um hash (scrypt). Nem você
  consegue ver a senha de novo depois de fechar a tela de criação; só dá
  pra revogar e gerar uma nova.
- Cada sessão carrega, de forma assinada, quais contas e qual nível de
  acesso ela tem — o que aparece no navegador é só conveniência de
  interface; a real restrição acontece nas rotas do servidor antes de
  qualquer dado sair da Vercel.
