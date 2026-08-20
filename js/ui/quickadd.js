/* Criação rápida: menu "+", criação por texto, por voz e por print/imagem,
   sempre com tela de confirmação antes de salvar. */

import { el, icon, clear } from '../util/dom.js';
import { openSheet } from './modal.js';
import { ok, err, toast } from './toast.js';
import * as S from '../core/store.js';
import * as NLP from '../features/nlp.js';
import * as Speech from '../features/speech.js';
import * as OCR from '../features/ocr.js';
import * as R from '../features/recurrence.js';
import { facets } from '../features/search.js';
import { editTask, editEvent, editLog, editNote, field, categoryPicker, recurrenceEditor, remindersEditor } from './forms.js';
import { today, fmtDate, nowTime } from '../util/date.js';

/* ------------------------------------------------------------- menu "+" */
export function openQuickAdd(onDone) {
  const done = () => onDone?.();
  const item = (iconName, label, sub, fn) => el('button', {
    class: 'menu__item', onclick: async () => { close(); await fn(); },
  }, el('span', { class: 'menu__ico' }, icon(iconName)),
     el('span', { class: 'grow' }, el('span', {}, label), sub ? el('small', {}, sub) : null));

  const { close } = openSheet({
    title: 'Criar',
    body: el('div', { class: 'menu' },
      item('check', 'Nova tarefa', 'Algo a fazer', async () => { await editTask(); done(); }),
      item('calendar', 'Novo compromisso', 'Reunião, culto, consulta…', async () => { await editEvent(); done(); }),
      item('note', 'Nova anotação', 'Nota, ideia, ata', async () => { await editNote(); done(); }),
      item('log', 'Registrar o que fiz', 'Entra na linha do tempo de hoje', async () => { await editLog(); done(); }),
      item('text', 'Criar por texto', '"Reunião com João sexta às 14h"', () => openTextCapture('', done)),
      item('mic', 'Criar por voz', 'Fale naturalmente', () => openVoiceCapture(done)),
      item('image', 'Importar print/imagem', 'Lê o texto da imagem', () => openImageCapture(done)),
      item('inbox', 'Jogar na Entrada', 'Organizo depois', async () => { await openInboxCapture(); done(); }),
    ),
  });
}

/* --------------------------------------------------------- criar por texto */
export function openTextCapture(initial = '', onDone) {
  const ta = el('textarea', {
    class: 'textarea', style: { minHeight: '120px' },
    placeholder: 'Escreva naturalmente.\nEx.: Reunião com João sexta às 14h no cartório\nEx.: Fiz agora: conferência dos equipamentos\nEx.: Todo sábado estudar às 9h',
  }, initial);
  const hint = el('p', { class: 'tiny dim' }, 'Uma linha por item. O aplicativo interpreta datas, horários, pessoas, locais e repetições.');

  const { close } = openSheet({
    title: 'Criar por texto',
    body: el('div', {}, field(null, ta), hint),
    foot: [el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        const text = ta.value.trim();
        if (!text) { err('Escreva alguma coisa.'); return; }
        close();
        await openConfirm(await interpret(text), { onDone, source: 'texto' });
      },
    }, 'Interpretar')],
  });
}

/* ----------------------------------------------------------- criar por voz */
export function openVoiceCapture(onDone) {
  if (!Speech.supported()) {
    err('Este navegador não tem reconhecimento de voz. Use "Criar por texto".');
    return openTextCapture('', onDone);
  }
  const bubble = el('div', { class: 'miclive' }, icon('mic'));
  const status = el('p', { class: 'center small muted' }, 'Toque no microfone e fale');
  const transcript = el('textarea', { class: 'textarea', placeholder: 'O que você falar aparece aqui…' });
  let recording = false;

  const rec = Speech.createRecognizer({
    onPartial: t => { transcript.value = t; },
    onFinal: t => { if (t) transcript.value = t; },
    onError: e => { status.textContent = e === 'not-allowed'
      ? 'Permissão de microfone negada.' : `Erro: ${e}`; setRec(false); },
    onEnd: () => setRec(false),
  });

  function setRec(v) {
    recording = v;
    bubble.classList.toggle('is-rec', v);
    status.textContent = v ? 'Gravando… toque para parar' : 'Toque no microfone e fale';
  }
  bubble.onclick = () => { if (recording) rec.stop(); else { rec.start(); setRec(true); } };

  const { close } = openSheet({
    title: 'Criar por voz',
    body: el('div', {}, bubble, status, field('Transcrição', transcript)),
    foot: [el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        rec.stop();
        const text = transcript.value.trim();
        if (!text) { err('Nada foi capturado.'); return; }
        close();
        await openConfirm(await interpret(text), { onDone, source: 'voz' });
      },
    }, 'Interpretar')],
    onClose: () => rec.abort(),
  });
}

