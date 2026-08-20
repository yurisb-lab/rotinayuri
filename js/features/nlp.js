/* Interpretação de linguagem natural (pt-BR).
   Converte frases livres em tarefas, compromissos, registros, notas ou
   atividades recorrentes. Roda 100% local, sem enviar nada para fora. */

import { today, iso, parseISO, addDays, addMonths, dow, pad } from '../util/date.js';
import * as R from './recurrence.js';

/* ------------------------------------------------------------ dicionários */
const WEEKDAYS = [
  { i: 0, re: 'domingos?|dom\\.?' },
  { i: 1, re: 'segundas?(?:[- ]feiras?)?|seg\\.?' },
  { i: 2, re: 'ter[çc]as?(?:[- ]feiras?)?|ter\\.?' },
  { i: 3, re: 'quartas?(?:[- ]feiras?)?|qua\\.?' },
  { i: 4, re: 'quintas?(?:[- ]feiras?)?|qui\\.?' },
  { i: 5, re: 'sextas?(?:[- ]feiras?)?|sex\\.?' },
  { i: 6, re: 's[áa]bados?|s[áa]b\\.?' },
];
const WD_ALL = WEEKDAYS.map(w => w.re).join('|');
const MONTH_RE = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';
const MONTH_IDX = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};
const ORDINALS = { primeir: 1, segund: 2, terceir: 3, quart: 4, quint: 5, 'últim': -1, ultim: -1 };

const LOG_VERBS = [
  'fiz agora', 'fiz', 'acabei de', 'acabo de', 'terminei', 'finalizei', 'conclu[íi]',
  'falei', 'conversei', 'resolvi', 'atendi', 'enviei', 'entreguei', 'revisei', 'atualizei',
  'organizei', 'comprei', 'paguei', 'estudei', 'li', 'assisti', 'ajudei', 'visitei',
  'participei', 'fui', 'estive', 'liguei', 'respondi', 'configurei', 'instalei', 'arrumei',
  'consertei', 'corrigi', 'verifiquei', 'conferi', 'montei', 'preparei', 'escrevi', 'gravei',
  'editei', 'fotografei', 'reuni', 'apresentei', 'almocei', 'jantei', 'cheguei', 'sa[íi]',
  'comecei', 'iniciei', 'marquei', 'passei', 'trabalhei', 'orei', 'preguei', 'cantei', 'treinei',
];
const EVENT_WORDS = [
  'reuni[ãa]o', 'consulta', 'culto', 'encontro', 'audi[êe]ncia', 'missa', 'anivers[áa]rio',
  'casamento', 'viagem', 'voo', 'entrevista', 'almo[çc]o', 'jantar', 'caf[ée] com', 'visita',
  'evento', 'palestra', 'treinamento', 'apresenta[çc][ãa]o', 'compromisso', 'ensaio', 'show',
  'aula', 'plant[ãa]o', 'sess[ãa]o', 'batismo', 'ceia', 'formatura', 'exame', 'per[íi]cia',
];
const NOTE_WORDS = ['anota[çr]', 'ideia', 'id[ée]ia', 'observa[çc][ãa]o', 'lembrete de que', 'rascunho'];
const PRIORITY_WORDS = [
  [/(?<![\wÀ-ÿ])urgent(e|íssimo)(?![\wÀ-ÿ])/i, 'urgente'],
  [/(?<![\wÀ-ÿ])prioridade\s+(alta|máxima|maxima)(?![\wÀ-ÿ])/i, 'urgente'],
  [/(?<![\wÀ-ÿ])(importante|priorit[áa]ri[oa])(?![\wÀ-ÿ])/i, 'alta'],
  [/(?<![\wÀ-ÿ])se\s+der\s+tempo(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])sem\s+pressa(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])prioridade\s+baixa(?![\wÀ-ÿ])/i, 'baixa'],
];
const STOP_PLACE = new Set(['casa','breve','frente','seguida','ponto','dia','dias','semana','semanas','mês','mes','meses','ano','anos','hora','horas','manhã','manha','tarde','noite','ponto da','andamento']);

