import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  de: {
    translation: {
      'loading.exploring': 'tuur erkundet diese Gegend…',
      'home.tagline': 'Dein KI-Audio-Stadtguide',
    },
  },
  en: {
    translation: {
      'loading.exploring': 'tuur is exploring this area…',
      'home.tagline': 'Your AI audio city guide',
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'de',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
