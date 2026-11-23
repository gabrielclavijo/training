import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/ui/Page'

/**
 * Guías paso a paso en lenguaje no técnico, con ilustraciones simples
 * (esquemas de pantalla) en lugar de capturas, para que no se desactualicen
 * cuando Strava o Garmin cambien su diseño.
 */
// Con HashRouter los enlaces "#ancla" cambiarían de ruta: desplazamos y enfocamos a mano
const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault()
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el?.querySelector<HTMLElement>('h2')?.focus()
}

export function GuidesPage() {
  const { t } = useTranslation()
  const list = (key: string) => t(key, { returnObjects: true }) as unknown as string[]
  return (
    <Page title={t('guides.title')}>
      <p className="muted">{t('guides.intro')}</p>
      <nav aria-label={t('guides.title')} className="card">
        <ol className="toc">
          <li><a href="#g-account" onClick={jump('g-account')}>{t('guides.account.title')}</a></li>
          <li><a href="#g-strava" onClick={jump('g-strava')}>{t('guides.strava.title')}</a></li>
          <li><a href="#g-garmin" onClick={jump('g-garmin')}>{t('guides.garmin.title')}</a></li>
          <li><a href="#g-single" onClick={jump('g-single')}>{t('guides.single.title')}</a></li>
          <li><a href="#g-manual" onClick={jump('g-manual')}>{t('guides.manual.title')}</a></li>
          <li><a href="#g-trouble" onClick={jump('g-trouble')}>{t('guides.trouble.title')}</a></li>
        </ol>
      </nav>

      <Guide id="g-account" title={t('guides.account.title')} steps={list('guides.account.steps')} illustration={<Screen lines={['', '']} button="Continuar con Google" second="Crear cuenta" />} />

      <Guide
        id="g-strava"
        title={t('guides.strava.title')}
        note={t('guides.strava.note')}
        steps={list('guides.strava.steps')}
        illustration={<Screen lines={['Configuración', 'Mi cuenta']} button="Solicitar tu archivo" desktop />}
      />

      <Guide
        id="g-garmin"
        title={t('guides.garmin.title')}
        note={t('guides.garmin.note')}
        steps={list('guides.garmin.steps')}
        illustration={<Screen lines={['Configuración de la cuenta', 'Administración de datos']} button="Exportar datos" desktop />}
      />

      <section id="g-single" className="card prose" aria-labelledby="g-single-h">
        <h2 id="g-single-h" tabIndex={-1}>{t('guides.single.title')}</h2>
        <p>{t('guides.single.intro')}</p>
        <ul>
          <li>{t('guides.single.garmin')}</li>
          <li>{t('guides.single.strava')}</li>
          <li>{t('guides.single.other')}</li>
        </ul>
        <Screen lines={['Actividad', '⚙ / …']} button="Exportar original" />
        <p>{t('guides.single.upload')}</p>
        <Link className="btn btn-primary" to="/subir">{t('nav.upload')}</Link>
      </section>

      <section id="g-manual" className="card prose" aria-labelledby="g-manual-h">
        <h2 id="g-manual-h" tabIndex={-1}>{t('guides.manual.title')}</h2>
        <p>{t('guides.manual.text')}</p>
        <Link to="/actividades/nueva">{t('activities.manualTitle')}</Link>
      </section>

      <section id="g-trouble" className="card prose" aria-labelledby="g-trouble-h">
        <h2 id="g-trouble-h" tabIndex={-1}>{t('guides.trouble.title')}</h2>
        <ul>
          {list('guides.trouble.items').map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <p className="muted">{t('guides.strava_api_note')}</p>
      </section>
    </Page>
  )
}

function Guide({ id, title, note, steps, illustration }: { id: string; title: string; note?: string; steps: string[]; illustration: React.ReactNode }) {
  return (
    <section id={id} className="card prose" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} tabIndex={-1}>{title}</h2>
      {note && <p className="callout">{note}</p>}
      <div className="guide-grid">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {illustration}
      </div>
    </section>
  )
}

/** Esquema genérico de una pantalla con el botón que hay que tocar resaltado. */
function Screen({ lines, button, second, desktop = false }: { lines: string[]; button: string; second?: string; desktop?: boolean }) {
  const w = desktop ? 260 : 150
  const h = desktop ? 160 : 260
  return (
    <figure className="illustration">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Ilustración: botón «${button}»`}>
        <rect x="2" y="2" width={w - 4} height={h - 4} rx={desktop ? 8 : 18} className="ill-frame" />
        {desktop && <rect x="2" y="2" width={w - 4} height="18" rx="8" className="ill-bar" />}
        {lines.map((l, i) => (
          <g key={i}>
            <rect x="14" y={(desktop ? 30 : 30) + i * 24} width={w - 28} height="16" rx="4" className="ill-line" />
            <text x="20" y={(desktop ? 42 : 42) + i * 24} className="ill-text">
              {l}
            </text>
          </g>
        ))}
        <rect x="14" y={h - (second ? 82 : 52)} width={w - 28} height="30" rx="8" className="ill-button" />
        <text x={w / 2} y={h - (second ? 62 : 32)} textAnchor="middle" className="ill-button-text">
          {button}
        </text>
        {second && (
          <>
            <rect x="14" y={h - 44} width={w - 28} height="28" rx="8" className="ill-line" />
            <text x={w / 2} y={h - 26} textAnchor="middle" className="ill-text">
              {second}
            </text>
          </>
        )}
        <circle cx={w - 30} cy={h - (second ? 60 : 30)} r="12" className="ill-tap" />
      </svg>
      <figcaption className="muted">«{button}»</figcaption>
    </figure>
  )
}