/* ------------------------------------------------------------- utilitários */
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function nextWeekdayFrom(base, target, forceNext = false) {
  const cur = dow(base);
  let delta = (target - cur + 7) % 7;
  if (delta === 0 && forceNext) delta = 7;
  if (forceNext && delta < 7 && delta !== 0) delta += 0; // "próxima sexta" = a mais próxima futura
  return addDays(base, delta);
}
function monthIndex(word) {
  const k = strip(word).slice(0, 3);
  return MONTH_IDX[k] ?? null;
}
function makeDate(y, m, d) {
  const dt = new Date(y, m, d, 12);
  return iso(dt);
}
/** Resolve dia/mês para a próxima ocorrência futura se o ano não for dado. */
function resolveDayMonth(day, month, year, ref) {
  const r = parseISO(ref);
  if (year) return makeDate(year < 100 ? 2000 + year : year, month, day);
  let cand = makeDate(r.getFullYear(), month, day);
  if (cand < ref) cand = makeDate(r.getFullYear() + 1, month, day);
  return cand;
}

/* ------------------------------------------------ máquina de consumo de texto */
class Scanner {
  constructor(text) { this.original = text; this.work = text; }
  /** Executa regex sobre o texto restante; handler recebe o match. */
  take(re, handler) {
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = rx.exec(this.work)) !== null) {
      const ok = handler(m);
      if (ok !== false) {
        this.work = this.work.slice(0, m.index) + ' '.repeat(m[0].length) + this.work.slice(m.index + m[0].length);
        return true;
      }
      rx.lastIndex = m.index + Math.max(1, m[0].length);
    }
    return false;
  }
  rest() {
    const GAP = '\u0000';
    let t = this.work.replace(/\s{2,}/g, GAP);
    const orphan = new RegExp(`(^|${GAP})\\s*(?:[àa]s?|em|nos?|nas?|de|do|da|dos|das|para|pra|pro|com|at[ée]|ao|e|o|a)\\s*(?=${GAP}|$)`, 'gi');
    for (let i = 0; i < 3; i++) t = t.replace(orphan, '$1');
    return t
      .split(GAP).join(' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,;:.\-–]+/, '')
      .replace(/[\s,;:.\-–]+$/, '')
      .trim();
  }
}

