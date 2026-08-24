import i18n from 'i18next'

const LANGUAGES = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

export default function LanguagePicker({ onSelect }: { onSelect?: () => void }) {
  const current = i18n.language?.split('-')[0] ?? 'de'

  const switchLang = (code: string) => {
    i18n.changeLanguage(code)
    try { localStorage.setItem('language', code) } catch {}
    onSelect?.()
  }

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLang(lang.code)}
          className={`px-2 py-1 rounded text-xs font-medium ${
            current === lang.code
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
          data-testid={`lang-${lang.code}`}
        >
          {lang.flag}
        </button>
      ))}
    </div>
  )
}
