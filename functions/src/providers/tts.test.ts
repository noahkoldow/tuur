import { describe, expect, it } from 'vitest';
import {
  Mp3AudioEncoder,
  MockTtsProvider,
  OpenAiTtsProvider,
  RoutedTtsProvider,
  aiGeneratedId3Tag,
} from './tts';

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
