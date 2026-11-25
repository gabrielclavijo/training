import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../ui/Icon'
import { haptic } from './motion'

interface Toast {
  id: number
  text: string
  icon: IconName
  leaving?: boolean
}
type Show = (text: string, opts?: { icon?: IconName; vibrate?: boolean }) => void

const Ctx = createContext<Show>(() => {})

// Avisos desde fuera de React (p. ej. al terminar una mutación)
let external: Show | null = null
/** Muestra un aviso desde cualquier parte (si la app ya cargó los avisos). */
export const notify: Show = (text, opts) => external?.(text, opts)

/** Avisos cortos abajo de la pantalla («Guardado», «Actividad subida»…). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(0)
  const show = useCallback<Show>((text, opts) => {
    const id = ++seq.current
    setItems((xs) => [...xs.slice(-2), { id, text, icon: opts?.icon ?? 'check' }])
    if (opts?.vibrate !== false) haptic()
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 2600)
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2900)
  }, [])
  const value = useMemo(() => show, [show])
  useEffect(() => {
    external = show
    return () => {
      if (external === show) external = null
    }
  }, [show])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <p key={x.id} className={`toast${x.leaving ? ' is-leaving' : ''}`}>
            <span className="toast-icon" aria-hidden="true">
              <Icon name={x.icon} />
            </span>
            {x.text}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
