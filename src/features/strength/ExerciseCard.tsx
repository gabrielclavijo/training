import { Icon } from '../../components/ui/Icon'
import { ExerciseFigure } from './ExerciseFigure'

export interface ExerciseInfo {
  id: string
  name: string
  where: string
  dose: string
  rest: string
  steps: string[]
  mistakes: string[]
  easier: string
  harder: string
  muscles: string
}

/** Tarjeta de un ejercicio: dibujo animado, cómo hacerlo, errores y variantes. */
export function ExerciseCard({ ex, index = 0 }: { ex: ExerciseInfo; index?: number }) {
  return (
    <article className="ex-card" style={{ animationDelay: `${index * 80}ms` }} aria-labelledby={`ex-${ex.id}`}>
      <div className="ex-card-art">
        <ExerciseFigure id={ex.id} />
        <span className="ex-muscles">
          <i aria-hidden="true" /> {ex.muscles}
        </span>
      </div>
      <div className="ex-card-body">
        <span className="ex-where">{ex.where}</span>
        <h3 id={`ex-${ex.id}`}>{ex.name}</h3>
        <ul className="ex-dose">
          <li>
            <Icon name="refresh" /> {ex.dose}
          </li>
          <li>
            <Icon name="clock" /> {ex.rest}
          </li>
        </ul>
        <ol className="ex-steps">
          {ex.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="ex-mistakes">
          <Icon name="alert" /> <span>{ex.mistakes.join(' · ')}</span>
        </p>
        <div className="ex-variants">
          <span>
            <b>Más fácil:</b> {ex.easier}
          </span>
          <span>
            <b>Más difícil:</b> {ex.harder}
          </span>
        </div>
      </div>
    </article>
  )
}