/* ------------------------------------------------------------- recorrência */
function parseRecurrence(sc) {
  let rec = null;
  const weekdaysIn = txt => {
    const found = [];
    for (const w of WEEKDAYS) {
      if (new RegExp(`(?<![\\wÀ-ÿ])(?:${w.re})(?![\\wÀ-ÿ])`, 'i').test(txt)) found.push(w.i);
    }
    return [...new Set(found)].sort();
  };

  // "toda primeira segunda-feira do mês"
  sc.take(new RegExp(`(?<![\\wÀ-ÿ])(?:tod[oa]s?\\s+(?:as?\\s+)?)?(primeir|segund|terceir|quart|quint|últim|ultim)[ao]s?\\s+(${WD_ALL})(?:\\s*-?\\s*feiras?)?\\s+d[eo]\\s+(?:cada\\s+)?m[êe]s(?![\\wÀ-ÿ])`, 'i'), m => {
    const nth = ORDINALS[strip(m[1])] ?? 1;
    const wd = weekdaysIn(m[2]);
    rec = { type: 'monthlyNth', nth, nthDow: wd[0] ?? 1, interval: 1 };
  });
  if (rec) return rec;

  // "de segunda a sexta" / "dias úteis"
  sc.take(/(?<![\wÀ-ÿ])de\s+(segunda|seg)\s*(?:-\s*feira)?\s+(?:a|até|ate)\s+(sexta|sex)\s*(?:-\s*feira)?(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])dias?\s+[úu]teis(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])em\s+dias?\s+[úu]teis(?![\wÀ-ÿ])/i, () => {
    rec = { type: 'weekdays', weekdays: [1, 2, 3, 4, 5], interval: 1 };
  });
  if (rec) return rec;

  // "todo sábado", "todas as segundas e quartas", "toda segunda, quarta e sexta"
  sc.take(new RegExp(`(?<![\\wÀ-ÿ])tod[oa]s?\\s+(?:as?\\s+|os\\s+)?((?:${WD_ALL})(?:\\s*(?:,|e|,\\s*e)\\s*(?:${WD_ALL}))*)(?![\\wÀ-ÿ])`, 'i'), m => {
    const wd = weekdaysIn(m[1]);
    if (!wd.length) return false;
    rec = { type: 'weekly', weekdays: wd, interval: 1 };
  });
  if (rec) return rec;

  // "todo dia 5 do mês", "todo mês no dia 10"
  sc.take(/(?<![\wÀ-ÿ])todo\s+(?:m[êe]s\s+(?:no\s+)?)?dia\s+(\d{1,2})(?:\s+d[eo]\s+(?:cada\s+)?m[êe]s)?(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])todo\s+dia\s+(\d{1,2})\s+d[eo]\s+m[êe]s(?![\wÀ-ÿ])/i, m => {
    rec = { type: 'monthly', monthDay: Number(m[1] || m[2]), interval: 1 };
  });
  if (rec) return rec;

  // lista de dias da semana sem "todo": "segundas e quartas às 6h"
  sc.take(new RegExp(`(?<![\\wÀ-ÿ])((?:${WD_ALL})(?:\\s*(?:,|e|,\\s*e)\\s*(?:${WD_ALL}))+)(?![\\wÀ-ÿ])`, 'i'), m => {
    const wd = weekdaysIn(m[1]);
    if (wd.length < 2) return false;
    rec = { type: 'weekly', weekdays: wd, interval: 1 };
  });
  if (rec) return rec;

  // "todos os dias", "diariamente", "todo dia às 6"
  sc.take(/(?<![\wÀ-ÿ])tod[oa]s?\s+(?:os\s+)?dias?(?![\wÀ-ÿ])(?!\s+\d)|(?<![\wÀ-ÿ])diariamente(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])todo\s+dia(?![\wÀ-ÿ])(?!\s+\d)/i, () => {
    rec = { type: 'daily', interval: 1 };
  });
  if (rec) return rec;

  // "fins de semana"
  sc.take(/(?<![\wÀ-ÿ])(?:todo\s+)?fins?\s+de\s+semana(?![\wÀ-ÿ])/i, () => {
    rec = { type: 'weekdays', weekdays: [0, 6], interval: 1 };
  });
  if (rec) return rec;

  sc.take(/(?<![\wÀ-ÿ])todo\s+m[êe]s(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])mensalmente(?![\wÀ-ÿ])/i, () => { rec = { type: 'monthly', interval: 1 }; });
  if (rec) return rec;
  sc.take(/(?<![\wÀ-ÿ])todo\s+ano(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])anualmente(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])todo\s+anivers[áa]rio(?![\wÀ-ÿ])/i, () => { rec = { type: 'yearly', interval: 1 }; });
  if (rec) return rec;
  sc.take(/(?<![\wÀ-ÿ])toda\s+semana(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])semanalmente(?![\wÀ-ÿ])/i, () => { rec = { type: 'weekly', interval: 1 }; });
  if (rec) return rec;

  // "a cada 2 dias/semanas/meses"
  sc.take(/(?<![\wÀ-ÿ])a\s+cada\s+(\d{1,2})\s+(dias?|semanas?|m[êe]s(?:es)?)(?![\wÀ-ÿ])/i, m => {
    const n = Number(m[1]); const unit = strip(m[2]);
    if (unit.startsWith('dia')) rec = { type: 'custom', interval: n };
    else if (unit.startsWith('sem')) rec = { type: 'weekly', interval: n };
    else rec = { type: 'monthly', interval: n };
  });
  return rec;
}

/* ------------------------------------------------------------------ horas */
function normHour(h, m, period) {
  h = Number(h); m = m ? Number(m) : 0;
  if (period) {
    const p = strip(period);
    if ((p.includes('tarde') || p.includes('noite')) && h < 12) h += 12;
    if (p.includes('manh') && h === 12) h = 0;
  }
  if (h > 23) h = 23;
  return `${pad(h)}:${pad(m)}`;
}

