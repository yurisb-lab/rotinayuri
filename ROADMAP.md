# Roteiro — de lista de tarefas a "Minha Memória"

> **Estado:** fases 0, 1 e 2 implementadas. O detalhamento técnico das fases 3 a 11,
> com a ordem por dificuldade e os seis blocos de implementação, está em
> [`docs/fases-3-11.md`](docs/fases-3-11.md).
>
> Fases 0 a 11 implementadas, exceto 9b e 10 (a camada de IA e a memória
> consultável). Blocos A, B, C e D concluídos. A contagem de adiamentos da fase 3 foi
> antecipada, porque sem ela o dado dos meses seguintes não existiria. As fases 3 a 11
> continuam abertas.

Este documento organiza as ideias soltas em **12 funções** e as coloca numa ordem de
implementação. Ele parte do que **já existe** no código (PWA local, IndexedDB, NLP em
pt-BR, recorrências, linha do tempo, fechamento do dia) e diz, para cada fase, o que
muda em quais arquivos.

---

## 1. O conceito, em uma frase

O app já faz **Planejar → Executar → Registrar → Revisar**.
As ideias novas empurram o peso do produto para o lado direito dessa seta:

| Memória | Pergunta que responde | Onde já está |
|---|---|---|
| **Futura** | "O que preciso fazer?" | Tarefas, Calendário, Lembretes — pronto |
| **Presente** | "O que estou fazendo agora?" | Registro do dia — parcial |
| **Passada** | "O que realmente aconteceu?" | Histórico — cru, sem interpretação |

O diferencial não é o calendário (todo mundo tem). É a **memória passada consultável**.
Mas ela só existe se a memória presente for barata de alimentar — e é por isso que a
ordem abaixo não é só "fácil → difícil".

---

## 2. Consolidação: 24 ideias → 12 funções

Várias ideias da lista original são a mesma função com nomes diferentes. Agrupando:

| Função | Ideias que ela absorve |
|---|---|
| **F1 · Fiz agora** | botão "Fiz agora", captura sem categorizar, registro por voz |
| **F2 · Captura em lote** | captura inteligente, colar texto, compartilhar de outro app, print |
| **F3 · Planejado × Aconteceu** | linha do tempo real, dois lados do dia, "não estava na agenda" |
| **F4 · Onde estou no meu dia** | âncora no presente, última coisa / próxima coisa |
| **F5 · Pessoas** | área Pessoas, "com quem interagi", "faz 30 dias que…" |
| **F6 · Lugares** | lugares onde estive, trajeto do dia (sem GPS) |
| **F7 · Momentos** | coisas que valeram a pena perceber, "3 coisas que marcaram o dia" |
| **F8 · Fechamento guiado ("Perceber")** | revisão guiada, o que não estava planejado, "Não lembro" |
| **F9 · Check-ins e humor** | perguntas ao longo do dia, check-in de transição, 🙂😐😣😴⚡ |
| **F10 · Resumo do dia** | diário automático, "reconstruir seu dia", "Você lembra?" da manhã |
| **F11 · Revisão semanal** | relatório semanal, barras por categoria, semana em acontecimentos |
| **F12 · Perguntar à minha memória** | memória da rotina, "quando falei com João pela última vez" |

**Projetos + Kanban** ficam de fora dessa lista de propósito — ver seção 7.

---

## 3. O princípio da ordem: dados primeiro

Uma observação antes do roteiro, porque ela muda a ordem pedida.

Ordenar só por dificuldade colocaria a revisão semanal (fácil, é só somar) antes das
pessoas (médio). Seria um erro. **Funções que só leem histórico não valem nada sem
histórico** — e histórico não se implementa, se acumula, em tempo real.

Se o "Perguntar à minha memória" ficar pronto em dezembro, ele só saberá responder
sobre o que foi capturado desde que a captura existiu. Cada mês que a captura não
existe é um mês que a memória nunca terá.

Então a ordem é:

1. **Escrever** — funções que criam dados novos (baratas, e começam a encher o banco hoje)
2. **Mostrar** — funções que exibem o que foi acumulado
3. **Interpretar** — funções que resumem e respondem

Dentro de cada bloco, do mais fácil para o mais difícil. Felizmente isso quase coincide
com a ordem de dificuldade, então você perde pouco e ganha meses de dados.

Esforço: **P** ≈ uma sessão · **M** ≈ duas ou três · **G** ≈ várias.

---

## FASE 0 · Fundação de dados — **P** · ✅ FEITO

Invisível para o usuário, destrava metade do resto. Vale fazer primeiro porque toda
migração de banco depois fica mais cara.

