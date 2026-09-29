import { GoogleGenAI, Modality } from '@google/genai';
import { estimateSpeechMs, silencePcm } from '@tuur/shared';
import { Mp3Encoder } from '@breezystack/lamejs';
import { TTS_SAMPLE_RATE } from '@tuur/shared';

export interface TtsProvider {
  /** Returns 16-bit mono PCM at 24 kHz. */
  synthesize(req: {
    text: string;
    lang: string;
    voice: string;
    model: string;
  }): Promise<{ pcm: Uint8Array; chars: number }>;
}

export interface AudioEncoder {
  encode(pcm: Uint8Array): { data: Buffer; mimeType: string; ext: string };
}

/** Gemini TTS (same platform as the text model). The voice is the tuur guide voice configured per language. */
export class GeminiTtsProvider implements TtsProvider {
  private readonly ai: GoogleGenAI;
  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }
  async synthesize(req: { text: string; lang: string; voice: string; model: string }) {
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: [
        {
          parts: [
            {
              text: `Say in a warm, engaging, natural tour-guide voice, at a relaxed walking-tour pace: ${req.text}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice } } },
      },
    });
    const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new Error('TTS returned no audio');
    return { pcm: new Uint8Array(Buffer.from(b64, 'base64')), chars: req.text.length };
  }
}

/** Silent audio with realistic duration; keeps emulator flows and tests keyless. */
export class MockTtsProvider implements TtsProvider {
  async synthesize(req: { text: string; lang: string }) {
    return { pcm: silencePcm(estimateSpeechMs(req.text, req.lang)), chars: req.text.length };
  }
}

/** Pure-JS MP3 (no native ffmpeg needed in Cloud Functions): 48 kbps mono keeps a 3 min narration near 1 MB. */
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
    return { data: Buffer.concat(chunks), mimeType: 'audio/mpeg', ext: 'mp3' };
  }
}
