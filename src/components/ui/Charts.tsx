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
function useInView<T extends Element>() {
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
        {average && average.value > 0 && (
          <div className="bars-avg" style={{ bottom: `${(average.value / max) * 100}%` }} aria-hidden="true" />
        )}
        {data.map((d, i) => (
          <div key={d.label + i} className="bar-col" aria-hidden="true">
            <span className={`bar-value${d.highlight ? ' bar-value-strong' : ''}`} style={{ animationDelay: `${300 + i * 40}ms` }}>
              {d.warn && <span className="bar-flag">▲</span>}
              {d.short ?? d.display}
            </span>
            <div
              className={['bar-rect', d.highlight && 'bar-rect-highlight', d.warn && 'bar-rect-warn', d.partial && 'bar-rect-partial'].filter(Boolean).join(' ')}
              style={{ height: `${(d.value / max) * 100}%`, animationDelay: `${i * 40}ms` }}
            />
          </div>
        ))}
      </div>
      <div className={`bar-xlabels${dense ? ' bar-xlabels-dense' : ''}`} aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.label + i} className={d.highlight ? 'strong' : undefined}>
            {d.label}
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

export function LineChart({
  title,
  summary,
  labels,
  series,
  formatLabel,
  zeroLine = false,
  tableEvery = 7,
}: {
  title: string
  summary: string
  labels: string[]
  series: LineSeries[]
  formatLabel: (l: string) => string
  zeroLine?: boolean
  tableEvery?: number
}) {
  const titleId = useId()
  const all = series.flatMap((s) => s.values)
  const min = Math.min(0, ...all)
  const max = Math.max(1, ...all)
  const n = Math.max(1, labels.length - 1)
  const y = (v: number) => 48 - ((v - min) / (max - min || 1)) * 44
  const rows = labels
    .map((l, i) => ({ l, i }))
    .filter(({ i }) => (labels.length - 1 - i) % tableEvery === 0)
    .map(({ l, i }) => [formatLabel(l), ...series.map((s) => String(Math.round(s.values[i])))])
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
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label={summary} className="chart-svg">
        {zeroLine && min < 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="axis" />}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            className={`line ${s.className}`}
            strokeDasharray={s.dash}
            vectorEffect="non-scaling-stroke"
            points={s.values.map((v, i) => `${(i / n) * 100},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="chart-xlabels" aria-hidden="true">
        <span>{labels[0] && formatLabel(labels[0])}</span>
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
