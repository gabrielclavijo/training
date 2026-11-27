// =============================================================================
// Flujos de los agentes usuarios. Cada persona recorre: registro → perfil →
// tiempo y fuerza → metas → plan → seguimiento → modificación → cierre de
// sesión y regreso. Guarda evidencia (textos de sesiones, rutinas, estado
// local) para los revisores expertos.
// =============================================================================
const { BASE } = require('./lib.cjs')

async function registro(A) {
  const p = A.page
  const d = A.persona.datos
  A.step('Entrar en modo local de prueba')
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Probar en modo local' }).click()
  // Aviso de responsabilidad: obligatorio antes de usar la app
  A.step('Aviso de responsabilidad: intenta seguir sin aceptar y luego acepta')
  await p.getByRole('heading', { name: 'Aviso de responsabilidad' }).waitFor({ timeout: 8000 })
  await A.uxCheck('/aviso')
  await p.getByRole('button', { name: 'Acepto y continúo' }).click()
  if (!(await p.getByText('Para usar Entreno debes marcar la casilla').isVisible().catch(() => false)))
    await A.bug('técnico', 'alta', 'Se puede seguir sin aceptar el aviso de responsabilidad', 'Pide marcar la casilla', 'No pide nada', { clave: 'tec:aviso-sin-aceptar' })
  await p.getByLabel(/Leí el aviso/).check()
  await p.getByRole('button', { name: 'Acepto y continúo' }).click()
  await p.waitForURL(/bienvenida/)
  A.step(`Registro: ${A.persona.nombre}, ${d.edad} años`)
  await p.getByLabel('Nombre').fill(A.persona.nombre)
  await p.getByLabel(/Fecha de nacimiento/).fill(d.nacimiento)
  await p.getByLabel(d.sexo, { exact: true }).check()
  await p.getByLabel(/Estatura/).fill(String(d.estatura))
  await p.getByLabel(/Peso/).first().fill(String(d.peso))
  await p.getByLabel('Confirmo que soy mayor de 18 años').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.getByRole('button', { name: 'Saltar por ahora' }).click()
  if (d.historial === 'demo') {
    A.step('Traer historial (datos de prueba)')
    await p.getByRole('button', { name: 'Cargar datos de prueba' }).click()
    await p.getByText('Listo: datos de prueba cargados.').waitFor({ timeout: 60000 })
    await p.getByRole('button', { name: 'Continuar' }).click()
  } else
    await p
      .getByRole('button', { name: /Saltar|Continuar/ })
      .last()
      .click()
  await p.getByRole('button', { name: 'Hacerlo después' }).click()
  await p.waitForTimeout(800)
  await A.uxCheck('/')
}

async function perfil(A) {
  const p = A.page
  const f = A.persona.datos.fisiologia
  if (f) {
    await A.tryStep('Datos fisiológicos', 'media', async () => {
      await A.go('/perfil')
      await p.getByLabel(/Pulso en reposo/).fill(String(f.reposo))
      await p.getByLabel(/Pulso máximo/).fill(String(f.max))
      await p.getByLabel(/Umbral de pulso/).fill(String(f.umbral))
      await p.getByLabel(/FTP/).fill(String(f.ftp))
      await p.getByRole('button', { name: 'Guardar datos fisiológicos' }).click()
      await p.waitForTimeout(800)
      const err = await p.locator('.error').allInnerTexts()
      if (err.length) await A.bug('técnico', 'media', 'Datos fisiológicos válidos rechazados', 'Se guardan', err.join(' | '))
    })
  }
  if (A.persona.datos.medicamento) {
    await A.tryStep(`Registrar medicamento que altera el pulso (${A.persona.datos.medicamento})`, 'alta', async () => {
      await A.go('/perfil')
      await p.getByRole('button', { name: 'Acepto que se guarden mis datos de salud' }).click()
      await p.waitForTimeout(800)
      await p.getByLabel('Nombre del medicamento').fill(A.persona.datos.medicamento)
      await p.getByLabel('Este medicamento altera el pulso (p. ej., betabloqueante)').check()
      await p.getByRole('button', { name: 'Agregar medicamento' }).click()
      await p.waitForTimeout(1000)
    })
  }
}

