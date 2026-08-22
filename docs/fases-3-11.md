# Fases 3 a 11 — especificação

Detalhamento das fases ainda abertas do [`ROADMAP.md`](../ROADMAP.md). As fases 0, 1 e 2
já estão implementadas.

Cada fase traz: o que a pessoa ganha, o modelo de dados, o algoritmo onde existe
dificuldade real, a interface, os arquivos, os riscos e o critério de "pronto".

Esforço: **P** ≈ uma sessão · **M** ≈ duas ou três · **G** ≈ várias.

---

## Ordem de implementação

Duas leituras da mesma lista. A **dificuldade** diz quanto custa cada fase isolada; os
**blocos** dizem o que faz sentido construir e publicar junto.

### Dificuldade real, do mais fácil ao mais difícil

| | Fase | Esforço | Onde mora a dificuldade |
|---|---|---|---|
| 1º | **4 · Onde estou no meu dia** | P | Nenhuma. Um cartão derivado, num arquivo só. |
| 2º | **8 · Revisão semanal** | M− | Soma sobre dados que já existem; o CSS de barras já existe. O trabalho é de contenção, não de código. |
| 3º | **6 · Momentos + Perceber** | M | Reescrever o fechamento em passos. Muita interface, nenhum algoritmo. |
| 4º | **5 · Pessoas + Lugares** | M | Duas telas fáceis e **uma parte chata**: juntar duplicadas reescrevendo itens. |
| 5º | **3 · Planejado × Aconteceu** | M+ | Algoritmo de casamento de verdade, mais uma migração e a decisão de congelar o passado. |
| 6º | **7 · Check-ins e humor** | M+ | Agendamento próprio e a lógica de se calar sozinho. Risco de produto maior que o técnico. |
| 7º | **9a · Resumo local** | M/G | Fazer texto gerado soar humano **e** ser determinístico. |
| 8º | **11 · Retrospectivas longas** | M/G | Lógica simples, volume grande. Depende de um agregado diário confiável. |
| 9º | **10a · Interpretador local** | G | Um leitor de datas **para trás**, que ainda não existe, mais cinco intenções. |
| 10º | **9b · Resumo por IA** | G | Consentimento, recorte do que sai, cache e queda para o local. |
| 11º | **10b · Pergunta aberta com IA** | G | Recuperar a janela certa sem mandar o banco inteiro. |

Repare que **9 e 10 se dividem**: a metade local é mais fácil e mais valiosa que a metade
com IA. Tratá-las como uma fase só inflaria as duas.

### Correção de dependências

No primeiro rascunho eu marquei dependências que, relendo o código, **não existem**:

- **4 não depende de 3.** O cartão precisa do último registro e do próximo compromisso —
  as duas coisas existem desde a fase 1. Ele pode ser feito hoje.
- **6 não depende de 3.** Só o congelamento do casamento depende; o roteiro de fechamento
  funciona sozinho, e o congelamento entra depois sem retrabalho.
- **8 não depende de 6.** Os destaques da fase 6 enriquecem "principais realizações", mas
  tarefas concluídas já bastam.

Sobram **duas dependências reais**: a fase 10 precisa da fase 5 (para responder sobre
pessoas) e a fase 11 precisa da 8 e da 9a (reaproveita o agregador e o gerador de texto).
Todo o resto é enriquecimento, não bloqueio.

---

## Os seis blocos

Cada bloco é um conjunto que faz sentido publicar junto — e **um lugar legítimo para
parar**. Se você parar no fim de qualquer bloco, o app está inteiro, não pela metade.

### BLOCO A · Leitura pura — **≈ 3 sessões**
> Fases **4** e **8**

Nenhum dado novo, nenhuma migração, nenhum risco. As duas fases só leem o que as fases
0 a 2 já começaram a gravar. É o melhor primeiro passo justamente por isso: enquanto o
banco enche, você entrega valor sem tocar no esquema.

**Ao final:** o app responde "onde estou agora?" e "onde minha semana foi parar?".

---

### BLOCO B · A memória ganha rosto — **≈ 5 sessões**
> Fases **5** e **6**

As duas constroem telas novas sobre o esquema que a fase 0 já criou — `people`, `places`
e `moments` deixam de ser tabelas vazias. É aqui que o app para de ser um organizador e
começa a ser uma memória.

