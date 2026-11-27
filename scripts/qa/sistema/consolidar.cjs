// =============================================================================
// Consolidación: cruza los hallazgos de todos los agentes en un informe único,
// priorizado primero por riesgo para la salud y luego por impacto en la
// experiencia.
//
// Reglas de cruce:
//  1. Mismo problema = misma «clave»: se fusionan aunque lo vean agentes distintos
//     (p. ej. el usuario no ve su evento y el entrenador no lo encuentra en el plan).
//  2. Confirmación: cuantos más agentes y personas lo vean, más prioridad.
//  3. Sistémico: si aparece en 2 o más personas, es una regla general rota, no un caso.
//  4. Escalamiento: con riesgo para la salud y confirmado por 2+ expertos, sube un nivel.
//  5. Orden: riesgo para la salud > severidad > impacto en la experiencia > confirmación.
// =============================================================================
const SEV = ['baja', 'media', 'alta', 'crítica']
const sevW = (s) => SEV.indexOf(s) + 1

function consolidar(findings) {
  const groups = new Map()
  for (const f of findings) {
    const g = groups.get(f.clave) || { clave: f.clave, items: [] }
    g.items.push(f)
    groups.set(f.clave, g)
  }
  const out = []
  for (const g of groups.values()) {
    const it = g.items
    const agentes = [...new Set(it.map((x) => x.agente))]
    const expertos = [...new Set(it.filter((x) => x.tipoAgente === 'experto').map((x) => x.agente))]
    const personas = [...new Set(it.map((x) => x.persona).filter(Boolean))]
    const riesgoSalud = Math.max(...it.map((x) => x.riesgoSalud || 0))
    const impactoUX = Math.max(...it.map((x) => x.impactoUX || 0))
    let severidad = it.map((x) => x.severidad).sort((a, b) => sevW(b) - sevW(a))[0]
    const escalado = riesgoSalud >= 2 && expertos.length >= 2 && severidad !== 'crítica'
    if (escalado) severidad = SEV[sevW(severidad)]
    const first = it.slice().sort((a, b) => sevW(b.severidad) - sevW(a.severidad))[0]
    out.push({
      clave: g.clave,
      titulo: first.titulo,
      categoria: first.categoria,
      severidad,
      escalado,
      riesgoSalud,
      impactoUX,
      agentes,
      personas,
      sistemico: personas.length >= 2,
      veces: it.length,
      pasos: first.pasos,
      esperado: first.esperado,
      obtenido: first.obtenido,
      ejemplos: it.slice(0, 4).map((x) => ({ persona: x.persona, agente: x.agente, obtenido: x.obtenido, evidencia: x.evidencia })),
      prioridad: riesgoSalud * 100 + sevW(severidad) * 10 + impactoUX * 5 + (agentes.length - 1) * 3 + (personas.length - 1) * 2,
    })
  }
  return out.sort((a, b) => b.prioridad - a.prioridad)
}

function markdown(consolidado, meta) {
  const L = []
  const n = (s) => consolidado.filter((x) => x.severidad === s).length
  L.push(`# Informe consolidado de QA — ${meta.fecha}`)
  L.push('')
  L.push(`Entorno: build local en modo de prueba (${meta.base}), sin servicios externos. Agentes: ${meta.agentes.join(', ')}.`)
  L.push('')
  L.push(
    `**${consolidado.length} problemas únicos** (de ${meta.total} reportes): ${n('crítica')} críticos · ${n('alta')} altos · ${n('media')} medios · ${n('baja')} bajos. ${consolidado.filter((x) => x.riesgoSalud >= 2).length} con riesgo para la salud.`,
  )
  L.push('')
  L.push('> Los hallazgos de contenido con riesgo para la salud deben validarlos un profesional antes de cambiar la app; no son indicaciones de entrenamiento.')
  for (const c of consolidado) {
    L.push('')
    L.push(`## [${c.severidad.toUpperCase()}${c.escalado ? ' ↑' : ''}] ${c.titulo}`)
    L.push(
      `- Tipo: ${c.categoria} · Riesgo para la salud: ${c.riesgoSalud}/3 · Impacto en la experiencia: ${c.impactoUX}/3${c.sistemico ? ' · **sistémico**' : ''}`,
    )
    L.push(`- Lo vieron: ${c.agentes.join(', ')} · Personas: ${c.personas.join(', ') || '—'} · ${c.veces} reporte(s)`)
    L.push(`- Esperado: ${c.esperado}`)
    L.push(`- Obtenido: ${c.obtenido}`)
    if (c.pasos?.length) L.push(`- Pasos: ${c.pasos.map((p, i) => `${i + 1}) ${p}`).join(' ')}`)
    const ev = c.ejemplos.map((e) => e.evidencia?.captura).filter(Boolean)
    if (ev.length) L.push(`- Evidencia: ${ev.join(', ')}`)
  }
  return L.join('\n')
}

module.exports = { consolidar, markdown }
