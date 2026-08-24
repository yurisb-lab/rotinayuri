/* Sincronização entre aparelhos.

   A regra que não se quebra: o aparelho continua lendo e escrevendo no
   IndexedDB, sempre. A nuvem é uma réplica que acerta as contas em segundo
   plano. Se a rede cair, o app não muda de comportamento — só fica com
   mudanças pendentes de envio.

   Como funciona, em duas frases: cada tabela guarda dois marcadores, o que já
   foi enviado (por `updatedAt` local) e o que já foi recebido (pelo horário do
   servidor). A cada rodada, manda o que mudou depois do primeiro marcador e
   busca o que chegou depois do segundo.

   Conflito: vence quem escreveu por último (`updatedAt`). `tags` e `aliases`
   são a exceção — nessas listas, a união é quase sempre a intenção certa.
   Exclusão é uma escrita como outra qualquer: o `deletedAt` viaja junto, e é
   por isso que os tombstones existem (ver docs/sincronizacao.md). */

import * as db from '../core/db.js';
import * as S from '../core/store.js';
import { emit, on } from '../core/bus.js';
import * as remote from './firebase.js';

const TABELAS = [...db.SYNCABLE];

/* ------------------------------------------------------------------ estado */
let estado = 'desligada';   /* desligada | sem-conta | sincronizando | ok | offline | erro */
let detalhe = '';
let rodando = false, naFila = false, aplicando = false;
let timer = null, intervalo = null, ligada = false;

export function status() {
  return {
    estado, detalhe,
    conta: remote.user(),
    ultima: S.settings.get('lastSync') || null,
    configurada: !!config(),
    ligada: !!S.settings.get('syncEnabled'),
  };
}
function setEstado(e, d = '') {
  estado = e; detalhe = d;
  emit('sync', status());
}

export const config = () => S.settings.get('firebaseConfig') || null;

/* -------------------------------------------------------------- marcadores */
const enviados = () => ({ ...(S.settings.get('syncPushed') || {}) });
const recebidos = () => ({ ...(S.settings.get('syncPulled') || {}) });

/** Reinicia os marcadores: a próxima rodada compara tudo de novo. Serve para
    trazer um aparelho novo por inteiro, ou para desencalhar. */
export async function resetCursors() {
  await S.settings.set('syncPushed', {});
  await S.settings.set('syncPulled', {});
}

/* ----------------------------------------------------------------- ligar */
export async function connect({ silencioso = false } = {}) {
  const cfg = config();
  if (!cfg) { setEstado('desligada', 'Sem configuração do Firebase.'); return false; }
  /* Sem rede, nem tenta: buscar o SDK só encheria o console de erro. */
  if (!navigator.onLine && !remote.ready()) { setEstado('offline'); return false; }
  try {
    const { version } = await remote.init(cfg, { sdkVersion: S.settings.get('firebaseSdkVersion') || null });
    /* Guarda a versão que funcionou: nas próximas aberturas ela é a primeira
       tentativa, em vez de percorrer a lista de novo. */
    if (version && version !== S.settings.get('firebaseSdkVersion')) {
      await S.settings.set('firebaseSdkVersion', version);
    }
    const u = await remote.waitAuth();
    setEstado(u ? 'ok' : 'sem-conta');
    if (u) await S.settings.set('syncAccount', u.email || u.uid);
    return true;
  } catch (e) {
    setEstado(navigator.onLine ? 'erro' : 'offline', e.message);
    if (!silencioso) throw e;
    return false;
  }
}

export async function enable(cfg) {
  if (cfg) await S.settings.set('firebaseConfig', cfg);
  await S.settings.set('syncEnabled', true);
  ligada = true;
  await connect();
  watch();
  return status();
}

export async function disable({ sairDaConta = true } = {}) {
  await S.settings.set('syncEnabled', false);
  ligada = false;
  clearTimeout(timer); clearInterval(intervalo); intervalo = null;
  if (sairDaConta) { try { await remote.signOut(); } catch { /* já saiu */ } }
  setEstado('desligada');
}

export async function signIn() {
  if (!remote.ready()) await connect();
  const u = await remote.signIn();
  if (u) {
    await S.settings.set('syncAccount', u.email || u.uid);
    setEstado('ok');
    await syncNow();
  }
  return u;
}

export async function signOut() {
  await remote.signOut();
  await S.settings.set('syncAccount', null);
  setEstado('sem-conta');
}

