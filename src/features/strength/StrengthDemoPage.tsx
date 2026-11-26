import { Page } from '../../components/ui/Page'
import { ExerciseCard, type ExerciseInfo } from './ExerciseCard'

// Vista previa de los 3 dibujos de ejemplo (solo en desarrollo)
const SAMPLES: ExerciseInfo[] = [
  {
    id: 'squat',
    name: 'Sentadilla',
    where: 'En casa · sin equipo',
    dose: '3 series × 12',
    rest: 'Descanso 60 s',
    muscles: 'Cuádriceps y glúteos',
    steps: [
      'Pies al ancho de los hombros, puntas un poco hacia afuera.',
      'Baja llevando la cadera atrás, como sentándote, hasta que los muslos queden paralelos al piso.',
      'Sube empujando el piso con todo el pie.',
    ],
    mistakes: ['Rodillas hacia adentro', 'Talones que se levantan', 'Espalda redonda'],
    easier: 'sentarte y pararte de una silla',
    harder: 'sentadilla búlgara con el pie de atrás en una silla',
  },
  {
    id: 'glute_bridge',
    name: 'Puente de glúteo',
    where: 'En casa · sin equipo',
    dose: '3 series × 15',
    rest: 'Descanso 45 s',
    muscles: 'Glúteos e isquiotibiales',
    steps: [
      'Acostado boca arriba, rodillas dobladas y pies apoyados cerca de la cadera.',
      'Aprieta los glúteos y sube la cadera hasta formar una línea de hombros a rodillas.',
      'Sostén 2 segundos arriba y baja despacio.',
    ],
    mistakes: ['Arquear la espalda baja', 'Empujar con los dedos en vez de los talones'],
    easier: 'subir solo hasta la mitad',
    harder: 'a una pierna o con mancuerna sobre la cadera',
  },
  {
    id: 'band_row',
    name: 'Remo con banda',
    where: 'En casa · banda elástica',
    dose: '3 series × 12',
    rest: 'Descanso 60 s',
    muscles: 'Espalda alta y bíceps',
    steps: [
      'Ancla la banda a la altura del pecho (una puerta o un poste) y aléjate hasta sentir tensión.',
      'Lleva los codos atrás pegados al cuerpo, juntando las escápulas.',
      'Vuelve despacio estirando los brazos.',
    ],
    mistakes: ['Encoger los hombros', 'Echar el tronco hacia atrás para tirar'],
    easier: 'acercarte al anclaje (menos tensión)',
    harder: 'banda más fuerte o pausa de 2 s atrás',
  },
]

export function StrengthDemoPage() {
  return (
    <Page title="Fuerza: ejemplos">
      <div className="ex-list">
        {SAMPLES.map((ex, i) => (
          <ExerciseCard key={ex.id} ex={ex} index={i} />
        ))}
      </div>
    </Page>
  )
}