**O que entra**

- `DB_VERSION` 1 → 2 em `js/core/db.js`, com novos stores em `STORES`:
  `people`, `places`, `moments`, `checkins`.
- Campos novos em `logs`: `unplanned` (bool), `triaged` (bool), `moodAt`, `linkedTaskId`.
- Campo novo em `days`: `mood`, `highlights[]` (ids de momentos), `closedAt`.
- Migração que **semeia** `people` e `places` a partir do que já existe.

**Por que é barato:** `db.js` já cria stores e índices de forma declarativa —
`onupgradeneeded` percorre `STORES` e cria o que falta. Bastam entradas novas no objeto
e o bump de versão. E `js/features/search.js` (linhas 77–88) **já tem o agregador** que
extrai pessoas e lugares de tarefas, compromissos e registros: é exatamente a função de
seed, só precisa gravar em vez de devolver.

**Arquivos:** `js/core/db.js`, `js/core/store.js`.

---

## FASE 1 · F1 "Fiz agora" em todas as telas — **P** · ✅ FEITO

A função mais barata da lista inteira e a de maior impacto diário. É ela que enche o
banco para as fases 8–12.

**O que entra**

- Botão fixo **"Fiz agora"** ao lado do `+` atual, presente em toda tela.
- Um toque → grava `log` com `time = agora`, texto por voz ou digitado, e **nada mais**.
  Sem categoria, sem pessoa, sem lugar — a regra é não exigir organização na captura.
- O log nasce com `triaged: false`. A organização acontece depois (fase 2).
- Confirmação discreta: `16:42 — Falei com Maria` num toast, com "desfazer".

**Por que agora:** `js/ui/quickadd.js` já tem `quickLog()` e a captura por voz
(`js/features/speech.js`); `js/views/hoje.js` já monta uma `quickbar`. É promover o que
existe a atalho global, não construir do zero.

**Arquivos:** `js/app.js` (botão global), `js/ui/quickadd.js`, `css/components.css`.

---

## FASE 2 · Captura em lote + triagem — **P** · ✅ FEITO

Ao inspecionar o código, esta fase é **bem menor do que parece**. Boa parte da "captura
inteligente" já existe:

- **Share target já funciona** — declarado no `manifest.webmanifest` e tratado em
  `js/app.js` (linha 129): texto compartilhado de outro app cai no interpretador.
- **Vários itens de uma vez já funcionam** — `NLP.parse()` já quebra o texto e devolve
  uma lista, e `openConfirm()` já mostra N itens numa tela só, com caixinha de incluir
  cada um. Voz, texto e print passam todos por esse mesmo caminho.

**O que realmente falta**

1. **Quebrar por ponto final.** Hoje `NLP.parse()` divide por quebra de linha, `;`, `•`,
   "e depois" e "também preciso" — mas **não por ponto**. É por isso que o seu exemplo
   *"Domingo às 18h tem culto. Antes preciso preparar os slides. Segunda tenho reunião
   às 10."* sai como um item só. Acrescentar `.` ao separador é praticamente uma linha —
   com o cuidado de não quebrar em "18h30." nem em abreviações.
2. **Triagem dos registros crus.** Os logs que a fase 1 grava sem categoria aparecem numa
   faixa em Hoje; um toque atribui categoria, pessoa e lugar. Isso sim é código novo.

**O que não vai sair de graça, e é honesto assumir:** no seu exemplo, transformar
*"Antes preciso preparar os slides"* em **Domingo 15:00** exige inferir que a preparação
vem antes do culto — e *"comprar o material"* em **Sábado**, mais ainda. Isso é raciocínio,
não análise de texto; o interpretador local vai criar os dois itens **sem data**. Duas
saídas: deixar a tela de confirmação (que já existe) receber a data com um toque, ou
mandar só esses casos para a IA opcional da fase 9b. Comece pela primeira.

**Arquivos:** `js/features/nlp.js` (uma linha no separador), `js/views/hoje.js` (triagem).

## FASE 3 · F3 Planejado × Aconteceu — **M**

O primeiro momento em que o app fica visivelmente diferente de um Todoist.

**O que entra**

- A linha do tempo do dia passa a ter **duas faixas**: o que estava previsto e o que foi
  registrado, lado a lado, na mesma escala de horas.
- Marcação **"não estava planejado"**: um registro que não corresponde a nenhum item
  previsto (por horário e por texto) ganha um selo. É o que responde
  *"o que aconteceu que não estava na minha agenda?"*.
