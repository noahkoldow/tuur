import { GoogleGenAI, Modality } from '@google/genai';
import { estimateSpeechMs, silencePcm } from '@tuur/shared';
import { Mp3Encoder } from '@breezystack/lamejs';
import { TTS_SAMPLE_RATE, type TtsProviderId } from '@tuur/shared';
import { MAX_TTS_OUTPUT_TOKENS } from './limits';

export interface TtsRequest {
  text: string;
  lang: string;
  /** Provider voice name (without the `provider:` prefix). */
  voice: string;
  model: string;
  /** Delivery direction of the guide persona (see packages/shared narration/voices.ts). */
  style?: string;
}

export interface TtsProvider {
  /** Returns 16-bit mono PCM at 24 kHz. */
  synthesize(req: TtsRequest): Promise<{ pcm: Uint8Array; chars: number }>;
}

/** Routes `provider:name` voices to the configured back ends (a missing key means the provider is unavailable). */
export class RoutedTtsProvider {
  constructor(private readonly providers: Partial<Record<TtsProviderId, TtsProvider>>) {}
  available = (p: TtsProviderId) => Boolean(this.providers[p]);
  synthesize(provider: TtsProviderId, req: TtsRequest) {
    const p = this.providers[provider];
    if (!p) throw new Error(`TTS provider ${provider} is not configured`);
    return p.synthesize(req);
  }
}

export interface AudioEncoder {
  encode(pcm: Uint8Array): { data: Buffer; mimeType: string; ext: string };
}

/** Gemini TTS (same platform as the text model). The voice is the tuur guide voice configured per language. */
export class GeminiTtsProvider implements TtsProvider {
  private readonly ai: GoogleGenAI;
  constructor(apiKey: string, client?: GoogleGenAI) {
    this.ai =
      client ?? new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } } });
  }
  async synthesize(req: TtsRequest) {
    const direction =
      req.style ?? 'Say in a warm, engaging, natural tour-guide voice, at a relaxed walking-tour pace';
    if (/^gemini-3\.(?:[8-9]|\d{2,})-/.test(req.model)) {
      // 3.8 reads text verbatim. Keep directions out of the transcript and explicitly request
      // PCM: the default unary response is WAV, whose header must not be encoded as samples.
      const result = await this.ai.interactions.create({
        model: req.model,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: req.text,
                annotations: [{ type: 'speech_metadata', style: `${direction} Speak in ${req.lang}.` }],
              },
            ],
          },
        ],
        response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: TTS_SAMPLE_RATE },
        generation_config: {
          speech_config: [{ voice: req.voice }],
          max_output_tokens: MAX_TTS_OUTPUT_TOKENS,
        },
        store: false,
      });
      const audio = result.output_audio;
      if (!audio?.data) throw new Error('Gemini TTS returned no audio');
      return { pcm: decodeGeminiPcm(audio.data, audio.mime_type), chars: req.text.length };
    }
    // Legacy 2.5/3.1 models use natural-language delivery directions before the transcript.
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: [{ parts: [{ text: `${direction}\n\nRead aloud exactly this text:\n${req.text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        maxOutputTokens: MAX_TTS_OUTPUT_TOKENS,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice } } },
      },
    });
    const audio = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!audio?.data) throw new Error('Gemini TTS returned no audio');
    return { pcm: decodeGeminiPcm(audio.data, audio.mimeType), chars: req.text.length };
  }
}

/** Fail before caching an MP3 if a provider returns a different encoding/sample rate. */
export function decodeGeminiPcm(base64: string, mimeType?: string): Uint8Array {
  if (mimeType && !/^audio\/(?:l16|pcm)(?:;|$)/i.test(mimeType))
    throw new Error(`Gemini TTS returned unsupported audio format: ${mimeType}`);
  const rate = mimeType?.match(/(?:rate|sample_rate)=(\d+)/i)?.[1];
  if (rate && Number(rate) !== TTS_SAMPLE_RATE)
    throw new Error('Gemini TTS returned an unsupported sample rate');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length % 2 !== 0 || bytes.subarray(0, 4).toString() === 'RIFF')
    throw new Error('Gemini TTS returned invalid PCM audio');
  return new Uint8Array(bytes);
}

/**
 * OpenAI speech (the voices of the ChatGPT voice mode; `marin`/`cedar` recommended). Raw 24 kHz 16-bit mono PCM,
 * the same format as Gemini, so paragraph timings and MP3 encoding stay unchanged. OpenAI's usage policy requires
 * telling listeners the voice is AI-generated: the player shows the AI label and the file carries the ID3 marker.
 */
export class OpenAiTtsProvider implements TtsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async synthesize(req: TtsRequest) {
    const res = await this.fetcher('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        voice: req.voice,
        input: req.text,
        ...(req.style ? { instructions: req.style } : {}),
        response_format: 'pcm',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS failed (${res.status})`);
    return { pcm: new Uint8Array(await res.arrayBuffer()), chars: req.text.length };
  }
}

/** Silent audio with realistic duration; keeps emulator flows and tests keyless. */
export class MockTtsProvider implements TtsProvider {
  async synthesize(req: { text: string; lang: string }) {
    return { pcm: silencePcm(estimateSpeechMs(req.text, req.lang)), chars: req.text.length };
  }
}

/** Pure-JS MP3 (no native ffmpeg needed in Cloud Functions): 48 kbps mono keeps a 3 min narration near 1 MB. */
/**
 * Minimal ID3v2.3 tag with a user-defined text frame that marks the audio as AI-generated (machine-readable marking of
 * synthetic audio, EU AI Act Art. 50(2)). Players skip the tag; the Storage object carries the same marker as metadata.
 */
export function aiGeneratedId3Tag(
  note = 'true; generator=tuur; voice=synthetic (AI text-to-speech)',
): Buffer {
  const body = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from('AI_GENERATED\0', 'latin1'),
    Buffer.from(note, 'latin1'),
  ]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write('TXXX', 0, 'latin1');
  frameHeader.writeUInt32BE(body.length, 4);
  const frame = Buffer.concat([frameHeader, body]);
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 'latin1');
  header[3] = 3; // v2.3
  const size = frame.length;
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  return Buffer.concat([header, frame]);
}

export class Mp3AudioEncoder implements AudioEncoder {
  encode(pcm: Uint8Array) {
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    const enc = new Mp3Encoder(1, TTS_SAMPLE_RATE, 48);
    const chunks: Buffer[] = [];
    for (let i = 0; i < samples.length; i += 1152) {
      const b = enc.encodeBuffer(samples.subarray(i, i + 1152));
      if (b.length) chunks.push(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
    }
    const tail = enc.flush();
    chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength));
    return { data: Buffer.concat([aiGeneratedId3Tag(), ...chunks]), mimeType: 'audio/mpeg', ext: 'mp3' };
  }
}
