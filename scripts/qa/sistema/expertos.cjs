// =============================================================================
// Revisores expertos. Leen el plan que cada agente usuario generó EN la app
// (estado local + textos de sesiones y rutinas que vio) y lo evalúan con
// criterios profesionales propios, independientes de las reglas de la app.
// El experto en UX revisa en vivo durante la navegación (ver lib.cjs).
// =============================================================================
const { report } = require('./lib.cjs')

const DAY = 86_400_000
const QUALITY = ['tempo', 'threshold', 'vo2', 'climb']
const ENDURANCE = ['cycling', 'running', 'swimming', 'other']
const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10)
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY)
const ageOn = (birth, day) => Math.floor(diff(birth, day) / 365.25)

/** Contraindicaciones por molestia (criterio del fisiatra, por nombre del ejercicio) */
const CONTRA = {
  knee: /zancada|búlgara|salto|pogo|prensa|extensión de cuádriceps|sentadilla isométrica|multipower/i,
  low_back: /peso muerto|swing|superman|hiperextensi|multipower|sentadilla goblet/i,
  shoulder: /flexiones|press de hombro|dominadas|jalón|remo invertido|plancha lateral/i,
}
const DISCOMFORT_LABEL = { knee: 'rodilla', low_back: 'espalda baja', shoulder: 'hombro' }

