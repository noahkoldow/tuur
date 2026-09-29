/** Kilometres with the locale's decimal separator ("1,1" in German). */
export function formatKm(meters: number, lang: string): string {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}
