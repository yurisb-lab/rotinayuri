/* Resumo do dia em prosa (fase 9a) — sem IA, sem rede, sem nada saindo daqui.

   Monta a narrativa a partir da estrutura dos dados: separa por período do
   dia, agrupa por categoria e preenche frases de ligação.

   A regra que faz isso funcionar: a variação é DETERMINÍSTICA, semeada pela
   data. Se a escolha das frases fosse aleatória, o resumo de ontem mudaria de
   texto a cada vez que a tela abrisse — e um resumo é memória. Memória não se
   reescreve sozinha. Mesma data, mesmo texto, para sempre. */

import * as S from '../core/store.js';
import { fmtDate, minutes } from '../util/date.js';

/* Semente estável a partir da data: djb2 sobre a string AAAA-MM-DD. */
function semente(date) {
  let h = 5381;
  for (let i = 0; i < date.length; i++) h = ((h << 5) + h + date.charCodeAt(i)) >>> 0;
  return h;
}
const escolher = (lista, s, desloc = 0) => lista[(s + desloc) % lista.length];

/* Os textos chegam em duas formas incompatíveis: registros costumam vir em
   primeira pessoa do passado ("Almocei em casa") e compromissos vêm como
   substantivo ("Culto"). Qualquer molde que comece com "você" quebra numa das
   duas — "você almocei", "você culto".

   A saída é uma frase com adverbial de tempo e sem sujeito explícito. Ela
   aceita as duas formas sem concordar com nada:
       "De manhã, reunião de equipe."          (nominal)
       "À tarde, almocei em casa."             (1ª pessoa)
   É por isso que aqui não existe "Você ..." nenhum. */
const PERIODOS = [
  { id: 'madrugada', ate: 6 * 60, abre: ['De madrugada', 'Ainda de madrugada', 'Na madrugada'] },
  { id: 'manha', ate: 12 * 60, abre: ['De manhã', 'Pela manhã', 'Na manhã'] },
  { id: 'tarde', ate: 18 * 60, abre: ['À tarde', 'Na parte da tarde', 'Já à tarde'] },
  { id: 'noite', ate: 24 * 60, abre: ['À noite', 'No fim do dia', 'Já à noite'] },
];

const periodoDe = hora => PERIODOS.find(p => minutes(hora || '12:00') < p.ate) || PERIODOS[3];

/** Junta uma lista em texto: "a, b e c". */
function lista(itens) {
  const x = [...new Set(itens)].filter(Boolean);
  if (!x.length) return '';
  if (x.length === 1) return x[0];
  return `${x.slice(0, -1).join(', ')} e ${x[x.length - 1]}`;
}

const minuscula = t => t ? t[0].toLowerCase() + t.slice(1) : t;

/**
 * Gera o resumo do dia. Devolve { paragrafos: [], vazio: bool }.
 * Nunca inventa: tudo que aparece no texto veio de um item gravado.
 */
