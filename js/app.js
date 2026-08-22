/* Ponto de entrada do aplicativo. */

import { $, el } from './util/dom.js';
import * as S from './core/store.js';
import * as Router from './core/router.js';
import { on } from './core/bus.js';
import * as Rem from './features/reminders.js';
import * as Checkins from './features/checkins.js';
import { openQuickAdd, instantLog } from './ui/quickadd.js';
import { closeTop, hasOpen } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { applyTheme } from './views/config.js';

import * as hoje from './views/hoje.js';
import * as tarefas from './views/tarefas.js';
import * as calendario from './views/calendario.js';
import * as registro from './views/registro.js';
import * as notas from './views/notas.js';
import * as entrada from './views/entrada.js';
import * as mais from './views/mais.js';
import * as dashboard from './views/dashboard.js';
import * as historico from './views/historico.js';
import * as config from './views/config.js';
import * as dados from './views/dados.js';
import * as categorias from './views/categorias.js';
import * as busca from './views/busca.js';
import * as semana from './views/semana.js';
import * as pessoas from './views/pessoas.js';
import * as lugares from './views/lugares.js';
import * as retrospectiva from './views/retrospectiva.js';

const VIEWS = {
  hoje, tarefas, calendario, registro, notas, entrada, mais,
  dashboard, historico, config, dados, categorias, busca,
  semana, pessoas, lugares, retrospectiva,
};

async function boot() {
  try {
    await S.init();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">
      <h2>Não foi possível abrir o banco de dados local</h2>
      <p>${e.message}</p>
      <p>Verifique se o navegador permite armazenamento neste site.</p></div>`;
    return;
  }

  applyTheme(S.settings.get('theme') || 'auto');
  for (const [name, mod] of Object.entries(VIEWS)) Router.register(name, mod);

  wireChrome();
  Router.start();

  Rem.start(30000);
  Checkins.start(300000);
  await updateBadge();
  on('data', updateBadge);
  on('inbox', updateBadge);
  on('*', evt => { if (['tasks', 'events', 'logs', 'notes', 'inbox', 'days'].includes(evt)) refreshIfVisible(); });

  registerServiceWorker();
  handleShareTarget();
  askPersistentStorage();
}

let refreshTimer = null;
function refreshIfVisible() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (!hasOpen()) Router.render(); }, 120);
}

function wireChrome() {
  $('#fab').addEventListener('click', () => openQuickAdd(() => Router.render()));
  $('#fabLog').addEventListener('click', () => instantLog(() => Router.render()));
  $('#btnSearch').addEventListener('click', () => Router.go('#/busca'));
  $('#btnTheme').addEventListener('click', async () => {
    const order = ['auto', 'light', 'dark'];
    const cur = S.settings.get('theme') || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    await S.settings.set('theme', next);
    applyTheme(next);
    toast(`Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[next]}`);
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && hasOpen()) { e.preventDefault(); closeTop(); }
  });

  /* Botão voltar do Android fecha a folha aberta antes de sair da tela */
  window.addEventListener('popstate', () => { if (hasOpen()) closeTop(); });
}

async function updateBadge() {
  try {
    const pending = await S.inbox.pending();
    const badge = $('#inboxBadge');
    badge.hidden = pending.length === 0;
    if ('setAppBadge' in navigator) {
      const overdue = await S.tasks.overdue();
      const n = pending.length + overdue.length;
      if (n) navigator.setAppBadge(n).catch(() => {});
      else navigator.clearAppBadge?.().catch(() => {});
    }
  } catch { /* sem problema */ }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const doRegister = async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nova versão disponível', {
              action: 'atualizar', timeout: 8000,
              onAction: () => { sw.postMessage({ type: 'SKIP_WAITING' }); location.reload(); },
            });
          }
        });
      });
    } catch (e) { console.warn('Service worker não registrado', e); }
  };
  if (document.readyState === 'complete') doRegister();
  else window.addEventListener('load', doRegister, { once: true });

  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data?.type === 'NAVIGATE' && ev.data.url) Router.go(ev.data.url);
  });
}

/* Compartilhar para o app (Web Share Target) e atalhos do manifesto */
function handleShareTarget() {
  const url = new URL(location.href);
  const shared = url.searchParams.get('texto') || url.searchParams.get('text');
  const action = url.searchParams.get('acao');
  if (shared) {
    import('./ui/quickadd.js').then(m => m.openTextCapture(shared, () => Router.render()));
    history.replaceState(null, '', location.pathname + (location.hash || '#/hoje'));
    return;
  }
  if (action) {
    import('./ui/quickadd.js').then(m => {
      if (action === 'registrar') m.instantLog(() => Router.render());
      if (action === 'voz') m.openVoiceCapture(() => Router.render());
      if (action === 'texto') m.openTextCapture('', () => Router.render());
      if (action === 'entrada') m.openInboxCapture().then(() => Router.render());
    });
    history.replaceState(null, '', location.pathname + (location.hash || '#/hoje'));
  }
}

async function askPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* opcional */ }
}

/* Convite para instalar ------------------------------------------------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (S.settings.get('installDismissed')) return;
  toast('Instale o Rotina na tela inicial', {
    action: 'instalar', timeout: 9000,
    onAction: async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome !== 'accepted') S.settings.set('installDismissed', true);
      deferredPrompt = null;
    },
  });
});

boot();

export { el };