**Ao final:** existe a área de Pessoas, existem Momentos, e fechar o dia virou uma
conversa curta em vez de um formulário.

---

### BLOCO C · O dia em movimento — **≈ 5 sessões**
> Fases **3** e **7**

O primeiro bloco com dificuldade técnica de verdade: um algoritmo de casamento, uma
migração de esquema e um agendador próprio. Também é o bloco onde a contenção de projeto
mais importa — é fácil transformar check-in em cobrança.

**Ao final:** o dia tem duas faces, o que fugiu do plano fica visível, e o app pergunta
como você está sem virar chato.

---

### BLOCO D · Narrativa local — **≈ 5 sessões**
> Fases **9a** e **11**

O app começa a escrever sobre você — sem nenhuma IA, sem nada saindo do aparelho. A fase
11 entra aqui porque reaproveita o gerador de texto da 9a e o agregador da 8.

**Ao final:** cada dia tem um resumo em prosa e existem retrospectivas de mês e de ano.
Este é o último bloco 100% offline — e um ponto de parada perfeitamente defensável.

---

### BLOCO E · A memória consultável — **≈ 4 sessões**
> Fase **10a**

O diferencial do produto, e a razão de tudo que veio antes. Sozinho, responde 8 das 9
perguntas da sua lista — offline, na hora, sem chance de inventar um fato sobre a sua
vida.

**Ao final:** dá para perguntar "quando falei com João pela última vez?" e receber a
resposta com os registros que a sustentam.

---

### BLOCO F · Camada de IA opcional — **≈ 5 sessões**
> Fases **9b** e **10b**

Deixado por último de propósito, e agrupado de propósito: é **todo o código que manda
alguma coisa para fora do aparelho**, atrás de um único consentimento explícito. Se você
decidir que não quer isso, é o único bloco que dá para descartar inteiro sem deixar buraco
— porque 9a e 10a já cobrem o essencial.

**Ao final:** o resumo do dia fica mais natural e perguntas abertas passam a ter resposta.

---

> As fases abaixo seguem em **ordem numérica**, não na ordem dos blocos — é mais fácil
> encontrar "fase 7" procurando por 7. A ordem de execução é a das tabelas acima.

# FASE 3 · Planejado × Aconteceu — **M+** · bloco C

O primeiro momento em que o app deixa de parecer um Todoist.

## O que a pessoa ganha

A linha do tempo do dia passa a mostrar **duas coisas ao mesmo tempo**: o que estava
previsto e o que de fato foi registrado. E o que aconteceu sem estar previsto ganha um
selo — respondendo sozinho à pergunta *"o que aconteceu que não estava na minha agenda?"*.

## Modelo de dados

Os campos já existem desde a fase 0, mas **um precisa mudar de significado**:

```
logs.unplanned   false  →  null | true | false
```

- `null` — o app decide sozinho (padrão)
- `true` / `false` — a pessoa corrigiu à mão, e a correção **sempre vence**

Migração: `schemaVersion` 2 → 3 trocando `false` por `null` nos registros existentes.
São poucas linhas em `migrate()`, e sem isso todo registro antigo apareceria como
"dentro do plano" sem nunca ter sido avaliado.

```
logs.linkedTaskId  id do item planejado que este registro cumpriu (ou null)
```

## O algoritmo: casar registro com plano

O ponto difícil da fase. Um registro casa com um item planejado quando:

```
candidatos = planejados com horário, dentro de ±90 min do registro

pontos por candidato:
  +2  compartilha uma palavra significativa do título
  +1  mesma categoria
  +1  compartilha uma pessoa
  -1  a cada 30 min de distância

casa com o de maior pontuação, desde que a pontuação seja >= 2
senão: fora do plano
```

**Palavra significativa** = normalizada (sem acento, minúscula), com 4+ letras, fora da
lista de palavras vazias (`de, da, do, para, com, sobre, uma, dos, das, pelo, pela…`).
"Reunião" casa com "reunião"; "de" não casa com nada.

O limiar de 2 pontos é deliberadamente conservador: **errar dizendo "fora do plano" é
barato** (a pessoa corrige com um toque), enquanto errar casando dois itens diferentes
esconde um acontecimento que ela queria ver.

## A decisão que não é óbvia: calcular na hora ou gravar?

Se o casamento for sempre calculado na hora, **editar o plano muda o passado** — o dia de
ontem se reescreve quando você mexe numa tarefa antiga. Num app de memória isso é um
defeito grave, não um detalhe.

