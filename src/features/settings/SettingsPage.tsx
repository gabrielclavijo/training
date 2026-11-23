import { useTranslation } from 'react-i18next'
import { useTheme, type ThemePreference } from '../../app/theme'
import { Page } from '../../components/ui/Page'
import { useAuth } from '../auth/AuthProvider'

const THEMES: ThemePreference[] = ['light', 'dark', 'system']

export function SettingsPage() {
  const { t } = useTranslation()
  const { preference, setPreference } = useTheme()
  const { user, signOut } = useAuth()

  return (
    <Page title={t('settings.title')}>
      <section className="card" aria-labelledby="theme-h">
        <fieldset>
          <legend id="theme-h">
            <h2 style={{ margin: 0 }}>{t('theme.label')}</h2>
          </legend>
          <p className="hint muted" id="theme-help">
            {t('theme.help')}
          </p>
          <div className="choice-list" aria-describedby="theme-help">
            {THEMES.map((th) => (
              <label key={th} className="choice">
                <input
                  type="radio"
                  name="theme"
                  value={th}
                  checked={preference === th}
                  onChange={() => setPreference(th)}
                />
                {t(`theme.${th}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card" aria-labelledby="locale-h">
        <h2 id="locale-h">{t('settings.language')} y {t('settings.units').toLowerCase()}</h2>
        <div className="field">
          <label htmlFor="locale">{t('settings.language')}</label>
          <select id="locale" disabled aria-describedby="only-one" defaultValue="es-CO">
            <option value="es-CO">{t('settings.languageEsCO')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="units">{t('settings.units')}</label>
          <select id="units" disabled aria-describedby="only-one" defaultValue="metric">
            <option value="metric">{t('settings.unitsMetric')}</option>
          </select>
        </div>
        <p id="only-one" className="muted">
          {t('settings.onlyOptionForNow')}
        </p>
      </section>

      <section className="card" aria-labelledby="account-h">
        <h2 id="account-h">{t('settings.account')}</h2>
        {user?.email && <p className="muted">{user.email}</p>}
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          {t('settings.signOut')}
        </button>
      </section>
    </Page>
  )
}
