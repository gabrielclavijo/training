import { Page } from '../../components/ui/Page'
import { EXERCISES } from '../../core/strength/library'
import { ExerciseCard } from './ExerciseCard'

// Vista previa de toda la biblioteca de ejercicios (solo en desarrollo)
export function StrengthDemoPage() {
  return (
    <Page title="Ejercicios de fuerza">
      <div className="ex-list">
        {EXERCISES.map((ex, i) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            index={Math.min(i, 4)}
            dose={{
              where: ex.place === 'gym' ? 'Gimnasio' : ex.needs.length ? 'En casa · con equipo' : 'En casa · sin equipo',
              dose: ex.hold ? '3 × 30 s' : '3 series × 12',
              rest: 'Descanso 60 s',
            }}
          />
        ))}
      </div>
    </Page>
  )
}