Regra adotada:

- **Hoje** → calculado na hora, porque o dia ainda está em movimento
- **Dias fechados** → congelado no fechamento (a fase 6 grava o resultado em `days`)
- **Correção manual** → grava em `logs.unplanned` / `logs.linkedTaskId` e vence sempre

## Interface

`S.timeline(date)` passa a marcar cada item com `lane: 'planejado' | 'registrado'` e
`matched: boolean`.

Na tela de Registro, uma coluna só (a tela tem 412 px no celular), com:

- trilho colorido à esquerda: azul = previsto · verde = aconteceu · âmbar = fora do plano
- etiqueta no cartão: `previsto` · `aconteceu` · `fora do plano`
- toque no selo alterna entre "fora do plano" e "estava previsto"
- rodapé do dia: `7 planejadas · 5 concluídas · 2 fora do plano`

Em telas de 620 px ou mais, as duas faixas ficam lado a lado no mesmo eixo de horas.

## Arquivos

- `js/core/store.js` — `timeline()`, novo `matchDay(date)`
- `js/features/match.js` — **novo**, o algoritmo de casamento isolado e testável
- `js/views/registro.js` — as faixas e o selo
- `css/views.css` — trilhos e etiquetas

## Pronto quando

- [ ] Um registro feito no horário de um compromisso aparece casado com ele
- [ ] Um registro sem correspondência aparece como "fora do plano"
- [ ] Alternar o selo à mão sobrevive a recarregar o app
- [ ] Editar uma tarefa de ontem não muda a linha do tempo de ontem
- [ ] O rodapé bate com o que está desenhado acima dele

---

# FASE 4 · Onde estou no meu dia — **P** · bloco A

**A fase mais fácil de todas as que restam, e ela não depende de nenhuma outra.** Não cria
dado nenhum: só lê o último registro e o próximo compromisso, que existem desde a fase 1.
Meia sessão de trabalho — dá para fazer hoje.

## O que a pessoa ganha

Um cartão no topo de Hoje que responde "onde eu estou agora?" sem precisar ler a lista
inteira:

```
Agora · 16:48
Última coisa registrada    Falei com Maria sobre o evento (16:42)
Próxima coisa              Preparar material da igreja — 18:00
Hoje você já registrou 14 acontecimentos.
```

## Lógica

Tudo derivado, nada novo no banco:

- **última coisa** — último `log` de hoje por horário
- **próxima coisa** — o primeiro item de hoje com horário **maior que agora**, olhando
  compromissos **e tarefas com horário** (não só compromissos, que é o erro fácil aqui)
- **contagem** — `stats.logCount`

## Casos de borda que decidem a qualidade

| Situação | O que mostrar |
|---|---|
| Nenhum registro ainda | "Seu dia ainda não tem registros." + botão Fiz agora |
| Nada mais marcado hoje | "Nada mais marcado para hoje." — nunca em tom de cobrança |
| Depois das 22h | Trocar "próxima coisa" pelo primeiro item de amanhã, rotulado `amanhã` |
| Item já passou do horário mas não foi concluído | Continua como "próxima coisa", com `atrasado` |

## Arquivos

`js/views/hoje.js` · `css/views.css`

## Pronto quando

- [ ] O cartão aparece antes de qualquer lista, no topo de Hoje
- [ ] Registrar algo atualiza o cartão sem recarregar a tela
- [ ] Uma tarefa com horário concorre com compromissos pela "próxima coisa"
- [ ] Nenhum texto do cartão soa como cobrança quando o dia está vazio

---

# FASE 5 · Pessoas + Lugares — **M** · bloco B

Duas funções, uma máquina só. A fase 0 já criou os registros e a semeadura; aqui eles
ganham tela e utilidade.

## O que a pessoa ganha

```
João
Última interação   22/08 — Falei sobre os equipamentos
Antes              18/08 — Reunião
                   10/08 — Enviei documento
Próxima ação       Entrar em contato — 25/08
```

E, para quem ela escolher acompanhar: *"faz 30 dias que você não fala com João."*

## Modelo de dados

`people` e `places` já existem. Faltam três campos:

```
people  + track: false          acompanhar esta pessoa
        + trackDays: 30         avisar depois de N dias sem contato
        + nextAction: null      { text, date }
```

