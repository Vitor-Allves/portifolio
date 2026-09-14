# Configurando a integração com o Gerenciador de Anúncios da Meta

A página `/analise` mostra dados de campanhas de todas as contas de anúncio
que o Business Manager da Legado Enterprise gerencia (contas próprias e
contas de clientes). Para isso funcionar, é preciso gerar um token de acesso
com permissão de leitura na Meta e configurá-lo como variável de ambiente —
o token nunca fica no código, nem é enviado ao navegador.

## 1. Criar um app no Meta for Developers

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps)
   e crie um app do tipo **Empresa** (Business).
2. No painel do app, adicione o produto **Marketing API**.
3. Anote o **App ID** e o **App Secret** (Configurações → Básico). Eles não
   são estritamente necessários para o fluxo de token de sistema abaixo, mas
   vale guardar para uso futuro (renovação de token, outras integrações).

## 2. Criar um Usuário do Sistema (System User)

Um "usuário do sistema" é uma identidade técnica do Business Manager, feita
para integrações — diferente de um token pessoal, ele não expira quando
alguém troca a senha ou sai da empresa.

1. Acesse o [Business Settings](https://business.facebook.com/settings) do
   Business Manager da Legado Enterprise.
2. Vá em **Usuários → Usuários do sistema** e clique em **Adicionar**.
3. Dê um nome (ex: `dashboard-analise`) e defina a função como **Funcionário**
   (não precisa ser Admin — o dashboard só lê dados).
4. Com o usuário do sistema criado, clique em **Adicionar ativos**:
   - Selecione **Contas de anúncio**.
   - Marque todas as contas (próprias e de clientes) que devem aparecer no
     dashboard.
   - Conceda a permissão **Visualizar desempenho** (ou "Analista"/"ads_read")
     — não é necessário dar permissão de edição/gastar.

## 3. Gerar o token de acesso

1. Ainda na tela do usuário do sistema, clique em **Gerar novo token**.
2. Selecione o app criado no passo 1.
3. Marque o escopo **ads_read** (e `business_management` se a listagem de
   contas do Business Manager exigir).
4. Escolha a validade **Nunca expira** (tokens de usuário do sistema podem
   ser gerados sem expiração — evita ter que trocar o token periodicamente).
5. Copie o token gerado — ele só é exibido uma vez.

## 4. Obter o Business ID

Na mesma página de Configurações do Business Manager, o **ID da empresa**
aparece em **Informações do negócio**. É um número, algo como `123456789012345`.

## 5. Configurar as variáveis de ambiente

Copie `.env.example` para `.env.local` (desenvolvimento) e preencha, ou
configure diretamente no painel da Vercel (**Project → Settings →
Environment Variables**), em **Production e Preview**:

| Variável | Valor |
|---|---|
| `META_SYSTEM_USER_TOKEN` | Token gerado no passo 3 |
| `META_BUSINESS_ID` | ID obtido no passo 4 |
| `ANALYTICS_DASHBOARD_PASSWORD` | Uma senha forte só para o time acessar `/analise` |
| `ANALYTICS_SESSION_SECRET` | String aleatória longa — gere com `openssl rand -base64 32` |

Depois de configurar, faça um novo deploy (ou redeploy) para que as
variáveis entrem em vigor. Sem elas, `/analise` mostra uma mensagem de
"integração ainda não configurada" em vez de quebrar.

## Observações importantes

- **Revisão do app / verificação de negócio.** Para ler dados de contas de
  anúncio de clientes (não só contas próprias), a Meta pode exigir que o
  Business Manager esteja verificado. Se a listagem de contas vier vazia ou
  o token falhar com erro de permissão, verifique isso em
  Configurações → Verificação da empresa.
- **Versão da API.** O cliente usa a versão `v21.0` da Graph API
  (`src/lib/meta-ads.ts`). A Meta desativa versões antigas periodicamente —
  confira a [changelog oficial](https://developers.facebook.com/docs/graph-api/changelog)
  de tempos em tempos e atualize a constante `GRAPH_API_VERSION` se
  necessário.
- **Limite de requisições.** A Marketing API tem rate limit por conta de
  anúncio. O dashboard faz cache de 15 minutos nas respostas (não busca dados
  novos a cada carregamento de página) — isso é intencional, não um bug.
- **Segurança do token.** Trate `META_SYSTEM_USER_TOKEN` como uma senha: ele
  dá acesso de leitura a dados de investimento e desempenho reais dos
  clientes da agência. Nunca cole o token em código, commits, ou mensagens —
  apenas nas variáveis de ambiente da Vercel.
