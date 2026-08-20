/* Reconhecimento de voz (pt-BR) usando a Web Speech API do navegador.
   Nada é enviado para servidores próprios — o processamento é do sistema. */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const supported = () => !!SR;

export function createRecognizer({ onPartial, onFinal, onError, onEnd, continuous = true } = {}) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'pt-BR';
  rec.continuous = continuous;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    onPartial?.((finalText + ' ' + interim).trim());
  };
  rec.onerror = e => onError?.(e.error || 'erro');
  rec.onend = () => { onFinal?.(finalText.trim()); onEnd?.(); };

  return {
    start() { finalText = ''; try { rec.start(); } catch { /* já iniciado */ } },
    stop() { try { rec.stop(); } catch { /* já parado */ } },
    abort() { try { rec.abort(); } catch { /* nada */ } },
    get text() { return finalText; },
  };
}

/** Lê um texto em voz alta (usado no resumo do dia, opcional). */
export function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
