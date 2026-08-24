# Rotina

PWA de organização de rotina, produtividade e registro pessoal.

**Planejar → Executar → Registrar → Revisar.**
Não é só uma lista de tarefas: é um diário operacional da sua rotina, integrado ao
planejamento. Funciona offline, instala no celular e **guarda tudo no seu aparelho**.

- Todos os dados ficam no **IndexedDB** do navegador — é dele que o app lê e escreve, sempre.
- Backup e restauração por arquivo **JSON**.
- **Sincronização entre aparelhos é opcional e vem desligada.** Ao ligar, os dados
  passam a ficar também num projeto do Firebase que é seu, sob a sua conta Google,
  e a nuvem vira uma réplica que acerta as contas em segundo plano. Enquanto não
  for ligada, nada sai do aparelho. Ver [`docs/firebase.md`](docs/firebase.md).

O plano de evolução do app está em [`ROADMAP.md`](ROADMAP.md), o detalhamento das
fases em [`docs/fases-3-11.md`](docs/fases-3-11.md), o passo a passo para ligar a
sincronização em [`docs/firebase.md`](docs/firebase.md) e as decisões por trás dela
em [`docs/sincronizacao.md`](docs/sincronizacao.md).

---

## Como usar

### Rodando localmente

Qualquer servidor estático serve (service workers exigem `http://localhost` ou HTTPS):

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

### Instalando no computador (Windows, Mac, Linux)

Abra o endereço no **Chrome ou Edge** → ícone de instalar na barra de endereço
(ou menu ⋮ → *Instalar Rotina*). O app passa a abrir em janela própria, sem
abas nem barra de endereço, e aparece na lista de programas.

Em tela a partir de 1000 px a navegação vira uma **barra lateral** e o conteúdo
fica numa coluna centralizada — não é o layout de celular esticado.

O Firefox e o Safari não instalam PWA no computador, mas o app funciona
normalmente neles como página.

> **Atenção:** sem sincronização, o computador e o celular são **dois bancos
> separados** — cada navegador tem o próprio IndexedDB, e o que você registrar num
> aparelho não aparece no outro. Duas pontes possíveis:
>
> - **Sincronização automática** (*Mais → Sincronização*): os mesmos dados nos dois,
>   sozinho, em segundo plano. Precisa de um projeto do Firebase — 15 minutos de
>   configuração, uma vez, seguindo [`docs/firebase.md`](docs/firebase.md).
> - **Backup em arquivo**: *Mais → Dados e backup → Exportar* num, *Importar* no
>   outro. Não depende de conta nenhuma.

### Instalando no celular (Android / S23 Ultra)

1. Publique a pasta em qualquer hospedagem estática com HTTPS ou acesse por
   `localhost`. O repositório já traz o fluxo do **GitHub Pages** em
   `.github/workflows/pages.yml`: em *Settings → Pages*, escolha **GitHub Actions**
   como origem, e cada push na `main` publica em
   `https://<usuário>.github.io/rotinayuri/`. Todos os caminhos do app são
   relativos, então funciona em subpasta.
2. Abra no Chrome → menu ⋮ → **Adicionar à tela inicial**.
3. Em **Mais → Configurações → Lembretes**, toque em **Ativar notificações**.

Depois de instalado, o app abre e funciona sem internet.

### Sincronizando computador e celular

*Mais → Sincronização.* Vem desligada. Ligar leva 15 minutos, uma vez, e precisa
de um projeto do Firebase seu — o passo a passo com telas e mensagens de erro
está em [`docs/firebase.md`](docs/firebase.md).

Como funciona: o app **nunca** espera a rede para mostrar uma tela. Ele lê e
escreve no banco local, e a sincronização acontece em segundo plano — ao abrir,
alguns segundos depois de cada alteração, ao voltar para o app e a cada cinco
minutos. Sem rede, o que ficou pendente sobe na próxima conexão.

Conflito entre dois aparelhos: **vence quem escreveu por último** (`updatedAt`).
`tags` e `aliases` são a exceção, e se unem. Exclusão viaja como qualquer outra
mudança — é para isso que existem os tombstones descritos em
[`docs/sincronizacao.md`](docs/sincronizacao.md).

---

## Telas

| Tela | O que faz |
|---|---|
| **Hoje** | Painel do dia: progresso, registros a organizar, compromissos, tarefas, recorrentes, atrasadas, registros, entrada e anotações. Botão **Fechar meu dia**. |
| **Tarefas** | Lista com filtros por período, status e categoria + busca. |
| **Calendário** | Visões de **mês, semana, dia e agenda**. Segure e arraste um item para mudar data/hora. |
| **Registro do dia** | "O que fiz hoje", linha do tempo do dia e fechamento com resumo. |
| **Notas** | Nota simples, lista, ideia, estudo, ata de reunião, rascunho. |
| **Entrada** | Captura rápida do que surge no dia, para organizar depois. |
| **Minha semana** | Onde a semana foi parar: categorias, acontecimentos por dia, realizações e pendências. |
| **Retrospectiva** | Mês, trimestre e ano, com pessoas e lugares mais presentes. |
| **Pessoas** | Com quem você tem falado, histórico de interações e próxima ação. |
| **Lugares** | Onde você tem estado e o trajeto do dia. |
| **Mais** | Painel (dashboard), Histórico, Categorias, Dados/Backup e Configurações. |

