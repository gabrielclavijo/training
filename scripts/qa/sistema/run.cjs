// =============================================================================
// Sistema de agentes de QA: 5 agentes usuarios recorren la app en paralelo
// (cada uno con su propio navegador y datos), 4 revisores expertos evalúan lo
// que generaron y un consolidador arma un informe único priorizado.
//
// Seguridad: corre solo contra un build local SIN Supabase (modo local de
// prueba). Si la app no ofrece «Probar en modo local», se detiene: así nunca
// toca producción ni cuentas reales.
//
// Uso:
//   npm run build && npx vite preview --port 4173
//   APP_URL=http://localhost:4173/ npm run qa:sistema
//   (opcional) AGENTES=normal,baja para correr solo algunos
// Salida: qa-out/sistema/{consolidado.json, informe.md, hallazgos.json, bitacora.txt, capturas}
// =============================================================================
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { BASE, OUT, findings, log, newIsolatedUser } = require('./lib.cjs')
const { USUARIOS, EXPERTOS } = require('./personas.cjs')
const { recorrer } = require('./usuarios.cjs')
const { revisar, vista } = require('./expertos.cjs')
const { consolidar, markdown } = require('./consolidar.cjs')

;(async () => {
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    console.error('Detenido: el sistema solo corre contra un build local de pruebas.')
    process.exit(1)
  }
  const browser = await chromium.launch()
  // Guarda de seguridad: debe existir el modo local (build sin Supabase)
  {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(BASE)
    const ok = await p
      .getByRole('button', { name: 'Probar en modo local' })
      .isVisible({ timeout: 10000 })
      .catch(() => false)
    await ctx.close()
    if (!ok) {
      console.error('Detenido: esta app no tiene «modo local de prueba» (¿es producción?). No se ejecuta nada.')
      await browser.close()
      process.exit(1)
    }
  }
  const only = (process.env.AGENTES || '').split(',').filter(Boolean)
  const personas = USUARIOS.filter((u) => !only.length || only.includes(u.id))
  const t0 = Date.now()
  const casos = await Promise.all(
    personas.map(async (persona) => {
      const { ctx, A } = await newIsolatedUser(browser, persona)
      try {
        return await recorrer(A)
      } catch (e) {
        await A.bug(
          'técnico',
          'crítica',
          'El agente no pudo completar su recorrido',
          'Recorrido completo',
          String(e.message || e)
            .split('\n')[0]
            .slice(0, 240),
        )
        return { persona, evidencia: A.evidence, estado: await A.snapshot().catch(() => null) }
      } finally {
        log.push(`[${persona.nombre}] terminó en ${Math.round((Date.now() - t0) / 1000)} s`)
        await ctx.close()
      }
    }),
  )
  await browser.close()
  revisar(casos)
  const consolidado = consolidar(findings)
  const meta = {
    fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
    base: BASE,
    agentes: [...personas.map((p) => p.nombre), ...EXPERTOS.map((e) => e.nombre)],
    total: findings.length,
  }
  fs.writeFileSync(path.join(OUT, 'hallazgos.json'), JSON.stringify(findings, null, 2))
  fs.writeFileSync(path.join(OUT, 'consolidado.json'), JSON.stringify({ ...meta, consolidado }, null, 2))
  fs.writeFileSync(path.join(OUT, 'informe.md'), markdown(consolidado, meta))
  fs.writeFileSync(path.join(OUT, 'bitacora.txt'), log.join('\n'))
  if (process.env.QA_ESTADO) fs.writeFileSync(path.join(OUT, 'estados.json'), JSON.stringify(casos.map((c) => ({ persona: c.persona.id, estado: c.estado }))))
  // Resumen semanal de cada plan (para revisar a mano lo que vieron los expertos)
  fs.writeFileSync(
    path.join(OUT, 'planes.json'),
    JSON.stringify(
      casos.map((c) => ({
        persona: c.persona.id,
        semanas: vista(c).weeks.map((w) => ({ semana: w.weekStart, fase: w.phase, minutos: w.minutes, larga: w.long, sesiones: w.ss.map((x) => `${x.date.slice(5)} ${x.sport} ${x.kind} ${Math.round(x.durationMin)}`) })),
      })),
      null,
      1,
    ),
  )
  fs.writeFileSync(
    path.join(OUT, 'casos.json'),
    JSON.stringify(
      casos.map((c) => ({ persona: c.persona.id, evidencia: c.evidencia })),
      null,
      2,
    ),
  )
  for (const c of consolidado)
    console.log(`[${c.severidad}${c.escalado ? '↑' : ''}] salud ${c.riesgoSalud} · ${c.titulo} — ${c.agentes.join(', ')} · ${c.personas.join(', ')}`)
  console.log(`\n${consolidado.length} problemas únicos de ${findings.length} reportes · ${Math.round((Date.now() - t0) / 1000)} s · ${OUT}`)
})()
