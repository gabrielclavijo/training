import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BusyButton, useAction } from '../../components/ui/Busy'

/** «Cerrar sesión» con indicador mientras se cierra. */
export function SignOutButton({ signOut, children }: { signOut: () => Promise<void>; children: ReactNode }) {
  const { t } = useTranslation()
  const out = useAction(signOut, { success: false })
  return (
    <BusyButton type="button" className="btn btn-secondary" busy={out.busy} busyLabel={t('settings.signingOut')} onClick={() => void out.run()}>
      {children}
    </BusyButton>
  )
}
