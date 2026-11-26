import { Icon } from '../../components/ui/Icon'
import type { Exercise } from '../../core/strength/library'
import { ExerciseArt } from './ExerciseArt'

/** Lo que cambia según la rutina: dónde, cuántas series y el descanso. */
export interface ExerciseDose {
  where: string
  dose: string
  rest: string
}

/** Tarjeta de un ejercicio: dibujo animado, cómo hacerlo, errores y variantes. */
export function ExerciseCard({ ex, dose, index = 0 }: { ex: Exercise; dose: ExerciseDose; index?: number }) {
  return (
    <article className={`ex-card ex-card-${ex.layout}`} style={{ animationDelay: `${index * 80}ms` }} aria-labelledby={`ex-${ex.id}`}>
      <div className="ex-card-art">
        <ExerciseArt id={ex.id} frames={ex.frames} layout={ex.layout} />
        <span className="ex-muscles">
          <i aria-hidden="true" /> {ex.muscles}
        </span>
      </div>
      <div className="ex-card-body">
        <span className="ex-where">{dose.where}</span>
        <h3 id={`ex-${ex.id}`}>{ex.name}</h3>
        {ex.machine && <p className="ex-machine">{ex.machine}</p>}
        <ul className="ex-dose">
          <li>
            <Icon name="refresh" /> {dose.dose}
          </li>
          <li>
            <Icon name="clock" /> {dose.rest}
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
