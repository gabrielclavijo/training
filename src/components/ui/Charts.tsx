import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Gráficas livianas en SVG. Cada gráfica:
 *  - tiene un resumen en texto (aria-label + texto visible),
 *  - se puede ver como tabla,
 *  - distingue series por patrón de línea y etiqueta, no solo por color.
 */

export interface BarDatum {
  label: string // etiqueta corta para el eje
  fullLabel?: string // etiqueta completa para la tabla
  value: number
  display: string // valor formateado (tabla)
  /** Valor corto encima de la barra (si falta, se usa `display`) */
  short?: string
  highlight?: boolean
  /** Barra con aviso (p. ej. subida brusca): color distinto y ▲ */
  warn?: boolean
  /** Periodo en curso (incompleto): barra rayada */
  partial?: boolean
}

export interface BarLegendItem {
  kind: 'normal' | 'highlight' | 'warn' | 'partial' | 'average'
  label: string
}

/** Marca un elemento como visible la primera vez que entra en pantalla (para animarlo entonces). */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') return setSeen(true)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return { ref, seen }
}

export function BarChart({
  title,
  summary,
  data,
  valueHeader,
  periodHeader,
  average,
  legend,
  note,
}: {
  title: string
  summary: string
  data: BarDatum[]
  valueHeader: string
  periodHeader: string
  /** Línea de referencia (p. ej. promedio) con su texto */
  average?: { value: number; label: string }
  legend?: BarLegendItem[]
  /** Explicación corta debajo de la gráfica */
  note?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value), average?.value ?? 0) * 1.12
  const titleId = useId()
  const { ref, seen } = useInView<HTMLDivElement>()
  const dense = data.length > 8
  // Con muchas barras (p. ej. 30 días): pocas fechas y solo los valores destacados
  const many = data.length > 14
  const step = Math.ceil(data.length / 6)
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="muted chart-summary">{summary}</p>
      {legend && legend.length > 0 && (
        <ul className="bar-legend">
          {legend.map((l) => (
            <li key={l.kind}>
              <span className={`swatch swatch-${l.kind}`} aria-hidden="true" />
              {l.kind === 'average' && average ? average.label : l.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className={`bars${seen ? ' bars-in' : ''}${dense ? ' bars-dense' : ''}`} role="img" aria-label={summary}>
        {average && average.value > 0 && <div className="bars-avg" style={{ bottom: `${(average.value / max) * 100}%` }} aria-hidden="true" />}
        {data.map((d, i) => (
          <div key={d.label + i} className="bar-col" aria-hidden="true">
            <span
              className={`bar-value${d.highlight ? ' bar-value-strong' : ''}${many && !(d.highlight || d.partial || i === maxIdx) ? ' bar-value-hide' : ''}`}
              style={{ animationDelay: `${300 + i * 40}ms` }}
            >
              {d.warn && <span className="bar-flag">▲</span>}
              {d.short ?? d.display}
            </span>
            <div
              className={['bar-rect', d.highlight && 'bar-rect-highlight', d.warn && 'bar-rect-warn', d.partial && 'bar-rect-partial']
                .filter(Boolean)
                .join(' ')}
              style={{ height: `${(d.value / max) * 100}%`, animationDelay: `${i * 40}ms` }}
            />
          </div>
        ))}
      </div>
      <div className={`bar-xlabels${dense && !many ? ' bar-xlabels-dense' : ''}`} aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.label + i} className={d.highlight ? 'strong' : undefined}>
            {!many || i % step === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
      {note && <p className="chart-note">{note}</p>}
      <DataTable headers={[periodHeader, valueHeader]} rows={data.map((d) => [d.fullLabel ?? d.label, d.display])} />
    </figure>
  )
}

export interface LineSeries {
  name: string
  values: number[]
  dash?: string // patrón: '' continua, '4 2' guiones, '1 2' puntos
  className: string
}

/** Curva suave (monótona: no inventa picos entre puntos) como «d» de un path SVG. */
export function smoothPath(pts: { x: number; y: number }[]) {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0].x},${pts[0].y}`
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x)
  const sl = pts.slice(1).map((p, i) => (p.y - pts[i].y) / (dx[i] || 1))
  const m = pts.map((_, i) => (i === 0 ? sl[0] : i === n - 1 ? sl[n - 2] : sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / sl[i]
    const b = m[i + 1] / sl[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      m[i] = k * a * sl[i]
      m[i + 1] = k * b * sl[i]
    }
  }
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${(pts[i].x + h).toFixed(2)},${(pts[i].y + m[i] * h).toFixed(2)} ${(pts[i + 1].x - h).toFixed(2)},${(pts[i + 1].y - m[i + 1] * h).toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`
  }
  return d
}

const W = 320
const H = 150
const PAD = { t: 10, r: 6, b: 8, l: 6 }

/**
 * Línea suave e interactiva: se dibuja de izquierda a derecha al aparecer y,
 * al tocarla (o con las flechas del teclado), muestra una línea vertical y una
 * burbuja con la fecha y los valores de ese día.
 */
export function LineChart({
  title,
  summary,
  labels,
  series,
  formatLabel,
  formatValue = (v: number) => String(Math.round(v)),
  zeroLine = false,
  tableEvery = 7,
  area = true,
}: {
  title: string
  summary: string
  labels: string[]
  series: LineSeries[]
  formatLabel: (l: string) => string
  formatValue?: (v: number) => string
  zeroLine?: boolean
  tableEvery?: number
  /** Relleno degradado bajo la primera serie */
  area?: boolean
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const gradId = useId().replace(/:/g, '')
  const all = series.flatMap((s) => s.values)
  const rawMin = Math.min(zeroLine ? 0 : Infinity, ...all)
  const rawMax = Math.max(...all)
  const span = rawMax - rawMin || 1
  const min = rawMin - span * 0.06
  const max = rawMax + span * 0.08
  const n = Math.max(1, labels.length - 1)
  const x = (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b)
  const rows = labels
    .map((l, i) => ({ l, i }))
    .filter(({ i }) => (labels.length - 1 - i) % tableEvery === 0)
    .map(({ l, i }) => [formatLabel(l), ...series.map((s) => formatValue(s.values[i]))])
  const view = useInView<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const px = ((clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n))))
  }
  const paths = series.map((s) => smoothPath(s.values.map((v, i) => ({ x: x(i), y: y(v) }))))
  const first = paths[0]
  const areaPath = area && first && labels.length > 1 ? `${first}L${x(labels.length - 1).toFixed(2)},${H - PAD.b}L${x(0).toFixed(2)},${H - PAD.b}Z` : null
  const hx = hover !== null ? (x(hover) / W) * 100 : 0

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="muted chart-summary">{summary}</p>
      <ul className="legend-list">
        {series.map((s) => (
          <li key={s.name}>
            <svg width="28" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="28" y2="5" className={`line ${s.className}`} strokeDasharray={s.dash} />
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <div
        ref={(el) => {
          view.ref.current = el
          box.current = el
        }}
        className={`line-wrap sline${view.seen ? ' line-in' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={`${summary} ${t('charts.explore')}`}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons ? pick(e.clientX) : undefined)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            const d = e.key === 'ArrowLeft' ? -1 : 1
            setHover((h) => Math.max(0, Math.min(labels.length - 1, (h ?? labels.length - 1) + d)))
          }
          if (e.key === 'Escape') setHover(null)
        }}
        onBlur={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="chart-svg">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="sline-grad-top" />
              <stop offset="100%" className="sline-grad-bottom" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((k) => (
            <line key={k} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + k * (H - PAD.t - PAD.b)} y2={PAD.t + k * (H - PAD.t - PAD.b)} className="grid" vectorEffect="non-scaling-stroke" />
          ))}
          {zeroLine && min < 0 && max > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="axis" vectorEffect="non-scaling-stroke" />}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} className="sline-area" />}
          {series.map((s, i) => (
            <path
              key={s.name}
              d={paths[i]}
              fill="none"
              className={`line sline-path ${s.className}`}
              strokeDasharray={s.dash}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t - 6} y2={H - PAD.b} className="sline-cursor" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null &&
          series.map((s) => (
            <span key={s.name} className={`sline-dot ${s.className}`} style={{ left: `${hx}%`, top: `${(y(s.values[hover]) / H) * 100}%` }} aria-hidden="true" />
          ))}
        {hover !== null && (
          <div className={`sline-bubble${hx > 60 ? ' is-left' : ''}`} style={{ left: `${hx}%` }} role="status">
            <strong>{formatLabel(labels[hover])}</strong>
            {series.map((s) => (
              <span key={s.name}>
                <i className={`sline-key ${s.className}`} aria-hidden="true" />
                {s.name}: <b className="num">{formatValue(s.values[hover])}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="chart-xlabels" aria-hidden="true">
        <span>{labels[0] && formatLabel(labels[0])}</span>
        {labels.length > 4 && <span>{formatLabel(labels[Math.floor(labels.length / 2)])}</span>}
        <span>{labels.length > 0 && formatLabel(labels[labels.length - 1])}</span>
      </div>
      <DataTable headers={['', ...series.map((s) => s.name)]} rows={rows} />
    </figure>
  )
}

export function DataTable({ headers, rows, caption }: { headers: string[]; rows: ReactNode[][]; caption?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <details className="table-toggle" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{t('fitness.seeTable')}</summary>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={t('fitness.seeTable')}>
        <table>
          {caption && <caption>{caption}</caption>}
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td key={j}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
