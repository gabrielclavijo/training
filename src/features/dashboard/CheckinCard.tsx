import { useEffect, useRef, useState } from 'react'
import { BusyButton } from '../../components/ui/Busy'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/ui/Icon'
import { useToast } from '../../components/fx/Toast'
import { addDays, localDayKey } from '../../core/dates'
import { keys, useCheckins, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { CHECKIN_TAGS, type CheckinTag, type DailyCheckin } from '../../data/types'

type Feeling = DailyCheckin['feeling']
const FEELINGS: Feeling[] = [1, 2, 3, 4, 5]

/** Carita dibujada (la boca va de triste a feliz según el valor). */
export function Face({ value, size = 40 }: { value: Feeling; size?: number }) {
  const c = (value - 3) * 1.9
  return (
    <svg className={`face face-${value}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" className="face-bg" />
      <circle cx="8.3" cy="10" r="1.35" className="face-ink-fill" />
      <circle cx="15.7" cy="10" r="1.35" className="face-ink-fill" />
      <path d={`M7.5 ${15.5 - c / 2} Q12 ${15.5 + c} 16.5 ${15.5 - c / 2}`} className="face-ink" />
    </svg>
  )
}

/** «¿Cómo te sientes hoy?»: 5 caritas y etiquetas; al guardar queda un resumen editable. */
export function CheckinCard() {
  const { t } = useTranslation()
  const repo = useRepo()
  const toast = useToast()
  const location = useLocation()
  const today = localDayKey(new Date())
  const list = useCheckins(14)
  const mine = list.data?.find((c) => c.day === today) ?? null
  const [editing, setEditing] = useState(false)
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [tags, setTags] = useState<CheckinTag[]>([])
  const [justSaved, setJustSaved] = useState(false)
  const card = useRef<HTMLElement>(null)

  const save = useRepoMutation((c: { feeling: Feeling; tags: CheckinTag[] }) => repo.saveCheckin({ day: today, ...c }), [keys.checkins, ['recState']])

  // Desde el botón «+» → «¿Cómo te sientes hoy?»
  const wantsFocus = Boolean((location.state as { checkin?: boolean } | null)?.checkin)
  useEffect(() => {
    if (!wantsFocus || !list.data || !card.current) return
    if (mine) startEdit(mine)
    card.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    card.current.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsFocus, list.data])

  function startEdit(c: DailyCheckin) {
    setFeeling(c.feeling)
    setTags(c.tags)
    setEditing(true)
  }

  if (list.isLoading) return <div className="card skeleton skeleton-checkin" aria-hidden="true" />

  const showForm = !mine || editing
  return (
    <section ref={card} className={`card checkin${showForm ? '' : ' is-done'}`} aria-labelledby="checkin-h">
      {showForm ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!feeling) return
            await save.mutateAsync({ feeling, tags })
            setEditing(false)
            setJustSaved(true)
            toast(t('checkin.saved'), { icon: 'check' })
          }}
        >
          <h2 id="checkin-h" className="checkin-title">
            {t('checkin.title')}
          </h2>
          <fieldset className="faces">
            <legend className="visually-hidden">{t('checkin.feelingLegend')}</legend>
            <div className={`faces-row${feeling ? ' has-pick' : ''}`}>
              {FEELINGS.map((v) => (
                <label key={v} className={`face-opt${feeling === v ? ' is-on' : ''}`}>
                  <input type="radio" name="feeling" className="visually-hidden" checked={feeling === v} onChange={() => setFeeling(v)} />
                  <Face value={v} size={44} />
                  <span>{t(`checkin.feeling.${v}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="checkin-tags">
            <legend className="legend">{t('checkin.tagsLegend')}</legend>
            <div className="tag-row">
              {CHECKIN_TAGS.map((k) => {
                const on = tags.includes(k)
                return (
                  <label key={k} className={`tag-opt${on ? ' is-on' : ''}`}>
                    <input type="checkbox" className="visually-hidden" checked={on} onChange={() => setTags(on ? tags.filter((x) => x !== k) : [...tags, k])} />
                    {on && <Icon name="check" />}
                    {t(`checkin.tags.${k}`)}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="row">
            <BusyButton type="submit" disabled={!feeling} busy={save.isPending}>
              {t('checkin.save')}
            </BusyButton>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </button>
            )}
          </div>
          <p className="checkin-private muted">
            <Icon name="shield" /> {t('checkin.private')}
          </p>
        </form>
      ) : (
        <div className="checkin-summary">
          <div className="checkin-face-wrap">
            <Face value={mine!.feeling} size={56} />
            <svg className={`check-burst${justSaved ? ' is-new' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" />
              <path d="M7 12.5l3.2 3.2L17 9" />
            </svg>
          </div>
          <div className="checkin-text">
            <h2 id="checkin-h" className="checkin-title">
              {t('checkin.todayYouFeel', { feeling: t(`checkin.feeling.${mine!.feeling}`).toLowerCase() })}
            </h2>
            {mine!.tags.length > 0 && (
              <ul className="tag-row tag-row-static">
                {mine!.tags.map((k) => (
                  <li key={k} className="tag-opt is-on">
                    {t(`checkin.tags.${k}`)}
                  </li>
                ))}
              </ul>
            )}
            <WeekFaces list={list.data ?? []} today={today} />
          </div>
          <button type="button" className="icon-btn checkin-edit" onClick={() => startEdit(mine!)}>
            <Icon name="edit" />
            <span className="visually-hidden">{t('checkin.edit')}</span>
          </button>
        </div>
      )}
    </section>
  )
}

/** Últimos 7 días: una carita (o un punto vacío) por día. */
function WeekFaces({ list, today }: { list: DailyCheckin[]; today: string }) {
  const { t } = useTranslation()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const by = new Map(list.map((c) => [c.day, c]))
  const label = days
    .map((d) => {
      const c = by.get(d)
      return `${t(`checkin.dowLong.${new Date(`${d}T12:00:00Z`).getUTCDay()}`)}: ${c ? t(`checkin.feeling.${c.feeling}`) : t('checkin.noRecord')}`
    })
    .join(', ')
  return (
    <ol className="week-faces" aria-label={`${t('checkin.lastDays')}: ${label}`}>
      {days.map((d) => {
        const c = by.get(d)
        return (
          <li key={d} aria-hidden="true">
            {c ? <Face value={c.feeling} size={22} /> : <span className="face-empty" />}
            <span>{t(`checkin.dow.${new Date(`${d}T12:00:00Z`).getUTCDay()}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}
