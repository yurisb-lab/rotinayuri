/* Service worker — funcionamento offline.
   Estratégia: app shell em cache (cache-first com atualização em segundo plano)
   e navegação com fallback para o index.html. */

const VERSION = 'rotina-v4';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/views.css',
  'js/app.js',
  'js/core/db.js',
  'js/core/store.js',
  'js/core/bus.js',
  'js/core/router.js',
  'js/util/date.js',
  'js/util/dom.js',
  'js/features/nlp.js',
  'js/features/recurrence.js',
  'js/features/reminders.js',
  'js/features/speech.js',
  'js/features/ocr.js',
  'js/features/gcal.js',
  'js/features/search.js',
  'js/features/backup.js',
  'js/ui/modal.js',
  'js/ui/toast.js',
  'js/ui/forms.js',
  'js/ui/items.js',
  'js/ui/quickadd.js',
  'js/ui/dragdrop.js',
  'js/views/hoje.js',
  'js/views/tarefas.js',
  'js/views/calendario.js',
  'js/views/registro.js',
  'js/views/notas.js',
  'js/views/entrada.js',
  'js/views/mais.js',
  'js/views/dashboard.js',
  'js/views/historico.js',
  'js/views/config.js',
  'js/views/dados.js',
  'js/views/categorias.js',
  'js/views/busca.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) ||
          new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) {
      event.waitUntil(refresh(req));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});

async function refresh(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  } catch { /* offline: mantém o cache */ }
}

/* Toque na notificação abre o aplicativo */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.refKind === 'event' ? '#/calendario' : '#/hoje';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        client.postMessage({ type: 'NAVIGATE', url: target });
        return client.focus();
      }
    }
    return self.clients.openWindow('./' + target);
  })());
});
