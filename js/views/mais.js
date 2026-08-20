/* Tela "Mais" — atalhos para painel, histórico, categorias, dados e ajustes. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import { section } from '../ui/items.js';
import { usage } from '../features/backup.js';
import { go } from '../core/router.js';
import { fmtDate } from '../util/date.js';

export const title = 'Mais';

export async function render(root) {
  clear(root);
  const u = await usage();

  root.appendChild(section('Visões'));
  root.appendChild(el('div', { class: 'card', style: { padding: '4px 12px' } },
    row('chart', 'Painel', 'Números, progresso e categorias', '#/dashboard'),
    row('history', 'Histórico', 'Dias anteriores e pesquisa', '#/historico'),
    row('search', 'Pesquisa global', 'Tudo em um só lugar', '#/busca'),
  ));

  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Organização')));
  root.appendChild(el('div', { class: 'card', style: { padding: '4px 12px' } },
    row('tag', 'Categorias', `${S.categories.all().length} categorias`, '#/categorias'),
    row('bell', 'Lembretes e notificações', 'Permissões e agenda de avisos', '#/config'),
  ));

  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Dados e ajustes')));
  root.appendChild(el('div', { class: 'card', style: { padding: '4px 12px' } },
    row('data', 'Dados e backup', 'Exportar, importar, restaurar, apagar', '#/dados'),
    row('gear', 'Configurações', 'Tema, semana, leitura de imagens', '#/config'),
  ));

  const total = Object.values(u.counts).reduce((a, b) => a + b, 0);
  root.appendChild(el('div', { class: 'card', style: { marginTop: '20px' } },
    el('h3', {}, 'Seus dados neste aparelho'),
    el('p', { class: 'small muted', style: { marginTop: '6px' } },
      `${u.counts.tasks} tarefas · ${u.counts.events} compromissos · ${u.counts.logs} registros · ${u.counts.notes} notas · ${u.counts.inbox} na entrada`),
    el('p', { class: 'tiny dim' },
      `${total} registros no total${u.quota?.used ? ` · ${(u.quota.used / 1048576).toFixed(1)} MB usados` : ''}`),
    S.settings.get('lastBackup')
      ? el('p', { class: 'tiny dim' }, `Último backup: ${fmtDate(S.settings.get('lastBackup').slice(0, 10), 'num')}`)
      : el('p', { class: 'tiny', style: { color: 'var(--c-warn)' } }, 'Você ainda não fez um backup.')));

  root.appendChild(el('p', { class: 'tiny dim center', style: { marginTop: '20px' } },
    'Rotina · PWA offline · seus dados ficam apenas neste aparelho'));
}

function row(ic, label, sub, href) {
  return el('button', { class: 'linkrow', onclick: () => go(href) },
    icon(ic),
    el('span', { class: 'grow' }, el('span', {}, label), el('small', {}, sub)),
    icon('chev', 'ic--chev'));
}
