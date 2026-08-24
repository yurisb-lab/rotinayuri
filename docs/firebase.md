# Ligar a sincronização — passo a passo

Objetivo: abrir o Rotina no computador e no celular vendo **os mesmos dados**,
sem deixar de funcionar offline.

O app continua lendo e escrevendo no banco local de cada aparelho. A nuvem entra
só para acertar as contas em segundo plano. Se a internet cair, nada muda: o que
ficou pendente sobe na próxima vez que houver conexão.

---

## Antes: publicar o app

A sincronização precisa que o app esteja num endereço HTTPS fixo — o mesmo nos
dois aparelhos. O repositório já traz o fluxo do GitHub Pages
(`.github/workflows/pages.yml`).

1. No GitHub, vá em **Settings → Pages**.
2. Em *Build and deployment → Source*, escolha **GitHub Actions**.
3. Faça um push na `main` (ou rode o fluxo à mão em *Actions → Publicar no GitHub Pages*).

O endereço fica `https://<usuário>.github.io/rotinayuri/`. Todos os caminhos do
app são relativos, então funciona em subpasta sem ajuste nenhum.

---

## 1. Criar o projeto no Firebase

1. Abra <https://console.firebase.google.com> com a sua conta Google.
2. **Criar um projeto** → nome (`rotina` serve) → pode desativar o Google Analytics.

## 2. Criar o banco

1. No menu, **Criação → Firestore Database → Criar banco de dados**.
2. Escolha **modo de produção** (fechado; as regras do passo 5 abrem só para você).
3. Local: `southamerica-east1` (São Paulo) responde melhor daqui.

## 3. Ativar o login com Google

1. **Criação → Authentication → Vamos começar**.
2. Aba **Sign-in method** → **Google** → ativar → escolher o e-mail de suporte → salvar.
3. Aba **Settings → Domínios autorizados** → **Adicionar domínio**:
   acrescente `<usuário>.github.io` (o `localhost` já vem autorizado).

> Esquecer este passo dá o erro `auth/unauthorized-domain` na hora de entrar.

## 4. Pegar a configuração

1. Engrenagem → **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web) e registre o app (apelido: `rotina`).
   Não é preciso marcar o Hosting.
3. Copie o bloco `firebaseConfig` que aparece — o objeto inteiro, das chaves `{` até `}`.

Essas chaves **não são segredo**: elas identificam o projeto, não autorizam nada.
Quem protege os dados são as regras do próximo passo.

## 5. Publicar as regras de segurança

1. **Firestore Database → Regras**.
2. Apague o conteúdo e cole o arquivo [`firestore.rules`](../firestore.rules) deste repositório.
3. **Publicar**.

As regras dizem uma coisa só: cada pessoa autenticada lê e escreve apenas o que
está sob o próprio `uid`. Sem isso, o projeto pode ficar aberto para qualquer um.

## 6. Ligar no app

Em cada aparelho:

1. Abra o app → **Mais → Sincronização**.
2. Cole a configuração do passo 4 → **Salvar e ligar**.
3. **Entrar com o Google** — a mesma conta nos dois aparelhos, senão cada um
   sincroniza com um espaço diferente.

O primeiro aparelho sobe tudo o que já tem. O segundo baixa tudo. A partir daí,
cada rodada leva só o que mudou.

---

## Como saber que está funcionando

Em **Mais → Sincronização**, o cartão de estado mostra *Em dia*, a conta
conectada e a hora da última rodada. Crie uma tarefa num aparelho, espere alguns
segundos, abra o outro: ela aparece.

A sincronização roda sozinha ao abrir o app, alguns segundos depois de cada
alteração, ao voltar para a tela do app e a cada cinco minutos.

## Quando algo dá errado

| O que aparece | O que fazer |
|---|---|
| `auth/unauthorized-domain` | Acrescente o domínio em Authentication → Settings → Domínios autorizados |
| `auth/operation-not-allowed` | O provedor Google não foi ativado no passo 3 |
| "O Firestore recusou o acesso" | As regras do passo 5 não foram publicadas, ou o login foi feito com outra conta |
| "Não consegui carregar o SDK" | Sem internet nesta primeira vez, ou uma rede que bloqueia `gstatic.com` |
| Um aparelho parece atrasado | **Comparar tudo de novo**, na tela de Sincronização |

## O que é sincronizado

Tarefas, compromissos, registros, notas, entrada, categorias, dias fechados,
ocorrências de recorrência, pessoas, lugares, momentos e check-ins.

**Não** sincronizam, de propósito: as configurações do aparelho (tema, horários,
chaves de API) e os lembretes agendados — os avisos são disparados pelo próprio
aparelho e são reconstruídos a partir das tarefas e compromissos.

## Custo

O plano gratuito do Firebase (Spark) dá 50 mil leituras, 20 mil escritas e 1 GB
de armazenamento por dia. Um uso pessoal como este fica em uma fração disso —
uma rodada típica lê e escreve dezenas de documentos, não milhares.

## Como desligar

**Mais → Sincronização → Desligar sincronização.** Os dados continuam neste
aparelho e continuam no Firebase; o aparelho só para de enviar e receber. Para
apagar da nuvem, exclua as coleções no console do Firebase (ou o projeto inteiro).
