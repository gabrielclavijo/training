// =============================================================================
// Agentes de prueba simulados (QA) para Entreno.
//
// Entorno: build local de la app (vite preview) en «modo local». Los datos viven
// solo en el navegador de cada agente (contexto de Playwright independiente):
// no hay Supabase, ni cuentas reales, ni producción. Toda petición fuera de
// localhost se BLOQUEA y se reporta (así ningún agente puede tocar servicios
// externos: Supabase, IA, Strava).
//
// Uso:  APP_URL=http://localhost:4173/ node scripts/qa/agentes.cjs
// Salida: qa-out/hallazgos.json + capturas en qa-out/
// =============================================================================
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.APP_URL || 'http://localhost:4173/'
const OUT = process.env.QA_OUT || path.join(process.cwd(), 'qa-out')
fs.mkdirSync(OUT, { recursive: true })
const isLocal = (u) => /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/.test(u)

const findings = []
const log = []
const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const plusDays = (n) => iso(new Date(Date.now() + n * 86_400_000))

function makeAgent(perfil, page) {
  const steps = []
  const A = {
    perfil,
    page,
    step(s) {
      steps.push(s)
      log.push(`[${perfil}] ${s}`)
    },
    async bug(gravedad, titulo, esperado, obtenido, extra = {}) {
      const shot = `${perfil.replace(/\W+/g, '_')}_${findings.length + 1}.png`
      try {
        await page.screenshot({ path: path.join(OUT, shot), fullPage: true })
      } catch {}
      findings.push({ perfil, gravedad, titulo, pasos: steps.slice(-8), esperado, obtenido, url: page.url(), captura: shot, ...extra })
      log.push(`  !! [${gravedad}] ${titulo}: ${obtenido}`)
    },
    async check(cond, gravedad, titulo, esperado, obtenido) {
      if (!cond) await A.bug(gravedad, titulo, esperado, obtenido)
      return cond
    },
    async go(route) {
      A.step(`Abrir ${route}`)
      if (page.url().endsWith('#' + route)) await page.goto(BASE + '#/')
      await page.goto(BASE + '#' + route)
      await page.waitForTimeout(900)
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      if (sw > 0) await A.bug('Baja', `La pantalla ${route} se sale del ancho`, 'Sin desplazamiento horizontal', `${sw}px de más`)
    },
    /** Ejecuta un paso; si falla, lo reporta y sigue */
    async tryStep(desc, gravedad, fn) {
      A.step(desc)
      try {
        return await fn()
      } catch (e) {
        await A.bug(
          gravedad,
          `No se pudo: ${desc}`,
          'El paso se completa',
          String(e.message || e)
            .split('\n')[0]
            .slice(0, 300),
        )
        return undefined
      }
    },
  }
  return A
}

async function withAgent(browser, perfil, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota' })
  const page = await ctx.newPage()
  const A = makeAgent(perfil, page)
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (isLocal(u)) return route.continue()
    findings.push({
      perfil,
      gravedad: 'Alta',
      titulo: 'Petición a un servicio externo en modo local',
      pasos: [],
      esperado: 'Sin conexiones externas en modo local',
      obtenido: u.slice(0, 120),
      url: page.url(),
    })
    return route.abort()
  })
  page.on('pageerror', (e) => void A.bug('Alta', 'Error de JavaScript en la página', 'Sin errores', String(e.message).slice(0, 300)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text()))
      void A.bug('Media', 'Error en la consola', 'Sin errores', m.text().slice(0, 300))
  })
  page.on('dialog', (d) => void d.accept())
  const t0 = Date.now()
  try {
    await fn(A)
  } catch (e) {
    await A.bug(
      'Crítica',
      'El agente no pudo continuar su recorrido',
      'Recorrido completo',
      String(e.message || e)
        .split('\n')[0]
        .slice(0, 300),
    )
  }
  log.push(`[${perfil}] terminó en ${Math.round((Date.now() - t0) / 1000)} s`)
  await ctx.close()
}

