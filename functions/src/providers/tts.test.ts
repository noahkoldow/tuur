import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import {
  Mp3AudioEncoder,
  MockTtsProvider,
  OpenAiTtsProvider,
  RoutedTtsProvider,
  aiGeneratedId3Tag,
  GeminiTtsProvider,
  decodeGeminiPcm,
} from './tts';

describe('Gemini speech', () => {
  it('keeps directions outside the 3.8 transcript and requests raw PCM for MP3 encoding', async () => {
    const create = vi.fn().mockResolvedValue({ output_audio: { data: 'AQACAA==', mime_type: 'audio/l16' } });
    const client = { interactions: { create } } as unknown as GoogleGenAI;
    const result = await new GeminiTtsProvider('test', client).synthesize({
      model: 'gemini-3.8-flash-tts',
      voice: 'Sulafat',
      text: 'Hallo Berlin.',
      lang: 'de',
      style: 'Warm guide',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: 'Hallo Berlin.',
                annotations: [{ type: 'speech_metadata', style: 'Warm guide Speak in de.' }],
              },
            ],
          },
        ],
        response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: 'Sulafat' }], max_output_tokens: 16_384 },
        store: false,
      }),
    );
    expect([...result.pcm]).toEqual([1, 0, 2, 0]);
  });

  it('rejects empty, corrupt or incompatible audio instead of caching noise', () => {
    expect(() => decodeGeminiPcm('', 'audio/l16')).toThrow('invalid PCM');
    expect(() => decodeGeminiPcm('AQ==', 'audio/l16')).toThrow('invalid PCM');
    expect(() => decodeGeminiPcm('AQACAA==', 'audio/wav')).toThrow('unsupported audio format');
    expect(() => decodeGeminiPcm('AQACAA==', 'audio/l16;rate=16000')).toThrow('sample rate');
    expect(() => decodeGeminiPcm(Buffer.from('RIFFabcd').toString('base64'))).toThrow('invalid PCM');
  });

  it('retains the legacy API for operator-configured preview models', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: 'AQACAA==', mimeType: 'audio/L16;codec=pcm;rate=24000' } }],
          },
        },
      ],
    });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    await new GeminiTtsProvider('test', client).synthesize({
      model: 'gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      text: 'Hello.',
      lang: 'en',
    });
    expect(generateContent).toHaveBeenCalledOnce();
  });
});

describe('AI marking of synthetic audio', () => {
  it('writes a valid ID3v2.3 tag with the AI_GENERATED frame in front of the MP3 frames', () => {
    const tag = aiGeneratedId3Tag();
    expect(tag.subarray(0, 3).toString()).toBe('ID3');
    const size = (tag[6]! << 21) | (tag[7]! << 14) | (tag[8]! << 7) | tag[9]!;
    expect(size).toBe(tag.length - 10);
    expect(tag.toString('latin1')).toContain('AI_GENERATED');
    const out = new Mp3AudioEncoder().encode(new Uint8Array(24000 * 2));
    expect(out.data.subarray(0, 3).toString()).toBe('ID3');
    expect(out.data.length).toBeGreaterThan(tag.length);
  });
});

describe('OpenAI TTS and routing', () => {
  it('asks OpenAI for raw PCM with the persona style as instructions', async () => {
    let body: Record<string, unknown> = {};
    let auth = '';
    const fake = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      auth = (init.headers as Record<string, string>)['Authorization']!;
      return new Response(new Uint8Array([1, 0, 2, 0]));
    }) as unknown as typeof fetch;
    const r = await new OpenAiTtsProvider('sk-test-key-123', fake).synthesize({
      text: 'Hallo Berlin',
      lang: 'de',
      voice: 'marin',
      model: 'gpt-4o-mini-tts',
      style: 'warm guide',
    });
    expect(body).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Hallo Berlin',
      instructions: 'warm guide',
      response_format: 'pcm',
    });
    expect(auth).toBe('Bearer sk-test-key-123');
    expect([...r.pcm]).toEqual([1, 0, 2, 0]);
  });

  it('fails loudly on API errors and routes only to configured providers', async () => {
    const fail = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(
      new OpenAiTtsProvider('k', fail).synthesize({ text: 'x', lang: 'de', voice: 'marin', model: 'm' }),
    ).rejects.toThrow('401');
    const routed = new RoutedTtsProvider({ gemini: new MockTtsProvider() });
    expect(routed.available('gemini')).toBe(true);
    expect(routed.available('openai')).toBe(false);
    expect(() => routed.synthesize('openai', { text: 'x', lang: 'de', voice: 'marin', model: 'm' })).toThrow(
      'not configured',
    );
  });
});
