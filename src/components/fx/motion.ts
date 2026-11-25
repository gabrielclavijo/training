/** ¿La persona pidió reducir el movimiento? (sin animaciones, confeti ni vibración) */
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Vibración corta en acciones importantes, si el teléfono la permite. */
export function haptic(pattern: number | number[] = 12) {
  if (reducedMotion()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* sin vibración */
  }
}

const COLORS = ['#006450', '#10b981', '#7bd8b8', '#007f66', '#c6f2df']

/**
 * Celebración: confeti verde liviano dibujado en un canvas temporal (≈1,6 s).
 * No hace nada con «reducir movimiento».
 */
export function celebrate(origin?: { x: number; y: number }) {
  if (reducedMotion() || typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.className = 'confetti-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  ctx.scale(dpr, dpr)
  const ox = origin?.x ?? w / 2
  const oy = origin?.y ?? h / 3
  const parts = Array.from({ length: 90 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
    const v = 6 + Math.random() * 7
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, s: 5 + Math.random() * 5, c: COLORS[(Math.random() * COLORS.length) | 0] }
  })
  const start = performance.now()
  const frame = (t: number) => {
    const k = (t - start) / 1600
    ctx.clearRect(0, 0, w, h)
    for (const p of parts) {
      p.vy += 0.28
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.r += p.vr
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - k)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
      ctx.restore()
    }
    if (k < 1) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

/**
 * Celebra una sola vez por clave (p. ej. «semana-2026-11-23»): guarda en el
 * navegador lo ya celebrado para no repetirlo en cada visita.
 */
export function celebrateOnce(key: string, origin?: { x: number; y: number }) {
  const k = `entreno.celebrated.${key}`
  try {
    if (localStorage.getItem(k)) return false
    localStorage.setItem(k, '1')
  } catch {
    return false
  }
  celebrate(origin)
  haptic([10, 40, 10])
  return true
}
