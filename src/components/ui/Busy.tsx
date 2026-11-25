import { useCallback, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../fx/Toast'
import type { IconName } from './Icon'

/**
 * Botón que muestra que algo se está haciendo: se desactiva, enseña un círculo
 * que gira y cambia el texto (por defecto «Guardando…»). Úsalo en todo botón
 * que guarde, borre o envíe algo.
 */
export function BusyButton({
  busy,
  busyLabel,
  children,
  className = 'btn btn-primary',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <button {...rest} className={`${className}${busy ? ' is-busy' : ''}`} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      {busy ? (busyLabel ?? t('common.saving')) : children}
    </button>
  )
}

/**
 * Ejecuta una acción asíncrona y avisa: mientras corre `busy` es true; al
 * terminar muestra un aviso («Guardado» por defecto) y, si falla, uno de error.
 * Devuelve true si salió bien.
 */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>, opts: { success?: string | false; icon?: IconName; error?: string } = {}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const running = useRef(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const optsRef = useRef(opts)
  optsRef.current = opts
  const run = useCallback(
    async (...args: A) => {
      if (running.current) return false
      running.current = true
      setBusy(true)
      setFailed(false)
      try {
        await fnRef.current(...args)
        const s = optsRef.current.success
        if (s !== false) toast(s ?? t('common.saved'), { icon: optsRef.current.icon ?? 'check' })
        return true
      } catch (e) {
        console.error(e)
        setFailed(true)
        toast(optsRef.current.error ?? t('errors.saveFailed'), { icon: 'alert' })
        return false
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [toast, t],
  )
  return { run, busy, failed }
}
