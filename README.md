# Rotina

PWA de organização de rotina, produtividade e registro pessoal.

**Planejar → Executar → Registrar → Revisar.**
Não é só uma lista de tarefas: é um diário operacional da sua rotina, integrado ao
planejamento. Funciona offline, instala no celular e **guarda tudo apenas no seu aparelho**.

- Sem servidor próprio, sem nuvem, sem Firebase/Supabase, sem login.
- Todos os dados ficam no **IndexedDB** do navegador.
- Backup e restauração por arquivo **JSON**.

O plano de evolução do app está em [`ROADMAP.md`](ROADMAP.md), o detalhamento das
fases em [`docs/fases-3-11.md`](docs/fases-3-11.md) e a preparação para
sincronizar entre aparelhos em [`docs/sincronizacao.md`](docs/sincronizacao.md).

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

> **Atenção:** o computador e o celular são **dois bancos separados**. Cada
> navegador tem o próprio IndexedDB, então o que você registrar num aparelho não
> aparece no outro. Hoje a ponte entre eles é o backup: *Mais → Dados e backup →
> Exportar* num, *Importar* no outro. Sincronização automática ainda não existe —
> o que já foi preparado para ela está em [`docs/sincronizacao.md`](docs/sincronizacao.md).

### Instalando no celular (Android / S23 Ultra)

1. Publique a pasta em qualquer hospedagem estática com HTTPS
   (GitHub Pages, Netlify, Cloudflare Pages…) ou acesse por `localhost`.
2. Abra no Chrome → menu ⋮ → **Adicionar à tela inicial**.
3. Em **Mais → Configurações → Lembretes**, toque em **Ativar notificações**.

Depois de instalado, o app abre e funciona sem internet.

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

## Estrutura do projeto

```
index.html              Casca do app (topo, navegação, sprite de ícones)
manifest.webmanifest    Manifesto da PWA (atalhos e share target)
sw.js                   Service worker (cache do app shell, offline)
css/
  tokens.css            Cores, espaçamentos, tema claro/escuro
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

Nenhum dado sai do aparelho. Não há autenticação, servidor ou banco online.
A única saída opcional é a API de IA que **você** configurar para ler imagens —
desligada por padrão.

Como não há nuvem, **faça backups**: *Mais → Dados e backup → Exportar backup*.
Se o app for desinstalado ou os dados do navegador forem limpos, o conteúdo se perde.
