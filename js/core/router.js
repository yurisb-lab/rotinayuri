/* Roteador por hash: #/tela?param=valor */

import { $, $$, clear } from '../util/dom.js';
import { emit } from './bus.js';

const routes = new Map();
let current = null;
let rendering = false;

export function register(name, mod) { routes.set(name, mod); }

export function parseHash(hash = location.hash) {
  const raw = (hash || '#/hoje').replace(/^#\/?/, '') || 'hoje';
  const [path, qs] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: path || 'hoje', params };
}

export function go(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : `#/${hash}`;
  if (location.hash === target) return render();
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

export function current_() { return current; }

export async function render() {
  if (rendering) return;
  rendering = true;
  const { name, params } = parseHash();
  const mod = routes.get(name) || routes.get('hoje');
  const root = $('#view');
  current = { name, params };

  try {
    $('#topbarTitle').textContent = typeof mod.title === 'function' ? mod.title(params) : (mod.title || 'Rotina');
    document.title = `${$('#topbarTitle').textContent} · Rotina`;
    root.setAttribute('aria-busy', 'true');
    await mod.render(root, { params, refresh: () => { rendering = false; render(); }, go });
    root.setAttribute('aria-busy', 'false');
    root.scrollTop = 0;
    highlightTab(name);
    const isTab = ['hoje','tarefas','calendario','registro','notas','entrada','mais'].includes(name);
    $('#btnMenu').hidden = isTab;
    emit('route', { name, params });
  } catch (e) {
    console.error('Erro ao abrir a tela', name, e);
    clear(root);
    root.innerHTML = `<div class="empty">Não consegui abrir esta tela.<br><small>${String(e.message || e)}</small></div>`;
  } finally {
    rendering = false;
  }
}

const TAB_OF = {
  hoje: 'hoje', tarefas: 'tarefas', calendario: 'calendario', registro: 'registro',
  notas: 'notas', entrada: 'entrada', mais: 'mais', config: 'mais', dados: 'mais',
  categorias: 'mais', dashboard: 'mais', historico: 'mais', busca: 'mais',
  semana: 'mais', pessoas: 'mais', lugares: 'mais', retrospectiva: 'mais',
};

function highlightTab(name) {
  const tab = TAB_OF[name];
  $$('.tab').forEach(a => a.classList.toggle('is-active', a.dataset.tab === tab));
}

export function start() {
  $('#btnMenu').addEventListener('click', () => {
    if (history.length > 1) history.back(); else go('#/mais');
  });
  window.addEventListener('hashchange', () => render());
  if (!location.hash) history.replaceState(null, '', '#/hoje');
  render();
}
