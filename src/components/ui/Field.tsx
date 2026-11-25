import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

/** Campo de formulario accesible: etiqueta visible, ayuda y error asociados. */
interface BaseProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
}

function describedBy(id: string, hint?: ReactNode, error?: string | null) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
}

function Wrapper({ id, label, hint, error, optional, children }: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="muted"> (opcional)</span>}
      </label>
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span id={`${id}-error`} className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export function TextField({ label, hint, error, optional, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        type="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Wrapper>
  )
}

export function NumberField({ label, hint, error, optional, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Wrapper>
  )
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  children,
  ...rest
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId()
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest}>
        {children}
      </select>
    </Wrapper>
  )
}

export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
  hideLegend = false,
}: {
  hideLegend?: boolean
  legend: ReactNode
  name: string
  value: T | null
  options: { value: T; label: ReactNode; help?: ReactNode }[]
  onChange: (v: T) => void
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <fieldset aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className={hideLegend ? 'visually-hidden' : 'legend'}>{legend}</legend>
      {hint && (
        <p id={`${id}-hint`} className="hint muted">
          {hint}
        </p>
      )}
      <div className="choice-list">
        {options.map((o) => (
          <label key={o.value} className="choice">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              {o.label}
              {o.help && <span className="choice-help">{o.help}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Convierte el texto de un campo numérico (acepta coma decimal) en número o null. */
export function parseNum(v: string): number | null {
  const s = v.trim().replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Da formato a lo que se escribe en un campo de tiempo, para poder usar el
 * teclado numérico del celular (que no tiene «:»): «510» → «5:10»,
 * «5.10», «5,10» o «5 10» → «5:10».
 */
export function formatClockInput(raw: string): string {
  const s = raw.replace(/[.,;'\s]/g, ':')
  if (s.includes(':')) return s.replace(/[^\d:]/g, '').replace(/:+/g, ':').slice(0, 6)
  const d = s.replace(/\D/g, '').slice(0, 5)
  return d.length <= 2 ? d : `${d.slice(0, -2)}:${d.slice(-2)}`
}

/**
 * Número entero (metros, minutos, pulso, vatios, cm). Acepta separador de miles
 * como se escribe en Colombia: «2.200» o «2,200» → 2200.
 */
export function parseWhole(v: string): number | null {
  const s = v.trim().replace(/\s/g, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''))
  return parseNum(s)
}

/** "5:10" → 310 s; "15:00" (h:mm) → 54.000 s según `unit`. Acepta «510», «5.10» o solo «5» (= 5:00). */
export function parseClock(v: string, unit: 'mm:ss' | 'hh:mm'): number | null {
  const s = formatClockInput(v.trim())
  if (s === '') return null
  const m = /^(\d{1,3})(?::([0-5]\d))?$/.exec(s)
  if (!m) return NaN
  const a = Number(m[1])
  const b = Number(m[2] ?? 0)
  return unit === 'mm:ss' ? a * 60 + b : a * 3600 + b * 60
}

/** Campo de tiempo (mm:ss o h:mm) con teclado numérico; los dos puntos se ponen solos. */
export function ClockField({ onChange, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <TextField
      {...rest}
      inputMode="numeric"
      autoComplete="off"
      onChange={(e) => {
        e.target.value = formatClockInput(e.target.value)
        onChange?.(e)
      }}
    />
  )
}

export function toClock(seconds: number | null | undefined, unit: 'mm:ss' | 'hh:mm') {
  if (!seconds) return ''
  if (unit === 'mm:ss') return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
  return `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`
}