## O aviso "faz 30 dias" só existe com convite

Se o app avisar sobre **todo mundo** que já foi mencionado, ele vira uma máquina de
cobrança — e é isso que faz desinstalar. Por isso `track` é **`false` por padrão**: o
aviso só aparece para quem a pessoa marcou explicitamente com "acompanhar".

Na tela de Hoje, no máximo **dois** avisos por vez, e cada um com "agora não", que empurra
por mais 7 dias.

## Buscar as interações de alguém

```js
async function interactions(person) {
  const chaves = new Set([person.key, ...person.aliases.map(identityKey)]);
  // varre logs, tasks e events; casa quando identityKey de qualquer nome bate
  // devolve ordenado por (data + hora) decrescente
}
```

É uma varredura completa de três tabelas. Na escala de uso pessoal — milhares de linhas —
isso custa poucos milissegundos e **não vale otimizar antes de doer**. Se um dia doer, o
caminho é um índice invertido em `people.refs[]`, mantido em `logs.save()`.

## Juntar pessoas duplicadas

O caso real: "João", "João Pedro" e "Joãozinho" são a mesma pessoa. A fase 0 já resolve
acento e caixa; o resto precisa de um gesto.

Na ficha, **"Juntar com…"** abre a lista de pessoas, e ao escolher:

1. mostra quantos itens serão reescritos (*"14 itens passarão a citar João"*)
2. só depois de confirmar, reescreve `people[]` em tarefas, compromissos e registros
3. guarda o nome antigo em `aliases[]` — para a busca continuar encontrando
4. apaga a pessoa absorvida

Reescrever é mais custoso que manter um apelido resolvido na consulta, mas deixa o dado
limpo — e num app cuja proposta é durar anos, isso importa mais.

## Lugares e o trajeto do dia

Mesma ficha, mais o trajeto: os lugares distintos dos registros do dia, na ordem do
relógio.

```
Casa → Trabalho → Almoço → Casa → Igreja
```

Sai de graça da ordem cronológica. **Sem GPS**, confirmado.

## Interface

- `#/pessoas` — lista por recência, com "faz N dias" em cinza
- `#/pessoas?id=per_x` — ficha: interações, próxima ação, acompanhar, anotação, juntar
- `#/lugares` e `#/lugares?id=plc_x` — iguais, mais o trajeto
- entradas novas em **Mais**

## Arquivos

`js/views/pessoas.js` **novo** · `js/views/lugares.js` **novo** · `js/core/store.js` ·
`js/core/router.js` · `js/views/mais.js` · `js/views/hoje.js`

## Pronto quando

- [ ] A ficha lista interações vindas de registros, tarefas e compromissos
- [ ] Juntar duas pessoas mostra a contagem antes e não perde nenhum item
- [ ] O aviso "faz N dias" só aparece para quem foi marcado com acompanhar
- [ ] O trajeto do dia sai na ordem certa

---

# FASE 6 · Momentos + Perceber meu dia — **M** · bloco B

## O que a pessoa ganha

Um tipo novo de registro — o que **valeu a pena perceber**, que não é tarefa nem registro
operacional — e um fechamento de dia que é uma conversa curta em vez de um formulário.

## Modelo de dados

`moments` já existe no esquema. Agora ganha forma:

```
moments  { id, date, time, text,
           kind: 'bom' | 'aprendi' | 'resolvi' | 'gratidao' | 'outro',
           refIds: [],        registros ou tarefas que originaram o momento
           createdAt }

days     + highlights: []     até 3 ids (de logs, tasks ou moments)
         + mood: null
         + nothingImportant / notRemembered: false
         + frozen: { ... }    o casamento da fase 3, congelado no fechamento
```

## O roteiro, em cinco passos

O `closeDay()` atual é uma folha única grande. Vira uma folha com passos, **todos
puláveis**, com indicador de progresso:

| # | Pergunta | Respostas |
|---|---|---|
| 1 | Aconteceu algo que não estava planejado? | **+ Registrar** · Nada importante · **Não lembro** |
| 2 | Até 3 coisas que marcaram o dia | marcar registros que já existem, ou escrever um momento |
| 3 | Alguma coisa que você não quer esquecer? | escrever · pular |
| 4 | Algo que precisa ir para amanhã? | a transferência de pendências que já existe |
| 5 | Como foi seu dia? | o campo de reflexão que já existe + humor de um toque |

