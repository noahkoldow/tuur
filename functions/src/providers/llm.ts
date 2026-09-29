import type { Interest } from '@tuur/shared';

/**
 * Minimal text-model interface; extended in Phase 2 (narration, fact checks). Phase 1 only needs
 * interest classification for candidates the rules cannot decide.
 */
export interface LlmProvider {
  classifyInterests(
    items: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[],
  ): Promise<Record<string, Interest[]>>;
}

export class MockLlmProvider implements LlmProvider {
  async classifyInterests(
    items: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[],
  ): Promise<Record<string, Interest[]>> {
    return Object.fromEntries(items.map((i) => [i.key, ['hidden_gems'] as Interest[]]));
  }
}