async function tiempoYFuerza(A) {
  const p = A.page
  const d = A.persona.datos
  await A.tryStep('Tiempo disponible y piscina', 'alta', async () => {
    await A.go('/plan/disponibilidad')
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    for (let i = 0; i < 7; i++) await p.getByLabel(new RegExp(`^${dias[i]} \\(minutos\\)`)).fill(String(d.disponibilidad[i]))
    for (const x of d.piscina) await p.locator('.pool-days .tag-opt', { hasText: x }).click()
    await p.getByRole('button', { name: 'Guardar disponibilidad' }).click()
    await p.waitForTimeout(900)
  })
  await A.tryStep('Tu fuerza', 'media', async () => {
    await A.go('/plan/disponibilidad')
    const f = d.fuerza
    await p.locator('.place-opt', { hasText: f.lugar }).click()
    for (const e of f.equipo) await p.locator('.tag-opt', { hasText: e }).click()
    if (f.kg) await p.getByLabel(/Peso máximo/).fill(String(f.kg))
    await p.getByRole('radio', { name: new RegExp('^' + f.experiencia) }).check()
    for (const m of f.molestias) await p.locator('.tag-opt', { hasText: m }).click()
    await p.getByRole('button', { name: 'Guardar mi fuerza' }).click()
    await p.getByText('Listo: ajustamos la fuerza').waitFor({ timeout: 8000 })
  })
}

async function crearMeta(A, g) {
  const p = A.page
  await A.go('/metas/nueva')
  await p.getByLabel(g.tipo === 'tri' ? 'Triatlón' : g.tipo === 'stage' ? 'Por etapas' : 'Salida única').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.getByLabel('Nombre de la meta').fill(g.nombre)
  if (g.tipo !== 'tri') await p.getByLabel('Deporte').selectOption({ label: g.deporte })
  await p.locator('#g-date').fill(g.fecha)
  if (g.prioridad) await p.getByLabel(g.prioridad === 'primary' ? 'Principal' : 'Secundaria', { exact: true }).check()
  if (g.tipo === 'single') {
    await p.getByLabel('Distancia (km)').fill(String(g.km))
    if (g.elev) await p.getByLabel('Desnivel positivo (m)').fill(String(g.elev))
  } else if (g.tipo === 'stage') {
    for (let i = 0; i < g.etapas.length; i++) {
      if (i >= 1) await p.getByRole('button', { name: 'Agregar etapa' }).click()
      await p.getByLabel('Distancia (km)').nth(i).fill(String(g.etapas[i].km))
      await p.getByLabel('Desnivel positivo (m)').nth(i).fill(String(g.etapas[i].elev))
    }
  } else await p.locator('.tri-preset', { hasText: g.preset }).first().click()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.waitForTimeout(300)
  if (
    await p
      .getByLabel('Nombre de la meta')
      .isVisible()
      .catch(() => false)
  )
    return { error: (await p.locator('.error').allInnerTexts()).join(' | ') }
  if (g.objetivo === 'time') {
    await p.getByLabel('Hacer un tiempo').check()
    await p.getByLabel(/Tiempo objetivo total/).fill(g.tiempo)
  } else if (g.tipo !== 'tri') await p.getByLabel('Participar y terminar').check()
  await p.getByRole('button', { name: 'Continuar' }).click()
  await p.waitForTimeout(300)
  if (
    await p
      .getByLabel(/Tiempo objetivo total/)
      .isVisible()
      .catch(() => false)
  )
    return { error: (await p.locator('.error').allInnerTexts()).join(' | ') }
  await p.getByRole('button', { name: 'Guardar meta' }).click()
  await p.waitForURL(/#\/metas\/[0-9a-f-]{8,}/, { timeout: 20000 })
  await p.getByRole('heading', { name: g.nombre }).first().waitFor({ timeout: 10000 })
  return { id: p.url().split('/metas/')[1] }
}

/** ¿El calendario del plan muestra el evento de la meta? */
async function eventoEnPlan(A, nombre, fecha) {
  const p = A.page
  await A.go('/plan', { axe: false })
  await p.getByRole('button', { name: 'Mes', exact: true }).click()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  for (let k = 0; k < 20; k++) {
    const title = (await p.locator('.cal-title').innerText()).toLowerCase()
    const ym = `${(title.match(/\d{4}/) || [])[0]}-${String(meses.findIndex((x) => title.includes(x)) + 1).padStart(2, '0')}`
    if (ym === fecha.slice(0, 7)) {
      const labels = await p.locator('.cal-day').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || ''))
      return labels.find((l) => new RegExp(`\\b${Number(fecha.slice(8, 10))} de`).test(l))?.includes(nombre) ?? false
    }
    const next = p.getByRole('button', { name: 'Mes siguiente' })
    if (await next.isDisabled()) return false
    await next.click()
    await p.waitForTimeout(120)
  }
  return false
}

