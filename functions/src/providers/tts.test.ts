import { describe, expect, it } from 'vitest';
import { Mp3AudioEncoder, aiGeneratedId3Tag } from './tts';

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
