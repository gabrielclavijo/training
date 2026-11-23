import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import esCO from './es-CO.json'

// Todos los textos viven en archivos JSON por idioma. Para agregar otro idioma:
// crear p. ej. en-US.json con las mismas claves y registrarlo aquí.
export const SUPPORTED_LOCALES = ['es-CO'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es-CO'

void i18n.use(initReactI18next).init({
  resources: { 'es-CO': { translation: esCO } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