/* -------------------------------------------------------- criar por imagem */
export function openImageCapture(onDone) {
  const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  const zone = el('div', { class: 'dropzone' }, icon('image', 'ic--lg'),
    el('p', { class: 'small', style: { marginTop: '8px' } }, 'Selecione um print ou tire uma foto'));
  const preview = el('div');
  const textArea = el('textarea', { class: 'textarea', placeholder: 'Texto identificado na imagem (edite se precisar)' });
  const note = el('p', { class: 'tiny dim' });

  const pick = f => { input.value = ''; camera.value = ''; f.click(); };
  input.onchange = () => handle(input.files[0]);
  camera.onchange = () => handle(camera.files[0]);

  async function handle(file) {
    if (!file) return;
    note.textContent = 'Lendo a imagem…';
    clear(preview);
    const url = await OCR.shrink(file, 700, 0.65);
    preview.appendChild(el('img', { class: 'preview', src: url, alt: 'Print selecionado' }));
    const { text, via, notes } = await OCR.extract(file);
    if (text) {
      textArea.value = text;
      note.textContent = `Texto lido pelo ${via}. Confira e ajuste antes de continuar.`;
    } else {
      note.textContent = (notes || []).join(' · ') +
        ' — digite ou cole o texto do print abaixo. Você pode ligar uma API de IA em Configurações → Leitura de imagens.';
    }
  }

  const { close } = openSheet({
    title: 'Importar print/imagem',
    body: el('div', {}, zone,
      el('div', { class: 'btnbar', style: { marginTop: '10px' } },
        el('button', { class: 'btn grow', onclick: () => pick(input) }, icon('image'), 'Escolher imagem'),
        el('button', { class: 'btn grow', onclick: () => pick(camera) }, icon('image'), 'Tirar foto')),
      preview, field('Texto identificado', textArea), note, input, camera),
    foot: [el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        const text = textArea.value.trim();
        if (!text) { err('Sem texto para interpretar.'); return; }
        close();
        await openConfirm(await interpret(text), { onDone, source: 'imagem' });
      },
    }, 'Interpretar')],
  });
}

/* ------------------------------------------------------ jogar na entrada */
export function openInboxCapture() {
  return new Promise(resolve => {
    const ta = el('textarea', { class: 'textarea', placeholder: 'Ex.: Comprar material para a igreja' });
    const { close } = openSheet({
      title: 'Entrada rápida',
      body: el('div', {}, field('Anote sem organizar agora', ta),
        el('p', { class: 'tiny dim' }, 'Depois você transforma em tarefa, compromisso, nota ou registro.')),
      foot: [el('button', {
        class: 'btn btn--primary btn--block',
        onclick: async () => {
          const lines = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (!lines.length) { err('Escreva alguma coisa.'); return; }
          for (const l of lines) await S.inbox.add(l);
          ok(`${lines.length} item(ns) na Entrada`);
          close(); resolve(lines.length);
        },
      }, 'Salvar na Entrada')],
      onClose: () => resolve(0),
    });
  });
}

/* ----------------------------------------------------------- interpretação */
export async function interpret(text) {
  const { people } = await facets().catch(() => ({ people: [] }));
  return NLP.parse(text, {
    ref: today(),
    knownPeople: people.slice(0, 40).map(p => p.name),
    guessCategory: t => S.categories.guess(t),
  });
}