---

## Criação rápida

### "Fiz agora" — captura em um toque

O botão **Fiz agora** fica em todas as telas, logo acima do **+**. Ele grava o que
acabou de acontecer com o horário atual e **nada mais**: sem categoria, sem pessoa,
sem local. Pedir organização no momento da captura é justamente o atrito que faz a
pessoa deixar de registrar.

O texto é guardado exatamente como foi escrito ou ditado — não passa pelo
interpretador. Logo depois aparece um aviso com **desfazer**.

Os registros capturados assim ficam marcados como pendentes de organização e
aparecem em **Hoje → Registros para organizar**. Lá, um toque abre categoria,
pessoas, local e horário — e **"Deixar assim"** é uma saída legítima: nada ali é
obrigatório.

### Menu completo

O botão **+** (canto inferior direito) abre:

- Nova tarefa
- Novo compromisso
- Nova anotação
- Registrar o que fiz
- **Criar por texto** (linguagem natural)
- **Criar por voz** (fala → texto → interpretação)
- **Importar print/imagem**
- Jogar na Entrada

Tudo que é interpretado automaticamente passa por uma **tela de confirmação**,
onde você corrige tipo, título, data, hora, local, pessoas, categoria,
recorrência e lembretes antes de salvar.

### Exemplos que o app entende

| Você escreve/fala | O app cria |
|---|---|
| `Reunião com João sexta às 14h no cartório` | Compromisso · sexta · 14:00 · local: cartório · pessoa: João |
| `Na próxima terça preciso ligar para Carlos` | Tarefa "Ligar para Carlos" na terça |
| `Todo sábado estudar às 9h` | Atividade recorrente semanal, sábados, 09:00 |
| `Trabalho de segunda a sexta às 08:00` | Recorrência em dias úteis |
| `Devocional todos os dias às 06:00` | Recorrência diária |
| `Reunião toda primeira segunda-feira do mês` | Recorrência mensal (1ª segunda) |
| `Fiz agora: conferência dos equipamentos` | Registro do dia no horário atual |
| `Falei com Carlos às 10h sobre a reunião` | Registro do dia às 10:00, pessoa: Carlos |
| `Comprar material para a igreja dia 27 lembrar 3 dias antes` | Tarefa em 27 + lembrete 3 dias antes |
| `Consulta médica 27/08 às 14:30 urgente` | Compromisso com prioridade urgente |

Também reconhece: `hoje`, `amanhã`, `depois de amanhã`, `semana que vem`,
`em 3 dias`, `dia 27`, `27 de agosto`, `das 14h às 16h`, `meio-dia`,
`8 da manhã`, `a cada 15 dias`, `fins de semana`, `#tags` e prioridades.

### Vários itens de uma vez

Um texto colado, ditado ou compartilhado de outro aplicativo vira **vários itens**,
separados por quebra de linha, `;`, "e depois" e também por **ponto final**. Assim:

> Domingo às 18h tem culto. Antes preciso preparar os slides. Segunda tenho reunião às 10.

vira três itens — o culto no domingo às 18:00, uma tarefa para preparar os slides e
a reunião na segunda às 10:00. Todos passam pela tela de confirmação antes de salvar.

A quebra por ponto é conservadora de propósito: só separa quando vem espaço e letra
maiúscula depois, e ignora abreviações. `Dr. Silva`, `1.500` e `às 14h30.` continuam
inteiros.

O que o interpretador **não** faz é deduzir data por raciocínio: em "antes preciso
preparar os slides", ele não conclui que a preparação vem antes do culto. O item é
criado sem data e você resolve com um toque na confirmação.

---

## Recursos principais

- **Tarefas**: título, descrição, categoria, data, horário, prazo, prioridade,
  status (pendente / em andamento / concluída / cancelada), recorrência,
  lembretes, subtarefas, pessoas, local e observações. Conclusão em um toque.
- **Recorrências**: diária, dias específicos da semana, semanal, mensal (dia do mês
  ou "1ª segunda"), anual e personalizada (a cada N dias), com data limite e
  exceções (pular uma ocorrência).
- **Lembretes**: 7/3/1 dia antes, no dia às 09:00, 1 hora, 30 e 10 minutos antes,
  ou horário definido. Vários por item, com notificação da PWA.