Os passos 4 e 5 são o `closeDay()` de hoje, reaproveitado inteiro — inclusive a regra de
**não mover nada sem confirmação**, que deve continuar exatamente como está.

## Por que "Não lembro" não é um detalhe

É ele que separa **registro** de **cobrança**. Sem essa saída, o fechamento vira uma prova
que a pessoa sente que reprovou — e em duas semanas ela para de abrir o app à noite.

Regra: "Não lembro" e "Pular" aparecem em **todos** os cinco passos, sempre no mesmo
lugar da tela, sem letra menor e sem cor apagada.

## "Você lembra?" — o cartão da manhã

Na primeira abertura do dia, se ontem teve registros:

```
Ontem
Você registrou 12 acontecimentos.
Trabalhou, resolveu a pendência dos equipamentos, conversou com João
e participou do culto.
                                              [ Revisar em 1 min ]
```

Condições para aparecer: antes das 12h · ontem tem ao menos 1 registro · ainda não foi
mostrado hoje (`settings.lastRecallShown`). O texto vem do resumo da fase 9 — antes dela,
uma lista simples dos registros.

## Arquivos

`js/views/registro.js` (reescrita do `closeDay`) · `js/core/store.js` (`moments`) ·
`js/views/hoje.js` (cartão da manhã) · `js/ui/forms.js` (editor de momento)

## Pronto quando

- [ ] Dá para fechar o dia respondendo **nada** e sem sensação de erro
- [ ] "Não lembro" existe nos cinco passos
- [ ] Os destaques podem sair de registros que já existem, sem redigitar
- [ ] O fechamento congela o casamento da fase 3 em `days.frozen`
- [ ] A transferência de pendências continua exigindo confirmação

---

# FASE 7 · Check-ins e humor — **M+** · bloco C

Tecnicamente é uma fase média. **O risco não é código** — é o app virar mais uma fonte de
notificação. E quando a pessoa desliga, ela desliga tudo, inclusive os lembretes que
funcionavam.

## Modelo de dados

```
checkins   { id, date, time, mood, note,
             trigger: 'transicao' | 'agendado' | 'manual' }

settings   + checkinsEnabled: false        desligado por padrão
           + checkinTimes: ['08:00','13:00','19:00']
           + checkinMaxPerDay: 3
           + checkinQuiet: { from: '22:00', to: '07:00' }
           + checkinIgnored: 0             ignorados seguidos
           + checkinsPaused: false
```

## Não reaproveitar a tabela de lembretes

Tentador, mas errado: `rebuildAll()` limpa `reminders` e reconstrói **só a partir de
tarefas e compromissos**. Check-ins gravados ali seriam apagados silenciosamente no
primeiro backup restaurado.

O caminho é um módulo próprio, `js/features/checkins.js`, que calcula o próximo horário e
usa `Rem.notify()` — a função de notificação, que é genérica e já existe. Zero
infraestrutura nova, zero risco para os lembretes.

## A regra que protege a função de si mesma

```
se dois check-ins seguidos forem ignorados:
    checkinsPaused = true
    o app para de perguntar

volta a perguntar quando a pessoa responder um check-in por conta própria
```

Um check-in é "ignorado" quando o próximo horário chega sem nenhum registro desde o
anterior. **Silêncio é uma resposta válida** e o app precisa entendê-la como tal.

Teto de 3 por dia, nada dentro do horário de silêncio, e só em transições grandes —
casa→trabalho, trabalho→casa, →igreja, início e fim do dia. **Nunca por tarefa.**

## Interface

Uma faixa em Hoje, sem notificação nenhuma:

```
Como está seu dia até aqui?
🙂 Bem   😐 Normal   😣 Difícil   😴 Cansativo   ⚡ Muito produtivo
```

Um toque grava e a faixa some. Depois de gravar, e só então, aparece "Quer registrar
alguma coisa? Sim / Agora não". **O "por quê?" nunca é obrigatório.**

## Arquivos

`js/features/checkins.js` **novo** · `js/views/config.js` · `js/views/hoje.js` ·
`js/core/store.js`

## Pronto quando

- [ ] Desligado por padrão, e a tela de configuração explica o que vai acontecer
- [ ] Dois ignorados seguidos pausam os avisos sozinhos
- [ ] Nada dispara dentro do horário de silêncio
- [ ] Responder o humor leva um toque e nada mais é exigido
- [ ] Restaurar um backup não apaga nem duplica check-ins

