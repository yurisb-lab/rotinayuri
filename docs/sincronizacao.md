# Sincronização entre aparelhos — decisões e como ficou

> **Situação: implementada.** A sincronização com o Firebase existe no app, em
> *Mais → Sincronização*, e vem **desligada**. O passo a passo para ligar está em
> [`firebase.md`](firebase.md); o motor está em `js/features/sync.js` e o
> adaptador em `js/features/firebase.js`. O texto abaixo continua valendo — é o
> raciocínio que levou até aqui, e a última seção diz como cada decisão foi
> resolvida na prática.

## Primeiro, uma correção sobre a premissa

O app **não usa `localStorage`**. Ele usa **IndexedDB**, que é um banco de dados
de verdade dentro do navegador: transações, índices, consultas por faixa, e um
limite prático de **centenas de megabytes** — não os 5 MB do `localStorage`.

O app inclusive já chama `navigator.storage.persist()` no boot, pedindo ao
navegador para não descartar os dados quando o espaço apertar.

Alguns números para dimensionar: um registro do dia ocupa por volta de 300 bytes.
Vinte registros por dia, todos os dias, durante dez anos, dão cerca de **22 MB**.
Não existe um teto chegando.

**Então o banco não é o problema.** O que o IndexedDB não faz é outra coisa:

| Necessidade real | IndexedDB resolve? |
|---|---|
| Guardar anos de rotina | ✅ sim, com folga |
| Consultar rápido | ✅ sim |
| Funcionar offline | ✅ sim, é a base disso |
| **Ver os mesmos dados no celular e no computador** | ❌ não |
| **Backup automático, sem exportar JSON à mão** | ❌ não |
| **Sobreviver a "limpar dados do navegador"** | ❌ não |
| **Trocar de aparelho sem perder nada** | ❌ não |

São essas quatro últimas que pedem Firebase — ou qualquer outro serviço. Vale
nomear direito o que se está comprando: **não é capacidade, é continuidade.**

---

## O que já foi preparado (esquema v3)

Nem tudo precisa ser feito agora. Mas **duas coisas não podem ser feitas depois**,
e por isso já entraram.

### 1. Tombstones — o rastro das exclusões

Quando um item é apagado, a linha **não some**: ela fica com `deletedAt`.

Sem isso, a sincronização quebra de um jeito específico e irritante: você apaga
uma tarefa no celular, o computador nunca fica sabendo, e na primeira
sincronização **a tarefa volta**. O aparelho que ainda a tem a reenvia como
novidade, porque para ele ela nunca deixou de existir.

E isso não é recuperável mais tarde: o que foi apagado **antes** dos tombstones
não deixou rastro nenhum. Por isso a decisão é irreversível-se-adiada.

Está tudo concentrado em `js/core/db.js`, num ponto só:

```js
db.getAll(store)                          // já filtra os apagados
db.getAll(store, { includeDeleted: true }) // o que a sincronização vai usar
db.del(store, id)                          // marca deletedAt
db.purge(store, id)                        // apaga de verdade (apagar tudo, restaurar)
db.purgeTombstones(store, 180)             // limpeza, com folga larga
```

Como **todas** as leituras do app já passavam por `db.js`, essa mudança valeu
uma função e não espalhou `if (!deletado)` por trinta arquivos.

### 2. `updatedAt` em tudo, e um `deviceId`

`updatedAt` é a chave de "quem escreveu por último" — a regra de resolução de
conflito mais simples que funciona. A migração v3 preencheu esse campo em todas
as linhas antigas que não tinham.

`deviceId` é um identificador aleatório deste aparelho, guardado nas
configurações. Serve para atribuir escritas e, no futuro, para não reprocessar
as próprias mudanças voltando do servidor.

### 3. A consulta que a sincronização vai fazer

```js
db.changedSince(store, isoTime)   // tudo que mudou depois de um instante
```

Inclui os tombstones de propósito — uma exclusão é uma mudança.

### 4. Backup já leva tudo

`backup.js` exporta com `includeDeleted: true`. Um backup que perdesse as
exclusões faria itens apagados ressuscitarem ao restaurar em outro aparelho —
exatamente o bug que os tombstones existem para evitar.

---

## O que ficou de fora, de propósito

**Fila de saída (outbox).** Uma lista de mudanças pendentes de envio. Não entrou
porque **dá para adicionar depois sem perder nada**: a primeira sincronização
pode ser uma comparação completa, e a partir dela a fila passa a valer. Ao
contrário dos tombstones, adiar não custa histórico.

**O SDK do Firebase.** Instalar agora seria peso morto: mais de 100 KB de
JavaScript, um passo de build num projeto que hoje não tem nenhum, e uma
promessa de privacidade no README que deixaria de ser verdade.

---

## O caminho quando for a hora

### O que muda no código

A boa notícia é que `js/core/store.js` **nunca fala com o IndexedDB direto** —
sempre passa por `js/core/db.js`. Essa fronteira já existe, e é nela que o
adaptador remoto entra:

```
store.js  →  db.js  →  IndexedDB          (hoje)

store.js  →  db.js  →  IndexedDB          (depois: local continua sendo a fonte
                    ↘  sync.js → Firestore  de verdade; a nuvem é uma réplica)
```

