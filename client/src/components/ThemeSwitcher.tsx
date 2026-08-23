import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores/theme'

export default function ThemeSwitcher() {
  const { t } = useTranslation()
  const { dark, toggle } = useThemeStore()

  return (
    <button
      onClick={toggle}
      className="px-3 py-1.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
      data-testid="theme-switcher"
    >
      {dark ? '☀️ ' + (t('theme.light') ?? 'Hell') : '🌙 ' + (t('theme.dark') ?? 'Dunkel')}
    </button>
  )
}