- Rodapé do dia: `7 planejadas · 5 concluídas · 2 fora do plano`.

**O que muda:** `S.timeline(date)` em `store.js` já junta compromissos, tarefas
concluídas, registros e notas num array ordenado por hora. Falta marcar cada item com
`lane: 'planejado' | 'registrado'` e rodar o casamento planejado↔registrado.

**Casamento, versão simples:** um registro casa com um item planejado se estiver dentro
de ±90 min **e** compartilhar uma palavra significativa do título. Sem isso, é "fora do
plano". Deixe o usuário corrigir com um toque — a correção vira dado de treino manual,
não estatística.

**Arquivos:** `js/core/store.js` (`timeline`), `js/views/registro.js`, `css/views.css`.

---

## FASE 4 · F4 Onde estou no meu dia — **P**

Fase barata encaixada aqui de propósito: ela não cria dado nenhum, só lê o que as fases
1–3 passaram a produzir. Meia sessão de trabalho.

**O que entra**

Um cartão no topo de Hoje:

```
Agora · 16:48
Última coisa registrada:  Falei com Maria sobre o evento (16:42)
Próxima coisa:            Preparar material da igreja — 18:00
Hoje você já registrou 14 acontecimentos.
```

Tudo derivado: último `log` do dia, próximo `event` com hora futura (`events.upcoming`
já existe), contagem de logs.

**Arquivos:** `js/views/hoje.js`.

---

## FASE 5 · F5 Pessoas + F6 Lugares — **M**

Duas funções, uma máquina só — por isso andam juntas.

**O que entra**

- Tela `#/pessoas`: lista por recência de interação.
- Ficha da pessoa: últimas interações (de `logs`, `tasks.people`, `events.people`),
  próxima ação, e um campo livre de anotação.
- Vínculo automático na gravação: o `nlp.js` **já extrai pessoas** (`parsePeople`,
  linha 325) e lugares (`parsePlace`). Falta o `store.js` fazer *upsert* na tabela
  `people` quando salva, em vez de só guardar a string no item.
- `logs.person` é hoje **uma string**; passa a `people: []` para casar com tarefas e
  compromissos, que já usam array. Migração na fase 0.
- Lugares: mesma ficha, mais o **trajeto do dia** (`Casa → Trabalho → Almoço → Igreja`),
  que sai de graça da ordem cronológica dos registros.
- **Sem GPS.** Confirmado: registro manual é mais simples, mais privado, e o trajeto já
  fica legível. GPS fica como opção distante, se algum dia.

**Cuidado de identidade:** "João", "joão" e "João Pedro" precisam virar a mesma pessoa,
ou a ficha se fragmenta e a função morre. Normalize por texto sem acento em minúsculas
como chave, guarde o nome de exibição, e ofereça "juntar com…" quando surgir parecido.

**Arquivos:** novo `js/views/pessoas.js`, `js/views/lugares.js`, `js/core/store.js`,
`js/features/nlp.js`, `js/core/router.js`, `js/views/mais.js`.

---

## FASE 6 · F7 Momentos + F8 Fechamento guiado — **M**

**O que entra**

- Novo tipo **Momento**: acontecimento que valeu a pena perceber. Não é tarefa, não é
  registro operacional. *"O culto foi muito bom hoje."* / *"Boa conversa com meus filhos."*
- **"Perceber meu dia"** substitui o fechamento atual por um roteiro curto, tudo pulável:
  1. O que aconteceu hoje que não estava planejado? → **[+ Registrar] [Nada importante] [Não lembro]**
  2. Escolha até 3 coisas que marcaram o dia (marcando registros que já existem)
  3. Alguma coisa que não pode ser esquecida?
  4. Algo que precisa ir para amanhã?
- **"Você lembra?"** na primeira abertura do dia seguinte: o resumo de ontem em um cartão,
  com um botão *Revisar em 1 min*.

**Por que "Não lembro" importa:** ele é o que separa registro de cobrança. Sem essa saída,
o fechamento vira uma prova que a pessoa sente que reprovou. Ele deve estar em toda
pergunta do roteiro, não só na primeira.

**O que muda:** `js/views/registro.js` já tem `closeDay()` com resumo e transferência de
pendências (que só age com confirmação — mantenha assim). É reescrever esse fluxo como
etapas.

**Arquivos:** `js/views/registro.js`, `js/core/store.js`, `js/views/hoje.js`.

---

## FASE 7 · F9 Check-ins e humor — **M**, com risco de projeto

Tecnicamente médio. O risco não é código — é o app virar mais uma fonte de notificação
que a pessoa desliga. E quando desliga, desliga tudo.

