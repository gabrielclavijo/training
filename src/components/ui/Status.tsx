import { useEffect, useRef, useState } from 'react'
import { scalePct, type Level, type Scale } from '../../core/fitness/status'

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Semáforo: tres luces con la del nivel encendida + el veredicto en texto
 * (el color nunca es la única señal).
 */
export function Semaphore({ level, label }: { level: Level; label: string }) {
  return (
    <span className={`semaphore semaphore-${level}`}>
      <span className="semaphore-lights" aria-hidden="true">
        <i className={level === 'alert' ? 'on' : ''} />
        <i className={level === 'caution' ? 'on' : ''} />
        <i className={level === 'good' ? 'on' : ''} />
      </span>
      <span className="semaphore-text">
        <span aria-hidden="true">{level === 'good' ? '✓ ' : level === 'caution' ? '! ' : '⚠ '}</span>
        {label}
      </span>
    </span>
  )
}

/** Escala de colores (zonas) con un marcador que se desliza hasta el valor. */
export function Gauge({ scale, value, label, ticks = [] }: { scale: Scale; value: number; label: string; ticks?: { value: number; label: string }[] }) {
  const [shown, setShown] = useState(() => (reduceMotion() ? scalePct(value, scale) : 0))
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(scalePct(value, scale)))
    return () => cancelAnimationFrame(id)
  }, [value, scale])
  let from = scale.min
  return (
    <div className="gauge" role="img" aria-label={label}>
      <div className="gauge-track">
        {scale.zones.map((z, i) => {
          const start = scalePct(from, scale)
          const end = scalePct(Math.min(z.to, scale.max), scale)
          from = z.to
          return <span key={i} className={`gauge-zone gauge-${z.level}`} style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }} />
        })}
        {ticks.map((t) => (
          <span key={t.label} className="gauge-tick" style={{ left: `${scalePct(t.value, scale)}%` }} aria-hidden="true">
            <span>{t.label}</span>
          </span>
        ))}
        <span className="gauge-marker" style={{ left: `${shown}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}

/** Barra de progreso que se llena al aparecer. */
export function Progress({ pct, label, level = 'good', marks = [] }: { pct: number; label: string; level?: Level; marks?: { pct: number; label: string }[] }) {
  const target = Math.min(100, Math.max(0, pct))
  const [shown, setShown] = useState(() => (reduceMotion() ? target : 0))
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target))
    return () => cancelAnimationFrame(id)
  }, [target])
  return (
    <div className="progress" role="img" aria-label={label}>
      <span className={`progress-fill progress-${level}`} style={{ width: `${shown}%` }} />
      {marks.map((m) => (
        <span
          key={m.label}
          className={`progress-mark${m.pct > 80 ? ' progress-mark-end' : m.pct < 20 ? ' progress-mark-start' : ''}`}
          style={{ left: `${Math.min(100, Math.max(0, m.pct))}%` }}
          aria-hidden="true"
        >
          <span>{m.label}</span>
        </span>
      ))}
    </div>
  )
}

/** Número que «cuenta» hasta su valor al aparecer. */
export function CountUp({ value, format, duration = 800 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [n, setN] = useState(() => (reduceMotion() ? value : 0))
  const from = useRef(0)
  useEffect(() => {
    if (reduceMotion()) {
      setN(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let id = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      setN(a + (value - a) * eased)
      if (k < 1) id = requestAnimationFrame(step)
      else from.current = value
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [value, duration])
  return <>{format(n)}</>
}