// ---------------------------------------------------------------- utilidades
async function onboarding(A, { name, birth, sex, height, weight, demo }) {
  const p = A.page
  A.step('Entrar en modo local')
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Probar en modo local' }).click()
  await p.getByLabel(/Leí el aviso/).check()
  await p.getByRole('button', { name: 'Acepto y continúo' }).click()
  await p.waitForURL(/bienvenida/)
  A.step(`Paso 1: datos básicos (${name})`)
  await p.getByLabel('Nombre').fill(name)
  if (birth) await p.getByLabel(/Fecha de nacimiento/).fill(birth)
  if (sex) await p.getByLabel(sex, { exact: true }).check()
  if (height !== undefined) await p.getByLabel(/Estatura/).fill(String(height))
  if (weight !== undefined) await p.getByLabel(/Peso/).first().fill(String(weight))
  await p.getByLabel('Confirmo que soy mayor de 18 años').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  A.step('Paso 2: datos fisiológicos → saltar')
  await p.getByRole('button', { name: 'Saltar por ahora' }).click()
  if (demo) {
    A.step('Paso 3: cargar datos de prueba')
    await p.getByRole('button', { name: 'Cargar datos de prueba' }).click()
    await p.getByText('Listo: datos de prueba cargados.').waitFor({ timeout: 60000 })
    await p.getByRole('button', { name: 'Continuar' }).click()
  } else {
    A.step('Paso 3: sin actividades → saltar')
    await p
      .getByRole('button', { name: /Saltar|Continuar/ })
      .last()
      .click()
  }
  A.step('Paso 4: hacerlo después')
  await p.getByRole('button', { name: 'Hacerlo después' }).click()
  await p.waitForTimeout(800)
}

/** Crea una meta con el asistente y devuelve su id (o null si no se guardó). */
async function createGoal(A, g) {
  const p = A.page
  await A.go('/metas/nueva')
  A.step(`Meta «${g.name}»: tipo ${g.type}`)
  await p.getByLabel(g.type === 'tri' ? 'Triatlón' : g.type === 'stage' ? 'Por etapas' : 'Salida única').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.waitForTimeout(300)
  A.step(`Datos: ${JSON.stringify({ sport: g.sport, date: g.date, km: g.km, stages: g.stages?.length, preset: g.preset })}`)
  await p.getByLabel('Nombre de la meta').fill(g.name)
  if (g.type !== 'tri' && g.sport) await p.getByLabel('Deporte').selectOption({ label: g.sport })
  await p.locator('#g-date').fill(g.date)
  if (g.priority) await p.getByLabel(g.priority === 'primary' ? 'Principal' : 'Secundaria', { exact: true }).check()
  if (g.type === 'single') {
    await p.getByLabel('Distancia (km)').fill(String(g.km))
    if (g.elev !== undefined) await p.getByLabel('Desnivel positivo (m)').fill(String(g.elev))
  } else if (g.type === 'stage') {
    for (let i = 0; i < g.stages.length; i++) {
      if (i >= 1) await p.getByRole('button', { name: 'Agregar etapa' }).click()
      await p.getByLabel('Distancia (km)').nth(i).fill(String(g.stages[i].km))
      await p.getByLabel('Desnivel positivo (m)').nth(i).fill(String(g.stages[i].elev))
    }
  } else if (g.type === 'tri') {
    await p.locator('.tri-preset', { hasText: g.preset }).first().click()
  }
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.waitForTimeout(300)
  // ¿Se quedó en el mismo paso por un error?
  const errs = await p.locator('.error, [role=alert]').allInnerTexts()
  if (
    await p
      .getByLabel('Nombre de la meta')
      .isVisible()
      .catch(() => false)
  )
    return { id: null, errors: errs }
  A.step(`Objetivo: ${g.objective === 'time' ? 'tiempo ' + g.target : 'terminar'}`)
  if (g.objective === 'time') {
    await p.getByLabel('Hacer un tiempo').check()
    await p.getByLabel(/Tiempo objetivo total/).fill(g.target)
  } else if (g.type !== 'tri') await p.getByLabel('Participar y terminar').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.waitForTimeout(300)
  if (
    await p
      .getByLabel(/Tiempo objetivo total/)
      .isVisible()
      .catch(() => false)
  ) {
    return { id: null, errors: await p.locator('.error, [role=alert]').allInnerTexts() }
  }
  A.step('Guardar meta')
  const t0 = Date.now()
  await p.getByRole('button', { name: 'Guardar meta' }).click()
  try {
    await p.waitForURL(/#\/metas\/[0-9a-f-]{8,}/, { timeout: 20000 })
  } catch {
    await A.bug(
      'Crítica',
      `Guardar la meta «${g.name}» se queda en «Guardando…»`,
      'La meta se guarda y abre su detalle',
      `Sin respuesta tras ${Math.round((Date.now() - t0) / 1000)} s`,
    )
    return { id: null, errors: ['(se quedó guardando)'], stuck: true }
  }
  // Como una persona: esperar a que se vea la meta guardada
  await p
    .getByRole('heading', { name: g.name })
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  const secs = (Date.now() - t0) / 1000
  if (secs > 5) await A.bug('Media', `Guardar la meta «${g.name}» tarda ${secs.toFixed(1)} s`, 'Menos de 5 s', `${secs.toFixed(1)} s`)
  const id = p.url().split('/metas/')[1]
  return { id, errors: [] }
}

/** ¿El calendario del plan muestra el evento de la meta en su fecha? */
async function eventInPlan(A, name, date) {
  const p = A.page
  await A.go('/plan')
  await p.getByRole('button', { name: 'Mes', exact: true }).click()
  const target = date.slice(0, 7)
  for (let k = 0; k < 18; k++) {
    const btn = p.locator('.cal-day').filter({ has: p.locator('.cal-num') })
    const labels = await btn.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || ''))
    const title = (await p.locator('.cal-title').innerText()).toLowerCase()
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const m = months.findIndex((x) => title.includes(x)) + 1
    const y = (title.match(/\d{4}/) || [])[0]
    if (`${y}-${String(m).padStart(2, '0')}` === target) {
      const day = Number(date.slice(8, 10))
      const lab = labels.find((l) => new RegExp(`\\b${day} de`).test(l)) || ''
      return { found: lab.includes(name), label: lab }
    }
    const next = p.getByRole('button', { name: 'Mes siguiente' })
    if (await next.isDisabled()) return { found: false, label: `el calendario no llega a ${target} (último mes: ${title})` }
    await next.click()
    await p.waitForTimeout(150)
  }
  return { found: false, label: 'no se encontró el mes' }
}