**O que entra**

- Check-in de transição, só em **grandes** mudanças de contexto (casa→trabalho,
  trabalho→casa, →igreja, início e fim do dia). Nunca por tarefa.
- Pergunta curtíssima com resposta de um toque: 🙂 Bem · 😐 Normal · 😣 Difícil ·
  😴 Cansativo · ⚡ Muito produtivo. O "por quê?" é opcional e vem depois, se vier.
- Configurável e silenciável por período, com teto de check-ins por dia.

**Reaproveitamento:** `js/features/reminders.js` já agenda e dispara notificações da PWA;
os horários de transição podem ser lembretes de um tipo novo, sem infraestrutura nova.

**Regra de projeto:** teto padrão de **3 por dia**, e se dois seguidos forem ignorados, o
app para de perguntar até você voltar a responder. Silêncio é resposta válida.

**Arquivos:** `js/features/reminders.js`, `js/views/config.js`, `js/core/store.js`.

---

## FASE 8 · F11 Revisão semanal — **M**

Tecnicamente fácil (é agregação sobre dados que já existem), mas colocada aqui porque só
fica boa depois que as fases 1–7 encheram algumas semanas.

**O que entra**

- Domingo: total de atividades, distribuição por categoria em barras, principais
  realizações, pendências, hábitos.
- **Semana em acontecimentos** — uma linha por dia, em texto:
  `Terça · Trabalho + resolver pendência + família`.
- Uma pergunta aberta ao final: *"O que você gostaria de melhorar na próxima semana?"*

**O que muda:** `S.weeklyProgress()` e `S.dashboard()` já existem em `store.js`, e
`js/views/dashboard.js` já desenha distribuição por categoria — a revisão semanal é uma
tela nova que reusa os dois.

**A regra que você mesmo definiu, e que vale respeitar no código:** mostrar
*"onde minha semana foi parar"*, nunca *"você foi produtivo 72%"*. Na prática: nada de
percentual de produtividade, nada de meta, nada de sequência que se "perde". Barras
comparam categorias entre si, não com um ideal.

**Arquivos:** novo `js/views/semana.js`, `js/core/store.js`.

---

## FASE 9 · F10 Resumo do dia (diário automático) — **M/G**

**Duas versões, e a ordem entre elas é o ponto.**

**9a · Resumo por modelo local — M.** Monta a narrativa a partir da estrutura dos dados,
sem IA: agrupa registros por período (manhã/tarde/noite) e categoria, e preenche frases
de ligação. Sai algo como *"Você passou a manhã trabalhando, concluiu 2 tarefas e
conversou com João. À noite participou da atividade da igreja."*

Funciona offline, é grátis, é determinístico, não vaza nada — e entrega talvez 80% da
sensação da ideia original.

**9b · Resumo por IA — G.** Melhor texto, mais natural. A infraestrutura de configuração
**já existe**: `aiEnabled`, `aiEndpoint`, `aiKey`, `aiModel` em `store.js` e a tela em
`js/views/config.js` (hoje usadas só para ler prints). O envio passa a incluir os
registros do dia — e é por isso que precisa ser **opt-in explícito e separado** do
opt-in de imagem: é um dado muito mais íntimo.

Faça 9a primeiro. Ela vira o *fallback* de 9b quando não houver internet ou API.

**Arquivos:** novo `js/features/summary.js`, `js/views/registro.js`, `js/views/config.js`.

---

## FASE 10 · F12 Perguntar à minha memória — **G** · o diferencial

A função mais difícil e a razão de tudo que veio antes. Também em duas camadas.

**10a · Interpretador de perguntas local — G, mas determinístico.**

A maioria das perguntas da sua lista cai em **cinco padrões** com resposta exata:

| Padrão | Exemplo | Vira |
|---|---|---|
| Recuperar um dia | "O que fiz na última quarta?" | `timeline(data)` |
| Última ocorrência | "Quando falei com João pela última vez?" | último item com pessoa=João |
| Contagem em período | "Quantas vezes fui à academia em agosto?" | contar por lugar/categoria no intervalo |
| Soma por categoria | "Quanto tempo dediquei ao trabalho?" | somar `durationMin` por categoria |
| Ranking | "Quais tarefas eu mais adiei?" | tarefas por nº de mudanças de data |

Isso responde **8 das 9 perguntas** que você escreveu — offline, na hora, sem custo e sem
chance de o modelo inventar um fato sobre a sua vida. E o `nlp.js` já sabe interpretar
"última quarta", "semana passada", "em 3 dias" em pt-BR: o parser de datas se reaproveita
inteiro.

