import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiLlmProvider, type NearbySelectionInput } from './llm';

const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', async (original) => {
  const actual = await original<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const input: NearbySelectionInput = {
  model: 'configured-lite-model',
  lang: 'de',
  interests: ['history'],
  thread: 'Streets and everyday life',
  candidates: [{ id: 'known-place', name: 'Market', interests: ['history'], kind: 'square', sourceHint: '' }],
};

beforeEach(() => generateContent.mockReset());

describe('Gemini nearby selection provider', () => {
  it('requests IDs only with a 256-token limit, no search tools, and accounts for lite usage', async () => {
    generateContent.mockResolvedValue({
      text: '["known-place"]',
      usageMetadata: { promptTokenCount: 81, candidatesTokenCount: 8, thoughtsTokenCount: 0 },
    });
    expect(await new GeminiLlmProvider('test-key').selectNearby(input)).toEqual({
      poiIds: ['known-place'],
      source: 'gemini',
      usage: { liteInputTokens: 81, liteOutputTokens: 8 },
    });
    const call = generateContent.mock.calls[0]![0];
    expect(call.model).toBe(input.model);
    expect(call.config.maxOutputTokens).toBe(256);
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.tools).toBeUndefined();
    expect(JSON.parse(call.contents).candidates).toEqual(input.candidates);
  });

  it('rejects generated descriptions and malformed selection data', async () => {
    const provider = new GeminiLlmProvider('test-key');
    for (const text of ['{"poiIds":["known-place"]}', '[{"id":"known-place"}]', 'not json']) {
      generateContent.mockResolvedValue({ text });
      await expect(provider.selectNearby(input)).rejects.toThrow();
    }
  });

  it('rejects responses without usage accounting instead of silently declaring them free', async () => {
    generateContent.mockResolvedValue({ text: '["known-place"]' });
    await expect(new GeminiLlmProvider('test-key').selectNearby(input)).rejects.toThrow(
      'Missing provider usage metadata',
    );
  });
});
