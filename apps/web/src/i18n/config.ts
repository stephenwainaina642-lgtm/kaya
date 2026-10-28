import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import sw from './locales/sw.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'sw', label: 'Kiswahili' },
] as const;

/**
 * Translation coverage is intentionally scoped to the surfaces a visitor
 * sees BEFORE they're inside a live workspace — the marketing page,
 * sign-in, sign-up, and the app's own nav labels — not the entire
 * product. Translating every CRM screen (forms, list columns, detail
 * pages) is a much larger, ongoing effort; starting here covers the
 * highest-traffic, most "first impression" surfaces first, and the nav
 * labels mean a non-English-speaking team at least orients around the
 * app in their language even though individual page content stays in
 * English for now.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      sw: { translation: sw },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'sw'],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });

export default i18n;
