# Configurando o CRM de prospecção (WhatsApp Cloud API)

O CRM fica em `/crm` (atalho "CRM · Prospecção" no menu do Intelligence, só
para a equipe). Contatos, funil, próximas ações, notas e histórico funcionam
desde já. Enviar e receber mensagens começa quando o número de prospecção é
ligado à **API oficial do WhatsApp (Cloud API)** pelos passos abaixo.

O número usado aqui é **exclusivo do CRM**: ele não fica instalado em nenhum
celular, e todas as conversas acontecem pelo `/crm`.

**Configuração atual (27/11/2026):** número +55 15 99665-7419, app da Meta
"Legado CRM" (exclusivo do CRM), conta do WhatsApp "Legado Enterprise"
(`1143191171647030`) no portfólio da Legado, usuário do sistema
"CRMWhatsApp". O botão de WhatsApp do site aponta para esse número.

## 1. Antes de começar

- **Chip novo**, que consiga receber SMS ou ligação para o código de
  verificação.
- O número **não pode estar em nenhum app do WhatsApp** (nem no comum, nem no
  Business). Se já esteve, apague a conta no app primeiro (Configurações →
  Conta → Apagar conta) e espere alguns minutos.
- Acesso de administrador ao Business Manager da Legado Enterprise.

## 2. App da Meta com o produto WhatsApp