function parseTimes(sc) {
  const out = { time: null, endTime: null, period: null };

  // intervalo: "das 14h às 16h" / "de 14:00 a 16:00"
  sc.take(/(?<![\wÀ-ÿ])d(?:as|e)\s+(\d{1,2})(?:[:h.](\d{2}))?\s*(?:h|hs|horas?)?\s*(?:[àa]s?|at[ée]|a)\s+(\d{1,2})(?:[:h.](\d{2}))?\s*(?:h|hs|horas?)?(?![\wÀ-ÿ])/i, m => {
    if (Number(m[1]) > 23 || Number(m[3]) > 23) return false;
    out.time = normHour(m[1], m[2]);
    out.endTime = normHour(m[3], m[4]);
  });

  if (!out.time) {
    // "às 14h", "as 14:30", "às 9 horas", "@14h"
    sc.take(/(?<![\wÀ-ÿ])(?:[àa]s?|@)\s*(\d{1,2})(?:[:h.](\d{2}))?\s*(?:h|hs|hrs|horas?)?\s*(?:d[ao]\s+(manh[ãa]|tarde|noite))?(?![\wÀ-ÿ])/i, m => {
      if (Number(m[1]) > 23) return false;
      if (!m[2] && !/[h@:]/i.test(m[0]) && !/[àa]s/i.test(m[0])) return false;
      out.time = normHour(m[1], m[2], m[3]);
    });
  }
  if (!out.time) {
    // "14h30", "14h", "8 da manhã", "20:00"
    sc.take(/(?<![\wÀ-ÿ])(\d{1,2})(?:[:h.](\d{2}))?\s*(?:h|hs|hrs|horas?)?\s*d[ao]\s+(manh[ãa]|tarde|noite)(?![\wÀ-ÿ])/i, m => {
      if (Number(m[1]) > 23) return false;
      out.time = normHour(m[1], m[2], m[3]);
    });
  }
  if (!out.time) {
    sc.take(/(?<![\wÀ-ÿ])(\d{1,2})[:h](\d{2})(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])(\d{1,2})\s*(?:h|hs|hrs|horas)(?![\wÀ-ÿ])/i, m => {
      const h = m[1] ?? m[3], mi = m[2];
      if (Number(h) > 23) return false;
      out.time = normHour(h, mi);
    });
  }
  if (!out.time) {
    sc.take(/(?<![\wÀ-ÿ])meio[- ]dia(?![\wÀ-ÿ])/i, () => { out.time = '12:00'; });
  }
  if (!out.time) {
    sc.take(/(?<![\wÀ-ÿ])meia[- ]noite(?![\wÀ-ÿ])/i, () => { out.time = '00:00'; });
  }
  // período sem hora exata
  sc.take(/(?<![\wÀ-ÿ])(?:de|pela|[àa])\s+(manh[ãa]|tarde|noite)(?![\wÀ-ÿ])/i, m => { out.period = strip(m[1]); });
  return out;
}