/** Prepara una vista del plan vigente a partir del estado local. */
function vista(caso) {
  const s = caso.estado || {}
  const today = new Date().toISOString().slice(0, 10)
  const plan = [...(s.plans || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
  const sessions = (s.sessions || []).filter((x) => !plan || x.planId === plan.id).filter((x) => x.date >= today && x.kind !== 'rest')
  const weeks = (s.weeks || []).filter((x) => !plan || x.planId === plan.id).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const byWeek = weeks.map((w) => {
    const ss = sessions.filter((x) => x.date >= w.weekStart && x.date <= add(w.weekStart, 6))
    const train = ss.filter((x) => x.kind !== 'event')
    return {
      ...w,
      ss,
      minutes: train.filter((x) => ENDURANCE.includes(x.sport)).reduce((t, x) => t + x.durationMin, 0),
      days: new Set(ss.map((x) => x.date)).size,
      quality: train.filter((x) => QUALITY.includes(x.kind)).length,
      endurance: train.filter((x) => ENDURANCE.includes(x.sport)).length,
      // La sesión de resistencia más larga de la semana (larga o suave larga)
      long: Math.max(0, ...train.filter((x) => ENDURANCE.includes(x.sport)).map((x) => x.durationMin)),
      full: w.weekStart >= today,
      // Semana con viaje, vacaciones, enfermedad o lesión (el plan se adapta a la pausa)
      pausa: (s.pauses || []).some((p) => p.startsOn <= add(w.weekStart, 6) && (p.endsOn || p.startsOn) >= w.weekStart),
    }
  })
  const goals = (s.goals || []).filter((g) => g.status === 'active')
  const pauses = s.pauses || []
  const age = s.profile?.birthDate ? ageOn(s.profile.birthDate, today) : null
  const hrMed = (s.health || []).some((h) => h.category === 'medication' && h.data?.affectsHeartRate)
  const recentActs = (s.activities || []).filter((a) => Date.parse(a.startTime) > Date.now() - 42 * DAY).length
  return { today, plan, sessions, weeks: byWeek, goals, pauses, age, hrMed, recentActs, strength: s.strength, availability: s.availability }
}

function make(agente, caso) {
  return (f) =>
    report({
      agente,
      tipoAgente: 'experto',
      persona: caso.persona.nombre,
      pasos: [
        `Agente ${caso.persona.nombre}: registro, metas y plan en la app`,
        'Revisión del plan vigente (estado local de la app y sesiones abiertas)',
        ...(f.pasos || []),
      ],
      ...f,
    })
}

// ------------------------------------------------------------ Médico deportólogo
function deportologo(caso) {
  const v = vista(caso)
  const r = make('Médico deportólogo', caso)
  const ses = caso.evidencia.sesiones
  if (v.hrMed) {
    const conPulso = ses.filter((x) => /\d+\s*[–-]\s*\d+\s*ppm/.test(x.texto))
    if (conPulso.length)
      r({
        categoria: 'contenido',
        severidad: 'crítica',
        riesgoSalud: 3,
        clave: 'cont:pulso-con-medicamento',
        titulo: 'Zonas por pulso con un medicamento que altera el pulso',
        esperado: 'Solo esfuerzo percibido',
        obtenido: `${conPulso.length} sesiones muestran pulsaciones (p. ej. «${conPulso[0].titulo}»)`,
        evidencia: { datos: conPulso[0].href },
      })
    const sinAviso = ses.filter((x) => !/altera el pulso/.test(x.texto))
    if (ses.length && sinAviso.length === ses.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:aviso-medicamento',
        titulo: 'Sin aviso de que el plan no es exacto con medicamentos',
        esperado: 'Aviso fijo: ajustar con el médico',
        obtenido: 'Ninguna sesión lo muestra',
      })
  }
  for (const p of v.pauses.filter((p) => p.kind === 'illness' || p.kind === 'injury')) {
    const dentro = v.sessions.filter((x) => x.kind !== 'event' && x.date >= p.startsOn && x.date <= (p.endsOn || p.startsOn))
    if (dentro.length)
      r({
        categoria: 'contenido',
        severidad: 'crítica',
        riesgoSalud: 3,
        clave: 'cont:entreno-en-pausa',
        titulo: 'Entrenamiento programado durante una enfermedad o lesión',
        esperado: 'Sin sesiones',
        obtenido: `${dentro.length} sesiones (${dentro[0].date} ${dentro[0].kind})`,
      })
  }
  for (let i = 1; i < v.weeks.length; i++) {
    const a = v.weeks[i - 1]
    const b = v.weeks[i]
    if (a.full && ['base', 'build'].includes(a.phase) && ['base', 'build'].includes(b.phase) && a.minutes > 60 && b.minutes > a.minutes * 1.2)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:subida-volumen',
        titulo: 'Subida de volumen semanal mayor al 20 %',
        esperado: 'Subidas graduales (≈10 %)',
        obtenido: `${a.weekStart}: ${a.minutes} min → ${b.weekStart}: ${b.minutes} min`,
      })
  }
  if (v.age !== null && v.age >= 65) {
    const fuertes = v.sessions.filter((x) => ['threshold', 'vo2'].includes(x.kind))
    if (fuertes.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:intensidad-mayor',
        titulo: `Sesiones de alta intensidad a los ${v.age} años sin valoración previa`,
        esperado: 'Intensidad alta solo tras valoración médica',
        obtenido: `${fuertes.length} sesiones de umbral o VO2`,
      })
    const muchos = v.weeks.filter((w) => w.days > 5)
    if (muchos.length)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:dias-mayor',
        titulo: `Más de 5 días de entreno por semana a los ${v.age} años`,
        esperado: '2 días suaves o libres',
        obtenido: `${muchos.length} semanas con ${muchos[0].days} días`,
      })
  }
  if (v.recentActs < 4) {
    const early = v.sessions.filter((x) => QUALITY.includes(x.kind) && diff(v.today, x.date) < 21)
    if (early.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:calidad-principiante',
        titulo: 'Intensidad en las primeras 3 semanas de alguien sin historial',
        esperado: 'Solo suave las primeras semanas',
        obtenido: `${early.length} sesiones (${early[0].date} ${early[0].kind})`,
      })
  }
  const sinDescanso = v.weeks.filter((w) => w.full && w.days >= 7 && w.phase !== 'event')
  if (sinDescanso.length)
    r({
      categoria: 'contenido',
      severidad: 'alta',
      riesgoSalud: 2,
      clave: 'cont:sin-descanso',
      titulo: 'Semanas sin un día de descanso',
      esperado: 'Al menos 1 día libre',
      obtenido: sinDescanso
        .map((w) => w.weekStart)
        .slice(0, 3)
        .join(', '),
    })
  const LIM = { running: 180, cycling: 360, swimming: 150 }
  const largas = v.sessions.filter((x) => x.kind !== 'event' && x.durationMin > (LIM[x.sport] ?? 999))
  if (largas.length)
    r({
      categoria: 'contenido',
      severidad: 'alta',
      riesgoSalud: 2,
      clave: 'cont:larga-excesiva',
      titulo: 'Sesión de entrenamiento más larga de lo prudente',
      esperado: 'Running ≤ 3 h, ciclismo ≤ 6 h, natación ≤ 2,5 h',
      obtenido: `${largas[0].date}: ${largas[0].sport} ${Math.round(largas[0].durationMin)} min`,
    })
  for (let i = 1; i < v.weeks.length; i++) {
    const a = v.weeks[i - 1]
    const b = v.weeks[i]
    if (b.phase === 'event' && a.phase === 'taper' && b.minutes > a.minutes * 1.1)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:semana-carrera',
        titulo: 'La semana de carrera tiene más volumen que la disminución previa',
        esperado: 'Semana de carrera más liviana',
        obtenido: `${a.minutes} → ${b.minutes} min`,
      })
  }
}