**Pré-requisito escondido:** "quais tarefas eu mais adiei" exige que o app **conte os
adiamentos**. Hoje `tasks.move()` só troca a data. Adicionar um `postponeCount` e um
`history[]` em `tasks.move()` custa três linhas — mas se não for feito **na fase 3**, o
dado dos meses anteriores não existe. Vale antecipar essas duas linhas.

**10b · Pergunta aberta com IA — G.** Para o que não cai nos padrões
("como foram minhas últimas quatro semanas?"). O erro a evitar: mandar o banco inteiro
para a API. O caminho é recuperar localmente só a janela relevante (as datas, pessoas ou
categorias que a pergunta menciona) e enviar **só essa fatia** como contexto.

**Arquivos:** novo `js/features/memory.js`, nova tela `js/views/memoria.js`.

---

## FASE 11 · Retrospectivas longas — **M**, depois de meses

Mês, trimestre, "como tem sido minha vida". Tecnicamente é a fase 8 com outro intervalo.
Só entra quando houver o que olhar para trás — e aí é quase de graça.

---

## 4. Modelo de dados novo

```
people      { id, key, name, aliases[], note, firstSeen, lastSeen, count }
places      { id, key, name, note, lastSeen, count }
moments     { id, date, time, text, kind, refIds[], createdAt }
checkins    { id, date, time, mood, note, trigger }

logs        + people[]  (era person: string)
            + unplanned, triaged, linkedTaskId, durationMin
days        + mood, highlights[], closedAt, notes
tasks       + postponeCount, history[]   ← antecipar para a fase 3
```

---

## 5. Regras de projeto que valem para todas as fases

1. **Nunca cobrar.** Sem nota de produtividade, sem meta, sem sequência que se perde.
   O app mostra onde o dia foi parar; ele não avalia o dia.
2. **"Não lembro" sempre disponível.** Toda pergunta aceita não ser respondida.
3. **Capturar agora, organizar depois.** Nenhum campo obrigatório no momento do registro.
4. **Local por padrão.** IA sempre opt-in, e o opt-in de "ler print" ≠ opt-in de
   "mandar meu diário".
5. **Backup vira crítico.** Hoje perder o banco custa uma lista de tarefas; depois da
   fase 10 custa a memória de anos. A partir da fase 5: aviso quando o último backup
   passar de 14 dias, e exportação num toque.
6. **Toda fase tem que ser útil sozinha.** Nenhuma fase entrega meio recurso esperando
   a próxima.

---

## 6. Resumo da ordem

| # | Fase | Esforço | Bloco | |
|---|---|---|---|---|
| 0 | Fundação de dados | P | escrever | ✅ |
| 1 | "Fiz agora" global | P | escrever | ✅ |
| 2 | Captura em lote + triagem | P | escrever | ✅ |
| 3 | Planejado × Aconteceu | M | mostrar |
| 4 | Onde estou no meu dia | P | mostrar |
| 5 | Pessoas + Lugares | M | mostrar |
| 6 | Momentos + Perceber meu dia | M | escrever |
| 7 | Check-ins e humor | M | escrever |
| 8 | Revisão semanal | M | mostrar |
| 9 | Resumo do dia (local → IA) | M/G | interpretar |
| 10 | Perguntar à minha memória | G | interpretar |
| 11 | Retrospectivas longas | M | interpretar |

**As fases 0 a 2 somam pouco código e começam a encher o banco imediatamente.**
Se só isso for feito nas próximas semanas, o resto fica mais fácil e mais rico depois.

---

## 7. O que ficou de fora, e por quê

- **Projetos + Kanban (EBF 2027).** É uma boa função, mas pertence ao lado *futuro* do
  app — o lado que já é o mais forte. Ela não alimenta nem consome a memória, e
  competiria por tempo com o que torna o app diferente. Melhor lugar: depois da fase 5,
  quando "pessoas" já existir para montar equipe de projeto. Como atalho barato hoje,
  uma **tag `#ebf2027`** já agrupa e já aparece na busca global.
- **GPS automático.** Adiado, como você mesmo propôs. Registro manual dá o trajeto do dia
  com uma fração da complexidade e sem o custo de privacidade.
- **CRM completo de contatos.** A ficha de pessoa para de crescer na fase 5. Funil,
  negócios e campos customizados são outro produto.
- **Diário emocional.** Momentos e humor de um toque bastam. Caixa de texto longa pedindo
  sentimento é a função que todo mundo abandona na segunda semana.
