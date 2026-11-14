# Configurando o CRM de prospecção (WhatsApp Cloud API)

O CRM fica em `/crm` (atalho "CRM · Prospecção" no menu do Intelligence, só
para a equipe). Contatos, funil, próximas ações, notas e histórico funcionam
desde já. Enviar e receber mensagens começa quando o número de prospecção é
ligado à **API oficial do WhatsApp (Cloud API)** pelos passos abaixo.

O número usado aqui é **exclusivo do CRM**: ele não fica instalado em nenhum
celular, e todas as conversas acontecem pelo `/crm`.

## 1. Antes de começar

- **Chip novo**, que consiga receber SMS ou ligação para o código de
  verificação.
- O número **não pode estar em nenhum app do WhatsApp** (nem no comum, nem no
  Business). Se já esteve, apague a conta no app primeiro (Configurações →
  Conta → Apagar conta) e espere alguns minutos.
- Acesso de administrador ao Business Manager da Legado Enterprise.

## 2. App da Meta com o produto WhatsApp

1. Em [developers.facebook.com/apps](https://developers.facebook.com/apps),
   abra o app que já é usado pelo Intelligence (ou crie um do tipo
   **Empresa**) e adicione o produto **WhatsApp**.
2. Quando pedir, vincule o app ao Business Manager da Legado. A Meta cria (ou
   reaproveita) uma **Conta do WhatsApp Business (WABA)**.

## 3. Registrar o número

1. No app: **WhatsApp → Configuração da API → Adicionar número de telefone**.
2. Preencha o **nome de exibição** (ex.: "Legado Enterprise"). Ele passa por
   uma revisão da Meta e aparece para quem recebe as mensagens.
3. Confirme o código que chega por SMS ou ligação.
4. Anote os dois IDs que aparecem na mesma tela:
   - **Identificação do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID`
   - **Identificação da conta do WhatsApp Business** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
5. No [WhatsApp Manager](https://business.facebook.com/wa/manage/), cadastre
   uma **forma de pagamento**. Respostas dentro da janela de 24h não são
   cobradas; modelos (templates) são cobrados por mensagem, conforme a
   categoria. Valores atualizados na
   [tabela da Meta](https://developers.facebook.com/docs/whatsapp/pricing).

## 4. Token permanente (Usuário do sistema)

O mesmo modelo do token do Intelligence: um usuário técnico do Business
Manager, que não expira quando alguém troca de senha.

1. Em [Business Settings](https://business.facebook.com/settings) →
   **Usuários → Usuários do sistema**, use o usuário já existente ou crie um
   (função **Admin**, porque ele vai enviar mensagens).
2. **Adicionar ativos**:
   - **Apps** → o app do passo 2, com controle total;
   - **Contas do WhatsApp** → a WABA do passo 3, com controle total.
3. **Gerar novo token** para esse app, expiração **Nunca**, com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Copie o token na hora (ele não aparece de novo) → `WHATSAPP_ACCESS_TOKEN`.

## 5. Variáveis na Vercel

Em **Project → Settings → Environment Variables** (Production):

| Variável | De onde vem |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | passo 4 |
| `WHATSAPP_PHONE_NUMBER_ID` | passo 3 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | passo 3 (necessário para listar os modelos) |
| `WHATSAPP_APP_SECRET` | app → **Configurações do app → Básico → Chave secreta do aplicativo** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | um texto longo e aleatório, inventado por você |

Depois de salvar, faça um **Redeploy** — as variáveis só valem para deploys
novos. O webhook precisa delas já no ar para o passo seguinte.

## 6. Webhook (mensagens chegando no CRM)

1. No app: **WhatsApp → Configuração → Webhook → Editar**.
2. **URL de retorno de chamada**:
   `https://SEU-DOMINIO/api/whatsapp/webhook/` — com a barra no final.
3. **Verificar token**: o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. **Verificar e salvar**. Em seguida, em **Campos do webhook**, assine
   **messages**.
5. Coloque o app em modo **Ativo** (alternador no topo do painel; pede a URL
   da política de privacidade do site). Em modo de desenvolvimento a Meta não
   entrega as mensagens reais.

Toda entrega é conferida pela assinatura `X-Hub-Signature-256` com a chave
secreta do app. Sem `WHATSAPP_APP_SECRET`, ou com o valor errado, o webhook
recusa tudo (aparece como 401 nos logs da Vercel).

## 7. Modelos de mensagem

Para **começar** uma conversa, ou falar com alguém que não respondeu nas
últimas 24h, o WhatsApp só aceita um modelo aprovado.

1. No WhatsApp Manager → **Modelos de mensagem → Criar modelo**.
2. Categoria **Marketing** para prospecção. Use `{{1}}`, `{{2}}`… onde entram
   dados variáveis (ex.: o nome do contato).
3. A aprovação costuma levar de minutos a algumas horas. Os aprovados aparecem
   sozinhos no botão **Enviar modelo** do CRM.

Exemplo de primeiro modelo:

> Oi, {{1}}! Aqui é o {{2}}, da Legado Enterprise. Conversamos no {{3}} e
> fiquei de te mandar uma ideia de como trazer mais clientes pelo digital.
> Posso te enviar por aqui?

## 8. Testar

1. Do seu celular pessoal, mande uma mensagem para o número de prospecção.
2. Em até 10 segundos ela aparece no `/crm`, na coluna **Novo**, com o contador
   de não lidas e a janela de 24h aberta.
3. Abra o card e responda pelo painel: a mensagem chega no seu celular e o
   status passa por Enviada → Entregue → Lida.

## Como o CRM usa o WhatsApp

- **Janela de 24h**: aberta a cada mensagem do contato. Com ela aberta, o
  painel mostra o campo de texto livre; fechada, só o envio de modelo.
- **Etapas**: quem escreve primeiro entra em **Novo**. Quando um lead
  responde depois de a equipe ter falado com ele, o card vai sozinho para
  **Em conversa** (fica registrado no histórico como automático). As demais
  etapas são movidas pela equipe, arrastando o card ou pelo painel.
- **Anúncios de clique para o WhatsApp**: o contato entra com origem
  **Anúncio**, e o título e o ID do anúncio ficam em "Detalhes e histórico".
- **Consentimento**: só inicie conversa com quem aceitou ser contatado, e
  registre como no campo "Como aceitou ser contatado". Denúncias e bloqueios
  derrubam a qualidade do número e reduzem o limite diário de conversas.
- **Tema**: o botão de sol/lua no topo alterna entre claro e escuro; a escolha
  fica salva no navegador. Sem escolha, segue o tema do sistema.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| "Verificar e salvar" falha | variáveis sem redeploy, URL sem a barra final ou verify token diferente |
| Mensagens não chegam no CRM | campo **messages** não assinado, app em modo de desenvolvimento ou `WHATSAPP_APP_SECRET` errado (401 nos logs) |
| Selo "WhatsApp ainda não conectado" no topo | falta `WHATSAPP_ACCESS_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` |
| "Configure WHATSAPP_BUSINESS_ACCOUNT_ID" ao enviar modelo | falta o ID da WABA |
| Envio falha com "mais de 24 horas" | a janela fechou: use um modelo |
| "Não foi possível falar com o WhatsApp agora" | a Meta não respondeu (rede/instabilidade); tente de novo |