/* --------------------------------------------------------------- a rodada */
export async function syncNow({ completa = false } = {}) {
  if (!S.settings.get('syncEnabled')) return { pulou: 'desligada' };
  if (rodando) { naFila = true; return { pulou: 'em andamento' }; }
  if (!navigator.onLine) { setEstado('offline'); return { pulou: 'sem rede' }; }
  if (!remote.ready() && !(await connect({ silencioso: true }))) return { pulou: 'sem conexão' };

  const u = remote.user();
  if (!u) { setEstado('sem-conta'); return { pulou: 'sem conta' }; }
  if (completa) await resetCursors();

  rodando = true;
  setEstado('sincronizando');
  const relatorio = { enviados: 0, recebidos: 0, aplicados: 0 };
  try {
    const push = enviados(), pull = recebidos();
    const dev = S.deviceId();
    let mudou = false;

    for (const tabela of TABELAS) {
      const kp = db.STORES[tabela].keyPath;

      /* subir o que mudou aqui */
      const desde = push[tabela] || null;
      const linhas = desde
        ? await db.changedSince(tabela, desde)
        : await db.getAll(tabela, { includeDeleted: true });
      const prontas = await carimbar(tabela, linhas);
      if (prontas.length) {
        await remote.push(tabela, prontas.map(limpar), { uid: u.uid, deviceId: dev, keyPath: kp });
        relatorio.enviados += prontas.length;
        push[tabela] = recuar(maiorData(prontas));
      }

      /* baixar o que mudou lá */
      const { rows, maxAt } = await remote.pull(tabela, pull[tabela] || 0, { uid: u.uid });
      relatorio.recebidos += rows.length;
      if (rows.length) {
        const n = await aplicar(tabela, rows.map(r => r.rec), kp);
        relatorio.aplicados += n;
        if (n) mudou = true;
      }
      if (maxAt) pull[tabela] = maxAt;
    }

    await S.settings.set('syncPushed', push);
    await S.settings.set('syncPulled', pull);
    await S.settings.set('lastSync', new Date().toISOString());

    if (mudou) await depoisDeAplicar();
    setEstado('ok');
    return relatorio;
  } catch (e) {
    console.warn('Sincronização falhou', e);
    setEstado(navigator.onLine ? 'erro' : 'offline', e.message || String(e));
    return { erro: e.message || String(e) };
  } finally {
    rodando = false;
    if (naFila) { naFila = false; schedule(1200); }
  }
}

/* Linhas antigas podem não ter `updatedAt` — sem ele não há como comparar
   versões nem avançar o marcador. Carimba uma vez, aqui, e o resto do
   mecanismo passa a funcionar igual para todo mundo. */
async function carimbar(tabela, linhas) {
  const sem = linhas.filter(r => !r.updatedAt);
  if (!sem.length) return linhas;
  const corrigidas = sem.map(r => ({ ...r, updatedAt: r.createdAt || new Date(0).toISOString() }));
  await db.putMany(tabela, corrigidas);
  const porChave = new Map(corrigidas.map(r => [r[db.STORES[tabela].keyPath], r]));
  return linhas.map(r => porChave.get(r[db.STORES[tabela].keyPath]) || r);
}

const quando = r => r?.updatedAt || r?.createdAt || '';
const maiorData = rows => rows.reduce((m, r) => (quando(r) > m ? quando(r) : m), '');
/* Um milissegundo para trás: o marcador é comparado com `>`, e uma linha
   gravada no mesmo milissegundo da última enviada ficaria para trás. */
function recuar(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t - 1).toISOString() : iso;
}
/* O Firestore recusa `undefined`; a ida e volta por JSON também garante que
   nada de exótico (Date, função) escape para a nuvem. */
const limpar = row => JSON.parse(JSON.stringify(row));

/* ------------------------------------------------------------- mesclagem */
async function aplicar(tabela, linhas, kp) {
  const gravar = [];
  for (const vinda of linhas) {
    const chave = vinda[kp];
    if (chave == null) continue;
    const local = await db.get(tabela, chave, { includeDeleted: true });
    const merged = mesclar(local, vinda);
    if (merged) gravar.push(merged);
  }
  if (!gravar.length) return 0;
  aplicando = true;
  try { await db.putMany(tabela, gravar); } finally { aplicando = false; }
  return gravar.length;
}

/** Última escrita vence. Devolve `null` quando não há nada a fazer — é o
    caso comum: o que volta do servidor costuma ser o que este aparelho
    acabou de mandar. */
export function mesclar(local, vinda) {
  if (!local) return vinda;
  const a = quando(local), b = quando(vinda);
  if (b < a) return null;
  if (b === a && !!local.deletedAt === !!vinda.deletedAt) return null;
  const out = { ...vinda };
  for (const campo of ['tags', 'aliases']) {
    if (Array.isArray(local[campo]) || Array.isArray(vinda[campo])) {
      out[campo] = [...new Set([...(local[campo] || []), ...(vinda[campo] || [])])];
    }
  }
  return out;
}

/* Categorias e ajustes vivem em cache na memória, e os lembretes são
   derivados de tarefas e compromissos: depois de receber dados novos, os
   três precisam ser refeitos — senão a tela mostra o de antes. */
async function depoisDeAplicar() {
  aplicando = true;
  try {
    await S.init();
    const { rebuildAll } = await import('./reminders.js');
    await rebuildAll().catch(() => {});
    emit('data');
    emit('categories');
  } finally {
    aplicando = false;
  }
}

/* ------------------------------------------------------------- automação */
export function schedule(atraso = 4000) {
  if (!S.settings.get('syncEnabled')) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), atraso);
}

let vigiando = false;
function watch() {
  if (vigiando) return;
  vigiando = true;
  on('data', () => { if (!aplicando) schedule(6000); });
  on('settings', ({ key } = {}) => { if (key === 'syncEnabled' && S.settings.get('syncEnabled')) schedule(1000); });
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(1500); });
  clearInterval(intervalo);
  intervalo = setInterval(() => schedule(0), 5 * 60 * 1000);
  remote.onAuth(u => { if (u) { setEstado('ok'); schedule(800); } else setEstado('sem-conta'); });
}

/** Chamado no boot. Nunca joga: um problema de nuvem não pode impedir o app
    de abrir. */
export async function start() {
  if (!S.settings.get('syncEnabled') || !config()) { setEstado('desligada'); return; }
  ligada = true;
  watch();
  await connect({ silencioso: true });
  schedule(2500);
}

export const emAndamento = () => rodando;
export const estaLigada = () => ligada;
