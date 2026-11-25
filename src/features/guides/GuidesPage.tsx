import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../../components/ui/Icon'
import { Page } from '../../components/ui/Page'
import { Semaphore } from '../../components/ui/Status'

/**
 * Ayuda: guías cortas por tema, con pasos numerados y dibujos simples de la
 * app (no capturas, para que no se desactualicen). Cada tema tiene su dirección
 * (#/ayuda?tema=pausa) para enlazarlo desde otras pantallas.
 */

type Group = 'start' | 'train' | 'health' | 'help'
interface Topic {
  id: string
  key: string // clave en guides.*
  group: Group
  icon: IconName
  tone?: 'coral' | 'sky' | 'soft'
  cta?: { to: string; label?: string }
  art?: () => ReactNode
}

const TOPICS: Topic[] = [
  { id: 'cuenta', key: 'account', group: 'start', icon: 'user', art: () => <Screen lines={['', '']} button="Continuar con Google" second="Crear cuenta" /> },
  {
    id: 'strava',
    key: 'strava',
    group: 'start',
    icon: 'import',
    tone: 'coral',
    cta: { to: '/subir', label: 'nav.upload' },
    art: () => <Screen lines={['Configuración', 'Mi cuenta']} button="Solicitar tu archivo" desktop />,
  },
  {
    id: 'garmin',
    key: 'garmin',
    group: 'start',
    icon: 'import',
    tone: 'sky',
    cta: { to: '/subir', label: 'nav.upload' },
    art: () => <Screen lines={['Configuración de la cuenta', 'Administración de datos']} button="Exportar datos" desktop />,
  },
  {
    id: 'subir',
    key: 'single',
    group: 'start',
    icon: 'upload',
    cta: { to: '/subir', label: 'nav.upload' },
    art: () => <Screen lines={['Actividad', '⚙ / …']} button="Exportar original" />,
  },
  {
    id: 'a-mano',
    key: 'manual',
    group: 'start',
    icon: 'dumbbell',
    tone: 'soft',
    cta: { to: '/actividades/nueva', label: 'activities.manualTitle' },
    art: () => <ArtEffort />,
  },
  { id: 'meta', key: 'goal', group: 'train', icon: 'flag', tone: 'coral', cta: { to: '/metas/nueva' }, art: () => <ArtGoal /> },
  { id: 'plan', key: 'plan', group: 'train', icon: 'plan', cta: { to: '/plan' }, art: () => <ArtWeek /> },
  { id: 'tiempo', key: 'availability', group: 'train', icon: 'clock', tone: 'sky', cta: { to: '/plan/disponibilidad' }, art: () => <ArtMinutes /> },
  { id: 'pausa', key: 'pause', group: 'train', icon: 'pause', tone: 'soft', cta: { to: '/temporada' }, art: () => <ArtPauses /> },
  { id: 'temporada', key: 'season', group: 'train', icon: 'calendar', tone: 'sky', cta: { to: '/temporada' }, art: () => <ArtSeason /> },
  { id: 'alimentacion', key: 'nutrition', group: 'health', icon: 'food', tone: 'coral', cta: { to: '/nutricion' }, art: () => <ArtNutrition /> },
  { id: 'examenes', key: 'labs', group: 'health', icon: 'lab', tone: 'sky', cta: { to: '/laboratorio' }, art: () => <ArtLabs /> },
  { id: 'numeros', key: 'reading', group: 'health', icon: 'gauge', cta: { to: '/glosario' }, art: () => <ArtSemaphores /> },
  { id: 'cifras', key: 'kpis', group: 'health', icon: 'trend', tone: 'sky', cta: { to: '/' }, art: () => <ArtKpis /> },
  { id: 'problemas', key: 'trouble', group: 'help', icon: 'alert', tone: 'coral' },
]

const GROUPS: Group[] = ['start', 'train', 'health', 'help']

export function GuidesPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const topic = TOPICS.find((x) => x.id === params.get('tema')) ?? null
  const open = (id: string | null) => {
    setParams(id ? { tema: id } : {})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return <Page title={t('guides.title')}>{topic ? <GuideView topic={topic} onOpen={open} /> : <TopicGrid onOpen={open} />}</Page>
}

function TopicGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="help-hero">
        <span className="ai-orb" aria-hidden="true">
          <Icon name="help" />
        </span>
        <div>
          <p className="help-ask">{t('guides.ask')}</p>
          <p className="muted">{t('guides.intro')}</p>
        </div>
      </div>
      {GROUPS.map((g) => (
        <section key={g} className="help-group" aria-labelledby={`hg-${g}`}>
          <h2 id={`hg-${g}`}>{t(`guides.groups.${g}`)}</h2>
          <ul className="topic-grid">
            {TOPICS.filter((x) => x.group === g).map((x, i) => (
              <li key={x.id} style={{ animationDelay: `${i * 50}ms` }}>
                <button type="button" className="topic-card" onClick={() => onOpen(x.id)}>
                  <span className={`icon-tile${x.tone ? ` icon-tile-${x.tone}` : ''}`} aria-hidden="true">
                    <Icon name={x.icon} />
                  </span>
                  <span className="topic-text">
                    <strong>{t(`guides.${x.key}.title`)}</strong>
                    <span className="muted">{t(`guides.${x.key}.desc`)}</span>
                  </span>
                  <span className="topic-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function GuideView({ topic, onOpen }: { topic: Topic; onOpen: (id: string | null) => void }) {
  const { t } = useTranslation()
  const h = useRef<HTMLHeadingElement>(null)
  useEffect(() => h.current?.focus(), [topic.id])
  const list = (key: string) => t(key, { returnObjects: true }) as unknown as string[]
  const steps = topic.key === 'trouble' ? list('guides.trouble.items') : list(`guides.${topic.key}.steps`)
  const note = topic.key === 'strava' || topic.key === 'garmin' ? t(`guides.${topic.key}.note`) : null
  const others = TOPICS.filter((x) => x.group === topic.group && x.id !== topic.id)
  return (
    <article className="guide" key={topic.id}>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(null)}>
        ← {t('guides.back')}
      </button>
      <header className="guide-head">
        <span className={`icon-tile guide-tile${topic.tone ? ` icon-tile-${topic.tone}` : ''}`} aria-hidden="true">
          <Icon name={topic.icon} />
        </span>
        <div>
          <span className="eyebrow">{t(`guides.groups.${topic.group}`)}</span>
          <h2 ref={h} tabIndex={-1}>
            {t(`guides.${topic.key}.title`)}
          </h2>
          <p className="muted">{t(`guides.${topic.key}.desc`)}</p>
        </div>
      </header>
      {note && <p className="notice-estimate">{note}</p>}
      <div className="guide-body">
        <ol className="stepper">
          {steps.map((s, i) => (
            <li key={i} style={{ animationDelay: `${i * 80}ms` }}>
              <span className="step-num" aria-hidden="true">
                {topic.key === 'trouble' ? <Icon name="alert" /> : i + 1}
              </span>
              <p>{s}</p>
            </li>
          ))}
        </ol>
        {topic.art && <div className="guide-art">{topic.art()}</div>}
      </div>
      {topic.key === 'trouble' && <p className="muted">{t('guides.strava_api_note')}</p>}
      {topic.cta && (
        <Link className="btn btn-primary" to={topic.cta.to}>
          {topic.cta.label ? t(topic.cta.label) : t(`guides.${topic.key}.cta`)} →
        </Link>
      )}
      {others.length > 0 && (
        <nav className="guide-others" aria-label={t('guides.others')}>
          <h3>{t('guides.others')}</h3>
          <ul className="chips">
            {others.map((x) => (
              <li key={x.id}>
                <button type="button" className="chip chip-btn" onClick={() => onOpen(x.id)}>
                  <Icon name={x.icon} /> {t(`guides.${x.key}.title`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Dibujos simples de la app (decorativos: cada guía se entiende con el texto)
// ---------------------------------------------------------------------------

function ArtGoal() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-goal">
        <span className="icon-tile">
          <Icon name="flag" />
        </span>
        <div>
          <small>Ciclismo · 3 etapas</small>
          <strong>Vuelta de 3 días</strong>
          <span className="mono">315 km · ↑ 5.600 m</span>
        </div>
      </div>
      <div className="art-row">
        <Semaphore level="caution" label="Vas justo" />
      </div>
    </figure>
  )
}

function ArtWeek() {
  const days: [string, IconName, string][] = [
    ['L', 'bed', ''],
    ['M', 'check', 'done'],
    ['X', 'activity', ''],
    ['J', 'check', 'done'],
    ['V', 'bed', ''],
    ['S', 'mountain', 'today'],
    ['D', 'flag', 'event'],
  ]
  return (
    <figure className="art" aria-hidden="true">
      <ul className="week-strip art-strip">
        {days.map(([l, ic, k]) => (
          <li key={l}>
            <span className={`day-chip${k === 'done' ? ' day-chip-done' : k === 'today' ? ' day-chip-today' : k === 'event' ? ' day-chip-event' : ''}`}>
              <span>{l}</span>
              <Icon name={ic} />
            </span>
          </li>
        ))}
      </ul>
      <div className="art-session">
        <span className="icon-tile">
          <Icon name="bike" />
        </span>
        <span>
          <strong>Salida larga · Ciclismo</strong>
          <small>240 min · Zona 2</small>
        </span>
      </div>
    </figure>
  )
}

function ArtMinutes() {
  const v = [60, 60, 75, 50, 0, 240, 90]
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-bars">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={d}>
            <i style={{ height: `${(v[i] / 240) * 100}%` }} className={i === 5 ? 'hi' : ''} />
            <small>{d}</small>
          </span>
        ))}
      </div>
    </figure>
  )
}

function ArtPauses() {
  const items: [IconName, string][] = [
    ['heart', 'Enfermedad'],
    ['alert', 'Lesión'],
    ['route', 'Viaje'],
    ['sun', 'Vacaciones'],
  ]
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-pauses">
        {items.map(([ic, l]) => (
          <span key={l}>
            <Icon name={ic} />
            {l}
          </span>
        ))}
      </div>
    </figure>
  )
}

function ArtSeason() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-season">
        <i className="b" style={{ flex: 5 }} />
        <i className="t" style={{ flex: 1 }} />
        <i className="e" style={{ flex: 0.4 }} />
        <i className="r" style={{ flex: 1 }} />
        <i className="p" style={{ flex: 0.8 }} />
        <i className="b" style={{ flex: 4 }} />
        <i className="t" style={{ flex: 1 }} />
        <i className="e" style={{ flex: 0.4 }} />
      </div>
      <div className="art-legend">
        <span>
          <i className="b" /> Preparación
        </span>
        <span>
          <i className="t" /> Disminución
        </span>
        <span>
          <i className="e" /> Evento
        </span>
        <span>
          <i className="p" /> Pausa
        </span>
      </div>
    </figure>
  )
}

function ArtNutrition() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-nut">
        <span className="art-donut">
          <b>3.100</b>
          <small>kcal</small>
        </span>
        <div className="art-meals">
          <span>
            <Icon name="sunrise" /> Desayuno
          </span>
          <span>
            <Icon name="sun" /> Almuerzo
          </span>
          <span>
            <Icon name="cup" /> Comida
          </span>
        </div>
      </div>
    </figure>
  )
}

function ArtLabs() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-lab">
        <strong>Ferritina</strong>
        <span className="badge badge-warning">▼ Por debajo del rango</span>
        <svg viewBox="0 0 120 40">
          <polyline points="0,8 40,14 80,22 120,32" fill="none" stroke="#006450" strokeWidth="3" />
        </svg>
      </div>
    </figure>
  )
}

