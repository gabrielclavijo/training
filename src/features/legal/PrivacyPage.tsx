import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { Page } from '../../components/ui/Page'

// Texto en español de Colombia. Para otro idioma se agregaría un componente
// equivalente por idioma (los textos largos no van en el JSON de i18n).

const KEY_POINTS: [IconName, string][] = [
  ['user', 'Tus datos son tuyos. Solo tú los ves; nadie más del grupo puede verlos.'],
  ['shield', 'No vendemos ni compartimos tus datos con nadie.'],
  ['import', 'Puedes descargar todo lo que guardaste y borrar tu cuenta cuando quieras.'],
  ['lab', 'Los datos de salud (medicamentos, alergias, exámenes) solo se guardan si das tu permiso, y van cifrados.'],
  [
    'sparkles',
    'Si pides un menú, a la inteligencia artificial solo le llega tu perfil de alimentación y las calorías de cada día. Nunca tus entrenamientos, tus datos de Strava ni tus exámenes.',
  ],
]

const STORED: [IconName, string, string, ('coral' | 'sky' | 'soft')?][] = [
  ['user', 'Cuenta', 'Tu correo y, si entras con Google, tu nombre.'],
  [
    'heart',
    'Perfil',
    'Fecha de nacimiento, sexo (solo para las fórmulas), estatura, peso, foto (si la subes) y los datos fisiológicos que quieras registrar (pulso, FTP, ritmos).',
    'coral',
  ],
  [
    'activity',
    'Entrenamientos',
    'Los archivos que subes (.FIT, .GPX, .TCX o exportaciones de Strava y Garmin) convertidos en un resumen: deporte, hora, duración, distancia, desnivel, pulso, potencia y, de los últimos 12 meses, el recorrido y las series de datos. El archivo original no se guarda.',
    'sky',
  ],
  ['flag', 'Metas y temporada', 'Lo que escribas sobre tus eventos y tus pausas.', 'soft'],
  [
    'heart',
    '¿Cómo te sientes hoy?',
    'Si lo usas: cómo te sentiste cada día (de 1 a 5) y las etiquetas que marques (dormí mal, piernas cansadas, estrés, con energía, enfermo). Solo sirve para tus recomendaciones; no va a la IA ni lo ve la persona que administra el grupo.',
    'coral',
  ],
  [
    'food',
    'Alimentación',
    'Tu perfil de alimentación (objetivo, tipo de alimentación, alergias e intolerancias de comida, alimentos que no comes o tienes en casa, comidas al día, tiempo de cocina y presupuesto) y los menús que pidas.',
    'coral',
  ],
  ['lab', 'Datos de salud (opcional)', 'Medicamentos que alteran el pulso, alergias y resultados de laboratorio (fecha, valor, unidad y rango).', 'sky'],
]