async function metas(A) {
  const ids = []
  for (const g of A.persona.datos.metas) {
    const r = await A.tryStep(`Crear meta ${g.nombre}`, 'alta', () => crearMeta(A, g))
    if (r?.error !== undefined) await A.bug('técnico', 'alta', `No se pudo guardar la meta «${g.nombre}»`, 'La meta se guarda', r.error || 'sin mensaje')
    if (r?.id) ids.push([g, r.id])
  }
  for (const [g, id] of ids) {
    await A.tryStep(`Revisar meta ${g.nombre}`, 'alta', async () => {
      await A.go(`/metas/${id}`)
      const t = await A.page.locator('main').innerText()
      if (!/Tu plan de entreno/.test(t))
        await A.bug('técnico', 'media', `La meta «${g.nombre}» no muestra su plan`, 'Sección «Tu plan de entreno»', 'No aparece')
      if (!(await eventoEnPlan(A, g.nombre, g.fecha)))
        await A.bug('técnico', 'alta', `El evento «${g.nombre}» no está en el calendario`, `Día ${g.fecha} con la meta`, 'No aparece', {
          clave: 'tec:evento-calendario',
        })
    })
  }
  return ids
}

/** Abre sesiones del plan y guarda su texto (y las rutinas de fuerza) como evidencia. */
async function revisarPlan(A, semanas = 6) {
  const p = A.page
  await A.go('/plan')
  const vistos = new Set()
  for (let w = 0; w < semanas; w++) {
    const links = await p.locator('a[href*="plan/sesion/"]').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.textContent]))
    for (const [href] of links) {
      if (vistos.has(href) || vistos.size > 30) continue
      vistos.add(href)
      await p.goto(BASE + href)
      await p.waitForTimeout(500)
      const titulo = await p
        .locator('h1')
        .first()
        .innerText()
        .catch(() => '')
      const texto = await p.locator('main').innerText()
      const ejercicios = await p.locator('.ex-card h3, .str-cooldown h3, .str-cool-list strong').allInnerTexts()
      A.evidence.sesiones.push({ href, titulo, texto: texto.slice(0, 4000) })
      if (ejercicios.length) A.evidence.rutinas.push({ href, titulo, ejercicios, texto: texto.slice(0, 4000) })
      if (/No encontramos/.test(texto))
        await A.bug('técnico', 'alta', 'Una sesión del plan no se encuentra', 'Detalle de la sesión', 'No encontramos', { clave: 'tec:sesion-404' })
    }
    await p.goto(BASE + '#/plan')
    await p.waitForTimeout(500)
    for (let k = 0; k <= w; k++) await p.getByRole('button', { name: 'Semana siguiente' }).first().click()
    await p.waitForTimeout(300)
  }
}

async function seguimiento(A) {
  const p = A.page
  for (const [d, deporte, min] of A.persona.actividades) {
    await A.tryStep(`Registrar ${deporte} ${min} min (día ${d})`, 'alta', async () => {
      await A.go('/actividades/nueva', { axe: false })
      await p.getByLabel('Deporte').selectOption({ label: deporte })
      await p.getByLabel('Fecha').fill(new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10))
      await p.getByLabel(/Duración/).fill(String(min))
      await p.getByRole('button', { name: 'Guardar actividad' }).click()
      await p.waitForTimeout(700)
      const err = await p.locator('.error').allInnerTexts()
      if (err.length) await A.bug('técnico', 'alta', 'Actividad válida rechazada', 'Se guarda', err.join(' | '))
    })
  }
  if (A.persona.checkin) {
    await A.tryStep('Registro diario «¿Cómo te sientes hoy?»', 'media', async () => {
      await A.go('/')
      const c = A.persona.checkin
      await p
        .locator('.checkin label', { hasText: new RegExp(`^${c.cara}$`) })
        .first()
        .click()
      for (const e of c.etiquetas) await p.locator('.checkin label', { hasText: e }).click()
      await p.locator('.checkin').getByRole('button', { name: 'Guardar' }).click()
      await p.waitForTimeout(800)
    })
  }
}

