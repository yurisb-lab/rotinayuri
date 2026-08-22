/* Check-ins de humor (fase 7).

   Módulo próprio de propósito. Seria tentador gravar os horários na tabela
   `reminders` e reaproveitar o agendador — mas `rebuildAll()` limpa aquela
   tabela e a reconstrói SÓ a partir de tarefas e compromissos. Check-ins
   gravados ali sumiriam, em silêncio, na primeira restauração de backup.
   Aqui reaproveitamos apenas `notify()`, que é genérico.

   A regra mais importante deste arquivo não é técnica: se dois check-ins
   seguidos forem ignorados, o app para de perguntar. Silêncio é uma resposta
   válida, e um app que insiste depois dela é desinstalado. */

import * as S from '../core/store.js';
import { notify } from './reminders.js';
import { today, nowTime, minutes } from '../util/date.js';

export const DEFAULTS = {
  checkinsEnabled: false,          // desligado até a pessoa pedir
  checkinTimes: ['08:30', '13:30', '19:30'],
  checkinMaxPerDay: 3,
  checkinQuietFrom: '22:00',
  checkinQuietTo: '07:00',
  checkinIgnored: 0,
  checkinsPaused: false,
  checkinLastPrompt: null,         // "AAAA-MM-DD HH:MM" do último aviso
};

export function config() {
  const s = S.settings.all();
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = s[k] ?? DEFAULTS[k];
  return out;
}

/** Está dentro do horário de silêncio? Cobre janelas que cruzam a meia-noite. */
export function emSilencio(hora = nowTime(), c = config()) {
  const m = minutes(hora), de = minutes(c.checkinQuietFrom), ate = minutes(c.checkinQuietTo);
  return de > ate ? (m >= de || m < ate) : (m >= de && m < ate);
}

/** Próximo horário de check-in ainda não usado hoje. */
export function proximoHorario(depoisDe = nowTime(), c = config()) {
  const m = minutes(depoisDe);
  return c.checkinTimes
    .filter(t => minutes(t) > m)
    .sort()[0] || null;
}

/**
 * Decide se cabe perguntar agora. Devolve o horário previsto que venceu, ou
 * null. Todas as portas precisam estar abertas: ligado, não pausado, fora do
 * silêncio, abaixo do teto do dia e sem já ter perguntado neste horário.
 */
export async function devePerguntar(agora = nowTime(), date = today()) {
  const c = config();
  if (!c.checkinsEnabled || c.checkinsPaused) return null;
  if (emSilencio(agora, c)) return null;

  const feitos = await S.checkins.forDate(date);
  if (feitos.length >= c.checkinMaxPerDay) return null;

  const m = minutes(agora);
  const vencidos = c.checkinTimes.filter(t => minutes(t) <= m).sort();
  const alvo = vencidos[vencidos.length - 1];
  if (!alvo) return null;

  /* já respondeu depois desse horário? então este já foi atendido */
  if (feitos.some(f => minutes(f.time) >= minutes(alvo))) return null;
  if (c.checkinLastPrompt === `${date} ${alvo}`) return null;

  return alvo;
}

/**
 * Verifica e, se couber, avisa. Também aplica a regra dos dois ignorados.
 * Chamado no boot e a cada alguns minutos — nunca cria timer próprio de
 * segundo plano, porque a PWA só roda enquanto está aberta.
 */
export async function check(date = today()) {
  const alvo = await devePerguntar(nowTime(), date);
  if (!alvo) return null;

  const c = config();
  /* Se o aviso anterior passou sem resposta, conta como ignorado. */
  if (c.checkinLastPrompt) {
    const [dPrev, hPrev] = c.checkinLastPrompt.split(' ');
    const feitos = await S.checkins.forDate(dPrev);
    const respondeu = feitos.some(f => f.time >= hPrev);
    if (!respondeu) {
      const n = (c.checkinIgnored || 0) + 1;
      await S.settings.set('checkinIgnored', n);
      if (n >= 2) {
        await S.settings.set('checkinsPaused', true);
        return null;
      }
    } else if (c.checkinIgnored) {
      await S.settings.set('checkinIgnored', 0);
    }
  }

  await S.settings.set('checkinLastPrompt', `${date} ${alvo}`);
  await notify('Como está seu dia até aqui?', 'Uma resposta de um toque, se você quiser.',
    { tag: `checkin-${date}-${alvo}`, refKind: 'checkin' });
  return alvo;
}

/** Registrar um humor destrava os avisos de novo. Responder é o sinal. */
export async function registrar(mood, extra = {}) {
  const rec = await S.checkins.add(mood, extra);
  await S.settings.set('checkinIgnored', 0);
  if (S.settings.get('checkinsPaused')) await S.settings.set('checkinsPaused', false);
  return rec;
}

/** A faixa deve aparecer em Hoje? Independe de notificação. */
export async function mostrarFaixa(date = today()) {
  const c = config();
  if (!c.checkinsEnabled) return false;
  if (emSilencio()) return false;
  const feitos = await S.checkins.forDate(date);
  if (feitos.length >= c.checkinMaxPerDay) return false;
  const m = minutes(nowTime());
  const vencidos = c.checkinTimes.filter(t => minutes(t) <= m);
  if (!vencidos.length) return false;
  const ultimo = vencidos.sort().pop();
  return !feitos.some(f => minutes(f.time) >= minutes(ultimo));
}

let timer = null;
export function start(intervalMs = 300000) {
  stop();
  check();
  timer = setInterval(check, intervalMs);
}
export function stop() { if (timer) clearInterval(timer); timer = null; }
