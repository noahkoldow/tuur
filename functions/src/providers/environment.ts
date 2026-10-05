/** Never silently substitute synthetic content or unsigned mock payments for deployed live providers. */
export function validateProvider(
  parameter: string,
  selected: string,
  liveProviders: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string {
  if (liveProviders.includes(selected)) return selected;
  if (selected === 'mock' && env['FUNCTIONS_EMULATOR'] === 'true') return selected;
  throw new Error(`${parameter} must select a configured live provider outside the Functions emulator`);
}
