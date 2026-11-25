import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reducedMotion } from './motion'

/**
 * Panel modal que entra deslizándose: desde la izquierda (menú ☰) o desde abajo
 * (acciones rápidas, avisos). Se cierra con Esc, tocando afuera o deslizando.
 * Usa <dialog> nativo: atrapa el foco y lo devuelve al botón que lo abrió.
 */
export function Sheet({
  open,
  onClose,
  side,
  label,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  side: 'left' | 'bottom' | 'center'
  label: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const drag = useRef<{ x: number; y: number; d: number } | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setClosing(false)
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      document.documentElement.classList.add('has-sheet')
    }
    if (!open && d.open) {
      // Animación de salida y luego cerrar
      setClosing(true)
      const t = setTimeout(
        () => {
          if (typeof d.close === 'function') d.close()
          else d.removeAttribute('open')
          setClosing(false)
          document.documentElement.classList.remove('has-sheet')
        },
        reducedMotion() ? 0 : 220,
      )
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => () => document.documentElement.classList.remove('has-sheet'), [])

  const move = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return
    const d = side === 'left' ? Math.min(0, e.clientX - drag.current.x) : Math.max(0, e.clientY - drag.current.y)
    drag.current.d = d
    panel.current.style.transform = side === 'left' ? `translateX(${d}px)` : `translateY(${d}px)`
  }
  const end = () => {
    if (!drag.current || !panel.current) return
    const far = Math.abs(drag.current.d) > 70
    panel.current.style.transform = ''
    drag.current = null
    if (far) onClose()
  }

  return (
    <dialog
      ref={ref}
      className={`sheet sheet-${side}${closing ? ' is-closing' : ''} ${className}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div
        ref={panel}
        className="sheet-panel"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' || side === 'center') return
          // Abajo: solo se arrastra desde la manija o el título (el contenido puede tener scroll)
          if (side === 'bottom' && !(e.target as Element).closest('.sheet-grip, .sheet-head')) return
          drag.current = { x: e.clientX, y: e.clientY, d: 0 }
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {side === 'bottom' && <span className="sheet-grip" aria-hidden="true" />}
        {(open || closing) && children}
      </div>
    </dialog>
  )
}
