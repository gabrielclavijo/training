import type { Sport, SubSport } from './types'

export interface SportMapping {
  sport: Sport
  subSport: SubSport | null
}

/** Deporte y modalidad a partir de los nombres del protocolo FIT (Garmin y otros relojes). */
export function fromFit(sport?: string, subSport?: string): SportMapping {
  const s = (sport ?? '').toLowerCase()
  const sub = (subSport ?? '').toLowerCase()
  if (s === 'cycling' || s === 'ebiking') {
    if (sub === 'gravelcycling' || sub === 'cyclocross') return { sport: 'cycling', subSport: 'gravel' }
    if (sub === 'mountain' || sub === 'downhill' || sub === 'ebikemountain' || sub === 'ebikeenduro')
      return { sport: 'cycling', subSport: 'mtb' }
    if (sub === 'indoorcycling' || sub === 'virtualactivity')
      return { sport: 'cycling', subSport: 'indoor' }
    if (sub === 'road' || sub === 'commuting') return { sport: 'cycling', subSport: 'road' }
    return { sport: 'cycling', subSport: null }
  }
  if (s === 'running') {
    if (sub === 'trail') return { sport: 'running', subSport: 'trail' }
    if (sub === 'treadmill' || sub === 'indoorrunning') return { sport: 'running', subSport: 'treadmill' }
    if (sub === 'track') return { sport: 'running', subSport: 'track' }
    return { sport: 'running', subSport: 'road' }
  }
  if (s === 'swimming') {
    if (sub === 'openwater') return { sport: 'swimming', subSport: 'open_water' }
    return { sport: 'swimming', subSport: 'pool' }
  }
  if (s === 'training' || s === 'fitnessequipment') {
    if (sub === 'strengthtraining' || sub === 'cardiotraining' || sub === '' || sub === 'generic')
      return { sport: 'strength', subSport: null }
  }
  return { sport: 'other', subSport: null }
}

/** Tipos de actividad de Strava (columna "Activity Type" de la exportación, en inglés o español). */
export function fromStravaType(type?: string | null): SportMapping {
  const t = (type ?? '').trim().toLowerCase()
  const map: Record<string, SportMapping> = {
    ride: { sport: 'cycling', subSport: null },
    'bicicleta': { sport: 'cycling', subSport: null },
    'ciclismo': { sport: 'cycling', subSport: null },
    'road ride': { sport: 'cycling', subSport: 'road' },
    'gravel ride': { sport: 'cycling', subSport: 'gravel' },
    'ciclismo gravel': { sport: 'cycling', subSport: 'gravel' },
    'mountain bike ride': { sport: 'cycling', subSport: 'mtb' },
    'ciclismo de montaña': { sport: 'cycling', subSport: 'mtb' },
    'e-mountain bike ride': { sport: 'cycling', subSport: 'mtb' },
    'e-bike ride': { sport: 'cycling', subSport: null },
    'virtual ride': { sport: 'cycling', subSport: 'indoor' },
    'ciclismo virtual': { sport: 'cycling', subSport: 'indoor' },
    run: { sport: 'running', subSport: 'road' },
    carrera: { sport: 'running', subSport: 'road' },
    'trail run': { sport: 'running', subSport: 'trail' },
    'carrera por montaña': { sport: 'running', subSport: 'trail' },
    'virtual run': { sport: 'running', subSport: 'treadmill' },
    swim: { sport: 'swimming', subSport: null },
    natación: { sport: 'swimming', subSport: null },
    'weight training': { sport: 'strength', subSport: null },
    'entrenamiento con pesas': { sport: 'strength', subSport: null },
    workout: { sport: 'strength', subSport: null },
    entrenamiento: { sport: 'strength', subSport: null },
    crossfit: { sport: 'strength', subSport: null },
    hiit: { sport: 'strength', subSport: null },
  }
  return map[t] ?? { sport: 'other', subSport: null }
}

/** Deporte a partir de los textos de GPX (<type>) o TCX (Sport="Biking"). */
export function fromText(text?: string | null): SportMapping {
  const t = (text ?? '').toLowerCase()
  if (/gravel/.test(t)) return { sport: 'cycling', subSport: 'gravel' }
  if (/mountain|mtb/.test(t)) return { sport: 'cycling', subSport: 'mtb' }
  if (/virtual|indoor/.test(t) && /bik|cycl|ride/.test(t)) return { sport: 'cycling', subSport: 'indoor' }
  if (/bik|cycl|ride|ciclis/.test(t)) return { sport: 'cycling', subSport: null }
  if (/trail/.test(t)) return { sport: 'running', subSport: 'trail' }
  if (/run|carrera|correr/.test(t)) return { sport: 'running', subSport: 'road' }
  if (/open.?water/.test(t)) return { sport: 'swimming', subSport: 'open_water' }
  if (/swim|nata/.test(t)) return { sport: 'swimming', subSport: null }
  if (/strength|weight|gym|pesas|fuerza/.test(t)) return { sport: 'strength', subSport: null }
  return { sport: 'other', subSport: null }
}
