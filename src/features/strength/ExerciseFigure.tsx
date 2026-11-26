import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../../components/fx/motion'
import { FIGURES, type Figure, type Pose, type Pt } from './figures'

const lerp = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
const mix = (a: Pose, b: Pose, k: number): Pose =>
  Object.fromEntries((Object.keys(a) as (keyof Pose)[]).map((j) => [j, lerp(a[j], b[j], k)])) as unknown as Pose

/** Ida y vuelta suave con pausa en cada extremo (ciclo de 2,8 s). */
function phase(t: number) {
  const c = (t % 2800) / 2800
  if (c < 0.12) return 0
  if (c < 0.5) return ease((c - 0.12) / 0.38)
  if (c < 0.62) return 1
  return 1 - ease((c - 0.62) / 0.38)
}
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)

/**
 * Dibujo animado de un ejercicio (decorativo: los pasos van en texto al lado).
 * Con «reducir movimiento» muestra el inicio tenue y el final sólido, quieto.
 */
export function ExerciseFigure({ id, size = 220, label }: { id: string; size?: number; label?: string }) {
  const fig = FIGURES[id]
  const [k, setK] = useState(0)
  const still = useRef(reducedMotion())
  const box = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (still.current || !fig) return
    let raf = 0
    let visible = true
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : null
    if (io && box.current) io.observe(box.current)
    const t0 = performance.now()
    const loop = (now: number) => {
      if (visible) setK(phase(now - t0))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
    }
  }, [fig])
  if (!fig) return null
  return (
    <svg
      ref={box}
      className="ex-figure"
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <line x1="8" y1="151" x2="192" y2="151" className="ex-floor" />
      {fig.mat && <rect x="18" y="148" width="150" height="4" rx="2" className="ex-mat" />}
      {fig.bench && <rect x={fig.bench.x} y={fig.bench.y} width={fig.bench.w} height="8" rx="3" className="ex-bench" />}
      {fig.arrow && <Arrow from={fig.arrow[0]} to={fig.arrow[1]} />}
      {still.current ? (
        <>
          <Body fig={fig} pose={fig.start} ghost />
          <Body fig={fig} pose={fig.end} />
        </>
      ) : (
        <Body fig={fig} pose={mix(fig.start, fig.end, k)} />
      )}
    </svg>
  )
}

function Body({ fig, pose: p, ghost = false }: { fig: Figure; pose: Pose; ghost?: boolean }) {
  const hl = new Set(fig.highlight)
  const seg = (a: Pt, b: Pt, on: boolean, w = 9) => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={on ? 'ex-limb ex-on' : 'ex-limb'} strokeWidth={w} />
  )
  return (
    <g className={ghost ? 'ex-ghost' : undefined}>
      {fig.band && <path d={`M${fig.band[0]},${fig.band[1]} L${p.wrist[0]},${p.wrist[1]}`} className="ex-band" />}
      {fig.band && <circle cx={fig.band[0]} cy={fig.band[1]} r="4" className="ex-anchor" />}
      {/* Pierna */}
      {seg(p.hip, p.knee, hl.has('thigh'), 11)}
      {seg(p.knee, p.ankle, hl.has('shin'), 9)}
      {seg(p.ankle, p.toe, false, 6)}
      {/* Tronco */}
      {seg(p.shoulder, p.hip, hl.has('torso') || hl.has('back'), 13)}
      {hl.has('glute') && <circle cx={p.hip[0]} cy={p.hip[1]} r="8" className="ex-on-fill" />}
      {/* Brazo */}
      {seg(p.shoulder, p.elbow, hl.has('upperArm'), 8)}
      {seg(p.elbow, p.wrist, hl.has('forearm'), 7)}
      {fig.dumbbell && <rect x={p.wrist[0] - 9} y={p.wrist[1] - 4} width="18" height="8" rx="3" className="ex-weight" />}
      {/* Cabeza */}
      <circle cx={p.head[0]} cy={p.head[1]} r="10" className="ex-head" />
    </g>
  )
}

function Arrow({ from, to }: { from: Pt; to: Pt }) {
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0])
  const h = (d: number) => [to[0] - 9 * Math.cos(ang + d), to[1] - 9 * Math.sin(ang + d)]
  const [a1, a2] = [h(0.5), h(-0.5)]
  return (
    <g className="ex-arrow">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
      <polyline points={`${a1[0]},${a1[1]} ${to[0]},${to[1]} ${a2[0]},${a2[1]}`} />
    </g>
  )
}
