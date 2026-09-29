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
/**
 * Minimal ID3v2.3 tag with a user-defined text frame that marks the audio as AI-generated (machine-readable marking of
 * synthetic audio, EU AI Act Art. 50(2)). Players skip the tag; the Storage object carries the same marker as metadata.
 */
export function aiGeneratedId3Tag(
  note = 'true; generator=tuur; voice=synthetic (Google text-to-speech)',
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
