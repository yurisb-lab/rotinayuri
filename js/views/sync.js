/* Sincronização entre aparelhos — ligar, entrar na conta, acompanhar. */

import { el, icon, clear } from '../util/dom.js';
import * as S from '../core/store.js';
import * as Sync from '../features/sync.js';
import { section } from '../ui/items.js';
import { field } from '../ui/forms.js';
import { confirm as ask } from '../ui/modal.js';
import { ok, err } from '../ui/toast.js';
import { on } from '../core/bus.js';

export const title = 'Sincronização';

/* Um assinante só, trocado a cada desenho: a tela se redesenha sozinha
   enquanto a rodada acontece. */
let ouvindo = null;

const PILL = {
  desligada:      ['', 'Desligada'],
  'sem-conta':    ['pill--warn', 'Falta entrar na conta'],
  sincronizando:  ['pill--warn', 'Sincronizando…'],
  ok:             ['pill--ok', 'Em dia'],
  offline:        ['', 'Sem rede — vai enviar depois'],
  erro:           ['pill--danger', 'Erro'],
};

export async function render(root, { refresh }) {
  clear(root);
  const st = Sync.status();

  /* ---------------------------------------------------------- explicação */
  root.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Os mesmos dados no computador e no celular'),
    el('p', { class: 'small muted', style: { marginTop: '6px' } },
      'Cada aparelho continua com o banco dele, e é dele que o app lê e escreve — '
      + 'por isso tudo segue funcionando sem internet. A nuvem só acerta as contas '
      + 'em segundo plano: o que você criou aqui sobe, o que criou no outro desce.'),
    el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
      'Com a sincronização ligada, seus dados passam a ficar também no Firebase, '
      + 'num projeto que é seu, sob a sua conta Google.')));

  if (!st.configurada) {
    root.appendChild(setupCard(refresh));
    return;
  }

  /* -------------------------------------------------------------- estado */
  const [cls, label] = PILL[st.estado] || ['', st.estado];
  const cfg = Sync.config();

  root.appendChild(el('div', { style: { marginTop: '20px' } }, section('Estado')));
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'row row--between' },
      el('span', { class: 'small' }, 'Sincronização'),
      el('span', { class: `pill ${cls}` }, st.ligada ? label : 'Desligada')),
    st.detalhe ? el('p', { class: 'tiny', style: { color: 'var(--c-danger)', marginTop: '8px' } }, st.detalhe) : null,
    el('p', { class: 'tiny dim', style: { marginTop: '8px' } },
      `Projeto: ${cfg.projectId}`),
    st.conta
      ? el('p', { class: 'tiny dim' }, `Conta: ${st.conta.email || st.conta.uid}`)
      : el('p', { class: 'tiny', style: { color: 'var(--c-warn)' } }, 'Nenhuma conta conectada neste aparelho.'),
    el('p', { class: 'tiny dim' }, st.ultima
      ? `Última sincronização: ${new Date(st.ultima).toLocaleString('pt-BR')}`
      : 'Ainda não sincronizou neste aparelho.')));

  /* --------------------------------------------------------------- ações */
  const acoes = el('div', { class: 'stack', style: { marginTop: '14px' } });

  if (!st.ligada) {
    acoes.appendChild(el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        try { await Sync.enable(); ok('Sincronização ligada'); refresh(); }
        catch (e) { err(e.message); refresh(); }
      },
    }, icon('repeat'), 'Ligar sincronização'));
  } else if (!st.conta) {
    acoes.appendChild(el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        try {
          const u = await Sync.signIn();
          if (u) ok(`Conectado como ${u.email || u.name}`);
          refresh();
        } catch (e) { err(traduzir(e)); }
      },
    }, icon('google'), 'Entrar com o Google'));
  } else {
    acoes.appendChild(el('button', {
      class: 'btn btn--primary btn--block',
      onclick: async () => {
        const r = await Sync.syncNow();
        if (r?.erro) err(traduzir(r));
        else if (r?.pulou) ok(`Nada a fazer agora (${r.pulou})`);
        else ok(`Enviados ${r.enviados}, recebidos ${r.aplicados}`);
        refresh();
      },
    }, icon('repeat'), 'Sincronizar agora'));

    acoes.appendChild(el('button', {
      class: 'btn btn--block',
      onclick: async () => {
        const c = await ask({
          title: 'Comparar tudo de novo',
          message: 'Envia e busca todas as tabelas desde o começo, ignorando os marcadores. '
            + 'Serve para trazer um aparelho novo por inteiro. Nada é apagado.',
          okLabel: 'Comparar tudo',
        });
        if (!c) return;
        const r = await Sync.syncNow({ completa: true });
        if (r?.erro) err(traduzir(r)); else ok(`Enviados ${r.enviados}, recebidos ${r.aplicados}`);
        refresh();
      },
    }, 'Comparar tudo de novo'));

    acoes.appendChild(el('button', {
      class: 'btn btn--ghost btn--block',
      onclick: async () => { await Sync.signOut(); ok('Conta desconectada'); refresh(); },
    }, 'Sair da conta neste aparelho'));
  }

  if (st.ligada) {
    acoes.appendChild(el('button', {
      class: 'btn btn--danger btn--block',
      onclick: async () => {
        const c = await ask({
          title: 'Desligar sincronização',
          message: 'Os dados continuam neste aparelho e também continuam no Firebase — '
            + 'este aparelho só para de enviar e receber.',
          okLabel: 'Desligar', danger: true,
        });
        if (!c) return;
        await Sync.disable();
        ok('Sincronização desligada');
        refresh();
      },
    }, 'Desligar sincronização'));
  }

  acoes.appendChild(el('button', {
    class: 'btn btn--ghost btn--block',
    onclick: async () => {
      const c = await ask({
        title: 'Trocar configuração do Firebase',
        message: 'Você vai colar outra configuração. Os dados deste aparelho não são apagados.',
        okLabel: 'Trocar',
      });
      if (!c) return;
      await S.settings.set('firebaseConfig', null);
      await Sync.disable({ sairDaConta: false });
      refresh();
    },
  }, 'Trocar configuração'));

  root.appendChild(acoes);

  root.appendChild(el('p', { class: 'tiny dim', style: { marginTop: '18px' } },
    'A sincronização acontece sozinha: ao abrir o app, alguns segundos depois de '
    + 'cada alteração, ao voltar para a tela e a cada cinco minutos. Se estiver sem '
    + 'rede, o que ficou pendente sobe na próxima vez que houver conexão.'));

  /* Mantém o estado da tela vivo enquanto ela estiver aberta. */
  ouvindo?.();
  ouvindo = on('sync', () => {
    if (location.hash.startsWith('#/sync')) refresh();
    else { ouvindo?.(); ouvindo = null; }
  });
}

