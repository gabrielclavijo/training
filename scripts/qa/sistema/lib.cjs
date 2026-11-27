// =============================================================================
// Herramientas comunes de los agentes: registro de hallazgos, revisión UX en
// cada pantalla y acciones sobre la app (modo local de pruebas).
// =============================================================================
const fs = require('fs')
const path = require('path')

const BASE = process.env.APP_URL || 'http://localhost:4173/'
const OUT = process.env.QA_OUT || path.join(process.cwd(), 'qa-out', 'sistema')
fs.mkdirSync(OUT, { recursive: true })
const isLocal = (u) => /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/.test(u)

/** Todos los hallazgos de todos los agentes (formato único). */
const findings = []
const log = []

/**
 * Formato de hallazgo:
 *  agente, tipoAgente (usuario|experto), persona, categoria (técnico|contenido|ux),
 *  severidad (crítica|alta|media|baja), riesgoSalud 0–3, impactoUX 0–3,
 *  titulo, clave (para cruzar entre agentes), pasos[], esperado, obtenido, evidencia{}
 */
function report(f) {
  const full = { riesgoSalud: 0, impactoUX: 0, pasos: [], evidencia: {}, ...f }
  full.clave = full.clave || `${full.categoria}:${full.titulo}`
  findings.push(full)
  log.push(`  !! [${full.severidad}] (${full.agente}${full.persona ? ' · ' + full.persona : ''}) ${full.titulo}`)
  return full
}

let AxeBuilder = null
try {
  ;({ AxeBuilder } = require('@axe-core/playwright'))
} catch {
  AxeBuilder = null
}

/** Agente usuario: navega, registra pasos y deja que el experto UX revise cada pantalla. */
function makeUser(persona, page) {
  const steps = []
  const seenAxe = new Set()
  const ux = (sev, titulo, esperado, obtenido, extra = {}) =>
    report({
      agente: 'Experto en UX/UI',
      tipoAgente: 'experto',
      persona: persona.nombre,
      categoria: 'ux',
      severidad: sev,
      impactoUX: { crítica: 3, alta: 3, media: 2, baja: 1 }[sev],
      titulo,
      pasos: steps.slice(-5),
      esperado,
      obtenido,
      evidencia: { url: page.url() },
      ...extra,
    })
  const A = {
    persona,
    page,
    steps,
    evidence: { sesiones: [], rutinas: [], pantallas: [] },
    step(s) {
      steps.push(s)
      log.push(`[${persona.nombre}] ${s}`)
    },
    async shot(name) {
      const f = `${persona.id}_${name}_${findings.length}.png`.replace(/[^\w.-]+/g, '_')
      try {
        await page.screenshot({ path: path.join(OUT, f), fullPage: true })
      } catch {}
      return f
    },
    async bug(categoria, severidad, titulo, esperado, obtenido, extra = {}) {
      return report({
        agente: persona.perfil.split(':')[0],
        tipoAgente: 'usuario',
        persona: persona.nombre,
        categoria,
        severidad,
        titulo,
        pasos: steps.slice(-8),
        esperado,
        obtenido,
        evidencia: { url: page.url(), captura: await A.shot('bug') },
        ...extra,
      })
    },
    /** Abre una pantalla y la revisa como experto UX */
    async go(route, { axe = true } = {}) {
      A.step(`Abrir ${route}`)
      if (page.url().endsWith('#' + route)) await page.goto(BASE + '#/')
      await page.goto(BASE + '#' + route)
      await page.waitForTimeout(900)
      await A.uxCheck(route, axe)
    },
    async uxCheck(route, axe = true) {
      const key = route.replace(/[0-9a-f-]{36}/g, ':id')
      const r = await page.evaluate(() => {
        const vis = (el) => {
          const b = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
        }
        const small = [...document.querySelectorAll('main button, main a, main [role=button], nav button, nav a')]
          .filter(vis)
          .filter((el) => !el.closest('p, li > span, .muted'))
          .map((el) => ({
            t: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30),
            w: el.getBoundingClientRect().width,
            h: el.getBoundingClientRect().height,
          }))
          .filter((x) => x.h < 40 && x.t)
        const tiny = [...document.querySelectorAll('main *')]
          .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2) && vis(el))
          .map((el) => parseFloat(getComputedStyle(el).fontSize))
          .filter((x) => x < 12).length
        const main = document.querySelector('main')
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          h1: !!document.querySelector('h1'),
          small: small.slice(0, 5),
          tiny,
          invalidSinMensaje: [...document.querySelectorAll('[aria-invalid=true]')].filter((el) => !el.getAttribute('aria-describedby')).length,
          vacio: main ? main.innerText.trim().length < 20 : true,
          texto: main ? main.innerText : '',
        }
      })
      A.evidence.pantallas.push({ route: key, overflow: r.overflow })
      if (r.overflow > 0)
        ux('media', `La pantalla ${key} se sale del ancho del teléfono`, 'Sin desplazamiento horizontal a 390 px', `${r.overflow}px de más`, {
          clave: `ux:overflow:${key}`,
        })
      if (!r.h1) ux('baja', `La pantalla ${key} no tiene título principal`, 'Un título (h1) por pantalla', 'Sin h1', { clave: `ux:h1:${key}` })
      if (r.small.length)
        ux(
          'baja',
          `Botones o enlaces pequeños para tocar en ${key}`,
          'Área de toque ≥ 44 px',
          r.small.map((x) => `«${x.t}» ${Math.round(x.h)}px`).join(' · '),
          { clave: `ux:toque:${key}` },
        )
      if (r.tiny > 3) ux('baja', `Texto muy pequeño en ${key}`, 'Texto ≥ 12 px', `${r.tiny} textos < 12 px`, { clave: `ux:texto:${key}` })
      if (r.invalidSinMensaje)
        ux('media', `Campo con error sin mensaje asociado en ${key}`, 'Cada error explica qué corregir', `${r.invalidSinMensaje} campos`, {
          clave: `ux:error:${key}`,
        })
      if (r.vacio) ux('alta', `Pantalla vacía en ${key}`, 'Contenido o estado vacío con ayuda', 'Pantalla sin contenido', { clave: `ux:vacio:${key}` })
      if (/NaN|undefined|Infinity|\[object Object\]/.test(r.texto))
        report({
          agente: persona.perfil.split(':')[0],
          tipoAgente: 'usuario',
          persona: persona.nombre,
          categoria: 'técnico',
          severidad: 'alta',
          impactoUX: 2,
          titulo: `Valores inválidos en ${key}`,
          clave: `tec:nan:${key}`,
          pasos: steps.slice(-5),
          esperado: 'Números válidos',
          obtenido: (r.texto.match(/.{0,40}(NaN|undefined|Infinity|\[object Object\]).{0,40}/) || [''])[0],
          evidencia: { url: page.url(), captura: await A.shot('nan') },
        })
      if (axe && AxeBuilder && !seenAxe.has(key)) {
        seenAxe.add(key)
        try {
          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
          for (const v of res.violations)
            ux(
              v.impact === 'critical' || v.impact === 'serious' ? 'alta' : 'media',
              `Accesibilidad: ${v.help} (${key})`,
              'Sin problemas de accesibilidad WCAG 2.2 AA',
              `${v.id} en ${v.nodes.length} elemento(s): ${v.nodes[0].target}`,
              { clave: `ux:axe:${v.id}:${key}` },
            )
        } catch {}
      }
    },
    /** `interno`: paso del agente (no es una tarea de una persona), no se mide su tiempo */
    async tryStep(desc, sev, fn, { interno = false } = {}) {
      A.step(desc)
      const t0 = Date.now()
      try {
        const r = await fn()
        const s = (Date.now() - t0) / 1000
        if (!interno && s > 20)
          ux('baja', `«${desc}» tarda ${s.toFixed(0)} s`, 'Tareas comunes en menos de 20 s', `${s.toFixed(0)} s`, { clave: `ux:lento:${desc}` })
        return r
      } catch (e) {
        await A.bug(
          'técnico',
          sev,
          `No se pudo: ${desc}`,
          'El paso se completa',
          String(e.message || e)
            .split('\n')[0]
            .slice(0, 240),
        )
        return undefined
      }
    },
    /** Estado completo del modo local (lo que revisan los expertos) */
    async snapshot() {
      return page.evaluate(() => JSON.parse(localStorage.getItem('entreno.localData') || 'null'))
    },
  }
  return A
}