---

# FASE 8 · Revisão semanal — **M−** · bloco A

Tecnicamente é a mais fácil depois da 4: agregação sobre dados que já existem, com o CSS
de barras (`.catbar`, `.spark`) já pronto no painel.

**Mas ela tem um tempo de maturação.** Só fica boa com algumas semanas de registro
acumulado — então construir cedo e olhar depois é melhor do que adiar: o código fica
pronto enquanto o banco enche.

## O que a pessoa ganha

```
Sua semana
31 atividades

TRABALHO       ███████████  18
IGREJA         █████         6
PESSOAL        ████          5
ESTUDOS        ██            2

Principais realizações     …
Pendências                 …
Hábitos                    6 de 7 dias
```

E a semana em acontecimentos, uma linha por dia:

```
Segunda   Reunião + trabalho + academia
Terça     Trabalho + resolver pendência + família
Quarta    Trabalho + igreja
```

## O que o código **não** pode fazer

A regra que você definiu, traduzida em restrições concretas:

- **nenhum percentual de produtividade** — nada de "72%"
- **nenhuma meta** — não existe número a ser batido
- **nenhuma sequência que se perde** — sem "você quebrou 12 dias seguidos"
- as barras são normalizadas **pela maior categoria**, nunca por um alvo
- nada de verde/vermelho julgando o resultado; as cores são as das categorias

O objetivo é responder *"onde minha semana foi parar?"* — não *"você foi produtivo?"*.
Onde couber, mostrar número absoluto em vez de proporção.

## Agregação

Novo `S.weekSummary(from, to)` devolvendo total, por categoria, realizações (concluídas +
destaques da fase 6), pendências, hábitos (recorrentes cumpridas ÷ ocorrências) e uma
linha por dia. `weeklyProgress()` e `dashboard()` já existem e entram como peças.

O CSS `.catbar` e `.spark` do painel já servem — não precisa de gráfico novo.

## A pergunta do fim

*"O que você gostaria de melhorar na próxima semana?"* — campo livre, gravado na semana,
e **mostrado na revisão seguinte** para a pessoa ver o que ela mesma escreveu. Sem isso,
é só uma caixa de texto que ninguém preenche duas vezes.

## Arquivos

`js/views/semana.js` **novo** · `js/core/store.js` · `js/views/mais.js`

## Pronto quando

- [ ] Nenhum percentual de produtividade em lugar nenhum da tela
- [ ] A semana em acontecimentos cabe numa tela de celular
- [ ] A resposta da semana anterior aparece na revisão atual
- [ ] Uma semana vazia mostra algo digno, não um esqueleto com zeros

---

# FASE 9 · Resumo do dia — **M/G** · blocos D e F

Duas versões, e **a ordem entre elas é o ponto**.

## 9a · Resumo por modelo local — **M**

Monta a narrativa a partir da estrutura dos dados, sem IA nenhuma.

```
1. separa os acontecimentos em madrugada / manhã / tarde / noite
2. dentro de cada período, agrupa por categoria
3. preenche frases de ligação a partir de um repertório
4. cita as pessoas encontradas e os lugares
5. fecha com uma frase sobre o que estava planejado e não aconteceu
```

Resultado:

> Você passou a manhã trabalhando, concluiu 2 tarefas e conversou com João.
> À tarde resolveu uma pendência que não estava no plano. À noite participou
> da atividade da igreja. Ficaram 2 tarefas para outro dia.

### A regra que faz isso não parecer robô — nem instável

O repertório de frases precisa variar, ou todo dia sai igual. Mas a escolha **não pode ser
aleatória**: se for, o resumo de ontem muda de texto cada vez que a tela abre.

Um resumo é memória. Memória não se reescreve sozinha.

Então a variação é determinística, semeada pela data: mesma data, mesmo texto, para
sempre. Um `hash(date)` escolhendo dentro do repertório resolve.

Funciona offline, é grátis, não manda nada para fora, e entrega talvez 80% da sensação da
ideia original.

## 9b · Resumo por IA — **G**

Texto melhor e mais natural. A infraestrutura de configuração **já existe** —
`aiEnabled`, `aiEndpoint`, `aiKey`, `aiModel` em `store.js`, e o padrão de chamada em
`js/features/ocr.js` (`POST` com `Authorization: Bearer`), que dá para copiar quase
inteiro.

