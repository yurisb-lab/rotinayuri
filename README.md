# Rotina

PWA de organização de rotina, produtividade e registro pessoal.

**Planejar → Executar → Registrar → Revisar.**
Não é só uma lista de tarefas: é um diário operacional da sua rotina, integrado ao
planejamento. Funciona offline, instala no celular e **guarda tudo apenas no seu aparelho**.

- Sem servidor próprio, sem nuvem, sem Firebase/Supabase, sem login.
- Todos os dados ficam no **IndexedDB** do navegador.
- Backup e restauração por arquivo **JSON**.

---

## Como usar

### Rodando localmente

Qualquer servidor estático serve (service workers exigem `http://localhost` ou HTTPS):

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

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
| **Hoje** | Painel do dia: progresso, compromissos, tarefas, recorrentes, atrasadas, registros, entrada e anotações. Botão **Fechar meu dia**. |
| **Tarefas** | Lista com filtros por período, status e categoria + busca. |
| **Calendário** | Visões de **mês, semana, dia e agenda**. Segure e arraste um item para mudar data/hora. |
| **Registro do dia** | "O que fiz hoje", linha do tempo do dia e fechamento com resumo. |
| **Notas** | Nota simples, lista, ideia, estudo, ata de reunião, rascunho. |
| **Entrada** | Captura rápida do que surge no dia, para organizar depois. |
| **Mais** | Painel (dashboard), Histórico, Categorias, Dados/Backup e Configurações. |

---

## Criação rápida

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

### Dados no IndexedDB (`rotina`)

`tasks`, `events`, `logs`, `notes`, `inbox`, `categories`, `days`,
`occurrences` (ocorrências de itens recorrentes), `reminders`, `settings`.

Itens recorrentes guardam **uma regra**, e as ocorrências são geradas na hora;
só as que mudam de status ficam gravadas em `occurrences`.

---

## Privacidade

Nenhum dado sai do aparelho. Não há autenticação, servidor ou banco online.
A única saída opcional é a API de IA que **você** configurar para ler imagens —
desligada por padrão.

Como não há nuvem, **faça backups**: *Mais → Dados e backup → Exportar backup*.
Se o app for desinstalado ou os dados do navegador forem limpos, o conteúdo se perde.