async function errores(A) {
  const p = A.page
  await A.tryStep('Errores típicos de principiante en una meta', 'media', async () => {
    await A.go('/metas/nueva')
    await p.getByLabel('Salida única').check()
    await p.getByRole('button', { name: 'Continuar' }).click()
    await p.getByRole('button', { name: 'Continuar' }).click()
    const vacio = await p.locator('.error').allInnerTexts()
    if (vacio.length < 2) await A.bug('ux', 'media', 'Sin errores claros al dejar la meta vacía', 'Un mensaje por campo', vacio.join(' | ') || 'ninguno')
    await p.getByLabel('Distancia (km)').fill('cinco')
    await p.getByRole('button', { name: 'Continuar' }).click()
    if (!(await p.locator('.error').count())) await A.bug('técnico', 'media', 'Se acepta texto como distancia', 'Error de distancia', 'Sin error')
  })
  await A.tryStep('Consultar la ayuda', 'baja', async () => {
    await A.go('/ayuda')
    await A.go('/glosario')
  })
}

async function modificar(A, ids) {
  const p = A.page
  const id = A.persona.id
  if (id === 'deportista' && ids.length) {
    const [g, gid] = ids[0]
    await A.tryStep(`Cambiar la fecha de ${g.nombre}`, 'alta', async () => {
      const nueva = new Date(Date.parse(g.fecha) + 14 * 86_400_000).toISOString().slice(0, 10)
      await A.go(`/metas/${gid}/editar`)
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.locator('#g-date').fill(nueva)
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByRole('button', { name: 'Guardar meta' }).click()
      await p.waitForTimeout(1500)
      if (!(await eventoEnPlan(A, g.nombre, nueva)))
        await A.bug('técnico', 'alta', 'Al cambiar la fecha, el evento no se movió', `Evento el ${nueva}`, 'No aparece')
      g.fecha = nueva
    })
  }
  const pausa = A.persona.pausa || (A.persona.datos.lesion && { tipo: 'Lesión', ...A.persona.datos.lesion })
  if (pausa) {
    await A.tryStep(`Registrar pausa: ${pausa.tipo}`, 'alta', async () => {
      await A.go('/temporada')
      await p.locator('#nueva-pausa summary').click()
      await p.locator('.kind-option', { hasText: pausa.tipo }).click()
      await p.waitForTimeout(200)
      if (pausa.tipo === 'Lesión' && !(await p.locator('.notice-health').count()))
        await A.bug('contenido', 'alta', 'Al registrar una lesión no se avisa que el plan exacto lo define un profesional', 'Aviso de salud', 'Sin aviso', {
          riesgoSalud: 2,
        })
      await p.locator('#p-from').fill(pausa.desde)
      await p.locator('#p-to').fill(pausa.hasta)
      await p.locator('.pause-form button[type=submit]').click()
      await p.waitForTimeout(1200)
    })
  }
}

async function cerrarYVolver(A, ids) {
  const p = A.page
  await A.tryStep('Cerrar sesión y volver a entrar', 'crítica', async () => {
    await A.go('/ajustes')
    await p.getByRole('button', { name: 'Cerrar sesión' }).click()
    await p.waitForTimeout(1000)
    await p.getByRole('button', { name: 'Probar en modo local' }).click()
    await p.waitForTimeout(1500)
    if (await p.getByRole('heading', { name: 'Aviso de responsabilidad' }).isVisible().catch(() => false))
      await A.bug('técnico', 'media', 'Al volver a entrar pide de nuevo aceptar el aviso', 'Se acepta una sola vez', 'Lo vuelve a pedir', {
        clave: 'tec:aviso-repetido',
      })
    if (/bienvenida/.test(p.url()))
      await A.bug('técnico', 'media', 'Al volver a entrar pide de nuevo el registro', 'Entra directo con sus datos', 'Vuelve a «Primeros pasos»')
    await A.go('/metas')
    const t = await p.locator('main').innerText()
    for (const [g] of ids)
      if (!t.includes(g.nombre))
        await A.bug('técnico', 'crítica', `La meta «${g.nombre}» se perdió al cerrar sesión`, 'Los datos siguen', 'No aparece', { clave: 'tec:datos-perdidos' })
  })
}

/** Recorrido completo de un agente usuario. Devuelve la evidencia y el estado final. */
async function recorrer(A) {
  await registro(A)
  await perfil(A)
  await tiempoYFuerza(A)
  if (A.persona.id === 'normal') await errores(A)
  await seguimiento(A)
  const ids = await metas(A)
  await modificar(A, ids)
  await A.tryStep('Revisar el plan y abrir sesiones', 'alta', () => revisarPlan(A), { interno: true })
  await cerrarYVolver(A, ids)
  const estado = await A.snapshot()
  return { persona: A.persona, evidencia: A.evidence, estado }
}

module.exports = { recorrer }