async function checkGoal(A, g, id) {
  const p = A.page
  await A.go(`/metas/${id}`)
  await A.check(
    await p
      .getByRole('heading', { name: g.name })
      .first()
      .isVisible()
      .catch(() => false),
    'Alta',
    `La meta «${g.name}» no se ve en su detalle`,
    'Nombre visible',
    'No aparece',
  )
  const hasPlan = await p
    .getByRole('heading', { name: 'Tu plan de entreno' })
    .isVisible()
    .catch(() => false)
  await A.check(hasPlan, 'Media', `La meta «${g.name}» no muestra su plan de entreno`, 'Sección «Tu plan de entreno»', 'No aparece')
  const diag = await p
    .getByRole('heading', { name: 'Diagnóstico' })
    .isVisible()
    .catch(() => false)
  await A.check(diag, 'Media', `La meta «${g.name}» no muestra el diagnóstico`, 'Sección «Diagnóstico»', 'No aparece')
  const text = await p.locator('main').innerText()
  if (/NaN|undefined|Infinity/.test(text))
    await A.bug('Alta', `Valores inválidos en la meta «${g.name}»`, 'Números válidos', (text.match(/.{0,40}(NaN|undefined|Infinity).{0,40}/) || [''])[0])
  const ev = await eventInPlan(A, g.name, g.date)
  await A.check(ev.found, 'Alta', `El evento «${g.name}» (${g.date}) no está en el calendario del plan`, `Día ${g.date} con la meta`, ev.label || 'vacío')
}

async function planSanity(A) {
  const p = A.page
  await A.go('/plan')
  const text = await p.locator('main').innerText()
  if (/NaN|undefined|Infinity/.test(text))
    await A.bug('Alta', 'Valores inválidos en el plan', 'Números válidos', (text.match(/.{0,40}(NaN|undefined|Infinity).{0,40}/) || [''])[0])
  // Abrir algunas sesiones
  const links = await p.locator('a[href*="plan/sesion/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  for (const h of links.slice(0, 4)) {
    await A.tryStep(`Abrir sesión ${h}`, 'Media', async () => {
      await p.goto(BASE + h)
      await p.waitForTimeout(700)
      const t = await p.locator('main').innerText()
      if (/NaN|undefined/.test(t))
        await A.bug('Alta', 'Valores inválidos en una sesión', 'Números válidos', (t.match(/.{0,40}(NaN|undefined).{0,40}/) || [''])[0])
      if (/No encontramos/.test(t)) await A.bug('Alta', 'Una sesión del plan no se encuentra', 'Detalle de la sesión', 'No encontramos')
    })
  }
}

