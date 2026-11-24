import { useId, useState, type ReactNode } from 'react'
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
  display: string // valor formateado
  highlight?: boolean
}

export function BarChart({
  title,
  summary,
  data,
  valueHeader,
  periodHeader,
}: {
  title: string
  summary: string
  data: BarDatum[]
  valueHeader: string
  periodHeader: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  const titleId = useId()
  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="muted chart-summary">{summary}</p>
      <svg viewBox="0 0 100 52" preserveAspectRatio="none" role="img" aria-label={summary} className="chart-svg">
        <line x1="0" y1="50" x2="100" y2="50" className="axis" />
        {data.map((d, i) => {
          const h = (d.value / max) * 46
          return (
            <rect
              key={d.label + i}
              x={i * w + w * 0.15}
              y={50 - h}
              width={w * 0.7}
              height={h}
              className={d.highlight ? 'bar bar-highlight' : 'bar'}
              style={{ animationDelay: `${Math.min(i, 16) * 30}ms` }}
            />
          )
        })}
      </svg>
      <div className="chart-xlabels" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <DataTable
        headers={[periodHeader, valueHeader]}
        rows={data.map((d) => [d.fullLabel ?? d.label, d.display])}
      />
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