/* ------------------------------------------------- tela de confirmação */
export function openConfirm(items, { onDone, source = 'texto' } = {}) {
  return new Promise(resolve => {
    if (!items?.length) { err('Não consegui identificar nada.'); resolve(0); return; }
    const list = items.map(i => ({ ...i, include: true }));
    const container = el('div');

    function render() {
      clear(container);
      list.forEach((it, idx) => container.appendChild(card(it, idx, render)));
    }
    render();

    const { close } = openSheet({
      title: `Confirmar ${list.length > 1 ? `${list.length} itens` : 'item'}`,
      body: el('div', {},
        el('p', { class: 'tiny dim', style: { marginBottom: '10px' } },
          `Interpretado a partir de ${source}. Ajuste o que estiver errado antes de salvar.`),
        container),
      foot: [
        el('button', { class: 'btn btn--ghost', onclick: () => { close(); resolve(0); } }, 'Cancelar'),
        el('button', { class: 'btn btn--primary grow', onclick: save }, 'Salvar'),
      ],
      onClose: () => resolve(0),
      wide: true,
    });

    async function save() {
      const chosen = list.filter(i => i.include);
      if (!chosen.length) { err('Nenhum item selecionado.'); return; }
      let n = 0;
      for (const it of chosen) { await persist(it, source); n++; }
      ok(`${n} item(ns) salvo(s)`);
      close(); onDone?.(); resolve(n);
    }
  });
}

const KINDS = [
  ['task', 'Tarefa'], ['event', 'Compromisso'], ['log', 'Registro'],
  ['note', 'Nota'], ['inbox', 'Entrada'],
];

function card(it, idx, rerender) {
  const box = el('div', { class: 'parsed' });

  const kindChips = el('div', { class: 'scroller' },
    ...KINDS.map(([k, label]) => el('button', {
      type: 'button', class: `chip ${it.kind === k ? 'chip--on' : 'chip--out'}`,
      onclick: () => { it.kind = k; rerender(); },
    }, label)));

  const include = el('input', { type: 'checkbox', checked: it.include, onchange: e => { it.include = e.target.checked; } });
  const title = el('input', { class: 'input', value: it.title, oninput: e => { it.title = e.target.value; } });

  box.appendChild(el('div', { class: 'parsed__head' },
    el('label', { class: 'switch' }, include),
    el('span', { class: 'parsed__kind' }, NLP.KIND_LABEL[it.kind] || it.kind),
    el('span', { class: 'pill', style: { marginLeft: 'auto' } }, `${Math.round(it.confidence * 100)}%`)));

  box.appendChild(kindChips);
  box.appendChild(field('Título', title));

  if (it.why) box.appendChild(el('p', { class: 'tiny dim', style: { marginTop: '-6px' } }, `Detectado como ${NLP.KIND_LABEL[it.kind]}: ${it.why}.`));

  const date = el('input', { class: 'input', type: 'date', value: it.date || '', oninput: e => { it.date = e.target.value; } });
  const time = el('input', { class: 'input', type: 'time', value: it.time || '', oninput: e => { it.time = e.target.value; } });
  box.appendChild(el('div', { class: 'grid2' }, field('Data', date), field(it.kind === 'log' ? 'Horário' : 'Hora', time)));

  if (it.kind === 'event' || it.kind === 'log' || it.kind === 'task') {
    const place = el('input', { class: 'input', value: it.place || '', placeholder: 'Local', oninput: e => { it.place = e.target.value; } });
    const people = el('input', {
      class: 'input', value: (it.people || []).join(', '), placeholder: 'Pessoas',
      oninput: e => { it.people = e.target.value.split(',').map(s => s.trim()).filter(Boolean); },
    });
    box.appendChild(el('div', { class: 'grid2' }, field('Local', place), field('Pessoas', people)));
  }

  const cat = categoryPicker(it.categoryId);
  box.appendChild(field('Categoria', cat.node));
  it._cat = cat;

  if (it.kind === 'task' || it.kind === 'event') {
    const recBox = el('div');
    if (it.recurrence) {
      recBox.appendChild(el('div', { class: 'row', style: { marginBottom: '6px' } },
        icon('repeat', 'ic--sm'),
        el('span', { class: 'small strong' }, R.describe(it.recurrence, it.date))));
    }
    const advanced = el('div', { hidden: true });
    const recEditor = recurrenceEditor(it.recurrence);
    const remEditor = remindersEditor(it.reminders);
    advanced.appendChild(recEditor.node);
    advanced.appendChild(field('Lembretes', remEditor.node));
    it._rec = recEditor; it._rem = remEditor;
    recBox.appendChild(el('button', {
      type: 'button', class: 'btn btn--sm btn--ghost',
      onclick: () => { advanced.hidden = !advanced.hidden; },
    }, icon('gear', 'ic--sm'), 'Repetição e lembretes'));
    recBox.appendChild(advanced);
    box.appendChild(recBox);
  }
  void idx;
  return box;
}