async function setAvailability(A, mins, poolDays = []) {
  const p = A.page
  await A.go('/plan/disponibilidad')
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  for (let i = 0; i < 7; i++) await p.getByLabel(new RegExp(`^${days[i]} \\(minutos\\)`)).fill(String(mins[i]))
  for (const d of poolDays) await p.locator('.pool-days .tag-opt', { hasText: d }).click()
  await p.getByRole('button', { name: 'Guardar disponibilidad' }).click()
  await p.waitForTimeout(800)
}

// ---------------------------------------------------------------- agentes
async function elite(A) {
  const p = A.page
  await onboarding(A, { name: 'QA-Élite', birth: '1994-05-10', sex: 'Masculino', height: 181, weight: 68, demo: true })
  await A.tryStep('Datos fisiológicos de élite (FTP 390 W, umbral 176)', 'Media', async () => {
    await A.go('/perfil')
    await p.getByLabel(/Pulso en reposo/).fill('38')
    await p.getByLabel(/Pulso máximo/).fill('196')
    await p.getByLabel(/Umbral de pulso/).fill('176')
    await p.getByLabel(/FTP/).fill('390')
    await p.getByLabel(/Ritmo umbral de running/).fill('3:20')
    await p.getByLabel(/Ritmo umbral de natación/).fill('1:12')
    await p.getByRole('button', { name: 'Guardar datos fisiológicos' }).click()
    await p.waitForTimeout(800)
    const err = await p.locator('.error').allInnerTexts()
    if (err.length) await A.bug('Media', 'Datos fisiológicos de élite rechazados', 'Se guardan valores válidos de élite', err.join(' | '))
  })
  await A.tryStep('Disponibilidad alta con piscina L/X/V', 'Media', () =>
    setAvailability(A, [120, 150, 120, 150, 90, 360, 240], ['Lunes', 'Miércoles', 'Viernes']),
  )
  const y = today.getFullYear() + 1
  const goals = [
    {
      type: 'single',
      name: 'QA-Élite Maratón sub 2:40',
      sport: 'Running',
      date: `${y}-03-14`,
      priority: 'secondary',
      km: 42.195,
      elev: 150,
      objective: 'time',
      target: '2:39',
    },
    {
      type: 'stage',
      name: 'QA-Élite Vuelta 4 etapas',
      sport: 'Ciclismo',
      date: `${y}-05-20`,
      priority: 'primary',
      stages: [
        { km: 160, elev: 3200 },
        { km: 175, elev: 2800 },
        { km: 140, elev: 3600 },
        { km: 120, elev: 1500 },
      ],
      objective: 'time',
      target: '22:00',
    },
    { type: 'single', name: 'QA-Élite Travesía 10 km', sport: 'Natación', date: `${y}-07-18`, priority: 'secondary', km: 10, objective: 'finish' },
    { type: 'tri', name: 'QA-Élite IRONMAN', preset: 'IRONMAN', date: `${y}-09-12`, priority: 'secondary', objective: 'time', target: '9:30' },
    { type: 'single', name: 'QA-Élite Clásica', sport: 'Ciclismo', date: `${y}-09-14`, priority: 'secondary', km: 200, elev: 4000, objective: 'finish' },
  ]
  const ids = []
  for (const g of goals) {
    const r = await A.tryStep(`Crear meta ${g.name}`, 'Alta', () => createGoal(A, g))
    if (r && !r.id && !r.stuck)
      await A.bug('Alta', `No se pudo guardar la meta «${g.name}»`, 'La meta se guarda', `Errores: ${r.errors.join(' | ') || 'sin mensaje'}`)
    if (r?.id) ids.push([g, r.id])
  }
  for (const [g, id] of ids) await A.tryStep(`Verificar meta ${g.name}`, 'Alta', () => checkGoal(A, g, id))
  await A.tryStep('Revisar el plan y sus sesiones', 'Alta', () => planSanity(A))
  // Valores extremos
  const extreme = await A.tryStep('Meta extrema: 2.000 km en un día', 'Media', () =>
    createGoal(A, { type: 'single', name: 'QA-Élite Extremo', sport: 'Ciclismo', date: `${y}-10-10`, km: 2000, elev: 40000, objective: 'finish' }),
  )
  if (extreme?.id) {
    await A.go(`/metas/${extreme.id}`)
    const t = await p.locator('main').innerText()
    if (/NaN|Infinity/.test(t)) await A.bug('Media', 'Meta extrema muestra valores inválidos', 'Números válidos o aviso', 'NaN/Infinity')
    await A.bug('Baja', 'Se acepta una meta de 2.000 km y 40.000 m en un solo día sin aviso', 'Aviso de valor poco realista', 'Se guarda sin advertencia')
  }
  await A.tryStep('Tiempo objetivo irreal (maratón en 0:30)', 'Baja', async () => {
    const r = await createGoal(A, {
      type: 'single',
      name: 'QA-Élite Irreal',
      sport: 'Running',
      date: `${y}-11-01`,
      km: 42.195,
      objective: 'time',
      target: '0:30',
    })
    if (r?.id) await A.bug('Baja', 'Se acepta un maratón con objetivo de 30 minutos sin aviso', 'Aviso de objetivo imposible', 'Se guarda sin advertencia')
  })
  // Editar fecha y comprobar que el plan se mueve
  if (ids.length) {
    const [g, id] = ids[0]
    await A.tryStep(`Editar la fecha de ${g.name}`, 'Alta', async () => {
      await A.go(`/metas/${id}/editar`)
      await p.getByRole('button', { name: 'Continuar' }).click()
      const nd = `${y}-03-28`
      await p.locator('#g-date').fill(nd)
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByRole('button', { name: 'Guardar meta' }).click()
      await p.waitForTimeout(1500)
      const ev = await eventInPlan(A, g.name, nd)
      await A.check(ev.found, 'Alta', 'Tras cambiar la fecha, el evento no se movió en el plan', `Evento el ${nd}`, ev.label)
    })
  }
  // Continuidad entre sesiones
  await A.tryStep('Recargar y verificar que todo sigue', 'Crítica', async () => {
    await p.reload()
    await p.waitForTimeout(1500)
    await A.go('/metas')
    const t = await p.locator('main').innerText()
    for (const [g] of ids) await A.check(t.includes(g.name), 'Crítica', `La meta «${g.name}» desapareció al recargar`, 'Sigue guardada', 'No aparece')
  })
}

