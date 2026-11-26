import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, TitleIcon } from '../../components/ui/Icon'
import { buildRoutine, focusFor, type RoutineItem, type RoutineSport } from '../../core/strength/routine'
import type { StrengthPrefs } from '../../core/strength/library'
import type { Phase } from '../../core/planner/plan'
import { ExerciseCard } from './ExerciseCard'

/**
 * La rutina de una sesión de fuerza del plan: ejercicios con su dibujo
 * animado, series y descanso. Si la persona entrena en casa y en gimnasio,
 * elige dónde la hace hoy.
 */
export function StrengthSession({
  prefs,
  askPrefs,
  sport,
  phase,
  minutes,
  mobility,
  core = false,
  indexInWeek,
  weekInPhase,
}: {
  prefs: StrengthPrefs
  /** Aún no respondió «Tu fuerza» */
  askPrefs: boolean
  sport: RoutineSport
  phase: Phase
  minutes: number
  mobility: boolean
  /** Sesión corta solo de core */
  core?: boolean
  indexInWeek: number
  weekInPhase: number
}) {
  const { t } = useTranslation()
  const [place, setPlace] = useState<'home' | 'gym'>(prefs.location === 'gym' ? 'gym' : 'home')
  const focus = focusFor(sport, indexInWeek, mobility, core)
  const routine = buildRoutine({ prefs, place, sport, phase, focus, minutes, weekInPhase })
  const where = place === 'gym' ? t('strength.session.gym') : prefs.equipment.length ? t('strength.session.homeEquip') : t('strength.session.homeBody')

  const doseText = (i: RoutineItem) =>
    (i.secs ? t('strength.session.doseHold', { sets: i.sets, secs: i.secs }) : t('strength.session.dose', { sets: i.sets, reps: i.reps })) +
    (i.perSide ? ` ${t('strength.session.perSide')}` : '')

  return (
    <section className="card strength-session" aria-labelledby="str-h">
      <h2 id="str-h" className="card-title-icon">
        <TitleIcon name="dumbbell" />
        {t('strength.session.focus.' + focus)}
      </h2>

      {askPrefs && (
        <div className="str-ask">
          <Icon name="sparkles" />
          <div>
            <strong>{t('strength.askTitle')}</strong>
            <p>{t('strength.askBody')}</p>
            <Link className="btn btn-primary" to="/plan/disponibilidad#tu-fuerza">
              {t('strength.askCta')}
            </Link>
          </div>
        </div>
      )}

      {prefs.location === 'both' && (
        <div className="seg" role="group" aria-label={t('strength.where')}>
          {(['home', 'gym'] as const).map((v) => (
            <button key={v} type="button" className={`seg-btn${place === v ? ' is-on' : ''}`} aria-pressed={place === v} onClick={() => setPlace(v)}>
              {t(`strength.session.${v}`)}
            </button>
          ))}
          <span className={`seg-thumb seg-thumb-${place === 'home' ? 'week' : 'month'}`} aria-hidden="true" />
        </div>
      )}

      <p className="muted">{t('strength.session.why', { text: t(`strength.session.whyText.${sport}`) })}</p>
      <ul className="str-tips">
        <li>
          <Icon name="flame" /> {t('strength.session.warmup')}
        </li>
        <li>
          <Icon name="trend" /> {t('strength.session.progress', { n: weekInPhase, text: t(`strength.session.progressText.${routine.progress}`) })}
        </li>
        {place === 'home' && prefs.equipment.includes('dumbbells') && prefs.dumbbellMaxKg && (
          <li>
            <Icon name="dumbbell" /> {t('strength.session.useWeight', { kg: String(prefs.dumbbellMaxKg).replace('.', ',') })}
          </li>
        )}
        <li>
          <Icon name="heart" /> {t('strength.session.easyNote')}
        </li>
      </ul>

      <div className="ex-list">
        {routine.items.map((i, k) => (
          <ExerciseCard key={i.ex.id} ex={i.ex} index={k} dose={{ where, dose: doseText(i), rest: t('strength.session.rest', { s: i.restS }) }} />
        ))}
      </div>

      <Link to="/plan/disponibilidad#tu-fuerza" className="str-change">
        <Icon name="edit" /> {t('strength.session.change')}
      </Link>
    </section>
  )
}
