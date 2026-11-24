import { useState } from 'react'
import { useAvatar } from '../../data/hooks'

/**
 * Foto de perfil o, si no hay, el avatar estándar (silueta).
 * Es decorativa: el nombre de la persona siempre aparece en texto al lado.
 */
export function Avatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const avatar = useAvatar()
  const [failed, setFailed] = useState<string | null>(null)
  const url = avatar.data && avatar.data !== failed ? avatar.data : null
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {url ? (
        <img src={url} alt="" width={size} height={size} onError={() => setFailed(url)} />
      ) : (
        <svg viewBox="0 0 40 40" width={size} height={size} focusable="false">
          <rect width="40" height="40" fill="#d9e5df" />
          <circle cx="20" cy="15.5" r="7" fill="#006450" />
          <path d="M6 38c1.5-8 7.2-12.5 14-12.5S32.5 30 34 38z" fill="#006450" />
        </svg>
      )}
    </span>
  )
}
