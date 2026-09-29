import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { SUPPORTED_UI_LANGUAGES, type UiLanguage } from '@tuur/shared';
import { de } from './de';
import { en } from './en';

export function deviceLanguage(): UiLanguage {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_UI_LANGUAGES as readonly string[]).includes(code) ? (code as UiLanguage) : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const setLanguage = (lng: UiLanguage) => i18n.changeLanguage(lng);
export default i18n;