async function persist(it, source) {
  const categoryId = it._cat?.get?.() ?? it.categoryId ?? null;
  const recurrence = it._rec?.get?.() ?? it.recurrence ?? null;
  const reminders = it._rem?.get?.() ?? it.reminders ?? [];

  if (it.kind === 'task') {
    return S.tasks.save(S.newTask({
      title: it.title, date: it.date || today(), time: it.time || null,
      categoryId, recurrence, reminders, priority: it.priority || 'media',
      people: it.people || [], place: it.place || '', tags: it.tags || [],
      description: it.raw !== it.title ? it.raw : '',
    }));
  }
  if (it.kind === 'event') {
    return S.events.save(S.newEvent({
      title: it.title, date: it.date || today(), time: it.time || null,
      endTime: it.endTime || null, location: it.place || '',
      categoryId, recurrence, reminders, people: it.people || [], tags: it.tags || [],
      description: it.raw !== it.title ? it.raw : '',
    }));
  }
  if (it.kind === 'log') {
    return S.logs.save(S.newLog({
      text: it.title, date: it.date || today(), time: it.time || nowTime(),
      categoryId, person: (it.people || [])[0] || '', place: it.place || '',
      tags: it.tags || [], source,
    }));
  }
  if (it.kind === 'note') {
    return S.notes.save(S.newNote({
      title: it.title.slice(0, 60), body: it.raw, type: 'nota', categoryId, tags: it.tags || [],
    }));
  }
  return S.inbox.add(it.raw || it.title, source);
}

/* ---------------------------------------------- registro rápido de 1 toque */
export function quickLog(onDone) {
  const ta = el('textarea', {
    class: 'textarea', style: { minHeight: '90px' },
    placeholder: 'Ex.: Falei com João sobre os equipamentos',
  });
  const time = el('input', { class: 'input', type: 'time', value: nowTime() });
  const micBtn = Speech.supported()
    ? el('button', { class: 'btn btn--ghost', onclick: startVoice }, icon('mic'), 'Ditar')
    : null;
  let rec = null;

  function startVoice() {
    if (rec) { rec.stop(); rec = null; micBtn.classList.remove('btn--primary'); return; }
    rec = Speech.createRecognizer({
      onPartial: t => { ta.value = t; },
      onEnd: () => { rec = null; micBtn.classList.remove('btn--primary'); },
      onError: e => { err(e === 'not-allowed' ? 'Microfone bloqueado' : 'Erro no microfone'); },
    });
    rec.start();
    micBtn.classList.add('btn--primary');
  }

  const { close } = openSheet({
    title: 'Registrar o que fiz',
    body: el('div', {},
      field(null, ta),
      el('div', { class: 'grid2' }, field('Horário', time), micBtn ? field('Voz', micBtn) : null),
      el('p', { class: 'tiny dim' }, 'Dica: escreva "Falei com Carlos às 10h sobre a reunião" que o horário é reconhecido sozinho.')),
    foot: [el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        rec?.stop();
        const text = ta.value.trim();
        if (!text) { err('Escreva o que você fez.'); return; }
        const parsed = (await interpret(text))[0];
        await S.logs.save(S.newLog({
          text: parsed?.kind === 'log' ? parsed.title : text,
          date: parsed?.date || today(),
          time: parsed?.time || time.value || nowTime(),
          categoryId: parsed?.categoryId || S.categories.guess(text),
          person: (parsed?.people || [])[0] || '',
          place: parsed?.place || '',
          tags: parsed?.tags || [],
          source: 'manual',
        }));
        ok('Registrado');
        close(); onDone?.();
      },
    }, 'Salvar registro')],
    onClose: () => rec?.abort(),
  });
}

export { fmtDate, toast };