/* ------------------------------------------------------- primeira vez */
function setupCard(refresh) {
  const cfgInput = el('textarea', {
    class: 'input', rows: 8, spellcheck: 'false',
    placeholder: '{\n  "apiKey": "…",\n  "authDomain": "…",\n  "projectId": "…",\n  "appId": "…"\n}',
  });

  return el('div', {},
    el('div', { style: { marginTop: '20px' } }, section('Configurar o Firebase')),
    el('div', { class: 'card' },
      el('ol', { class: 'small muted', style: { paddingLeft: '18px', lineHeight: '1.7' } },
        el('li', {}, 'Abra console.firebase.google.com e crie um projeto (pode se chamar "rotina").'),
        el('li', {}, 'Em Criação → Firestore Database, crie o banco (modo de produção).'),
        el('li', {}, 'Em Criação → Authentication, ative o provedor Google.'),
        el('li', {}, 'Em Authentication → Settings → Domínios autorizados, acrescente o endereço onde o app está publicado.'),
        el('li', {}, 'Em Configurações do projeto → Seus apps, registre um app da Web e copie o objeto firebaseConfig.'),
        el('li', {}, 'Em Firestore → Regras, cole as regras do arquivo firestore.rules do repositório. Sem isso, qualquer pessoa lê seus dados.')),
      el('p', { class: 'tiny dim', style: { marginTop: '10px' } },
        'O passo a passo completo está em docs/firebase.md. Essas chaves não são segredo — '
        + 'quem protege os dados são as regras do Firestore.'),
      field('Cole aqui o firebaseConfig', cfgInput),
      el('button', {
        class: 'btn btn--primary btn--block',
        onclick: async () => {
          let cfg;
          try { cfg = parseConfig(cfgInput.value); }
          catch (e) { err(e.message); return; }
          try {
            await Sync.enable(cfg);
            ok('Configuração salva. Agora entre com o Google.');
          } catch (e) { err(traduzir(e)); }
          refresh();
        },
      }, 'Salvar e ligar')));
}

/** Aceita tanto JSON quanto o trecho de JavaScript que o console mostra. */
export function parseConfig(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) throw new Error('Cole a configuração do Firebase.');
  let s = bruto
    .replace(/^[\s\S]*?firebaseConfig\s*=\s*/, '')   /* tira "const firebaseConfig =" */
    .replace(/;\s*$/, '')
    .trim();
  const abre = s.indexOf('{'), fecha = s.lastIndexOf('}');
  if (abre === -1 || fecha === -1) throw new Error('Não encontrei o objeto de configuração.');
  s = s.slice(abre, fecha + 1)
    .replace(/\/\/[^\n]*/g, '')                      /* comentários */
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')  /* chaves sem aspas */
    .replace(/'/g, '"')
    .replace(/,(\s*[}\]])/g, '$1');                  /* vírgula sobrando */
  let cfg;
  try { cfg = JSON.parse(s); }
  catch { throw new Error('Não consegui ler essa configuração. Copie o bloco inteiro, das chaves { até }.'); }
  for (const campo of ['apiKey', 'projectId', 'appId']) {
    if (!cfg[campo]) throw new Error(`Falta "${campo}" na configuração.`);
  }
  if (!cfg.authDomain) cfg.authDomain = `${cfg.projectId}.firebaseapp.com`;
  return cfg;
}

function traduzir(e) {
  const code = e?.code || '';
  const msg = e?.erro || e?.message || String(e);
  if (code === 'auth/unauthorized-domain')
    return 'Este endereço não está autorizado no Firebase. Acrescente-o em Authentication → Settings → Domínios autorizados.';
  if (code === 'auth/operation-not-allowed')
    return 'O login com Google ainda não foi ativado no projeto (Authentication → Sign-in method).';
  if (code === 'permission-denied' || /permission/i.test(msg))
    return 'O Firestore recusou o acesso. Confira as regras de segurança (firestore.rules).';
  return msg;
}
