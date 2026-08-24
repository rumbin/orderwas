import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'
import fr from './fr.json'

// Restore saved language
let savedLang = 'de'
try { savedLang = localStorage.getItem('language') ?? 'de' } catch {}

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: savedLang,
  fallbackLng: 'de',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
