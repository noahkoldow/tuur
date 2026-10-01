/** Copy for the public server-rendered pages (landing, invite, legal, delete-account). */

export type PageLang = 'de' | 'en';

/**
 * Picks the page language from an Accept-Language header: German when German is preferred over English
 * (by order and q-value), English otherwise (also without a header, like the group-join page).
 */
export function pickLang(acceptLanguage: string | null | undefined): PageLang {
  if (!acceptLanguage) return 'en';
  const ranked = acceptLanguage
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
      return { base: tag.split('-')[0] ?? '', q: q === undefined ? 1 : Number(q), i };
    })
    .filter((l) => l.base && l.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const first = ranked.find((l) => l.base === 'de' || l.base === 'en');
  return first?.base === 'de' ? 'de' : 'en';
}

export interface InviteCopy {
  title: string;
  generic: string;
  withTour(title: string): string;
  ios: string;
  android: string;
  hint: string;
  invalid: string;
}

export const inviteCopy: Record<PageLang, InviteCopy> = {
  de: {
    title: 'Dir wurde eine Tour geschenkt',
    generic: 'Jemand hat dir eine tuur-Tour geschenkt. Hol dir die App und hör sie dir unterwegs an.',
    withTour: (title) => `Jemand hat dir die tuur-Tour „${title}“ geschenkt. Hol dir die App und hör sie dir unterwegs an.`,
    ios: 'Im App Store laden',
    android: 'Bei Google Play laden',
    hint: 'Hast du tuur schon installiert, öffnet sich die Einladung direkt in der App. Sonst öffne den Link nach der Installation noch einmal.',
    invalid: 'Diese Einladung ist abgelaufen oder wurde schon eingelöst.',
  },
  en: {
    title: 'You were gifted a tour',
    generic: 'Someone gifted you a tuur tour. Get the app and listen to it on the go.',
    withTour: (title) => `Someone gifted you the tuur tour “${title}”. Get the app and listen to it on the go.`,
    ios: 'Get it on the App Store',
    android: 'Get it on Google Play',
    hint: 'With tuur installed the invite opens directly in the app. Otherwise open the link again after installing.',
    invalid: 'This invite has expired or has already been redeemed.',
  },
};