async function normal(A) {
  const p = A.page
  await onboarding(A, { name: 'QA-Normal', birth: '1985-02-20', sex: 'Femenino', height: 165, weight: 63, demo: false })
  // Actividades a mano en las últimas semanas
  for (const [d, sport, min] of [
    [-20, 'Running', 45],
    [-17, 'Ciclismo', 90],
    [-13, 'Running', 50],
    [-10, 'Natación', 40],
    [-6, 'Ciclismo', 120],
    [-3, 'Running', 40],
  ]) {
    await A.tryStep(`Registrar a mano ${sport} ${min} min (${plusDays(d)})`, 'Alta', async () => {
      await A.go('/actividades/nueva')
      await p.getByLabel('Deporte').selectOption({ label: sport })
      await p.getByLabel('Fecha').fill(plusDays(d))
      await p.getByLabel(/Duración/).fill(String(min))
      await p.getByRole('button', { name: 'Guardar actividad' }).click()
      await p.waitForTimeout(800)
      const err = await p.locator('.error').allInnerTexts()
      if (err.length) await A.bug('Alta', 'No se pudo registrar una actividad a mano válida', 'Se guarda', err.join(' | '))
    })
  }
  await A.tryStep('Ver actividades: deben ser 6', 'Media', async () => {
    await A.go('/actividades')
    const t = await p.locator('main').innerText()
    await A.check(/6 actividades/.test(t), 'Media', 'El conteo de actividades no coincide', '6 actividades', (t.match(/\d+ actividades?/) || ['sin conteo'])[0])
  })
  await A.tryStep('Disponibilidad típica', 'Media', () => setAvailability(A, [0, 60, 45, 60, 0, 180, 120], ['Miércoles']))
  await A.tryStep('Tu fuerza: casa con mancuernas 8 kg y bandas, molestia de rodilla', 'Media', async () => {
    await A.go('/plan/disponibilidad')
    await p.locator('.tag-opt', { hasText: 'Mancuernas' }).click()
    await p.locator('.tag-opt', { hasText: 'Bandas' }).click()
    await p.getByLabel(/Peso máximo/).fill('8')
    await p.getByRole('radio', { name: /^Algo/ }).check()
    await p.locator('.tag-opt', { hasText: 'Rodilla' }).click()
    await p.getByRole('button', { name: 'Guardar mi fuerza' }).click()
    await p.getByText('Listo: ajustamos la fuerza').waitFor({ timeout: 8000 })
  })
  const y = today.getFullYear()
  const goals = [
    { type: 'single', name: 'QA-Normal 10K', sport: 'Running', date: plusDays(75), priority: 'secondary', km: 10, elev: 50, objective: 'time', target: '0:58' },
    { type: 'single', name: 'QA-Normal Gran Fondo', sport: 'Ciclismo', date: plusDays(170), priority: 'primary', km: 110, elev: 1800, objective: 'finish' },
    { type: 'tri', name: 'QA-Normal Sprint', preset: 'Sprint', date: plusDays(260), priority: 'secondary', objective: 'time', target: '1:35' },
    { type: 'single', name: 'QA-Normal Piscina 1500', sport: 'Natación', date: plusDays(320), priority: 'secondary', km: 1.5, objective: 'finish' },
  ]
  const ids = []
  for (const g of goals) {
    const r = await A.tryStep(`Crear meta ${g.name}`, 'Alta', () => createGoal(A, g))
    if (r && !r.id && !r.stuck)
      await A.bug('Alta', `No se pudo guardar la meta «${g.name}»`, 'La meta se guarda', `Errores: ${r.errors.join(' | ') || 'sin mensaje'}`)
    if (r?.id) ids.push([g, r.id])
  }
  for (const [g, id] of ids) await A.tryStep(`Verificar meta ${g.name}`, 'Alta', () => checkGoal(A, g, id))
  await A.tryStep('Revisar el plan y sus sesiones', 'Alta', () => planSanity(A))
  await A.tryStep('Abrir una rutina de fuerza (debe evitar ejercicios de rodilla)', 'Media', async () => {
    await A.go('/plan')
    for (let k = 0; k < 4; k++) {
      const ls = await p.locator('a[href*="plan/sesion/"]').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.textContent]))
      const r = ls.find((x) => /Rutina/.test(x[1]))
      if (r) {
        await p.goto(BASE + r[0])
        await p.waitForTimeout(1200)
        const t = await p.locator('main').innerText()
        for (const bad of ['Zancada hacia atrás', 'Sentadilla búlgara', 'Prensa de piernas', 'Extensión de piernas', 'Saltos'])
          if (t.includes(bad)) await A.bug('Media', `Con molestia de rodilla la rutina incluye «${bad}»`, 'Ejercicios sin carga de rodilla', bad)
        return
      }
      await p.getByRole('button', { name: 'Semana siguiente' }).first().click()
    }
    await A.bug('Media', 'No aparece ninguna rutina de fuerza en 4 semanas', 'Fuerza en el plan (activa por defecto)', 'Ninguna')
  })
  await A.tryStep('Registrar una pausa por viaje', 'Media', async () => {
    await A.go('/temporada')
    await p.locator('#nueva-pausa summary').click()
    await p
      .getByLabel('Viaje')
      .check()
      .catch(() => {})
    await p.locator('#p-from').fill(plusDays(30))
    await p
      .locator('#p-to')
      .fill(plusDays(34))
      .catch(() => {})
    await p.getByRole('button', { name: /Guardar pausa|Registrar pausa/ }).click()
    await p.waitForTimeout(1200)
  })
  if (ids.length > 1) {
    const [g, id] = ids[ids.length - 1]
    await A.tryStep(`Borrar la meta ${g.name}`, 'Alta', async () => {
      await A.go(`/metas/${id}`)
      await p.getByRole('button', { name: 'Borrar meta' }).click()
      await p.waitForTimeout(1500)
      await A.go('/metas')
      const t = await p.locator('main').innerText()
      await A.check(!t.includes(g.name), 'Alta', 'La meta borrada sigue apareciendo', 'Ya no aparece', 'Sigue en la lista')
      const ev = await eventInPlan(A, g.name, g.date)
      await A.check(!ev.found, 'Alta', 'El evento de la meta borrada sigue en el plan', 'Sin evento', ev.label)
    })
  }
  await A.tryStep('Alimentación: perfil y necesidades del día', 'Media', async () => {
    await A.go('/nutricion')
    await p.getByRole('button', { name: 'Guardar perfil de alimentación' }).click()
    await p.waitForTimeout(1000)
    const t = await p.locator('main').innerText()
    if (/NaN|undefined/.test(t)) await A.bug('Alta', 'Valores inválidos en alimentación', 'Números válidos', 'NaN/undefined')
  })
  await A.tryStep('Nueva pestaña: los datos siguen ahí', 'Crítica', async () => {
    const p2 = await p.context().newPage()
    await p2.goto(BASE + '#/metas')
    await p2.waitForTimeout(1500)
    const t = await p2.locator('main').innerText()
    for (const [g] of ids.slice(0, -1))
      if (!t.includes(g.name)) await A.bug('Crítica', `«${g.name}» no aparece en otra pestaña`, 'Datos persistentes', 'No aparece')
    await p2.close()
  })
}