**A regra que não deve ser quebrada:** o app continua lendo e escrevendo local, e
a sincronização acontece em segundo plano. Se o app passar a esperar a rede para
mostrar a tela de hoje, ele perde justamente a qualidade que tem hoje — abrir
instantâneo e funcionar no avião.

### Modelagem no Firestore

Uma coleção por tabela, sob o usuário, com **os mesmos ids que já existem**:

```
usuarios/{uid}/tasks/{id}
usuarios/{uid}/logs/{id}
usuarios/{uid}/people/{id}
...
```

Os ids do app (`tsk_...`, `log_...`) já são únicos e estáveis, então não há
tradução: o mesmo id vale nos dois lados. Isso simplifica muito.

### Resolução de conflito

**Última escrita vence**, comparando `updatedAt`. Para um app de uso pessoal,
onde o mesmo dono edita em dois aparelhos, isso é suficiente e previsível —
mesclagem campo a campo custa caro e resolve um problema que quase não acontece.

Uma exceção que vale tratar à mão: `people.aliases` e `tags` são listas onde a
união é quase sempre a intenção certa.

### Ordem de implementação sugerida

1. Login (Firebase Auth, provavelmente Google) — e a decisão de que o app deixa
   de ser sem-conta
2. `sync.js`: subir o que `changedSince` devolve, baixar o que mudou no servidor
3. Aplicar o que baixou respeitando tombstones e `updatedAt`
4. Indicador de estado na interface (sincronizado / pendente / sem rede)
5. Regras de segurança no Firestore: cada usuário só lê e escreve o próprio
   caminho — isso é obrigatório, não opcional
6. Só então: tempo real, se fizer falta

### O que precisa mudar no README

Hoje ele promete, sem asterisco:

> Nenhum dado sai do aparelho. Não há autenticação, servidor ou banco online.

No dia em que a sincronização existir, essa frase deixa de ser verdadeira e
precisa ser reescrita **antes** de a função ir para o ar, não depois. É a parte
mais fácil de esquecer e a mais importante de não esquecer.

---

## Como ficou, na prática

O que estava previsto e foi feito:

| Previsto | Como ficou |
|---|---|
| `sync.js` subindo `changedSince` e baixando o que mudou | `js/features/sync.js`, dois marcadores por tabela: `syncPushed` (por `updatedAt` local) e `syncPulled` (pelo horário do servidor) |
| Aplicar respeitando tombstones e `updatedAt` | `mesclar()` — última escrita vence; `tags` e `aliases` se unem; `deletedAt` viaja como qualquer campo |
| Indicador de estado na interface | Tela *Sincronização*: desligada / falta entrar / sincronizando / em dia / sem rede / erro |
| Regras de segurança | [`firestore.rules`](../firestore.rules), na raiz do repositório, obrigatórias no passo 5 do guia |
| Login (Firebase Auth com Google) | Pop-up no computador, com queda automática para redirecionamento no celular |
| Reescrever o README **antes** de a função ir para o ar | Feito no mesmo commit |

Decisões tomadas na implementação, que o plano não previa:

- **A fila de saída continua fora**, como o plano dizia que podia. O marcador por
  tabela faz o mesmo trabalho com menos peças: uma rodada perdida não perde nada,
  porque o marcador só avança depois do envio bem-sucedido.
- **O SDK não é embutido.** Ele é importado do CDN do Google sob demanda, e só
  quando a sincronização está ligada. Quem nunca ligar não baixa um byte a mais, e
  o app continua abrindo offline.
- **A paginação da descida usa o documento como marcador** (`startAfter`), não o
  horário. Um lote de 400 documentos gravados no mesmo instante compartilha o
  mesmo `serverAt`; paginar por horário puro perderia o excedente em silêncio.
- **O marcador de subida recua um milissegundo.** A comparação é `>`, e uma linha
  gravada no mesmo milissegundo da última enviada ficaria para trás para sempre.
- **`settings` não sincroniza.** Tema, horários e chaves de API são do aparelho.
  Junto com eles fica a configuração do Firebase — que por isso precisa ser colada
  uma vez em cada aparelho.
- **`reminders` também não.** São derivados de tarefas e compromissos, e o próprio
  aparelho os reconstrói depois de cada descida.

---

## Alternativas que valem considerar antes de decidir

Firebase é uma boa escolha, mas não é a única — e a diferença entre elas é
principalmente **quanto do seu dado passa a viver na infraestrutura de outra
pessoa**.

| Opção | A favor | Contra |
|---|---|---|
| **Firebase / Firestore** | offline nativo, tempo real, fácil de começar | conta Google, dado na nuvem do Google, custo cresce com uso |
| **Supabase** | Postgres, dá para hospedar você mesmo | offline exige mais trabalho manual |
| **CouchDB / PouchDB** | sincronização é o motivo de existir dele | precisa manter um servidor |
| **Arquivo em nuvem** (Drive, Dropbox) | mantém a promessa de privacidade quase intacta | não é sincronização de verdade, e conflito vira dor |

Se o objetivo principal for **não perder os dados**, a última linha resolve com
uma fração do trabalho: exportação automática do backup para uma pasta de nuvem.
Se o objetivo for **usar no celular e no computador ao mesmo tempo**, aí é
sincronização mesmo, e o Firebase é uma escolha defensável.