- **Calendário**: mês / semana / dia / agenda, com arrastar para reagendar.
- **Google Agenda**: cada compromisso tem "Adicionar ao Google Agenda" (link
  `calendar.google.com`, sem backend), compartilhamento nativo e download `.ics`.
- **Registro do dia**: horário preenchido automaticamente (e editável), pessoa,
  local, categoria e tags. Linha do tempo combinando compromissos, tarefas
  concluídas, registros, notas e atividades recorrentes.
- **Fechamento do dia**: resumo (planejado / concluído / pendências / registros /
  anotações), linha do tempo resumida, transferência das tarefas não concluídas
  (**somente com confirmação**) e o campo "Como foi meu dia?".
- **Histórico**: hoje, ontem, últimos 7 dias, este mês ou data específica, com busca.
- **Pesquisa global**: tarefas, compromissos, registros, notas, entrada, categorias,
  pessoas e locais — tudo local e instantâneo.
- **Painel**: pendentes, em andamento, concluídas, atrasadas, compromissos,
  registros, progresso semanal e distribuição por categoria.
- **Backup**: exportar/importar JSON, restaurar (substituindo tudo), apagar tudo,
  além de exportar registros e tarefas em CSV e a agenda em `.ics`.
- **Onde estou no meu dia**: cartão no topo de Hoje com a última coisa registrada,
  a próxima coisa e quantos acontecimentos o dia já teve.
- **Planejado × Aconteceu**: a linha do tempo separa o que estava previsto do que
  foi registrado, e marca o que aconteceu **fora do plano**. O selo é tocável — a
  sua correção vence o automático para sempre.
- **Momentos**: o que valeu a pena perceber, que não é tarefa nem registro.
- **Perceber meu dia**: o fechamento virou cinco passos curtos, todos puláveis, com
  "Não lembro" em todos eles.
- **Check-ins**: em horários que você escolhe, uma pergunta de um toque sobre como
  está o dia. Desligado por padrão — e se dois avisos seguidos forem ignorados, o
  app para de perguntar sozinho.
- **Resumo do dia**: cada dia ganha um texto em prosa, montado localmente, sem IA e
  sem rede. Mesma data, mesmo texto, sempre.
- **Você lembra?**: de manhã, um cartão com o resumo de ontem e um atalho para revisar.

### Leitura de prints/imagens

1. Tenta o **detector de texto nativo** do navegador (Shape Detection API).
2. Se você configurar uma **API de IA própria** em *Configurações → Leitura de
   imagens*, o app usa essa API (endereço e chave ficam salvos só no aparelho).
3. Se nada estiver disponível, você cola ou digita o texto do print.

Em qualquer caso o texto passa pelo interpretador e pela tela de confirmação, e
os dados continuam sendo salvos apenas localmente.

---

## Identidade visual

O app tem um sistema visual próprio, chamado **Papel & Tinta**, e ele não é
decoração solta: sai do próprio ciclo do app — *planejar → executar →
registrar → revisar*.

### Duas cores, dois significados

| Cor                       | Quer dizer            | Onde aparece                                                   |
|---------------------------|-----------------------|----------------------------------------------------------------|
| **Índigo** `--c-accent`   | o plano, o que vem    | tarefas, compromissos, o botão "+", abas, faixa "planejado"     |
| **Âmbar** `--c-accent-2`  | o vivido, o registro  | "Fiz agora", registros do dia, faixa "fora do plano"            |

Por isso o botão de criar e o botão de registrar têm cores diferentes: eles
fazem coisas diferentes no ciclo. O cartão "Agora", que liga as duas pontas,
tem uma régua no topo que vai de uma cor à outra.

### Papel e tinta

O tema claro é papel morno (`#f6f4f0`), não cinza de escritório; o escuro é
tinta noturna com um fio de violeta, não preto de terminal. O fundo tem duas
manchas de luz nas cores da marca e um grão fino por cima — dois
pseudo-elementos fixos atrás do conteúdo, sem imagem nenhuma na rede.

Profundidade é um sistema de três alturas (`--e-1`, `--e-2`, `--e-3`), cada
uma somando um contorno de luz, uma sombra de contato e uma de ambiente. Nada
usa "uma sombra genérica" repetida.

### Tipos

- **Fraunces** nos títulos, na saudação do dia e no resumo do dia (com
  capitular) — é ela que dá cara de caderno.
- **Plus Jakarta Sans** em todo o resto, com numerais tabulares em horas e
  contagens.

As duas ficam em `fonts/`, não em CDN: o app é offline-first e instalável.
Detalhes e licenças em [`fonts/LEIAME.md`](fonts/LEIAME.md).

### Movimento

A entrada em cascata acontece **só ao trocar de tela** — recarregar a lista
depois de marcar uma tarefa não reanima nada, porque piscar a cada toque
incomoda mais do que agrada. Quem liga *reduzir movimento* no sistema recebe
o app praticamente sem animação.

