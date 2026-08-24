/* Adaptador do Firebase — a única parte do app que conhece o Firestore.

   O SDK não vem embutido: é carregado sob demanda do CDN do Google, e só
   quando a sincronização está ligada. Assim o app continua abrindo offline,
   instantâneo e sem peso morto para quem nunca ligar a nuvem.

   Nada aqui decide regra de sincronização — isso é de `sync.js`. Aqui só
   existe: autenticar, enviar documentos, buscar o que mudou. */

/* Versões testadas, em ordem de preferência. A primeira que carregar vence;
   o resultado fica guardado para as próximas aberturas. Se um dia todas
   falharem, dá para fixar a versão em Configurações → Sincronização. */
export const SDK_VERSIONS = ['10.12.5', '10.14.1', '11.10.0', '12.0.0'];
const cdn = (v, mod) => `https://www.gstatic.com/firebasejs/${v}/firebase-${mod}.js`;

let sdk = null;        /* { version, app, auth, firestore } */
let app = null, auth = null, fs = null, provider = null;
let currentUser = null;
const authListeners = new Set();

/** Carrega os três módulos do SDK, tentando as versões conhecidas. */
export async function loadSDK(preferred) {
  if (sdk) return sdk;
  const tentativas = preferred ? [preferred, ...SDK_VERSIONS.filter(v => v !== preferred)] : SDK_VERSIONS;
  let ultimoErro = null;
  for (const v of tentativas) {
    try {
      const [a, b, c] = await Promise.all([
        import(/* @vite-ignore */ cdn(v, 'app')),
        import(/* @vite-ignore */ cdn(v, 'auth')),
        import(/* @vite-ignore */ cdn(v, 'firestore')),
      ]);
      sdk = { version: v, app: a, auth: b, firestore: c };
      return sdk;
    } catch (e) { ultimoErro = e; }
  }
  throw new Error('Não consegui carregar o SDK do Firebase. Verifique a conexão — '
    + `a sincronização precisa de internet na primeira vez. (${ultimoErro?.message || 'sem detalhe'})`);
}

export function loadedVersion() { return sdk?.version || null; }

/** Liga o app ao projeto do Firebase e restaura a sessão, se houver. */
export async function init(config, { sdkVersion } = {}) {
  if (!config?.apiKey || !config?.projectId) throw new Error('Configuração do Firebase incompleta.');
  const s = await loadSDK(sdkVersion || null);
  if (!app) {
    app = s.app.getApps().length ? s.app.getApp() : s.app.initializeApp(config);
    auth = s.auth.getAuth(app);
    fs = s.firestore.getFirestore(app);
    provider = new s.auth.GoogleAuthProvider();
    try { await s.auth.setPersistence(auth, s.auth.browserLocalPersistence); } catch { /* padrão serve */ }
    s.auth.onAuthStateChanged(auth, u => {
      currentUser = u ? { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL } : null;
      authListeners.forEach(fn => { try { fn(currentUser); } catch (e) { console.error(e); } });
    });
    /* Volta de um login por redirecionamento (celular, app instalado). */
    try { await s.auth.getRedirectResult(auth); } catch (e) { console.warn('Retorno do login', e); }
  }
  return { version: s.version };
}

export const ready = () => !!fs;
export const user = () => currentUser;
export function onAuth(fn) { authListeners.add(fn); return () => authListeners.delete(fn); }

/** Espera o Firebase decidir se já existe sessão salva (evita "sem conta"
    piscando na primeira tela). */
export function waitAuth(timeout = 6000) {
  const s = sdk;
  if (!s || !auth) return Promise.resolve(null);
  return new Promise(resolve => {
    const t = setTimeout(() => { stop(); resolve(currentUser); }, timeout);
    const stop = s.auth.onAuthStateChanged(auth, u => {
      clearTimeout(t); stop();
      resolve(u ? { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL } : null);
    });
  });
}

/** Entrar com a conta Google. Janela pop-up no computador; se o navegador
    bloquear — comum no app instalado do celular — cai para redirecionamento. */
export async function signIn() {
  const s = sdk;
  try {
    const cred = await s.auth.signInWithPopup(auth, provider);
    return { uid: cred.user.uid, email: cred.user.email, name: cred.user.displayName, photo: cred.user.photoURL };
  } catch (e) {
    const cai = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment',
      'auth/cancelled-popup-request', 'auth/popup-closed-by-user'].includes(e?.code);
    if (!cai) throw e;
    await s.auth.signInWithRedirect(auth, provider);
    return null;                     /* a página recarrega e volta autenticada */
  }
}

export async function signOut() {
  if (auth) await sdk.auth.signOut(auth);
  currentUser = null;
}

const BATCH = 400;                   /* o limite do Firestore é 500 operações */

/** Envia documentos de uma tabela. `rows` já vem limpo e com a chave. */
export async function push(store, rows, { uid, deviceId, keyPath }) {
  const { collection, doc, writeBatch, serverTimestamp } = sdk.firestore;
  const col = collection(fs, 'usuarios', uid, store);
  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = writeBatch(fs);
    for (const row of rows.slice(i, i + BATCH)) {
      lote.set(doc(col, String(row[keyPath])), { ...row, _dev: deviceId, serverAt: serverTimestamp() });
    }
    await lote.commit();
  }
  return rows.length;
}

/** Tudo que chegou ao servidor a partir de `sinceMillis` (inclusive).
    A paginação usa o próprio documento como marcador, então empates de
    horário — um lote inteiro gravado no mesmo instante — não somem. */
export async function pull(store, sinceMillis, { uid } = {}) {
  const { collection, query, where, orderBy, limit, startAfter, getDocs, Timestamp } = sdk.firestore;
  const col = collection(fs, 'usuarios', uid, store);
  const base = sinceMillis
    ? [where('serverAt', '>=', Timestamp.fromMillis(sinceMillis)), orderBy('serverAt'), limit(BATCH)]
    : [orderBy('serverAt'), limit(BATCH)];

  const rows = [];
  let maxAt = sinceMillis || 0, cursor = null;
  for (;;) {
    const q = cursor ? query(col, ...base, startAfter(cursor)) : query(col, ...base);
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      const { serverAt, _dev, ...rec } = d.data();
      const at = serverAt?.toMillis?.() || 0;
      if (at > maxAt) maxAt = at;
      rows.push({ rec, dev: _dev || null });
    }
    if (snap.size < BATCH) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { rows, maxAt };
}
