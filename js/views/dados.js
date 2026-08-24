/* Configurações → Dados: exportar, importar, restaurar e apagar. */

import { el, icon, clear } from '../util/dom.js';
import * as B from '../features/backup.js';
import * as S from '../core/store.js';
import { section } from '../ui/items.js';
import { confirm as ask, openSheet, prompt } from '../ui/modal.js';
import { ok, err } from '../ui/toast.js';
import { fmtDate, today, addDays } from '../util/date.js';
import { toICS, download } from '../features/gcal.js';

export const title = 'Dados e backup';

export async function render(root, { refresh }) {
  clear(root);
  const u = await B.usage();

  root.appendChild(el('div', { class: 'card' },
    el('h3', {}, S.settings.get('syncEnabled') ? 'Neste aparelho e na sua nuvem' : 'Tudo fica neste aparelho'),
    el('p', { class: 'small muted', style: { marginTop: '6px' } },
      S.settings.get('syncEnabled')
        ? 'Com a sincronização ligada, seus dados também ficam no seu projeto do Firebase e voltam ao instalar o app em outro aparelho. O backup em arquivo continua valendo — é o que não depende de conta nenhuma.'
        : 'O Rotina não usa servidor, nuvem nem login. Faça backups com frequência — se o aplicativo for desinstalado ou os dados do navegador forem limpos, o conteúdo é perdido.'),
    S.settings.get('lastBackup')
      ? el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
          `Último backup: ${new Date(S.settings.get('lastBackup')).toLocaleString('pt-BR')}`)
      : el('p', { class: 'tiny', style: { color: 'var(--c-warn)', marginTop: '8px' } }, 'Nenhum backup feito ainda.')));

  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Backup')));
  root.appendChild(el('div', { class: 'stack' },
    big('data', 'Exportar backup (JSON)', 'Salva um arquivo com todos os seus dados', async () => {
      const { json, name, payload } = await B.exportJSON();
      B.saveFile(name, json);
      ok(`Backup gerado (${Object.values(payload.counts).reduce((a, b) => a + b, 0)} registros)`);
      refresh();
    }),
    big('arrowr', 'Importar backup', 'Acrescenta os itens que ainda não existem', () => pickFile('merge', refresh)),
    big('repeat', 'Restaurar dados (substituir tudo)', 'Apaga o conteúdo atual e usa o do arquivo', () => pickFile('replace', refresh)),
  ));

  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Exportações')));
  root.appendChild(el('div', { class: 'stack' },
    big('log', 'Exportar registros (CSV)', 'Planilha com o que você fez', async () => {
      const from = await prompt({ title: 'Exportar registros', label: 'A partir de (AAAA-MM-DD)', value: addDays(today(), -30) });
      if (from === null) return;
      const csv = await B.exportLogsCSV(from || null, today());
      B.saveFile(`rotina-registros-${today()}.csv`, csv, 'text/csv');
      ok('Registros exportados');
    }),
    big('check', 'Exportar tarefas (CSV)', 'Todas as tarefas em planilha', async () => {
      B.saveFile(`rotina-tarefas-${today()}.csv`, await B.exportTasksCSV(), 'text/csv');
      ok('Tarefas exportadas');
    }),
    big('calendar', 'Exportar agenda (.ics)', 'Importe em qualquer calendário', async () => {
      const evs = await S.events.all();
      if (!evs.length) { err('Nenhum compromisso para exportar.'); return; }
      download(`rotina-agenda-${today()}.ics`, toICS(evs));
      ok(`${evs.length} compromisso(s) exportado(s)`);
    }),
  ));

  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Conteúdo guardado')));
  const counts = el('div', { class: 'stats' });
  const LABEL = {
    tasks: 'tarefas', events: 'compromissos', logs: 'registros', notes: 'notas',
    inbox: 'entrada', categories: 'categorias', days: 'dias fechados',
    occurrences: 'ocorrências', reminders: 'lembretes', settings: 'ajustes',
  };
  Object.entries(u.counts).forEach(([k, v]) =>
    counts.appendChild(el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, LABEL[k] || k))));
  root.appendChild(counts);
  if (u.quota?.total) {
    root.appendChild(el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
      `${(u.quota.used / 1048576).toFixed(1)} MB usados de ${(u.quota.total / 1048576).toFixed(0)} MB disponíveis`));
  }

  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Zona de risco')));
  root.appendChild(el('button', {
    class: 'btn btn--danger btn--block',
    onclick: async () => {
      const c1 = await ask({
        title: 'Apagar todos os dados',
        message: 'Tarefas, compromissos, registros, notas e fechamentos serão apagados deste aparelho. Faça um backup antes.',
        okLabel: 'Continuar', danger: true,
      });
      if (!c1) return;
      const typed = await prompt({ title: 'Confirmação final', label: 'Digite APAGAR para confirmar', placeholder: 'APAGAR' });
      if (typed !== 'APAGAR') { err('Cancelado.'); return; }
      await B.wipe();
      ok('Dados apagados');
      refresh();
    },
  }, icon('trash'), 'Apagar todos os dados'));
}

function big(ic, label, sub, onClick) {
  return el('button', { class: 'item', style: { textAlign: 'left', width: '100%' }, onclick: onClick },
    el('span', { class: 'menu__ico' }, icon(ic)),
    el('span', { class: 'item__body' },
      el('span', { class: 'item__title' }, label),
      el('span', { class: 'tiny dim', style: { display: 'block' } }, sub)),
    icon('chev', 'ic--sm'));
}

function pickFile(mode, refresh) {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const payload = await B.readFile(file);
      const total = Object.values(payload.counts || {}).reduce((a, b) => a + b, 0);
      const confirmed = await ask({
        title: mode === 'replace' ? 'Restaurar dados' : 'Importar backup',
        message: `Arquivo de ${payload.exportedAt ? fmtDate(payload.exportedAt.slice(0, 10), 'num') : 'data desconhecida'} com ${total} registro(s).\n\n` +
          (mode === 'replace'
            ? 'TODOS os dados atuais serão apagados e substituídos.'
            : 'Os itens que ainda não existem serão acrescentados.'),
        okLabel: mode === 'replace' ? 'Restaurar' : 'Importar',
        danger: mode === 'replace',
      });
      if (!confirmed) return;
      const report = await B.importJSON(payload, mode);
      const n = Object.values(report).reduce((a, b) => a + b, 0);
      showReport(report, n);
      refresh();
    } catch (e) {
      err(e.message || 'Falha ao importar.');
    }
  };
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}

function showReport(report, total) {
  openSheet({
    title: 'Importação concluída',
    body: el('div', {},
      el('p', { class: 'muted' }, `${total} registro(s) importado(s).`),
      el('div', { class: 'stats', style: { marginTop: '10px' } },
        ...Object.entries(report).filter(([, v]) => v > 0).map(([k, v]) =>
          el('div', { class: 'stat' }, el('b', {}, String(v)), el('span', {}, k))))),
  });
}