## Estrutura do projeto

```
index.html              Casca do app (topo, navegação, sprite de ícones)
manifest.webmanifest    Manifesto da PWA (atalhos e share target)
sw.js                   Service worker (cache do app shell, offline)
fonts/
  fraunces-latin.woff2  Fraunces (títulos) — ver fonts/LEIAME.md
  jakarta-latin.woff2   Plus Jakarta Sans (texto)
css/
  tokens.css            Cores, formas, tipos, sombras, movimento; claro/escuro
  base.css              Reset e layout geral
  components.css        Botões, cards, chips, formulários, folhas modais
  views.css             Estilos específicos das telas
js/
  app.js                Inicialização e ligação dos componentes
  core/
    db.js               Camada IndexedDB
    store.js            Domínio (tarefas, compromissos, registros, notas…)
    router.js           Roteamento por hash
    bus.js              Barramento de eventos
  util/
    date.js             Datas e formatação em pt-BR
    dom.js              Helpers de DOM
  features/
    nlp.js              Interpretação de linguagem natural (pt-BR)
    recurrence.js       Motor de recorrências
    reminders.js        Lembretes e notificações
    speech.js           Reconhecimento de voz
    ocr.js              Leitura de imagens
    gcal.js             Google Agenda, .ics e compartilhamento
    search.js           Pesquisa global
    backup.js           Exportação/importação/limpeza
    sync.js             Sincronização entre aparelhos (motor: o que sobe e o que desce)
    firebase.js         Adaptador do Firebase (o único arquivo que conhece o Firestore)
  ui/
    modal.js            Folhas modais, confirmações e menus
    toast.js            Avisos rápidos
    forms.js            Formulários de tarefa, compromisso, registro, nota
    items.js            Componentes de lista
    quickadd.js         Menu "+", texto, voz, imagem e confirmação
    dragdrop.js         Arrastar itens no calendário (toque e mouse)
  views/                Uma tela por arquivo
```

### Dados no IndexedDB (`rotina`, versão 3)

`tasks`, `events`, `logs`, `notes`, `inbox`, `categories`, `days`,
`occurrences` (ocorrências de itens recorrentes), `reminders`, `settings`,
`people`, `places`, `moments`, `checkins`.

`people` e `places` são registros de **identidade**, não de contagem: guardam quem e
onde existe, com a primeira e a última aparição. "João", "joão" e "JOÃO" viram a
mesma pessoa, porque a chave é o nome sem acento e em minúsculas. São preenchidos
sozinhos sempre que uma tarefa, compromisso ou registro é salvo.

`moments` e `checkins` já existem no esquema, mas ainda não têm tela — ver
`ROADMAP.md`, fases 6 e 7.

Ao abrir o app pela primeira vez depois da atualização, a migração roda sozinha e
**semeia pessoas e lugares a partir de tudo que já estava escrito**, sem precisar
digitar nada de novo. Ela é idempotente: rodar de novo não duplica.

**Exclusões deixam rastro.** Desde a versão 3, apagar um item marca `deletedAt` em
vez de remover a linha. Isso é invisível no uso (o app filtra sozinho) e existe
para que sincronizar entre aparelhos, um dia, não faça itens apagados
ressuscitarem. Ver [`docs/sincronizacao.md`](docs/sincronizacao.md).

O IndexedDB é um banco de verdade e aguenta anos de uso — vinte registros por dia
durante dez anos dão cerca de 22 MB. O que ele não faz é sincronizar entre
aparelhos; é isso, e não capacidade, que um serviço em nuvem resolveria.

Itens recorrentes guardam **uma regra**, e as ocorrências são geradas na hora;
só as que mudam de status ficam gravadas em `occurrences`.

---

## Privacidade

Com a instalação padrão, **nenhum dado sai do aparelho**: não há autenticação,
servidor nem banco online. Existem duas saídas, as duas opcionais e desligadas
até você ligar:

- **Sincronização entre aparelhos** (*Mais → Sincronização*). Ligando, os dados
  passam a ser copiados para um projeto do **Firebase que é seu**, sob a sua conta
  Google. Não há servidor deste app no meio: nada passa por nenhum outro lugar.
  As regras em [`firestore.rules`](firestore.rules) limitam a leitura e a escrita
  à sua própria conta — publicá-las não é opcional. O que **não** sobe: as
  configurações do aparelho (tema, horários, chaves de API) e os lembretes
  agendados.
- **API de IA para ler imagens**, se você configurar uma.

**Faça backups de qualquer jeito**: *Mais → Dados e backup → Exportar backup*. Sem
sincronização, desinstalar o app ou limpar os dados do navegador perde o conteúdo;
com ela, o backup em arquivo continua sendo a cópia que não depende de conta
nenhuma.