async function newIsolatedUser(browser, persona) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota' })
  const page = await ctx.newPage()
  const A = makeUser(persona, page)
  // Aislamiento: nada sale de localhost (ni Supabase, ni IA, ni Strava)
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (isLocal(u)) return route.continue()
    report({
      agente: persona.perfil.split(':')[0],
      tipoAgente: 'usuario',
      persona: persona.nombre,
      categoria: 'técnico',
      severidad: 'alta',
      titulo: 'Petición a un servicio externo en modo de prueba',
      clave: 'tec:externo',
      esperado: 'Sin conexiones externas',
      obtenido: u.slice(0, 120),
    })
    return route.abort()
  })
  page.on('pageerror', (e) =>
    report({
      agente: persona.perfil.split(':')[0],
      tipoAgente: 'usuario',
      persona: persona.nombre,
      categoria: 'técnico',
      severidad: 'alta',
      impactoUX: 2,
      titulo: 'Error de JavaScript',
      clave: `tec:js:${String(e.message).slice(0, 60)}`,
      pasos: A.steps.slice(-5),
      esperado: 'Sin errores',
      obtenido: String(e.message).slice(0, 240),
      evidencia: { url: page.url() },
    }),
  )
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text()))
      report({
        agente: persona.perfil.split(':')[0],
        tipoAgente: 'usuario',
        persona: persona.nombre,
        categoria: 'técnico',
        severidad: 'media',
        titulo: 'Error en la consola',
        clave: `tec:consola:${m.text().slice(0, 60)}`,
        pasos: A.steps.slice(-5),
        esperado: 'Sin errores',
        obtenido: m.text().slice(0, 240),
        evidencia: { url: page.url() },
      })
  })
  page.on('dialog', (d) => void d.accept())
  return { ctx, A }
}

module.exports = { BASE, OUT, findings, log, report, newIsolatedUser }