// ------------------------------------------------------------ Entrenador
function entrenador(caso) {
  const v = vista(caso)
  const r = make('Entrenador', caso)
  for (const g of v.goals) {
    const ok = v.sessions.some((x) => x.kind === 'event' && x.goalId === g.id && x.date === g.eventDate)
    if (!ok && g.eventDate >= v.today)
      r({
        categoria: 'técnico',
        severidad: 'alta',
        impactoUX: 2,
        clave: 'tec:evento-calendario',
        titulo: `La meta «${g.name}» no tiene su evento en el plan`,
        esperado: `Evento el ${g.eventDate}`,
        obtenido: 'Sin sesión de evento',
      })
  }
  let streak = 0
  for (const w of v.weeks) {
    if (['base', 'build'].includes(w.phase)) streak++
    else streak = 0
    if (streak === 6)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:sin-descarga',
        titulo: 'Más de 5 semanas de carga sin descarga',
        esperado: 'Descarga cada 3–4 semanas',
        obtenido: `hasta ${w.weekStart}`,
      })
  }
  // La larga se compara con la mayor de las 3 semanas anteriores (una semana de viaje o de descarga no cuenta como base)
  for (let i = 1; i < v.weeks.length; i++) {
    const a = v.weeks[i - 1]
    const b = v.weeks[i]
    const ref = Math.max(...v.weeks.slice(Math.max(0, i - 3), i).map((w) => w.long))
    if (a.full && !b.pausa && ref > 0 && b.long > ref * 1.15 + 5 && ['base', 'build'].includes(a.phase))
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:larga-salto',
        titulo: 'La sesión larga crece más de un 15 % en una semana',
        esperado: 'Crecimiento gradual',
        obtenido: `${ref} → ${b.long} min (${b.weekStart})`,
      })
  }
  for (const w of v.weeks.filter((w) => w.full && w.days <= 4 && w.endurance >= 2))
    if (w.quality / w.endurance > 0.4) {
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:mucha-intensidad',
        titulo: 'Demasiadas sesiones fuertes para pocos días de entreno',
        esperado: 'Mayoría suave (≈80/20)',
        obtenido: `semana ${w.weekStart}: ${w.quality} de ${w.endurance}`,
      })
      break
    }
  const builds = v.weeks.filter((w) => w.phase === 'build')
  for (let i = 3; i < builds.length; i++)
    if ([0, 1, 2].every((k) => builds[i - k].minutes === builds[i - 3].minutes) && builds[i].minutes > 0) {
      r({
        categoria: 'contenido',
        severidad: 'baja',
        clave: 'cont:monotonia',
        titulo: 'Semanas de desarrollo idénticas (sin progresión ni variedad)',
        esperado: 'Progresión de la sesión clave',
        obtenido: `${builds[i - 3].weekStart} a ${builds[i].weekStart}: ${builds[i].minutes} min`,
      })
      break
    }
  const primary = v.goals.find((g) => g.priority === 'primary')
  if (primary) {
    const wk = v.weeks.find((w) => w.weekStart <= primary.eventDate && add(w.weekStart, 6) >= primary.eventDate)
    const prev = wk && v.weeks[v.weeks.indexOf(wk) - 1]
    if (prev && !['taper', 'event', 'recovery'].includes(prev.phase))
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:sin-disminucion',
        titulo: `Sin disminución previa antes de «${primary.name}»`,
        esperado: 'Semana de disminución previa',
        obtenido: `semana anterior en fase ${prev.phase}`,
      })
  }
  if (v.goals.some((g) => g.sport === 'triathlon')) {
    const falta = v.weeks.filter((w) => w.full && !w.pausa && w.phase === 'build' && !['swimming', 'cycling', 'running'].every((sp) => w.ss.some((x) => x.sport === sp)))
    if (falta.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        clave: 'cont:tri-disciplina',
        titulo: 'Semanas de triatlón sin las tres disciplinas',
        esperado: 'Natación, bici y running cada semana',
        obtenido: falta
          .map((w) => w.weekStart)
          .slice(0, 3)
          .join(', '),
      })
  }
  const pool = new Set(v.availability?.poolDays || [])
  if (pool.size) {
    const wd = (d) => ((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
    const fuera = v.sessions.filter((x) => x.sport === 'swimming' && x.kind !== 'event' && !pool.has(wd(x.date)))
    if (fuera.length)
      r({
        categoria: 'contenido',
        severidad: 'media',
        clave: 'cont:natacion-sin-piscina',
        titulo: 'Natación en días sin piscina',
        esperado: 'Solo días con piscina',
        obtenido: `${fuera.length} sesiones (${fuera[0].date})`,
      })
  }
}

// ------------------------------------------------------------ Fisiatra
function fisiatra(caso) {
  const v = vista(caso)
  const r = make('Fisiatra', caso)
  const molestias = v.strength?.discomfort || []
  for (const m of molestias) {
    const malas = caso.evidencia.rutinas.flatMap((x) => x.ejercicios.filter((e) => CONTRA[m]?.test(e)).map((e) => `${e} (${x.titulo})`))
    if (malas.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: `cont:ejercicio-contra-${m}`,
        titulo: `Ejercicios que cargan la ${DISCOMFORT_LABEL[m]} pese a la molestia`,
        esperado: `Sin ejercicios que carguen la ${DISCOMFORT_LABEL[m]}`,
        obtenido: [...new Set(malas)].slice(0, 4).join(' · '),
      })
  }
  if (molestias.length) {
    const sinAviso = caso.evidencia.rutinas.filter((x) => !/no es una rutina de rehabilitación/.test(x.texto))
    if (sinAviso.length)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:aviso-molestia',
        titulo: 'Rutina con molestias sin aviso de que no es rehabilitación',
        esperado: 'Aviso: ajustar con el fisioterapeuta',
        obtenido: `${sinAviso.length} rutinas sin aviso`,
      })
  }
  if (v.age !== null && v.age >= 65) {
    const saltos = caso.evidencia.rutinas.flatMap((x) => x.ejercicios.filter((e) => /salto|pogo/i.test(e)))
    if (saltos.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:saltos-mayor',
        titulo: `Saltos a los ${v.age} años sin valoración`,
        esperado: 'Sin pliometría sin valoración',
        obtenido: [...new Set(saltos)].join(', '),
      })
  }
  for (const p of v.pauses.filter((p) => p.kind === 'injury')) {
    const fin = p.endsOn || p.startsOn
    const primera = v.sessions.filter((x) => x.date > fin && x.date <= add(fin, 7) && ENDURANCE.includes(x.sport))
    if (primera.length > 4)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:regreso-lesion',
        titulo: 'Regreso tras lesión con demasiadas sesiones la primera semana',
        esperado: 'Días alternos (≤ 3–4 sesiones)',
        obtenido: `${primera.length} sesiones entre ${add(fin, 1)} y ${add(fin, 7)}`,
      })
    const calidad = v.sessions.filter((x) => x.date > fin && x.date <= add(fin, 14) && QUALITY.includes(x.kind))
    if (calidad.length)
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:calidad-tras-lesion',
        titulo: 'Intensidad en las 2 semanas siguientes a una lesión',
        esperado: 'Solo suave hasta estar sin síntomas',
        obtenido: `${calidad[0].date} ${calidad[0].kind}`,
      })
    const regreso = caso.evidencia.sesiones.filter((x) => /Regreso gradual/.test(x.texto))
    if (regreso.length && regreso.some((x) => !/no es un plan de recuperación/.test(x.texto)))
      r({
        categoria: 'contenido',
        severidad: 'alta',
        riesgoSalud: 2,
        clave: 'cont:aviso-lesion',
        titulo: 'Sesiones de regreso sin aviso de lesión',
        esperado: 'Aviso: ajustar con el fisioterapeuta o médico',
        obtenido: 'Falta el aviso en alguna sesión de regreso',
      })
  }
  for (const g of v.goals) {
    const end = add(g.eventDate, Math.max(0, ...(g.stages || []).map((s) => s.dayOffset || 0)))
    const tras = v.sessions.filter((x) => x.date === add(end, 1) && x.kind !== 'event')
    if (tras.length)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:dia-despues-evento',
        titulo: `Entrenamiento el día después de «${g.name}»`,
        esperado: 'Descanso',
        obtenido: `${tras[0].date} ${tras[0].kind}`,
      })
    // Recuperación sin fuerza: 7 días tras eventos largos (≥ 3 h estimadas), 3 días tras los cortos
    const largo =
      (g.sport === 'running' && g.distanceM > 25000) || (g.sport === 'cycling' && g.distanceM > 90000) || g.sport === 'triathlon' || (g.stages || []).length > 1
    const dias = largo ? 7 : 3
    const fuerza = v.sessions.filter((x) => x.sport === 'strength' && x.date > end && diff(end, x.date) <= dias)
    if (fuerza.length)
      r({
        categoria: 'contenido',
        severidad: 'media',
        riesgoSalud: 1,
        clave: 'cont:fuerza-tras-evento',
        titulo: `Fuerza en la semana siguiente a «${g.name}»`,
        esperado: `Sin fuerza ${dias} días después`,
        obtenido: `${fuerza[0].date} (${fuerza[0].note === 'core' ? 'core' : 'fuerza'}, ${diff(end, fuerza[0].date)} días después)`,
      })
  }
  const todos = caso.evidencia.rutinas.flatMap((x) => x.ejercicios)
  if (todos.length && !todos.some((e) => /movilidad|estiramiento|flexibilidad/i.test(e)))
    r({
      categoria: 'contenido',
      severidad: 'baja',
      clave: 'cont:sin-movilidad',
      titulo: 'Las rutinas no incluyen movilidad ni estiramientos',
      esperado: 'Algo de movilidad en la semana',
      obtenido: 'Solo fuerza y core',
      tipoMejora: true,
    })
}

function revisar(casos) {
  for (const caso of casos) {
    if (!caso.estado) continue
    deportologo(caso)
    entrenador(caso)
    fisiatra(caso)
  }
}

module.exports = { revisar, vista }