async function principiante(A) {
  const p = A.page
  await onboarding(A, { name: 'QA-Principiante', demo: false })
  await A.tryStep('Ayuda y glosario', 'Baja', async () => {
    await A.go('/ayuda')
    await A.go('/glosario')
  })
  // Errores de entrada en la meta
  await A.tryStep('Meta sin nombre ni distancia', 'Alta', async () => {
    await A.go('/metas/nueva')
    await p.getByLabel('Salida única').check()
    await p.getByRole('button', { name: 'Continuar' }).click()
    await p.getByRole('button', { name: 'Continuar' }).click()
    const err = await p.locator('.error').allInnerTexts()
    await A.check(err.length >= 2, 'Alta', 'Sin nombre/fecha/distancia no muestra errores claros', 'Errores en cada campo', err.join(' | ') || 'ninguno')
  })
  await A.tryStep('Distancia con texto «cinco» y negativa', 'Media', async () => {
    await p.getByLabel('Nombre de la meta').fill('QA-Principiante prueba')
    await p.locator('#g-date').fill(plusDays(60))
    await p.getByLabel('Distancia (km)').fill('cinco')
    await p.getByRole('button', { name: 'Continuar' }).click()
    let err = await p.locator('.error').allInnerTexts()
    await A.check(err.length > 0, 'Media', 'Se acepta «cinco» como distancia', 'Error de distancia', 'Sin error')
    await p.getByLabel('Distancia (km)').fill('-5')
    await p.getByRole('button', { name: 'Continuar' }).click()
    err = await p.locator('.error').allInnerTexts()
    await A.check(err.length > 0, 'Media', 'Se acepta una distancia negativa', 'Error de distancia', 'Sin error')
  })
  await A.tryStep('Meta con fecha pasada', 'Media', async () => {
    const r = await createGoal(A, { type: 'single', name: 'QA-Principiante Pasada', sport: 'Running', date: plusDays(-10), km: 5, objective: 'finish' })
    if (r?.id) await A.bug('Media', 'Se puede crear una meta con fecha pasada sin aviso', 'Aviso: la fecha ya pasó', 'Se guarda sin advertencia')
  })
  await A.tryStep('Tiempo objetivo mal escrito («1h20»)', 'Media', async () => {
    const r = await createGoal(A, {
      type: 'single',
      name: 'QA-Principiante Tiempo',
      sport: 'Running',
      date: plusDays(90),
      km: 10,
      objective: 'time',
      target: '1h20',
    })
    if (r?.id) {
      await A.go(`/metas/${r.id}`)
      const t = await p.locator('main').innerText()
      await A.check(
        /1:20/.test(t),
        'Media',
        'Un tiempo escrito como «1h20» no se interpreta como 1:20',
        'Objetivo 1:20',
        (t.match(/objetivo[^\n]{0,30}/i) || ['?'])[0],
      )
    }
  })
  // Metas reales de principiante
  const goals = [
    { type: 'single', name: 'QA-Principiante 5K', sport: 'Running', date: plusDays(45), km: 5, objective: 'finish' },
    { type: 'single', name: 'QA-Principiante Paseo 40 km', sport: 'Ciclismo', date: plusDays(120), km: 40, elev: 300, objective: 'finish' },
    { type: 'tri', name: 'QA-Principiante Súper sprint', preset: 'Súper sprint', date: plusDays(200), objective: 'time', target: '1:10' },
    { type: 'single', name: 'QA-Principiante Mañana', sport: 'Running', date: plusDays(1), km: 3, objective: 'finish' },
  ]
  const ids = []
  for (const g of goals) {
    const r = await A.tryStep(`Crear meta ${g.name}`, 'Alta', () => createGoal(A, g))
    if (r && !r.id && !r.stuck)
      await A.bug('Alta', `No se pudo guardar la meta «${g.name}»`, 'La meta se guarda', `Errores: ${r.errors.join(' | ') || 'sin mensaje'}`)
    if (r?.id) ids.push([g, r.id])
  }
  for (const [g, id] of ids) await A.tryStep(`Verificar meta ${g.name}`, 'Alta', () => checkGoal(A, g, id))
  await A.tryStep('Disponibilidad en cero todos los días', 'Media', async () => {
    await setAvailability(A, [0, 0, 0, 0, 0, 0, 0])
    const err = await p.locator('.error, [role=alert]').allInnerTexts()
    await A.go('/plan')
    const t = await p.locator('main').innerText()
    if (/NaN|undefined/.test(t)) await A.bug('Alta', 'Con 0 minutos el plan muestra valores inválidos', 'Mensaje claro', 'NaN/undefined')
    if (!/tiempo|minutos|disponible/i.test(t) && !err.length)
      await A.bug('Media', 'Con 0 minutos disponibles no se explica por qué no hay plan', 'Aviso claro', 'Sin aviso')
  })
  await A.tryStep('Disponibilidad con 900 minutos (fuera de rango)', 'Baja', async () => {
    await A.go('/plan/disponibilidad')
    await p.getByLabel(/^Lunes \(minutos\)/).fill('900')
    await p.getByRole('button', { name: 'Guardar disponibilidad' }).click()
    await p.waitForTimeout(600)
    const err = await p.locator('.error').allInnerTexts()
    await A.check(err.length > 0, 'Baja', 'Se aceptan 900 minutos en un día', 'Error 0–600', 'Sin error')
    await setAvailability(A, [30, 45, 0, 45, 0, 90, 60])
  })
  await A.tryStep('Registrar actividad con duración vacía', 'Media', async () => {
    await A.go('/actividades/nueva')
    await p.getByRole('button', { name: 'Guardar actividad' }).click()
    await p.waitForTimeout(500)
    const err = await p.locator('.error').allInnerTexts()
    await A.check(err.length > 0, 'Media', 'Se guarda una actividad sin duración', 'Error de duración', 'Sin error')
  })
  await A.tryStep('Revisar el plan y sus sesiones', 'Alta', () => planSanity(A))
  await A.tryStep('Recargar: metas siguen', 'Crítica', async () => {
    await p.reload()
    await p.waitForTimeout(1200)
    await A.go('/metas')
    const t = await p.locator('main').innerText()
    for (const [g] of ids) await A.check(t.includes(g.name), 'Crítica', `La meta «${g.name}» desapareció al recargar`, 'Sigue guardada', 'No aparece')
  })
}

;(async () => {
  const browser = await chromium.launch()
  const only = process.env.AGENT
  const agents = [
    ['Deportista de élite', elite],
    ['Usuario normal', normal],
    ['Principiante', principiante],
  ].filter(([n]) => !only || n.toLowerCase().includes(only.toLowerCase()))
  // Agentes en paralelo: cada uno en su propio contexto (datos y sesión aislados)
  await Promise.all(agents.map(([n, fn]) => withAgent(browser, n, fn)))
  await browser.close()
  fs.writeFileSync(path.join(OUT, 'hallazgos.json'), JSON.stringify({ fecha: new Date().toISOString(), base: BASE, findings }, null, 2))
  fs.writeFileSync(path.join(OUT, 'bitacora.txt'), log.join('\n'))
  const order = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 }
  for (const f of findings.sort((a, b) => order[a.gravedad] - order[b.gravedad])) console.log(`[${f.gravedad}] (${f.perfil}) ${f.titulo} — ${f.obtenido}`)
  console.log(`\n${findings.length} hallazgos · bitácora en ${OUT}`)
})()
