import type { LengthTier, NarrationResponse } from '@tuur/shared';

/** The story actually heard at a place, retained locally for reading during and after a walk. */
export type StopNarration = Pick<
  NarrationResponse,
  'key' | 'title' | 'text' | 'images' | 'aiGenerated' | 'sponsored' | 'grounding'
> & {
  tier: LengthTier;
  keyFacts?: string[];
};

/** A shorter replay must not replace the longer story the listener already heard. */
export function preferStopNarration(
  current: StopNarration | undefined,
  incoming: StopNarration | undefined,
): StopNarration | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  const tiers: LengthTier[] = ['short', 'medium', 'long'];
  if (tiers.indexOf(current.tier) > tiers.indexOf(incoming.tier)) return current;
  return current.key === incoming.key && current.tier === incoming.tier ? current : incoming;
}
