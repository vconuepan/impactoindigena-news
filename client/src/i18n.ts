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
    // i18next 25 imprime un anuncio de Locize —su producto comercial— en la
    // consola de cada carga de pagina, tambien en produccion. No rompe nada,
    // pero es ruido en la consola de un medio y nada tiene que hacer ahi.
    // La condicion exacta esta en `i18next.bundled.js`:
    // `options.showSupportNotice !== false && !usesLocize(this)`.
    showSupportNotice: false,
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

/**
 * `<html lang>` sigue al idioma de la interfaz.
 *
 * `index.html` lo trae fijo en «es», que es lo correcto para lo que se hornea
 * (el prerender corre sin `ii_lng`, en español). Pero quien elige inglés en el
 * selector seguía con `lang="es"` (medido el 12-oct-2026): el lector de
 * pantalla pronunciaba el inglés con reglas del español, y el traductor del
 * navegador ofrecía traducir del español una página ya en inglés.
 */
export function fijarIdiomaDelDocumento(idioma: string | undefined): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = idioma?.startsWith('en') ? 'en' : 'es'
}

i18n.on('languageChanged', fijarIdiomaDelDocumento)
fijarIdiomaDelDocumento(i18n.resolvedLanguage)

export default i18n
