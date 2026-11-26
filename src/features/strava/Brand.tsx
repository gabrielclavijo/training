import { useState } from 'react'

/**
 * Elementos de marca de Strava según sus guías:
 *  - botón oficial «Connect with Strava»,
 *  - logo «Powered by Strava» donde se muestren sus datos,
 *  - enlace «View on Strava» en cada actividad que venga de allá.
 * Los archivos oficiales van en public/brand/strava/ (ver README). Mientras no
 * estén, se muestra una versión en texto con el color de la marca.
 */
const base = `${import.meta.env.BASE_URL}brand/strava/`
const ORANGE = '#FC5200'

export function ConnectWithStrava({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <button type="button" className="strava-connect" onClick={onClick} disabled={disabled} aria-label="Connect with Strava">
      {imgOk ? (
        <img src={`${base}btn_strava_connect_with_orange.svg`} alt="" height={48} onError={() => setImgOk(false)} />
      ) : (
        <span className="strava-connect-fallback" style={{ background: ORANGE }}>
          Connect with Strava
        </span>
      )}
    </button>
  )
}

export function PoweredByStrava() {
  const [imgOk, setImgOk] = useState(true)
  return imgOk ? (
    <img
      className="powered-by-strava"
      src={`${base}api_logo_pwrdBy_strava_horiz_orange.svg`}
      alt="Powered by Strava"
      height={24}
      onError={() => setImgOk(false)}
    />
  ) : (
    <span className="powered-by-strava-text" style={{ color: ORANGE }}>
      Powered by Strava
    </span>
  )
}

export function ViewOnStrava({ href }: { href: string }) {
  return (
    <a className="view-on-strava" href={href} target="_blank" rel="noopener noreferrer" style={{ color: ORANGE }}>
      View on Strava<span className="visually-hidden"> (se abre en otra pestaña)</span>
    </a>
  )
}
