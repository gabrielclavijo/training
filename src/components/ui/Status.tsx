import { useEffect, useRef, useState, type ReactNode } from 'react'
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
    <div className="prog" role="img" aria-label={label}>
      <span className={`prog-fill prog-${level}`} style={{ width: `${shown}%` }} />
      {marks.map((m) => (
        <span
          key={m.label}
          className={`prog-mark${m.pct > 80 ? ' prog-mark-end' : m.pct < 20 ? ' prog-mark-start' : ''}`}
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

const arcPt = (f: number, r: number) => {
  const a = Math.PI * (1 - f)
  return { x: 100 + r * Math.cos(a), y: 100 - r * Math.sin(a) }
}
const arc = (f0: number, f1: number, r: number) => {
  const a = arcPt(f0, r)
  const b = arcPt(f1, r)
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}A${r},${r} 0 0 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`
}

/**
 * Medidor semicircular: zonas de color (bien / atención / alerta) y una aguja
 * que se mueve con un pequeño rebote hasta el valor. El texto central lo da `children`.
 */
export function ArcGauge({ scale, value, label, children }: { scale: Scale; value: number; label: string; children?: ReactNode }) {
  const target = scalePct(value, scale) / 100
  const [shown, setShown] = useState(() => (reduceMotion() ? target : 0))
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target))
    return () => cancelAnimationFrame(id)
  }, [target])
  let from = scale.min
  const GAP = 0.012
  return (
    <div className="arc-gauge" role="img" aria-label={label}>
      <svg viewBox="0 0 200 112" aria-hidden="true">
        <path d={arc(0, 1, 80)} className="arc-track" />
        {scale.zones.map((z, i) => {
          const f0 = scalePct(from, scale) / 100
          const f1 = scalePct(Math.min(z.to, scale.max), scale) / 100
          from = z.to
          if (f1 - f0 <= GAP * 2) return null
          return <path key={i} d={arc(f0 + (i ? GAP : 0), f1 - (i < scale.zones.length - 1 ? GAP : 0), 80)} className={`arc-zone arc-${z.level}`} style={{ animationDelay: `${i * 90}ms` }} />
        })}
        <g className="arc-needle" style={{ transform: `rotate(${shown * 180 - 90}deg)` }}>
          <path d="M100,100 L96.5,98 L100,34 L103.5,98 Z" />
        </g>
        <circle cx="100" cy="100" r="8" className="arc-hub" />
      </svg>
      {children && <div className="arc-center">{children}</div>}
    </div>
  )
}
