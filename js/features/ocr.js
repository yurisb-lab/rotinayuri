/* Leitura de prints/imagens.
   1) Tenta o detector de texto nativo do navegador (Shape Detection API).
   2) Se o usuário configurar uma API de IA em Configurações, usa-a.
   3) Caso contrário, permite colar/digitar o texto manualmente.
   Em todos os casos o resultado passa pela tela de confirmação e é salvo
   apenas no dispositivo. */

import { settings } from '../core/store.js';

export function nativeSupported() { return 'TextDetector' in window; }

export async function readWithNative(fileOrBitmap) {
  if (!nativeSupported()) throw new Error('sem-detector');
  const bitmap = fileOrBitmap instanceof Blob ? await createImageBitmap(fileOrBitmap) : fileOrBitmap;
  /* global TextDetector */
  const det = new TextDetector();
  const blocks = await det.detect(bitmap);
  return blocks.map(b => b.rawValue).join('\n').trim();
}

export function aiConfigured() {
  const s = settings.all();
  return !!(s.aiEnabled && s.aiEndpoint);
}

/** Envia a imagem para a API de IA configurada pelo próprio usuário. */
export async function readWithAI(file, { signal } = {}) {
  const s = settings.all();
  if (!s.aiEnabled || !s.aiEndpoint) throw new Error('ia-desativada');
  const dataUrl = await fileToDataURL(file);
  const body = {
    model: s.aiModel || undefined,
    prompt: PROMPT,
    image: dataUrl,
    language: 'pt-BR',
  };
  const res = await fetch(s.aiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(s.aiKey ? { Authorization: `Bearer ${s.aiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`falha na API (${res.status})`);
  const json = await res.json().catch(() => ({}));
  return String(json.text || json.result || json.output || json.content || '').trim();
}

const PROMPT = `Extraia deste print todo o texto visível e, se houver, liste em português:
datas, horários, pessoas, locais, tarefas e compromissos. Responda apenas com o texto.`;

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/** Reduz a imagem para pré-visualização/armazenamento leve. */
export async function shrink(file, max = 900, quality = 0.7) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch {
    return fileToDataURL(file);
  }
}

/** Estratégia completa: nativo -> IA -> manual. */
export async function extract(file) {
  const attempts = [];
  if (nativeSupported()) {
    try {
      const text = await readWithNative(file);
      if (text) return { text, via: 'detector do navegador' };
      attempts.push('detector nativo não encontrou texto');
    } catch (e) { attempts.push('detector nativo indisponível'); void e; }
  } else attempts.push('navegador sem detector de texto');

  if (aiConfigured()) {
    try {
      const text = await readWithAI(file);
      if (text) return { text, via: 'API de IA configurada' };
      attempts.push('a IA não retornou texto');
    } catch (e) { attempts.push(`IA: ${e.message}`); }
  }
  return { text: '', via: null, notes: attempts };
}
