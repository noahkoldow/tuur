/** Provider-side output bounds, shared with the budget reservation estimates. */
export const LLM_OUTPUT_LIMITS = {
  generateNarration: 4096,
  checkFacts: 4096,
  classifyInterests: 4096,
  generateTourConcept: 4096,
  teaser: 120,
  factSheet: 900,
  transition: 200,
  selectNearby: 256,
} as const;
export const MAX_LLM_REQUEST_BYTES = 256_000;
export const MAX_TTS_TEXT_CHARS = 20_000;
export const MAX_TTS_OUTPUT_TOKENS = 16_384;
