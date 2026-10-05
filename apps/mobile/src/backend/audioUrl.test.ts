import { describe, expect, it } from 'vitest';
import { reachableAudioUrl } from './audioUrl';

describe('audio emulator URLs', () => {
  it('replaces only local emulator addresses, preserving escaped paths and query strings', () => {
    expect(reachableAudioUrl('http://127.0.0.1:9199/v0/b/test/o/a%2Fb.mp3?alt=media', '192.168.1.5')).toBe(
      'http://192.168.1.5:9199/v0/b/test/o/a%2Fb.mp3?alt=media',
    );
    const signed = 'https://storage.googleapis.com/audio.mp3?token=abc';
    expect(reachableAudioUrl(signed, '192.168.1.5')).toBe(signed);
    expect(reachableAudioUrl('http://localhost:9199/file')).toBe('http://localhost:9199/file');
  });
});