### O que muda, e por que precisa de consentimento próprio

Hoje a IA opcional recebe **um print**. Aqui ela receberia **o seu diário**. São coisas
diferentes, e juntá-las no mesmo interruptor seria enganoso.

```
settings + aiSummaryEnabled: false     opt-in separado, com texto explícito
```

A tela precisa dizer, sem rodeio, o que sai do aparelho: os registros daquele dia, os
títulos, as pessoas e os horários. Nada de banco inteiro, nunca.

### Guardar o resultado

O resumo gerado vai para `days.summary`, com a data de geração. Ele é feito **uma vez** —
não a cada abertura da tela. Isso economiza chamada, e principalmente mantém a memória
estável.

9a continua sendo o resultado quando não há internet, quando a API falha, ou quando o
opt-in está desligado. Ela não é um degrau descartável: é o piso.

## Arquivos

`js/features/summary.js` **novo** · `js/views/registro.js` · `js/views/config.js` ·
`js/views/hoje.js` (cartão "Você lembra?")

## Pronto quando

- [ ] O resumo local funciona em modo avião
- [ ] Abrir o mesmo dia duas vezes dá exatamente o mesmo texto
- [ ] O opt-in da IA para resumo é separado do de leitura de imagem
- [ ] A tela diz o que exatamente é enviado
- [ ] Falha de rede cai no resumo local sem mensagem de erro assustadora

---

# FASE 10 · Perguntar à minha memória — **G** · blocos E e F

A função mais difícil e a razão de tudo que veio antes.

## 10a · Interpretador local — **G**, mas determinístico

A maior parte das suas perguntas cai em **cinco padrões** com resposta exata:

| Padrão | Exemplo | Vira |
|---|---|---|
| Recuperar um dia | "O que fiz na última quarta?" | `timeline(data)` |
| Última ocorrência | "Quando falei com João pela última vez?" | último item com pessoa = João |
| Contagem em período | "Quantas vezes fui à academia em agosto?" | contar por lugar/categoria no intervalo |
| Soma por categoria | "Quanto tempo dediquei ao trabalho?" | somar duração por categoria |
| Ranking | "Quais tarefas eu mais adiei?" | ordenar por `postponeCount` |

Isso responde **8 das 9 perguntas** que você escreveu — offline, na hora, sem custo e sem
chance de um modelo inventar um fato sobre a sua vida.

### Correção sobre o reaproveitamento do parser de datas

No `ROADMAP.md` eu escrevi que o parser de datas do `nlp.js` "se reaproveita inteiro".
Relendo o código, **isso está otimista demais**: o `parseDate()` é enviesado para o
futuro, porque foi feito para agendar, não para lembrar.

```js
sc.take(/próxima semana|semana que vem/) → addDays(ref, +7)   // não existe "semana passada"
nextWeekdayFrom(ref, w.i, forceNext)                          // "sexta" = a próxima sexta
"dia 27" → se já passou, pula para o mês seguinte
```

O que dá para reaproveitar de verdade: o **scanner** que consome trechos da frase, o
dicionário de dias da semana, os nomes de meses e o normalizador de texto. Isso não é
pouco — mas a resolução em si precisa de uma função irmã, olhando para trás:

```js
// js/features/memory.js
lastWeekdayFrom(ref, i)         "última quarta"
"semana passada"                intervalo completo, não um dia solto
"mês passado" / "em agosto"     intervalo do mês
"últimos 30 dias"               intervalo relativo
```

Repare que perguntas trabalham com **intervalos**, enquanto a captura trabalha com
**datas soltas** — mais um motivo para ser uma função separada, e não um parâmetro extra
na que já existe.

### O problema da pergunta sobre tempo

"Quanto tempo dediquei ao trabalho?" só tem resposta se houver duração — e `durationMin`
existe no modelo desde sempre, mas **quase nunca é preenchido**, porque nada no app pede.

Três saídas, em ordem de honestidade:

1. **Responder em quantidade, não em horas**: *"38 registros de trabalho em agosto"* —
   verdadeiro, e útil.
2. **Estimar por proximidade**: a diferença entre um registro e o próximo, dentro da mesma
   categoria e abaixo de 4 h, é uma aproximação decente do tempo dedicado. Sai de graça
   dos dados que a fase 1 já produz. Precisa aparecer rotulada como **estimativa**.
