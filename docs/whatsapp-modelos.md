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

## 1. `mensagem_inicial` · Marketing

O primeiro contato com quem ainda não falou com a Legado.

> Olá, {{1}}! Aqui é {{2}}, da Legado Enterprise. Ajudamos empresas a
> transformar investimento em anúncios em demanda qualificada para o time
> comercial. Posso te mostrar, numa conversa rápida, como isso funciona?

- Exemplos: {{1}} `Ana` · {{2}} `Vitor`
- Botões de resposta rápida: `Quero conhecer` · `Agora não` ·
  `Não quero receber` (este descadastra o lead sozinho no CRM)

## 2. `disparo_acao` · Marketing

Genérico para qualquer ação (condição especial, evento, conteúdo, convite):
o que muda a cada disparo vai inteiro no {{3}}.

> Olá, {{1}}! Aqui é {{2}}, da Legado Enterprise. Passando para te contar
> sobre {{3}}. Quer que eu te envie os detalhes por aqui?

- Exemplos: {{1}} `Ana` · {{2}} `Vitor` · {{3}}
  `uma condição especial para começar a anunciar em dezembro`
- Botões de resposta rápida: `Quero saber mais` · `Agora não` ·
  `Não quero receber` (este descadastra o lead sozinho no CRM)
- Na campanha do CRM: {{1}} = **Primeiro nome do contato**, {{2}} = **Nome do
  responsável**, {{3}} = **Texto fixo** com a ação (até 200 caracteres, numa
  linha só, completando a frase "Passando para te contar sobre…").

## 3. `continuar_conversa` · Utilidade

Genérica: para levar para o WhatsApp uma conversa que começou em outro lugar
(ligação, reunião, evento, e-mail) e ter onde retornar.

> Olá, {{1}}! Aqui é {{2}}, da Legado Enterprise. Podemos continuar nossa
> conversa por aqui? Assim fica mais fácil te dar retorno.

- Exemplos: {{1}} `Ana` · {{2}} `Vitor`
- Botão de resposta rápida: `Sim, pode ser`

## 4. `lembrete_reuniao` · Utilidade

Para confirmar uma reunião já marcada.

> Olá, {{1}}! Passando para lembrar da nossa reunião {{2}}, às {{3}}. Tudo
> certo?

- Exemplos: {{1}} `Ana` · {{2}} `amanhã (28/11)` · {{3}} `10h`
- Botões de resposta rápida: `Tudo certo` · `Preciso remarcar`

## Opcionais

### `retomada_contato` · Marketing

Para retomar com um lead que conversou com a Legado e esfriou.

> Olá, {{1}}! Aqui é {{2}}, da Legado Enterprise. Conversamos sobre gerar
> demanda para o time comercial da {{3}}. Faz sentido retomarmos essa
> conversa esta semana?

- Exemplos: {{1}} `Ana` · {{2}} `Vitor` · {{3}} `Clínica Exemplo`
- Botões de resposta rápida: `Sim, vamos conversar` · `Agora não`

### `retorno_proposta` · Utilidade

Para acompanhar uma proposta que o lead pediu e ainda não respondeu.

> Olá, {{1}}! Passando para saber se você conseguiu ver a proposta da Legado
> Enterprise para a {{2}}. Se quiser, explico qualquer ponto por aqui ou numa
> ligação rápida.

- Exemplos: {{1}} `Ana` · {{2}} `Clínica Exemplo`
- Botões de resposta rápida: `Tenho dúvidas` · `Vamos marcar uma ligação`

## Depois de aprovados

- Só envie modelo de Marketing para quem aceitou ser contatado (campo
  "Consentimento" do contato). Denúncias derrubam a qualidade do número e o
  limite diário de conversas.
- Quem responde "SAIR" (ou toca em "Não quero receber") é descadastrado
  sozinho e deixa de receber campanhas e mensagens programadas.
