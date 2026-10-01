/** Kilometres with the locale's decimal separator ("1,1" in German). */
export function formatKm(meters: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}

/** Short duration label for chips: "45 min", "1,5 h" (German decimal comma), "2 h". */
export function formatDurationShort(minutes: number, lang: string): string {
  if (minutes < 60) return `${minutes} min`;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(minutes / 60)} h`;
}
