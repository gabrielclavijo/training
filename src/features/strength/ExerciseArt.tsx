import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../../components/fx/motion'

const BASE = `${import.meta.env.BASE_URL}strength/`
const LETTERS = ['A', 'B', 'C']

/**
 * Dibujo de un ejercicio que pasa por sus pasos (A → B → C) con un fundido.
 * Es decorativo: los pasos van en texto al lado. Con «reducir movimiento»
 * muestra la lámina completa, quieta. Solo anima cuando está en pantalla.
 */
export function ExerciseArt({ id, frames, layout, ms = 1400 }: { id: string; frames: number; layout: 'cols' | 'rows'; ms?: number }) {
  const [step, setStep] = useState(0)
  const [still] = useState(reducedMotion)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (still || frames < 2) return
    let visible = true
    let timer = 0
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => (visible = e.isIntersecting)) : null
    if (io && box.current) io.observe(box.current)
    timer = window.setInterval(() => visible && setStep((s) => (s + 1) % frames), ms)
    return () => {
      clearInterval(timer)
      io?.disconnect()
    }
  }, [still, frames, ms])

  if (still || frames < 2) {
    return (
      <div className={`ex-art is-still ex-art-${layout}`} aria-hidden="true">
        <img src={frames < 2 ? `${BASE}${id}-1.webp` : `${BASE}${id}.webp`} alt="" loading="lazy" decoding="async" />
      </div>
    )
  }
  return (
    <div ref={box} className={`ex-art ex-art-${layout}`} aria-hidden="true">
      {Array.from({ length: frames }, (_, i) => (
        <img key={i} src={`${BASE}${id}-${i + 1}.webp`} alt="" loading="lazy" decoding="async" className={i === step ? 'is-on' : undefined} />
      ))}
      <span className="ex-art-steps">
        {Array.from({ length: frames }, (_, i) => (
          <i key={i} className={i === step ? 'is-on' : undefined}>
            {LETTERS[i]}
          </i>
        ))}
      </span>
    </div>
  )
}