export function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('privacy.title')}>
      <div className="privacy">
        <div className="help-hero">
          <span className="ai-orb" aria-hidden="true">
            <Icon name="shield" />
          </span>
          <div>
            <p className="help-ask">Tus datos, en tus manos</p>
            <p className="muted">Última actualización: 27/11/2026 · Versión 5</p>
          </div>
        </div>

        <section aria-labelledby="pv-short">
          <h2 id="pv-short">En pocas palabras</h2>
          <ul className="point-grid">
            {KEY_POINTS.map(([icon, text], i) => (
              <li key={i} style={{ animationDelay: `${i * 50}ms` }}>
                <TitleIcon name={icon} tone={i % 2 ? 'sky' : undefined} />
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pv-what">
          <h2 id="pv-what">Qué guardamos</h2>
          <ul className="info-grid">
            {STORED.map(([icon, title, text, tone]) => (
              <li key={title} className="info-card">
                <TitleIcon name={icon} tone={tone} />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="pv-why">
          <h2 id="pv-why" className="card-title-icon">
            <TitleIcon name="target" />
            Para qué los usamos
          </h2>
          <p>
            Solo para mostrarte tus entrenamientos, calcular tu forma física, ayudarte a planear tus metas y tu alimentación. Los cálculos los hace la
            aplicación con fórmulas conocidas.
          </p>
        </section>

        <section className="card" aria-labelledby="pv-health">
          <h2 id="pv-health" className="card-title-icon">
            <TitleIcon name="lab" tone="sky" />
            Datos de salud
          </h2>
          <ul className="step-chips">
            <li>
              <Icon name="check" /> Permiso explícito antes de guardar
            </li>
            <li>
              <Icon name="shield" /> Cifrados: en la base de datos solo queda un texto ilegible
            </li>
            <li>
              <Icon name="trash" /> Puedes retirar el permiso y borrarlos cuando quieras
            </li>
            <li>
              <Icon name="alert" /> La aplicación no interpreta ni diagnostica tus exámenes
            </li>
          </ul>
        </section>

        <section className="card" aria-labelledby="pv-ai">
          <h2 id="pv-ai" className="card-title-icon">
            <TitleIcon name="sparkles" tone="coral" />
            Inteligencia artificial
          </h2>
          <p>
            Las recomendaciones, el plan y los cálculos de calorías los hace la aplicación con reglas y fórmulas, sin inteligencia artificial. La IA solo se usa
            cuando tú tocas «Generar menú de la semana» u «Otra opción», en la sección Alimentación.
          </p>
          <div className="yes-no">
            <div className="yes">
              <h3>
                <Icon name="check" /> Qué se envía
              </h3>
              <p>
                Tu perfil de alimentación tal como lo escribiste y, para cada día, las calorías, los gramos de proteína, carbohidratos y grasa, y el tipo y la
                duración de la sesión planeada (por ejemplo, «ciclismo, larga, 240 min»). En la misma pantalla puedes ver exactamente lo que se envió.
              </p>
            </div>
            <div className="no">
              <h3>
                <Icon name="alert" /> Qué nunca se envía
              </h3>
              <p>
                Tus actividades, recorridos, pulso o potencia; cómo te sientes cada día; nada que venga de Strava o Garmin; tus exámenes, medicamentos u otros datos de salud; tu nombre,
                correo, edad o peso.
              </p>
            </div>
          </div>
          <dl className="mini-facts">
            <div>
              <dt>Quién lo procesa</dt>
              <dd>
                Anthropic (el modelo Claude), a través de su servicio para desarrolladores. Según sus condiciones, no usa lo que se le envía por ese servicio
                para entrenar sus modelos. La solicitud se hace desde nuestro servidor, nunca desde tu navegador.
              </dd>
            </div>
            <div>
              <dt>Para qué</dt>
              <dd>Solo para armar tu menú y tu lista de mercado. El menú queda guardado en tu cuenta y lo puedes borrar cuando quieras.</dd>
            </div>
          </dl>
        </section>

        <section className="card" aria-labelledby="pv-usage">
          <h2 id="pv-usage" className="card-title-icon">
            <TitleIcon name="clock" tone="soft" />
            Estadísticas de uso
          </h2>
          <p>
            Para saber si la app le sirve al grupo de prueba, mientras la tienes abierta y a la vista se cuenta el tiempo de uso (minutos y visitas
            por día) y la hora de tu última conexión. También se cuenta cuántos menús pides a la IA y cuánto cuestan.
          </p>
          <div className="yes-no">
            <div className="yes">
              <h3>
                <Icon name="check" /> Qué ve la persona que administra el grupo
              </h3>
              <p>
                Tu nombre y correo, cuándo te registraste y si entraste con Google, tu última conexión, los minutos y días de uso, cuántas actividades
                tienes y cuántos menús pediste con su costo.
              </p>
            </div>
            <div className="no">
              <h3>
                <Icon name="alert" /> Qué no ve
              </h3>
              <p>El contenido: tus entrenamientos, recorridos, metas, cómo te sientes, datos de salud, exámenes, alimentación ni tus menús.</p>
            </div>
          </div>
          <p className="muted">Estos datos de uso se borran a los 12 meses, van en «Exportar mis datos» y se eliminan si borras tu cuenta.</p>
        </section>

        <div className="info-grid">
          <section className="info-card" aria-labelledby="pv-strava">
            <TitleIcon name="route" tone="coral" />
            <h3 id="pv-strava">Conexión con Strava (opcional)</h3>
            <p>
              Si conectas tu cuenta de Strava, la app recibe tus actividades nuevas. Por las reglas de Strava, esos datos se guardan como máximo 7 días, solo tú
              los ves y nunca se usan con inteligencia artificial. Al desconectar Strava se borra todo lo que llegó desde allá.
            </p>
          </section>
          <section className="info-card" aria-labelledby="pv-where">
            <TitleIcon name="import" tone="sky" />
            <h3 id="pv-where">Dónde se guardan</h3>
            <p>En Supabase, un servicio de base de datos en la nube. Cada fila está protegida para que solo tu cuenta pueda leerla o cambiarla.</p>
          </section>
        </div>

        <section aria-labelledby="pv-rights">
          <h2 id="pv-rights">Tus derechos</h2>
          <ul className="info-grid">
            <li className="info-card">
              <TitleIcon name="user" />
              <h3>Ver y corregir</h3>
              <p>Todo lo que guardas lo puedes ver y editar en la aplicación.</p>
            </li>
            <li className="info-card">
              <TitleIcon name="import" tone="sky" />
              <h3>Descargar</h3>
              <p>
                En <Link to="/ajustes">Ajustes</Link> → «Exportar mis datos» recibes un archivo con todo.
              </p>
            </li>
            <li className="info-card">
              <TitleIcon name="trash" tone="coral" />
              <h3>Borrar</h3>
              <p>
                En <Link to="/ajustes">Ajustes</Link> → «Borrar mi cuenta» se elimina tu cuenta y todo su contenido, sin posibilidad de recuperarlo.
              </p>
            </li>
          </ul>
        </section>

        <ul className="fact-chips">
          <li>
            <TitleIcon name="book" tone="soft" />
            <span>Sigue los principios de la Ley 1581 de 2012 de protección de datos personales de Colombia.</span>
          </li>
          <li>
            <TitleIcon name="user" tone="soft" />
            <span>La aplicación es para personas mayores de 18 años.</span>
          </li>
          <li>
            <TitleIcon name="help" tone="soft" />
            <span>Si tienes preguntas, escríbele a la persona que administra este grupo de prueba.</span>
          </li>
        </ul>

        <p>
          <Link to="/">Volver al inicio</Link>
        </p>
      </div>
    </Page>
  )
}