/* ------------------------------------------------------------------ datas */
function parseDate(sc, ref) {
  let date = null, explicit = false;

  const set = d => { date = d; explicit = true; };

  sc.take(/(?<![\wÀ-ÿ])depois\s+de\s+amanh[ãa](?![\wÀ-ÿ])/i, () => set(addDays(ref, 2)));
  if (date) return { date, explicit };
  sc.take(/(?<![\wÀ-ÿ])anteontem(?![\wÀ-ÿ])/i, () => set(addDays(ref, -2)));
  if (date) return { date, explicit };
  sc.take(/(?<![\wÀ-ÿ])amanh[ãa](?![\wÀ-ÿ])/i, () => set(addDays(ref, 1)));
  if (date) return { date, explicit };
  sc.take(/(?<![\wÀ-ÿ])ontem(?![\wÀ-ÿ])/i, () => set(addDays(ref, -1)));
  if (date) return { date, explicit };
  sc.take(/(?<![\wÀ-ÿ])hoje(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])agora(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])hoje\s+mais\s+tarde(?![\wÀ-ÿ])/i, () => set(ref));
  if (date) return { date, explicit };

  // dd/mm(/aaaa)
  sc.take(/(?<![\wÀ-ÿ])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\wÀ-ÿ])/, m => {
    const d = Number(m[1]), mo = Number(m[2]) - 1;
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
    set(resolveDayMonth(d, mo, m[3] ? Number(m[3]) : null, ref));
  });
  if (date) return { date, explicit };

  // "27 de agosto (de 2026)" / "dia 27 de agosto"
  sc.take(new RegExp(`(?<![\\wÀ-ÿ])(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_RE})(?:\\s+de\\s+(\\d{4}))?(?![\\wÀ-ÿ])`, 'i'), m => {
    const mo = monthIndex(m[2]);
    if (mo == null) return false;
    set(resolveDayMonth(Number(m[1]), mo, m[3] ? Number(m[3]) : null, ref));
  });
  if (date) return { date, explicit };

  // "no dia 27" (mês corrente ou próximo)
  sc.take(/(?<![\wÀ-ÿ])(?:n[oa]\s+)?dia\s+(\d{1,2})(?![\wÀ-ÿ])/i, m => {
    const d = Number(m[1]); if (d < 1 || d > 31) return false;
    const r = parseISO(ref);
    let cand = makeDate(r.getFullYear(), r.getMonth(), d);
    if (cand < ref) cand = addMonths(cand, 1);
    set(cand);
  });
  if (date) return { date, explicit };

  // "em 3 dias" / "daqui a 2 semanas"
  sc.take(/(?<![\wÀ-ÿ])(?:em|daqui\s+a|dentro\s+de)\s+(\d{1,2})\s+(dias?|semanas?|m[êe]s(?:es)?)(?![\wÀ-ÿ])/i, m => {
    const n = Number(m[1]), u = strip(m[2]);
    if (u.startsWith('dia')) set(addDays(ref, n));
    else if (u.startsWith('sem')) set(addDays(ref, n * 7));
    else set(addMonths(ref, n));
  });
  if (date) return { date, explicit };

  // "semana que vem" / "próxima semana"
  sc.take(/(?<![\wÀ-ÿ])(?:pr[óo]xima\s+semana|semana\s+que\s+vem|na\s+semana\s+que\s+vem)(?![\wÀ-ÿ])/i, () => set(addDays(ref, 7)));
  if (date) return { date, explicit };
  sc.take(/(?<![\wÀ-ÿ])(?:pr[óo]ximo\s+m[êe]s|m[êe]s\s+que\s+vem)(?![\wÀ-ÿ])/i, () => set(addMonths(ref, 1)));
  if (date) return { date, explicit };

  // "próxima terça", "terça que vem", "na sexta", "sexta"
  sc.take(new RegExp(`(?<![\\wÀ-ÿ])(?:n[ao]\\s+)?(pr[óo]xim[oa]\\s+|que\\s+vem\\s+)?(${WD_ALL})(?:\\s+que\\s+vem)?(?![\\wÀ-ÿ])`, 'i'), m => {
    const w = WEEKDAYS.find(x => new RegExp(`^(?:${x.re})$`, 'i').test(m[2].trim()));
    if (!w) return false;
    const forceNext = !!m[1] || /que\s+vem/i.test(m[0]);
    set(nextWeekdayFrom(ref, w.i, forceNext));
  });
  if (date) return { date, explicit };

  sc.take(/(?<![\wÀ-ÿ])fim\s+de\s+semana(?![\wÀ-ÿ])/i, () => set(nextWeekdayFrom(ref, 6, false)));
  return { date, explicit };
}

/* -------------------------------------------------------------- lembretes */
function parseReminders(sc) {
  const out = [];
  sc.take(/(?<![\wÀ-ÿ])(?:lembrar|avisar|me\s+lembre|lembrete)\s+(\d{1,2})\s+(dias?|horas?|minutos?|semanas?)\s+antes(?![\wÀ-ÿ])/gi, m => {
    const n = Number(m[1]), u = strip(m[2]);
    if (u.startsWith('dia')) out.push(`d-${n}`);
    else if (u.startsWith('sem')) out.push(`d-${n * 7}`);
    else if (u.startsWith('hora')) out.push(`h-${n}`);
    else out.push(`m-${n}`);
    return true;
  });
  sc.take(/(?<![\wÀ-ÿ])(?:lembrar|avisar)\s+no\s+dia(?![\wÀ-ÿ])/i, () => { out.push('same-day-09:00'); });
  return out;
}

