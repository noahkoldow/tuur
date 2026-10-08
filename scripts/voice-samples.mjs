#!/usr/bin/env node
/**
 * Voice casting: renders the same German guide text with every candidate voice so the owner can compare them by
 * ear (`pnpm voices:samples`, output in ./voice-samples with an index.html player page).
 *
 * Keys come from the environment only (never commit them):
 *   OPENAI_API_KEY        OpenAI voices (the ones of the ChatGPT voice mode)
 *   GEMINI_API_KEY        Gemini voices (current production provider)
 *   ELEVENLABS_API_KEY    optional, plus ELEVENLABS_VOICE_IDS="id1,id2" (voices from your ElevenLabs library)
 * Model overrides: OPENAI_TTS_MODEL, GEMINI_TTS_MODEL, ELEVENLABS_MODEL.
 * Providers without a key are skipped.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'voice-samples');

// Fact-based sample in the tuur narration style (Brandenburger Tor, public-domain facts).
const TEXT_DE =
  'Schau mal nach oben. Auf dem Brandenburger Tor steht die Quadriga, eine Siegesgöttin mit vier Pferden. ' +
  'Napoleon hat sie 1806 mitgenommen, nach Paris. Acht Jahre später kam sie zurück, und seitdem trägt die Göttin ' +
  'ein Eisernes Kreuz im Siegeszeichen. Und jetzt stell dir vor: Genau hier, wo du gerade stehst, verlief bis 1989 die Mauer.';

// Keep in sync with packages/shared/src/narration/voices.ts (GUIDE + personalities).
const GUIDE =
  'You are a local city guide talking to one person walking next to you. Sound like a real human in a relaxed conversation, not like an announcer or an audiobook: natural rhythm, small pauses where a person would breathe or think, a light smile in the voice, stress on the surprising detail. Keep the language of the text and say local names the way locals do.';

const CANDIDATES = [
  {
    provider: 'openai',
    voice: 'marin',
    note: 'tuur "Mara" (empfohlen von OpenAI)',
    personality: 'warm, curious and lively',
  },
  {
    provider: 'openai',
    voice: 'cedar',
    note: 'tuur "Jonas" (empfohlen von OpenAI)',
    personality: 'calm, grounded storyteller',
  },
  {
    provider: 'openai',
    voice: 'coral',
    note: 'Ersatz für "Linus"',
    personality: 'friendly, upbeat, a little playful',
  },
  { provider: 'openai', voice: 'ballad', note: 'Alternative', personality: 'gentle and expressive' },
  { provider: 'openai', voice: 'sage', note: 'Alternative', personality: 'clear and thoughtful' },
  {
    provider: 'gemini',
    voice: 'Sulafat',
    note: 'Ersatz für "Mara" (Warm)',
    personality: 'warm, curious and lively',
  },
  {
    provider: 'gemini',
    voice: 'Sadaltager',
    note: 'Ersatz für "Jonas" (Knowledgeable)',
    personality: 'calm, grounded storyteller',
  },
  {
    provider: 'gemini',
    voice: 'Achird',
    note: 'tuur "Linus" (Friendly)',
    personality: 'friendly, upbeat, a little playful',
  },
  {
    provider: 'gemini',
    voice: 'Charon',
    note: 'Alternative (Informative)',
    personality: 'calm and informative',
  },
  { provider: 'gemini', voice: 'Aoede', note: 'Alternative (Breezy)', personality: 'breezy and light' },
  {
    provider: 'gemini',
    voice: 'Kore',
    note: 'bisherige Standardstimme (Firm)',
    personality: 'firm and clear',
  },
];

const style = (c) => `${GUIDE} Personality: ${c.personality}.`;

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function openai(c) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: c.voice,
      input: TEXT_DE,
      instructions: style(c),
      response_format: 'pcm',
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return { data: wav(Buffer.from(await res.arrayBuffer())), ext: 'wav' };
}

async function gemini(c) {
  const model = process.env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-tts';
  if (/^gemini-3\.(?:[8-9]|\d{2,})-/.test(model)) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        input: [
          {
            type: 'user_input',
            content: [
              { type: 'text', text: TEXT_DE, annotations: [{ type: 'speech_metadata', style: style(c) }] },
            ],
          },
        ],
        response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: c.voice }] },
        store: false,
      }),
    });
    if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
    const body = await res.json();
    const audio = body.steps
      ?.flatMap((step) => step.content ?? [])
      .find((part) => part.type === 'audio' && part.data);
    if (!audio?.data || (audio.mime_type && !/^audio\/l16/i.test(audio.mime_type)))
      throw new Error('Gemini returned no PCM audio');
    return { data: wav(Buffer.from(audio.data, 'base64')), ext: 'wav' };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${style(c)}\n\nRead aloud exactly this text:\n${TEXT_DE}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  const b64 = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('no audio in response');
  return { data: wav(Buffer.from(b64, 'base64')), ext: 'wav' };
}

async function elevenlabs(c) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${c.voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: TEXT_DE, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_v3' }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return { data: Buffer.from(await res.arrayBuffer()), ext: 'mp3' };
}

const RUN = { openai, gemini, elevenlabs };
const KEY = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY' };

const candidates = [
  ...CANDIDATES,
  ...(process.env.ELEVENLABS_VOICE_IDS ?? '')
    .split(',')
    .filter(Boolean)
    .map((id) => ({ provider: 'elevenlabs', voice: id.trim(), note: 'ElevenLabs (eigene Bibliothek)' })),
];

await mkdir(OUT, { recursive: true });
const done = [];
for (const c of candidates) {
  if (!process.env[KEY[c.provider]]) {
    console.log(`skip  ${c.provider}:${c.voice} (no ${KEY[c.provider]})`);
    continue;
  }
  try {
    const { data, ext } = await RUN[c.provider](c);
    const file = `${c.provider}-${c.voice}.${ext}`;
    await writeFile(join(OUT, file), data);
    done.push({ ...c, file });
    console.log(`ok    ${c.provider}:${c.voice} -> voice-samples/${file}`);
  } catch (e) {
    console.log(`fail  ${c.provider}:${c.voice}: ${e.message.slice(0, 200)}`);
  }
}

const rows = done
  .map(
    (c) =>
      `<tr><td><b>${c.provider}</b> · ${c.voice}</td><td>${c.note}</td><td><audio controls preload="none" src="${c.file}"></audio></td></tr>`,
  )
  .join('\n');
await writeFile(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>tuur voice casting</title>
<style>body{font:16px system-ui;margin:24px;max-width:960px}td{padding:8px;border-bottom:1px solid #eee}</style>
<h1>tuur – Stimmen im Vergleich</h1><p>${TEXT_DE}</p><table>${rows}</table>`,
);
console.log(`\n${done.length} samples. Open voice-samples/index.html in a browser.`);
