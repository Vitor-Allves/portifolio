# Modelos de mensagem do WhatsApp (para aprovação da Meta)

Um modelo é a única forma de **começar** uma conversa ou de falar com quem
não escreveu nas últimas 24 horas. Depois de aprovados, aparecem sozinhos no
botão **Enviar modelo** do CRM, com um campo para cada variável.

**Como cadastrar:** [WhatsApp Manager](https://business.facebook.com/wa/manage/)
→ conta **Legado Enterprise** → **Modelos de mensagem → Criar modelo** →
categoria → nome (exatamente como abaixo) → idioma **Português (BR)** → tipo
de variável **Número** (para ficarem `{{1}}`, `{{2}}`…) → corpo → um exemplo
para cada variável → botões → **Enviar para análise**. A
aprovação costuma levar de minutos a algumas horas.

Regras da Meta que já estão respeitadas nos textos: o corpo não começa nem
termina com uma variável, as variáveis são numeradas em ordem e cada uma tem
um exemplo. A Meta pode mudar a categoria na análise (por exemplo, de
Utilidade para Marketing); isso só muda o preço por mensagem.

## 1. `retomada_contato` · Marketing

Para retomar com um lead que conversou com a Legado e esfriou.

> Olá, {{1}}! Aqui é {{2}}, da Legado Enterprise. Conversamos sobre gerar
> demanda para o time comercial da {{3}}. Faz sentido retomarmos essa
> conversa esta semana?

- Exemplos: {{1}} `Ana` · {{2}} `Vitor` · {{3}} `Clínica Exemplo`
- Botões de resposta rápida: `Sim, vamos conversar` · `Agora não`

## 2. `retorno_proposta` · Utilidade

Para acompanhar uma proposta que o lead pediu e ainda não respondeu.

> Olá, {{1}}! Passando para saber se você conseguiu ver a proposta da Legado
> Enterprise para a {{2}}. Se quiser, explico qualquer ponto por aqui ou numa
> ligação rápida.

- Exemplos: {{1}} `Ana` · {{2}} `Clínica Exemplo`
- Botões de resposta rápida: `Tenho dúvidas` · `Vamos marcar uma ligação`

## 3. `lembrete_reuniao` · Utilidade

Para confirmar uma reunião já marcada.

> Olá, {{1}}! Lembrando da nossa reunião {{2}}, às {{3}}. Se precisar mudar o
> horário, é só responder esta mensagem.

- Exemplos: {{1}} `Ana` · {{2}} `amanhã (28/11)` · {{3}} `10h`
- Botões de resposta rápida: `Confirmado` · `Preciso remarcar`

## Depois de aprovados

- Só envie modelo de Marketing para quem aceitou ser contatado (campo
  "Consentimento" do contato). Denúncias derrubam a qualidade do número e o
  limite diário de conversas.
- Quem responde "SAIR" é descadastrado sozinho e deixa de receber campanhas e
  mensagens programadas.
