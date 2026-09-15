# Usuários e acessos (painel /analise/admin)

Login por **usuário e senha** — sem e-mail, sem convites, sem link de
recuperação. Toda a criação e administração de contas (equipe Legado e
clientes) fica em uma única aba, **Usuários e acessos**, dividida em duas
seções:

- **Equipe Legado**: administradores, gestores, analistas e demais
  funcionários, cada um com um login próprio, um perfil fixo
  (`administrador_geral`, `administrador`, `gestor`, `analista`) e uma
  lista de empresas/contas autorizadas (o `administrador_geral` sempre vê
  todas).
- **Clientes**: empresas atendidas (a *empresa* em si — nome, contas de
  anúncio, permissões padrão) e as *pessoas* que acessam os dados de cada
  uma, com login individual e, se necessário, permissões próprias que
  substituem as da empresa.

Tudo isso fica guardado num banco Postgres — sem banco configurado, o
painel mostra uma mensagem de "ainda não configurado" em vez de quebrar.

## 1. Conectar um banco Postgres ao projeto

1. Abra o projeto na Vercel → aba **Storage**.
2. Clique em **Connect Database** → escolha um provedor de Postgres (ex:
   **Neon**, tem plano gratuito).
3. Confirme a criação e conecte aos ambientes **Production** e **Preview**.
4. Isso configura automaticamente a variável `DATABASE_URL` (ou
   `POSTGRES_URL`) no projeto.
5. Gere um novo deploy depois de conectar.

As tabelas (`internal_users`, `client_access`, `client_access_users`,
`usernames`, `audit_log`, ...) são criadas e migradas sozinhas na primeira
vez que a aplicação roda no ambiente novo — não precisa rodar nenhuma
migração manual.

## 2. Criar o primeiro administrador geral (`bootstrap`)

Antes de existir qualquer conta, alguém precisa criar a primeira. Isso é
feito uma única vez pela rota `/api/analise/bootstrap-admin`, autorizada
pela variável `ANALYTICS_DASHBOARD_PASSWORD` — que a partir daqui **não é
mais um login de reserva** (a instrução do cliente foi remover
completamente esse tipo de fallback): ela só serve para autorizar esta
única chamada, uma vez.

```
POST /api/analise/bootstrap-admin
{
  "bootstrapPassword": "<ANALYTICS_DASHBOARD_PASSWORD>",
  "name": "Seu nome",
  "username": "seu.usuario",
  "password": "uma senha forte, só sua"
}
```

A rota se autodesativa: assim que existir um `administrador_geral` ativo,
toda chamada seguinte é rejeitada, não importa a senha enviada — nunca vira
uma porta permanente. No primeiro login, esse administrador é levado
direto para a configuração obrigatória de **autenticação em duas etapas**
(2FA), exigida para todo `administrador_geral`.

Depois desse passo, `ANALYTICS_DASHBOARD_PASSWORD` pode continuar
configurada (não atrapalha) ou ser removida do projeto — ela não é mais
lida por nenhuma outra rota.

## 3. Criar uma empresa e as pessoas que a acessam

Na aba **Usuários e acessos**, seção **Clientes**:

1. Em **Nova empresa**: nome da empresa + contas de anúncio que ela deve
   enxergar. Opcionalmente, defina permissões padrão (filtros/colunas/
   seções ocultas, ações bloqueadas) que valem para toda pessoa dessa
   empresa.
2. Depois de criada, expanda a empresa na lista e adicione as pessoas:
   nome, nome de usuário, senha inicial + confirmação e, se precisar,
   permissões individuais que substituem as da empresa.
3. A senha inicial só aparece **uma única vez**, com botão de copiar —
   entregue por um canal privado (WhatsApp, presencialmente, etc.), nunca
   por e-mail automático. Depois de fechar a tela, ninguém — nem o
   administrador — consegue vê-la de novo.
4. A conta já está pronta para o primeiro acesso, mas exige trocar a senha
   temporária antes de ver qualquer dado.

## 4. Criar um login para a equipe Legado

Na mesma aba, seção **Equipe Legado**: nome completo, nome de usuário,
senha inicial + confirmação, perfil de acesso (`administrador_geral`,
`administrador`, `gestor` ou `analista`), empresas autorizadas (exceto para
`administrador_geral`, que sempre vê todas) e permissões de módulos/ações.
Uma prévia do acesso efetivo aparece antes de salvar.

## 5. Nomes de usuário

Únicos em toda a plataforma (equipe e clientes compartilham o mesmo
espaço de nomes), sem diferenciar maiúsculas/minúsculas — `Cliente01` e
`cliente01` são o mesmo usuário. Regra: 3 a 32 caracteres, letras
minúsculas, números, ponto, hífen ou underscore, começando com letra.

## 6. Resetar senha (só `administrador_geral`)

Em **Resetar senha**, na linha da pessoa: confirme sua própria senha,
escolha gerar uma senha forte automaticamente ou definir uma manualmente,
e confirme. Isso:

- invalida imediatamente toda sessão aberta da conta (a pessoa precisa
  entrar de novo);
- força a troca da senha temporária no próximo acesso;
- nunca é logado nem fica visível de novo depois de fechar a tela.

Gestores e analistas não têm essa opção, mesmo enxergando a listagem.

## 7. Revogar um acesso

- **Empresa inteira**: botão **Revogar** na linha da empresa — derruba a
  empresa e todas as pessoas dela de uma vez.
- **Uma pessoa** (equipe ou cliente): botão **Revogar** na linha da
  pessoa — as outras contas continuam com acesso normal.

Isso invalida a sessão imediatamente (não espera a expiração de 12h) e
impede novos logins, preservando o histórico da conta e da auditoria — não
existe campo de "status" para reativar por engano.

## 8. Autenticação em duas etapas (2FA)

Obrigatória para `administrador_geral`, via aplicativo autenticador padrão
(TOTP — Google Authenticator, Authy, 1Password, etc.), sem depender de
e-mail. No primeiro login sem 2FA configurado, a pessoa é guiada por um QR
code e recebe 10 códigos de recuperação de uso único (mostrados uma única
vez). Se perder o dispositivo, outro `administrador_geral` pode resetar o
2FA da conta (reautenticando com a própria senha), o que força uma nova
configuração no próximo login.

## Segurança

- Senhas nunca são armazenadas em texto puro nem com criptografia
  reversível — apenas hash Argon2id.
- O backend nunca envia hash ou senha ao navegador, em nenhuma resposta.
- Nada de senha aparece em logs, auditoria ou mensagens de erro.
- Toda requisição a uma rota protegida é reverificada no servidor contra o
  banco de dados (papel, empresas, permissões, sessão revogada) — uma
  mudança de permissão ou uma revogação vale imediatamente, mesmo para
  sessões já abertas.
- Login, reset de senha e troca de senha têm limite de tentativas.