export async function resumoDoDia(date) {
  const [stats, mm, rota] = await Promise.all([
    S.dayStats(date), S.moments.forDate(date), S.dayRoute(date),
  ]);
  const s = semente(date);
  const logs = stats.logs;
  const feitas = stats.tasks.filter(t => t.status === 'concluida');
  const comps = stats.events;

  if (!logs.length && !feitas.length && !comps.length && !mm.length) {
    return { vazio: true, paragrafos: [`Nada foi registrado em ${fmtDate(date, 'long')}.`] };
  }

  /* Um registro que cumpriu um compromisso não deve aparecer duas vezes: o
     casamento da fase 3 diz quais pares são a mesma coisa, e nesses casos
     vale o que aconteceu, não o que estava previsto. */
  const m = await S.matchDay(date).catch(() => ({ casados: {} }));
  const planejadosCobertos = new Set(Object.values(m.casados || {}).map(x => x.planejadoId));

  const porPeriodo = {};
  const push = (hora, texto, catId) => {
    if (!texto) return;
    const p = periodoDe(hora).id;
    (porPeriodo[p] ||= { textos: [], cats: new Set() });
    porPeriodo[p].textos.push(texto);
    if (catId) porPeriodo[p].cats.add(catId);
  };
  logs.forEach(l => push(l.time, minuscula(l.text), l.categoryId));
  feitas.forEach(t => {
    if (planejadosCobertos.has(t.instanceId || t.id)) return;
    push(t.time || '12:00', minuscula(t.title), t.categoryId);
  });
  comps.forEach(e => {
    if (planejadosCobertos.has(e.instanceId || e.id)) return;
    push(e.time, minuscula(e.title), e.categoryId);
  });

  const paragrafos = [];
  let i = 0;
  for (const per of PERIODOS) {
    const bloco = porPeriodo[per.id];
    if (!bloco) continue;
    const cats = [...bloco.cats].map(id => S.categories.get(id)?.name).filter(Boolean);
    const abre = escolher(per.abre, s, i);
    const oQue = lista(bloco.textos.slice(0, 4));
    const resto = bloco.textos.length - 4;

    let frase = `${abre}, ${oQue}`;
    if (resto > 0) frase += `, além de mais ${resto} ${resto === 1 ? 'coisa' : 'coisas'}`;
    if (cats.length === 1) frase += ` — tudo em ${cats[0].toLowerCase()}`;
    else if (cats.length > 1) frase += ` — entre ${lista(cats.map(c => c.toLowerCase()))}`;
    paragrafos.push(frase + '.');
    i++;
  }

  /* pessoas e lugares */
  const pessoas = new Set();
  logs.forEach(l => (l.people?.length ? l.people : (l.person ? [l.person] : [])).forEach(n => pessoas.add(n)));
  comps.forEach(e => (e.people || []).forEach(n => pessoas.add(n)));
  const extras = [];
  if (pessoas.size) {
    /* Só verbos que servem para um nome ou vários — "apareceram João" é o
       tipo de erro que denuncia texto gerado. */
    const verbo = escolher(['Você esteve com', 'No meio disso, você falou com', 'Você teve contato com'], s, 7);
    extras.push(`${verbo} ${lista([...pessoas])}.`);
  }
  if (rota.length > 1) {
    extras.push(`Seu dia passou por ${lista(rota.map(r => r.nome))}.`);
  }
  if (extras.length) paragrafos.push(extras.join(' '));

  /* momentos */
  if (mm.length) {
    paragrafos.push(mm.length === 1
      ? `Você marcou um momento: ${minuscula(mm[0].text)}.`
      : `Você marcou ${mm.length} momentos: ${lista(mm.map(m => minuscula(m.text)))}.`);
  }

  /* o que ficou — dito sem cobrança */
  if (stats.openTasks) {
    const n = stats.openTasks, um = n === 1;
    const f = escolher([
      `${um ? 'Ficou 1 tarefa' : `Ficaram ${n} tarefas`} para outro dia.`,
      `${um ? '1 tarefa seguiu' : `${n} tarefas seguiram`} em aberto.`,
    ], s, 3);
    paragrafos.push(f);
  }

  return { vazio: false, paragrafos };
}

/** Versão curta, de uma frase — usada no cartão "Você lembra?" da manhã. */
export async function resumoCurto(date) {
  const stats = await S.dayStats(date);
  const partes = [];
  if (stats.logCount) partes.push(`${stats.logCount} ${stats.logCount === 1 ? 'acontecimento' : 'acontecimentos'}`);
  if (stats.doneTasks) partes.push(`${stats.doneTasks} ${stats.doneTasks === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`);
  if (stats.doneEvents) partes.push(`${stats.doneEvents} ${stats.doneEvents === 1 ? 'compromisso' : 'compromissos'}`);
  if (!partes.length) return null;

  const titulos = [
    ...stats.logs.slice(0, 3).map(l => minuscula(l.text)),
  ];
  return {
    contagem: `Você registrou ${lista(partes)}.`,
    detalhe: titulos.length ? `${lista(titulos)}.` : '',
  };
}