/* --------------------------------------------------------- pessoas e local */
function parsePeople(sc, known = []) {
  const people = [];
  const NAME = '([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\\wÀ-ÿ]{1,20}(?:\\s+(?:d[aeo]s?\\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\\wÀ-ÿ]{1,20})?)';
  const rx = new RegExp(`(?<![\\wÀ-ÿ])(?:com|para|pra|pro|ao|[àa])\\s+(?:o\\s+|a\\s+|Sr\\.?\\s+|Sra\\.?\\s+|Dr\\.?\\s+|Pr\\.?\\s+)?${NAME}`, 'g');
  let m;
  while ((m = rx.exec(sc.work)) !== null) {
    const name = m[1].trim();
    if (/^(Que|Isso|Ele|Ela|Hoje|Amanh|Deus|Mim|Voc)/i.test(name)) continue;
    people.push(name);
  }
  for (const k of known) {
    if (!people.some(p => strip(p) === strip(k)) &&
        new RegExp(`(?<![\\wÀ-ÿ])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\wÀ-ÿ])`, 'i').test(sc.work)) {
      people.push(k);
    }
  }
  return [...new Set(people)];
}

function parsePlace(sc) {
  let place = '';
  sc.take(/(?<![\wÀ-ÿ])(?:n[oa]s?|em)\s+((?:[a-zà-ÿ]|[A-ZÀ-Ý])[\wÀ-ÿ]{2,}(?:\s+(?:d[aeo]s?\s+)?[\wÀ-ÿ]{2,}){0,2})[\s.,;!]*$/i, m => {
    const raw = m[1].trim();
    if (STOP_PLACE.has(strip(raw))) return false;
    if (/^(que|qual|frente|breve|seguida|ponto)/i.test(raw)) return false;
    place = raw;
  });
  if (!place) {
    sc.take(/(?<![\wÀ-ÿ])em\s+casa(?![\wÀ-ÿ])/i, () => { place = 'casa'; });
  }
  return place;
}

/* ------------------------------------------------------------------ tipos */
function detectKind(text, { hasTime, hasRecurrence, people }) {
  const t = strip(text);

  const forced = t.match(/^\s*(tarefa|compromisso|evento|nota|anota[çc][ãa]o|registro|entrada|ideia)\s*:/);
  if (forced) {
    const k = forced[1];
    if (k.startsWith('tarefa')) return { kind: 'task', why: 'prefixo "tarefa:"' };
    if (k.startsWith('compromisso') || k.startsWith('evento')) return { kind: 'event', why: 'prefixo explícito' };
    if (k.startsWith('nota') || k.startsWith('anota') || k.startsWith('ideia')) return { kind: 'note', why: 'prefixo explícito' };
    if (k.startsWith('registro')) return { kind: 'log', why: 'prefixo "registro:"' };
    if (k.startsWith('entrada')) return { kind: 'inbox', why: 'prefixo "entrada:"' };
  }
  if (/(?<![\wÀ-ÿ])fiz\s+agora(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])acabei\s+de(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])acabo\s+de(?![\wÀ-ÿ])|(?<![\wÀ-ÿ])registrar\s+que(?![\wÀ-ÿ])/.test(t))
    return { kind: 'log', why: 'expressão de algo já realizado' };

  const logRe = new RegExp(`(^|[.;:,]\\s*|(?<![\\wÀ-ÿ])e\\s+)(?:${LOG_VERBS.join('|')})(?![\\wà-ÿ])`, 'i');
  if (logRe.test(t)) return { kind: 'log', why: 'verbo no passado (algo já feito)' };

  if (NOTE_WORDS.some(w => new RegExp(`^${w}`, 'i').test(t))) return { kind: 'note', why: 'texto de anotação' };

  const evRe = new RegExp(`(?<![\\wÀ-ÿ])(${EVENT_WORDS.join('|')})(?![\\wÀ-ÿ])`, 'i');
  if (evRe.test(t)) return { kind: 'event', why: 'palavra típica de compromisso' };
  if (hasTime && people.length && !hasRecurrence) return { kind: 'event', why: 'horário marcado com alguém' };
  if (hasTime && hasRecurrence) return { kind: 'task', why: 'atividade recorrente com horário' };
  return { kind: 'task', why: 'ação a fazer' };
}

