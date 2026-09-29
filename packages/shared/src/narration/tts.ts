/** Gemini TTS returns raw 16-bit PCM mono at 24 kHz. */
export const TTS_SAMPLE_RATE = 24_000;
export const PCM_BYTES_PER_SECOND = TTS_SAMPLE_RATE * 2;
export const PARAGRAPH_GAP_MS = 450;

export interface TimedParagraph {
  text: string;
  pcmBytes: number;
}

/** Lays paragraphs out on a timeline with a fixed pause between them; returns start/duration per paragraph. */
export function layoutParagraphs(
  paras: TimedParagraph[],
  gapMs = PARAGRAPH_GAP_MS,
): { text: string; startMs: number; durationMs: number }[] {
  let cursor = 0;
  return paras.map((p, i) => {
    const durationMs = Math.round((p.pcmBytes / PCM_BYTES_PER_SECOND) * 1000);
    const r = { text: p.text, startMs: cursor, durationMs };
    cursor += durationMs + (i < paras.length - 1 ? gapMs : 0);
    return r;
  });
}

export function silencePcm(ms: number): Uint8Array {
  return new Uint8Array(Math.round((ms / 1000) * PCM_BYTES_PER_SECOND) & ~1);
}

/** Rough speaking-time estimate used by the mock TTS provider. */
export function estimateSpeechMs(text: string, lang: string): number {
  const cjk = ['ja', 'zh', 'ko'].includes(lang);
  const units = cjk ? text.length : text.split(/\s+/).filter(Boolean).length;
  const perMinute = cjk ? 380 : 150;
  return Math.round((units / perMinute) * 60_000);
}
