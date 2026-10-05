/** The emulator returns its own loopback address; a phone needs the developer machine's LAN address. */
export function reachableAudioUrl(url: string, emulatorHost?: string): string {
  if (!emulatorHost) return url;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname)
    ) {
      parsed.hostname = emulatorHost;
      return parsed.toString();
    }
  } catch {
    /* Leave malformed URLs for the player to report. */
  }
  return url;
}
