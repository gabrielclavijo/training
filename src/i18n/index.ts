import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import activities from './es-CO/activities.json'
import app from './es-CO/app.json'
import base from './es-CO/base.json'
import fitness from './es-CO/fitness.json'
import goals from './es-CO/goals.json'
import guides from './es-CO/guides.json'
import plan from './es-CO/plan.json'
import profile from './es-CO/profile.json'

// Todos los textos viven en archivos JSON por idioma (src/i18n/<idioma>/*.json).
// Para agregar otro idioma: copiar la carpeta es-CO, traducir y registrarla aquí.
export const SUPPORTED_LOCALES = ['es-CO'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es-CO'

const esCO = { ...base, ...app, ...profile, ...activities, ...fitness, ...goals, ...guides, ...plan }

void i18n.use(initReactI18next).init({
  resources: { 'es-CO': { translation: esCO } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