function ArtSemaphores() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-sem">
        <Semaphore level="good" label="Bien" />
        <Semaphore level="caution" label="Atención" />
        <Semaphore level="alert" label="Alerta" />
      </div>
    </figure>
  )
}

function ArtKpis() {
  const tiles: [string, string, string, string][] = [
    ['Forma', '73', '▲ 3', 'good'],
    ['Fatiga', '65', '▲ 8', 'bad'],
    ['Carga 7 días', '486', '▼ 111', 'info'],
  ]
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-kpis">
        {tiles.map(([l, v, d, k]) => (
          <div key={l} className="art-kpi">
            <span className={`kpi-delta is-${k}`}>{d}</span>
            <span className="kpi-label">{l}</span>
            <strong className="num">{v}</strong>
          </div>
        ))}
      </div>
    </figure>
  )
}

function ArtEffort() {
  return (
    <figure className="art" aria-hidden="true">
      <div className="art-effort">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i === 6 ? 'on' : ''} style={{ background: `hsl(${140 - i * 14} 60% ${i === 6 ? 40 : 75}%)` }}>
            {i + 1}
          </span>
        ))}
      </div>
    </figure>
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
            <rect x="14" y={30 + i * 24} width={w - 28} height="16" rx="4" className="ill-line" />
            <text x="20" y={42 + i * 24} className="ill-text">
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
