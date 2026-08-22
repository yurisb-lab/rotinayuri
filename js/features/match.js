/* Casamento entre o que foi planejado e o que foi registrado (fase 3).

   Isolado num módulo próprio porque é o único pedaço do app com um algoritmo
   de verdade — e porque assim dá para testá-lo sem subir a interface.

   O limiar é deliberadamente conservador. Errar dizendo "fora do plano" é
   barato: a pessoa corrige com um toque. Errar casando dois itens diferentes
   esconde um acontecimento que ela queria enxergar. Na dúvida, não casa. */

import { normalizeText } from './nlp.js';
import { minutes } from '../util/date.js';

/** Palavras que aparecem em tudo e não distinguem nada. */
const VAZIAS = new Set([
  'para', 'pela', 'pelo', 'com', 'sem', 'dos', 'das', 'uma', 'uns', 'umas',
  'sobre', 'entre', 'este', 'esta', 'esse', 'essa', 'aquele', 'aquela',
  'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa', 'que', 'como', 'mais',
  'depois', 'antes', 'hoje', 'amanha', 'ontem', 'agora', 'ainda', 'toda',
  'todo', 'fazer', 'feito', 'coisa', 'coisas',
]);

/** Palavras significativas de um texto: sem acento, 4+ letras, fora da lista. */
export function palavras(texto) {
  return new Set(
    normalizeText(String(texto || ''))
      .split(/[^a-z0-9]+/)
      .filter(p => p.length >= 4 && !VAZIAS.has(p))
  );
}

const JANELA = 90;   // minutos de tolerância
const LIMIAR = 2;    // pontuação mínima para considerar casado

/** Pontua um par (registro, item planejado). Quanto maior, mais provável. */
export function pontuar(registro, planejado) {
  if (!planejado.time || !registro.time) return 0;
  const dist = Math.abs(minutes(registro.time) - minutes(planejado.time));
  if (dist > JANELA) return 0;

  let p = 0;
  const a = palavras(registro.text || registro.title);
  const b = palavras(planejado.title);
  for (const w of a) if (b.has(w)) { p += 2; break; }

  if (registro.categoryId && registro.categoryId === planejado.categoryId) p += 1;

  const pr = (registro.people?.length ? registro.people : (registro.person ? [registro.person] : []))
    .map(normalizeText);
  const pp = (planejado.people || []).map(normalizeText);
  if (pr.some(n => pp.includes(n))) p += 1;

  p -= Math.floor(dist / 30);
  return p;
}

/**
 * Casa os registros do dia com os itens planejados.
 *
 * Devolve um mapa `idDoRegistro → { planejadoId, pontos }` e a lista dos
 * registros que ficaram fora do plano. Uma correção manual (`log.unplanned`
 * true ou false) vence sempre — o automático nunca sobrescreve o que a
 * pessoa disse.
 */
export function casarDia(registros, planejados) {
  const casados = new Map();
  const fora = [];
  const usados = new Set();

  /* Registros mais antigos primeiro: se dois disputarem o mesmo item
     planejado, quem aconteceu antes tem preferência. */
  const ordenados = [...registros].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  for (const r of ordenados) {
    if (r.unplanned === true) { fora.push(r); continue; }
    if (r.unplanned === false && r.linkedTaskId) {
      casados.set(r.id, { planejadoId: r.linkedTaskId, pontos: null, manual: true });
      usados.add(r.linkedTaskId);
      continue;
    }

    let melhor = null, melhorP = 0;
    for (const p of planejados) {
      const chave = p.instanceId || p.id;
      if (usados.has(chave)) continue;
      const pontos = pontuar(r, p);
      if (pontos > melhorP) { melhorP = pontos; melhor = p; }
    }

    if (melhor && melhorP >= LIMIAR) {
      const chave = melhor.instanceId || melhor.id;
      casados.set(r.id, { planejadoId: chave, pontos: melhorP, manual: false });
      usados.add(chave);
    } else {
      fora.push(r);
    }
  }

  return { casados, fora, foraIds: new Set(fora.map(r => r.id)) };
}

export const CONFIG = { JANELA, LIMIAR };
