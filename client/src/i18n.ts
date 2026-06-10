import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import es from './locales/es.json'
import en from './locales/en.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    detection: {
      // Spanish-first: the UI language follows an explicit choice only (the
      // header toggle). Browser auto-detection produced a mixed experience
      // (English chrome over Spanish content) and cached itself as if the
      // reader had chosen it. New storage key so previously auto-detected
      // values reset once; the toggle keeps persisting choices from here on.
      order: ['localStorage'],
      lookupLocalStorage: 'ii_lng',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