3. Pedir duração na captura — **descartado**: é exatamente o atrito que a fase 1 removeu.

Recomendação: (1) como resposta, (2) como linha adicional marcada como aproximada.

### Estrutura

```js
// js/features/memory.js
export function parseQuestion(texto, ref)   // → { intent, params } | null
export async function answer(q)             // → { texto, itens[], periodo }
```

Quando `parseQuestion` devolve `null`, a tela oferece a busca global que já existe — que
é uma resposta melhor que "não entendi".

## 10b · Pergunta aberta com IA — **G**

Para o que não cai nos padrões: *"como foram minhas últimas quatro semanas?"*.

**O erro a evitar é mandar o banco inteiro.** O caminho é recuperar localmente só a janela
relevante — as datas, pessoas ou categorias que a pergunta menciona — e enviar **só essa
fatia**, com um teto rígido de itens. Se a janela não couber, resumir por dia antes de
enviar (reaproveitando a fase 9a) e mandar os resumos, não os registros crus.

Mesmo opt-in da fase 9b, mesma exigência de dizer o que sai.

## Interface

Tela `#/memoria`:

- campo de pergunta, com voz
- sugestões prontas em chips, que também ensinam o que dá para perguntar
- resposta em cartão: a frase direta primeiro, os itens que a sustentam embaixo
- **toda resposta mostra de onde veio** — tocar num item abre o registro original

Esse último ponto é o que separa memória de adivinhação: a pessoa precisa poder conferir.

## Arquivos

`js/features/memory.js` **novo** · `js/views/memoria.js` **novo** ·
`js/core/router.js` · `js/views/mais.js` · `js/views/hoje.js`

## Pronto quando

- [ ] As cinco perguntas-padrão respondem sem internet
- [ ] "Última quarta" resolve para trás, não para a próxima quarta
- [ ] Toda resposta permite abrir os itens que a sustentam
- [ ] Pergunta não reconhecida cai na busca, não numa mensagem de erro
- [ ] Nenhuma resposta de estimativa aparece sem estar rotulada como tal

---

# FASE 11 · Retrospectivas longas — **M/G** · bloco D

Mês, trimestre, "como tem sido minha vida". Tecnicamente é a fase 8 com outro intervalo —
mas com um problema novo: **volume**.

## O ganho de arquitetura que já está pronto

Um ano de dados varrido item a item, a cada abertura de tela, fica lento e desperdiça o
trabalho já feito. Mas o `closeDay()` **já grava um resumo por dia** em `days.summary` —
planejado, concluído, pendências, registros, anotações.

Ou seja: `days` já é uma tabela de agregados diários pré-calculados.

A retrospectiva mensal lê **só a tabela `days`** — 30 linhas em vez de milhares. E cai
para os itens brutos apenas nos dias que não foram fechados.

Isso torna a fase 11 barata, mas com uma condição: a fase 6 precisa garantir que
`days.summary` seja gravado **mesmo quando a pessoa pula todos os passos** do fechamento.

## O que entra

- retrospectiva do mês, do trimestre e do ano, no mesmo formato da semana
- **"há um ano você…"** — o mesmo dia em anos anteriores, se houver
- evolução das categorias ao longo dos meses, em números absolutos
- pessoas e lugares mais presentes no período

Sem nota, sem comparação com meta, sem "seu melhor mês" — as mesmas restrições da fase 8.

## Arquivos

`js/views/retrospectiva.js` **novo** · `js/core/store.js` · `js/views/mais.js`

## Pronto quando

- [ ] Um ano de dados abre sem travar no celular
- [ ] Dias não fechados não somem da retrospectiva
- [ ] Nenhum mês é apresentado como melhor ou pior que outro

---

## Duas coisas que valem para todas as fases

**Backup.** A partir da fase 5 o app guarda memória que não existe em nenhum outro lugar.
`backup.js` já cobre as tabelas novas, mas falta o aviso: quando o último backup passar de
14 dias, um cartão discreto em Hoje, com exportação em um toque.

**Migrações.** Cada fase que mexer no esquema sobe `DB_VERSION` e `schemaVersion` e
acrescenta um passo em `migrate()`. O padrão já está montado na fase 0 — o passo novo
entra dentro do `try`, é idempotente, e nunca reescreve o que já está correto.