/* --------------------------------------------------------------- interface */
/** Interpreta uma frase. Retorna um objeto de sugestão pronto para confirmação. */
export function parseOne(raw, opts = {}) {
  const ref = opts.ref || today();
  const text = String(raw || '').trim();
  if (!text) return null;

  const clean = text.replace(/^\s*(?:tarefa|compromisso|evento|nota|anota[çc][ãa]o|registro|entrada|ideia|fiz agora|fiz)\s*:\s*/i, m => ' '.repeat(m.length));
  const sc = new Scanner(clean);

  const recurrence = parseRecurrence(sc);
  const reminders = parseReminders(sc);
  const times = parseTimes(sc);
  const { date, explicit } = parseDate(sc, ref);
  const people = parsePeople(sc, opts.knownPeople || []);
  const place = parsePlace(sc);

  let priority = null;
  for (const [re, level] of PRIORITY_WORDS) {
    if (re.test(sc.work)) { sc.take(re, () => {}); priority = level; break; }
  }
  const tags = [];
  sc.take(/#([\wÀ-ÿ-]{2,})/g, m => { tags.push(m[1]); return true; });

  const { kind, why } = detectKind(text, {
    hasTime: !!times.time, hasRecurrence: !!recurrence, people,
  });

  let title = sc.rest();
  if (!title) title = text.replace(/\s{2,}/g, ' ').trim();
  title = title
    .replace(/^(?:eu\s+)?(?:preciso(?:\s+de)?|tenho\s+que|tenho\s+de|devo|necessito|quero|vou|lembrar\s+de|n[ãa]o\s+esquecer\s+de|marcar\s+de)\s+/i, '')
    .replace(/^(?:de|da|do|para|a|o)\s+/i, '')
    .trim();
  title = cap(title);

  let finalDate = date || ref;
  if (recurrence) finalDate = R.next(recurrence, date || ref, date || ref) || finalDate;
  let finalTime = times.time;
  if (!finalTime && times.period && kind === 'event') {
    finalTime = times.period.startsWith('manh') ? '09:00' : times.period === 'tarde' ? '14:00' : '19:00';
  }

  return {
    kind, why, raw: text, title,
    date: finalDate, dateExplicit: explicit,
    time: finalTime, endTime: times.endTime,
    recurrence, reminders, priority: priority || 'media',
    people, place, tags,
    categoryId: opts.guessCategory ? opts.guessCategory(text) : null,
    confidence: score({ explicit, time: finalTime, kind, recurrence, title }),
  };
}

function score({ explicit, time, kind, recurrence, title }) {
  let s = 0.4;
  if (explicit) s += 0.25;
  if (time) s += 0.15;
  if (recurrence) s += 0.1;
  if (kind === 'log') s += 0.1;
  if (title && title.length > 3) s += 0.1;
  return Math.min(1, Number(s.toFixed(2)));
}

/** Divide o texto em várias frases e interpreta cada uma. */
export function parse(raw, opts = {}) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parts = text
    .split(/\r?\n+/)
    .flatMap(line => line.split(/\s*(?:;|•|•)\s*|(?:\s+e\s+depois\s+)|(?:\s+tamb[ée]m\s+preciso\s+)/i))
    .map(s => s.trim())
    .filter(s => s.length > 1);
  const list = (parts.length ? parts : [text]).map(p => parseOne(p, opts)).filter(Boolean);
  return list;
}

/** Texto explicativo mostrado na tela de confirmação. */
export const KIND_LABEL = {
  task: 'Tarefa', event: 'Compromisso', log: 'Registro do dia',
  note: 'Nota', inbox: 'Entrada',
};

export { strip as normalizeText };