1. Em [developers.facebook.com/apps](https://developers.facebook.com/apps),
   crie um app **só para o CRM** (tipo **Empresa**, caso de uso "Conectar-se
   com clientes pelo WhatsApp"). Separado do app do Intelligence: um problema
   no WhatsApp não afeta o Intelligence.
2. Escolha o portfólio **verificado** da Legado. O app fica preso a ele para
   sempre (não dá para trocar depois). Confira o nome do portfólio no topo das
   Configurações: há mais de um com nome parecido.
3. Aceite os termos da plataforma do WhatsApp e clique em **Continuar**: a
   Meta cria uma conta de teste ("Test WhatsApp Business Account", com um
   número de teste dela), que não é usada pelo CRM.

## 3. Registrar o número

1. No app: **Casos de uso → Conectar no WhatsApp → Personalizar → Etapa 2.
   Configuração da produção → Adicionar número de telefone**. Em "Conta do
   WhatsApp", **Criar uma conta do WhatsApp Business** (não a de teste).
2. Preencha o **nome de exibição** (ex.: "Legado Enterprise"). Ele passa por
   uma revisão da Meta e aparece para quem recebe as mensagens.
3. Confirme o código que chega por SMS ou ligação. Antes, confira de outro
   celular (`wa.me/55DDDNÚMERO`) que o número não tem WhatsApp, e se a ligação
   não chegar, use SMS (chamadas de número internacional costumam ser
   silenciadas pelo filtro de spam do celular).
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

1. Em [Business Settings](https://business.facebook.com/settings), **no
   portfólio do app** → **Usuários → Usuários do sistema**, crie um usuário
   **só para o CRM** ("CRMWhatsApp", função **Admin**). Não reaproveite o
   usuário do sistema de outro cliente ou do Intelligence: se ele for removido,
   o envio do CRM para junto.
2. **Atribuir ativos**, com controle total:
   - **Apps** → o app do passo 2;
   - **Contas do WhatsApp** → a conta do passo 3 (confira o código dela).
3. **Só depois de atribuir os dois**, **Gerar token** para esse app,
   expiração **Nunca**, com as permissões `whatsapp_business_messaging` e
   `whatsapp_business_management`. O token guarda os acessos do momento em que
   foi gerado: se a conta do WhatsApp for atribuída depois, gere outro.
4. Copie o token na hora (ele não aparece de novo, começa com `EAA` e tem uns
   200 caracteres) → `WHATSAPP_ACCESS_TOKEN`.
5. Para conferir: [Depurador de token](https://developers.facebook.com/tools/debug/accesstoken/)
   → Tipo "System User", usuário "CRMWhatsApp", expira "Nunca", as duas
   permissões.

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
novos. O webhook precisa delas já no ar para o passo seguinte: **espere o
deploy ficar pronto** antes do "Verificar e salvar" (uma verificação feita
contra o deploy antigo é recusada).

## 6. Webhook (mensagens chegando no CRM)

1. No app: **WhatsApp → Configuração → Webhook → Editar**.
2. **URL de retorno de chamada**:
   `https://SEU-DOMINIO/api/whatsapp/webhook/` — com a barra no final.
3. **Verificar token**: o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. **Verificar e salvar**. Em seguida, em **Campos do webhook**, assine
   **messages**.
5. No cartão da conta (Etapa 2 → Registre seu número), ligue **Assinar
   webhooks**.
6. **Publique o app** (ícone "Publicar" na barra da esquerda; pede a URL da
   política de privacidade, `https://www.legadoenterprise.com.br/privacidade/`,
   em Configurações do app → Básico). Em desenvolvimento a Meta só manda os
   testes do painel, nunca as mensagens reais. Publicado, a página mostra o
   botão "Tirar do ar".

### 6.1 Se o "Teste" chega mas as mensagens reais não

Foi o que aconteceu na primeira ligação (27/11/2026): tudo verde no painel,
mas a tela não completou dois passos por trás. No
[Explorador da Graph API](https://developers.facebook.com/tools/explorer/),
com o app do CRM e um token com `whatsapp_business_management` e
`whatsapp_business_messaging`:

1. Registrar o número com um PIN de 6 dígitos (guarde-o; é a verificação em
   duas etapas do número):
   `POST {PHONE_NUMBER_ID}/register?messaging_product=whatsapp&pin=NNNNNN`
2. Refazer a assinatura da conta: `DELETE {WABA_ID}/subscribed_apps` e depois
   `POST {WABA_ID}/subscribed_apps` (cada um deve voltar `"success": true`).
3. Para conferir: `GET {WABA_ID}/subscribed_apps` lista o app, e
   `GET {PHONE_NUMBER_ID}?fields=status,platform_type,account_mode` mostra
   `CONNECTED`, `CLOUD_API` e `LIVE`.

A partir daí as entregas reais aparecem nos Runtime Logs da Vercel como
`[whatsapp/webhook] entrega recebida`.

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

Os primeiros modelos da Legado, prontos para cadastrar, estão em
[`docs/whatsapp-modelos.md`](./whatsapp-modelos.md).

Exemplo de primeiro modelo:

> Oi, {{1}}! Aqui é o {{2}}, da Legado Enterprise. Conversamos no {{3}} e
> fiquei de te mandar uma ideia de como trazer mais clientes pelo digital.
> Posso te enviar por aqui?

## 8. Testar

1. Do seu celular pessoal, mande uma mensagem para o número de prospecção.
   Os Runtime Logs devem mostrar `entrega recebida { messages: 1 }`.
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
| Mensagens não chegam no CRM | campo **messages** não assinado, app não publicado, `WHATSAPP_APP_SECRET` errado (aviso "assinatura inválida" nos logs) ou o número/assinatura incompletos (seção 6.1) |
| Enviar falha com "Authorization Error" | o token é de um usuário do sistema sem a conta do WhatsApp atribuída |
| Enviar falha com "Object with ID … does not exist … missing permissions" | o token foi gerado antes de a conta do WhatsApp ser atribuída ao usuário do sistema: gere outro token |
| O número não aparece no WhatsApp Manager | o WhatsApp Manager abriu em outro portfólio ou na conta de teste: troque no seletor do topo (conta "Legado Enterprise") |
| Selo "WhatsApp ainda não conectado" no topo | falta `WHATSAPP_ACCESS_TOKEN` ou `WHATSAPP_PHONE_NUMBER_ID` |
| "Configure WHATSAPP_BUSINESS_ACCOUNT_ID" ao enviar modelo | falta o ID da WABA |
| Envio falha com "mais de 24 horas" | a janela fechou: use um modelo |
| "Não foi possível falar com o WhatsApp agora" | a Meta não respondeu (rede/instabilidade); tente de novo |
| Webhook verificado (GET 200 nos logs), mas nenhum POST chega | a conta do WhatsApp não está assinada pelo app (**Assinar webhooks** no cartão da conta), o campo **messages** não está assinado ou o app não foi publicado |

**Para diagnosticar:** os Runtime Logs da Vercel mostram `[whatsapp/webhook]`
em cada verificação e em cada entrega (só contagens: mensagens, status e
ignoradas; nunca telefone nem texto), e um aviso quando a assinatura é
recusada. O botão **Teste** ao lado de um campo do webhook, no app da Meta,
manda um exemplo com um número fictício da Meta: o CRM responde 200 e o
ignora (`ignoredOtherNumber`), sem criar contato. Serve para confirmar que a
Meta consegue entregar e que a chave secreta está certa.
