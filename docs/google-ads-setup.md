# Configurando a integração com o Google Ads

A aba **Google Ads** do `/intelligence` mostra investimento, impressões,
cliques e conversões das contas do Google Ads que a Legado gerencia. Assim
como na integração da Meta, as credenciais ficam só em variáveis de ambiente
do servidor — nunca no código, nunca no navegador — e não existe login do
Google dentro do app: um token de longa duração é gerado **uma única vez**
seguindo os passos abaixo.

São necessários quatro itens: uma **conta gerenciadora (MCC)**, um
**developer token**, um **client OAuth** (ID + secret) e um **refresh
token**.

## 1. Conta gerenciadora (MCC)

Uma conta gerenciadora do Google Ads permite ler todas as contas de clientes
com um único conjunto de credenciais — é o equivalente ao Business Manager
da Meta.

1. Se a Legado ainda não tem uma, crie em
   [ads.google.com/home/tools/manager-accounts](https://ads.google.com/home/tools/manager-accounts/).
2. Vincule cada conta de cliente à MCC (**Contas → Subcontas → +** e enviar
   o convite de vinculação; o cliente aceita dentro da conta dele).
3. Anote o **ID de cliente da MCC** (o número `123-456-7890` no canto
   superior direito do Google Ads) — ele vai em `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

Sem MCC também funciona: deixe `GOOGLE_ADS_LOGIN_CUSTOMER_ID` vazio e o
painel lê todas as contas às quais o usuário Google do passo 5 foi convidado
diretamente.

## 2. Developer token

1. Dentro da **MCC**, abra **Administrador → Central de API** (API Center).
2. Preencha o formulário e aceite os termos. O token nasce com **acesso de
   teste**, que só funciona com contas de teste.
3. Solicite **Acesso básico** (Basic Access) no mesmo lugar. É ele que
   libera a leitura das contas reais dos clientes; a aprovação do Google
   pode levar alguns dias — vale pedir já.

Enquanto o acesso básico não for aprovado, a aba Google Ads mostra para a
equipe a mensagem do próprio Google ("developer token is only approved for
use with test accounts") em vez dos números.

## 3. Projeto no Google Cloud + API do Google Ads

1. Em [console.cloud.google.com](https://console.cloud.google.com/), crie um
   projeto (ex.: `legado-intelligence`).
2. **APIs e serviços → Biblioteca** → procure **Google Ads API** → **Ativar**.

## 4. Tela de consentimento OAuth e client OAuth

1. **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo** (ou
   **Interno**, se a Legado usa Google Workspace), preencha nome e e-mail.
2. Adicione o escopo `https://www.googleapis.com/auth/adwords`.
3. **Publique o app (status "Em produção").** Importante: enquanto o app
   estiver em "Teste", o Google invalida o refresh token após 7 dias e a
   integração para de funcionar sozinha.
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente
   OAuth**, tipo **Aplicativo da Web**, com o URI de redirecionamento
   autorizado `https://developers.google.com/oauthplayground`.
5. Anote o **Client ID** e o **Client secret**.

## 5. Gerar o refresh token (uma única vez)

1. Abra o [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Clique na engrenagem (canto superior direito) → marque **Use your own
   OAuth credentials** → cole o Client ID e o Client secret do passo 4.
3. Em **Step 1**, digite o escopo `https://www.googleapis.com/auth/adwords`
   e clique em **Authorize APIs**. Entre com a conta Google que tem acesso à
   MCC (de preferência uma conta da empresa, não pessoal, para não depender
   de uma pessoa específica).
4. Em **Step 2**, clique em **Exchange authorization code for tokens** e
   copie o **Refresh token**.

O refresh token não expira por tempo (com o app publicado), mas é
invalidado se a pessoa revogar o acesso, trocar a senha da conta Google em
alguns casos, ou se o client OAuth for excluído — aí basta repetir este
passo.

## 6. Variáveis de ambiente no Vercel

Em **Vercel → projeto → Settings → Environment Variables**, cadastre para
**Production** e **Preview**:

| Variável | Valor |
| --- | --- |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | developer token do passo 2 |
| `GOOGLE_ADS_CLIENT_ID` | Client ID do passo 4 |
| `GOOGLE_ADS_CLIENT_SECRET` | Client secret do passo 4 |
| `GOOGLE_ADS_REFRESH_TOKEN` | refresh token do passo 5 |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ID da MCC (com ou sem traços); vazio se não usar MCC |
| `GOOGLE_ADS_API_VERSION` | opcional — padrão `v26`; troque quando o Google descontinuar a versão |

Depois, faça um novo deploy (**Deployments → ⋯ → Redeploy**). Em
**Integrações** (visão da equipe), o cartão "Google Ads" passa para
"Credenciais configuradas".

## 7. Liberar as contas para cada cliente

1. Em **Usuários e acessos**, edite o cliente.
2. As contas do Google aparecem na mesma lista das contas da Meta, com o
   prefixo **"Google Ads ·"**. Marque as do cliente e salve.
3. O cliente passa a ver a aba **Google Ads** no menu, só com as contas
   marcadas. Quem não tem nenhuma conta do Google liberada não vê a aba.

O administrador geral vê todas as contas, sempre.

## Problemas comuns

| Mensagem | Causa provável |
| --- | --- |
| `developer token is only approved for use with test accounts` | O developer token ainda está em acesso de teste — solicite o Acesso básico (passo 2). |
| `Não foi possível renovar o acesso ao Google Ads (OAuth 400: invalid_grant)` | Refresh token expirado/revogado. Confira se o app OAuth está publicado (passo 4.3) e gere um novo (passo 5). |
| `User doesn't have permission to access customer` | A conta não está vinculada à MCC informada, ou o usuário Google do passo 5 não tem acesso a ela. |
| Conta aparece no aviso "não pôde ser carregada" | Erro só naquela conta — os números das demais continuam corretos. Veja o log do Vercel para o detalhe. |

## O que ainda não está incluído

Esta primeira versão cobre a aba Google Ads (KPIs com comparação, evolução
diária e tabela de campanhas). Ainda **não** incluem Google Ads:

- os relatórios em PDF/CSV (continuam só com dados da Meta);
- as Análises estratégicas;
- detalhamento por grupo de anúncios, palavra-chave ou público.

Valores monetários são exibidos em R$ — uma conta configurada em outra moeda
mostraria os números na moeda dela, mas com o símbolo R$.
