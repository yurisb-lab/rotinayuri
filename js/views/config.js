/* Configurações — aparência, semana, notificações, leitura de imagens, sobre. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import * as Rem from '../features/reminders.js';
import { section, empty } from '../ui/items.js';
import { remindersEditor, field } from '../ui/forms.js';
import { ok, err } from '../ui/toast.js';
import { go } from '../core/router.js';
import { fmtDate, fmtTime, DOW } from '../util/date.js';

export const title = 'Configurações';

export async function render(root, { refresh }) {
  clear(root);
  const s = S.settings.all();

  /* aparência ---------------------------------------------------------- */
  root.appendChild(section('Aparência'));
  root.appendChild(el('div', { class: 'card' },
    field('Tema', el('select', {
      class: 'select',
      onchange: async e => { await S.settings.set('theme', e.target.value); applyTheme(e.target.value); },
    },
      ...[['auto', 'Seguir o sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) =>
        el('option', { value: v, selected: s.theme === v }, l)))),
    field('Primeiro dia da semana', el('select', {
      class: 'select',
      onchange: e => S.settings.set('weekStart', Number(e.target.value)),
    },
      ...[0, 1].map(i => el('option', { value: i, selected: s.weekStart === i }, DOW[i])))),
    el('div', { class: 'grid2' },
      field('Início do dia', el('input', {
        class: 'input', type: 'number', min: 0, max: 12, value: s.dayStartHour,
        oninput: e => S.settings.set('dayStartHour', Number(e.target.value)),
      })),
      field('Fim do dia', el('input', {
        class: 'input', type: 'number', min: 13, max: 23, value: s.dayEndHour,
        oninput: e => S.settings.set('dayEndHour', Number(e.target.value)),
      }))),
  ));

  /* notificações -------------------------------------------------------- */
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const permLabel = { granted: 'Permitidas', denied: 'Bloqueadas pelo navegador', default: 'Ainda não autorizadas', unsupported: 'Sem suporte neste navegador' }[perm];
  const defaults = remindersEditor(s.defaultReminders || []);

  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Lembretes e notificações')));
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'row row--between' },
      el('span', { class: 'small' }, 'Notificações'),
      el('span', { class: `pill ${perm === 'granted' ? 'pill--ok' : perm === 'denied' ? 'pill--danger' : ''}` }, permLabel)),
    perm !== 'granted' ? el('button', {
      class: 'btn btn--primary btn--block', style: { marginTop: '10px' },
      onclick: async () => {
        const r = await Rem.requestPermission();
        if (r === 'granted') { await S.settings.set('notificationsEnabled', true); ok('Notificações ativadas'); }
        else err('Permissão não concedida.');
        refresh();
      },
    }, icon('bell'), 'Ativar notificações') : el('button', {
      class: 'btn btn--ghost btn--block', style: { marginTop: '10px' },
      onclick: () => Rem.notify('Rotina', 'Notificação de teste funcionando.'),
    }, icon('bell'), 'Enviar notificação de teste'),
    el('div', { style: { marginTop: '14px' } },
      field('Lembretes padrão para novos compromissos', defaults.node),
      el('button', {
        class: 'btn btn--sm btn--block',
        onclick: async () => { await S.settings.set('defaultReminders', defaults.get()); ok('Padrão salvo'); },
      }, 'Salvar lembretes padrão')),
    el('p', { class: 'tiny dim', style: { marginTop: '10px' } },
      'Os avisos são disparados pelo próprio aparelho enquanto o aplicativo estiver instalado. Mantenha o Rotina na tela inicial para receber melhor.'),
  ));

  const next = await Rem.upcoming(8);
  root.appendChild(el('div', { style: { marginTop: '16px' } }, section('Próximos lembretes', next.length)));
  root.appendChild(next.length
    ? el('div', { class: 'stack' }, ...next.map(r => el('div', { class: 'item' },
        el('div', { class: 'item__body' },
          el('div', { class: 'item__title' }, r.title),
          el('div', { class: 'item__meta' },
            el('span', {}, new Date(r.at).toLocaleString('pt-BR')),
            el('span', { class: 'pill' }, Rem.labelOf(r.preset)))))))
    : empty('Nenhum lembrete agendado.'));

  /* leitura de imagens --------------------------------------------------- */
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Leitura de imagens (opcional)')));
  /* ------------------------------------------------ check-ins (fase 7) */
  const ckOn = el('input', { type: 'checkbox', checked: !!s.checkinsEnabled });
  const ckTimes = el('input', { class: 'input', value: (s.checkinTimes || []).join(', '),
    placeholder: '08:30, 13:30, 19:30' });
  const ckMax = el('input', { class: 'input', type: 'number', min: '1', max: '6',
    value: String(s.checkinMaxPerDay ?? 3) });
  const ckDe = el('input', { class: 'input', type: 'time', value: s.checkinQuietFrom || '22:00' });
  const ckAte = el('input', { class: 'input', type: 'time', value: s.checkinQuietTo || '07:00' });

  root.appendChild(el('div', { style: { marginTop: '22px' } }, section('Como está seu dia?')));
  root.appendChild(el('div', { class: 'card' },
    el('p', { class: 'small muted' },
      'Em alguns momentos do dia o app pode perguntar como você está, com resposta de um toque. Fica desligado até você ligar.'),
    el('label', { class: 'switch', style: { marginTop: '10px' } }, ckOn,
      el('span', {}, 'Perguntar como está meu dia')),
    field('Horários', ckTimes),
    el('div', { class: 'grid2' }, field('No máximo por dia', ckMax), field(' ', el('span'))),
    el('div', { class: 'grid2' }, field('Não perguntar das', ckDe), field('até', ckAte)),
    s.checkinsPaused
      ? el('p', { class: 'tiny', style: { color: 'var(--c-warn)' } },
          'Os avisos estão pausados porque dois seguidos passaram sem resposta. Responder um humor em Hoje religa sozinho.')
      : null,
    el('p', { class: 'tiny dim' },
      'Se dois avisos seguidos forem ignorados, o app para de perguntar por conta própria. Silêncio também é resposta.'),
    el('button', {
      class: 'btn btn--primary btn--block', style: { marginTop: '10px' },
      onclick: async () => {
        const horas = ckTimes.value.split(',').map(x => x.trim())
          .filter(x => /^\d{2}:\d{2}$/.test(x)).sort();
        await S.settings.set('checkinsEnabled', ckOn.checked);
        if (horas.length) await S.settings.set('checkinTimes', horas);
        await S.settings.set('checkinMaxPerDay', Number(ckMax.value) || 3);
        await S.settings.set('checkinQuietFrom', ckDe.value || '22:00');
        await S.settings.set('checkinQuietTo', ckAte.value || '07:00');
        await S.settings.set('checkinsPaused', false);
        await S.settings.set('checkinIgnored', 0);
        ok('Preferências salvas');
      },
    }, 'Salvar')));

  const aiEnabled = el('input', { type: 'checkbox', checked: !!s.aiEnabled });
  const aiEndpoint = el('input', { class: 'input', placeholder: 'https://…', value: s.aiEndpoint || '' });
  const aiKey = el('input', { class: 'input', type: 'password', placeholder: 'Chave (fica só neste aparelho)', value: s.aiKey || '' });
  const aiModel = el('input', { class: 'input', placeholder: 'Modelo (opcional)', value: s.aiModel || '' });

  root.appendChild(el('div', { class: 'card' },
    el('p', { class: 'small muted' },
      'Ao importar um print, o app tenta ler o texto com o recurso do próprio navegador. Se quiser mais precisão, você pode ligar uma API de IA da sua escolha. A imagem só é enviada quando isto estiver ativado — os dados continuam salvos apenas aqui.'),
    el('label', { class: 'switch', style: { marginTop: '10px' } }, aiEnabled, el('span', {}, 'Usar API de IA para ler imagens')),
    field('Endereço da API', aiEndpoint),
    field('Chave de acesso', aiKey),
    field('Modelo', aiModel),
    el('button', {
      class: 'btn btn--block',
      onclick: async () => {
        await S.settings.set('aiEnabled', aiEnabled.checked);
        await S.settings.set('aiEndpoint', aiEndpoint.value.trim());
        await S.settings.set('aiKey', aiKey.value.trim());
        await S.settings.set('aiModel', aiModel.value.trim());
        ok('Configuração salva');
      },
    }, 'Salvar'),
    el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
      'Detector nativo do navegador: ' + ('TextDetector' in window ? 'disponível' : 'não disponível neste aparelho')),
  ));

  /* dados e sobre --------------------------------------------------------- */
  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Dados')));
  root.appendChild(el('button', { class: 'btn btn--block', style: { marginBottom: '8px' }, onclick: () => go('#/sync') },
    icon('repeat'), s.syncEnabled ? 'Sincronização entre aparelhos (ligada)' : 'Sincronizar com outro aparelho'));
  root.appendChild(el('button', { class: 'btn btn--block', onclick: () => go('#/dados') },
    icon('data'), 'Backup, importação e exclusão'));
  root.appendChild(el('button', { class: 'btn btn--block', style: { marginTop: '8px' }, onclick: () => go('#/categorias') },
    icon('tag'), 'Gerenciar categorias'));

  root.appendChild(el('div', { class: 'card', style: { marginTop: '20px' } },
    el('h3', {}, 'Sobre o Rotina'),
    el('p', { class: 'small muted', style: { marginTop: '6px' } },
      'Planejar → Executar → Registrar → Revisar. Um diário operacional da sua rotina, que funciona offline e guarda tudo no seu aparelho.'),
    el('p', { class: 'tiny dim' }, s.syncEnabled
      ? 'Sincronização ligada: os dados também ficam no seu projeto do Firebase.'
      : 'Sem servidor próprio, sem login, sem nuvem.'),
    el('p', { class: 'tiny dim' }, `Instalado: ${window.matchMedia('(display-mode: standalone)').matches ? 'sim' : 'ainda não (use "Adicionar à tela inicial")'}`)));
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export { fmtDate, fmtTime };
