import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/ui/Page'

// Texto en español de Colombia. Para otro idioma se agregaría un componente
// equivalente por idioma (los textos largos no van en el JSON de i18n).
export function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('privacy.title')}>
      <article className="card prose">
        <p className="muted">Última actualización: 25/11/2026 · Versión 3</p>

        <h2>En pocas palabras</h2>
        <ul>
          <li>Tus datos son tuyos. Solo tú los ves; nadie más del grupo puede verlos.</li>
          <li>No vendemos ni compartimos tus datos con nadie.</li>
          <li>Puedes descargar todo lo que guardaste y borrar tu cuenta cuando quieras.</li>
          <li>Los datos de salud (medicamentos, alergias, exámenes) solo se guardan si das tu permiso, y van cifrados.</li>
          <li>Si pides un menú, a la inteligencia artificial solo le llega tu perfil de alimentación y las calorías de cada día. Nunca tus entrenamientos, tus datos de Strava ni tus exámenes.</li>
        </ul>

        <h2>Qué guardamos</h2>
        <ul>
          <li><strong>Cuenta:</strong> tu correo y, si entras con Google, tu nombre.</li>
          <li><strong>Perfil:</strong> fecha de nacimiento, sexo (solo para las fórmulas), estatura, peso y los datos fisiológicos que quieras registrar (pulso, FTP, ritmos).</li>
          <li><strong>Entrenamientos:</strong> los archivos que subes (.FIT, .GPX, .TCX o exportaciones de Strava y Garmin) convertidos en un resumen: deporte, hora, duración, distancia, desnivel, pulso, potencia y, de los últimos 12 meses, el recorrido y las series de datos. El archivo original no se guarda.</li>
          <li><strong>Metas y temporada:</strong> lo que escribas sobre tus eventos.</li>
          <li><strong>Alimentación:</strong> tu perfil de alimentación (objetivo, tipo de alimentación, alergias e intolerancias de comida, alimentos que no comes o tienes en casa, comidas al día, tiempo de cocina y presupuesto) y los menús que pidas.</li>
          <li><strong>Datos de salud (opcional):</strong> medicamentos que alteran el pulso, alergias y resultados de laboratorio (fecha, valor, unidad y rango).</li>
        </ul>

        <h2>Para qué los usamos</h2>
        <p>
          Solo para mostrarte tus entrenamientos, calcular tu forma física, ayudarte a planear tus metas y tu
          alimentación. Los cálculos los hace la aplicación con fórmulas conocidas.
        </p>

        <h2>Datos de salud</h2>
        <p>
          Antes de guardar cualquier dato médico te pedimos un permiso explícito. Esos datos se guardan cifrados: en
          la base de datos solo queda un texto ilegible. Puedes retirar el permiso y borrarlos cuando quieras. La
          aplicación no interpreta ni diagnostica tus exámenes.
        </p>

        <h2>Inteligencia artificial</h2>
        <p>
          Las recomendaciones, el plan y los cálculos de calorías los hace la aplicación con reglas y fórmulas, sin
          inteligencia artificial. La IA solo se usa cuando tú tocas «Generar menú de la semana» u «Otra opción», en la
          sección Alimentación.
        </p>
        <ul>
          <li>
            <strong>Qué se envía:</strong> tu perfil de alimentación tal como lo escribiste y, para cada día, las calorías,
            los gramos de proteína, carbohidratos y grasa, y el tipo y la duración de la sesión planeada (por ejemplo,
            «ciclismo, larga, 240 min»). En la misma pantalla puedes ver exactamente lo que se envió.
          </li>
          <li>
            <strong>Qué nunca se envía:</strong> tus actividades, recorridos, pulso o potencia; nada que venga de Strava o
            Garmin; tus exámenes, medicamentos u otros datos de salud; tu nombre, correo, edad o peso.
          </li>
          <li>
            <strong>Quién lo procesa:</strong> Anthropic (el modelo Claude), a través de su servicio para desarrolladores.
            Según sus condiciones, no usa lo que se le envía por ese servicio para entrenar sus modelos. La solicitud se
            hace desde nuestro servidor, nunca desde tu navegador.
          </li>
          <li>
            <strong>Para qué:</strong> solo para armar tu menú y tu lista de mercado. El menú queda guardado en tu cuenta
            y lo puedes borrar cuando quieras.
          </li>
        </ul>

        <h2>Conexión con Strava (opcional)</h2>
        <p>
          Si conectas tu cuenta de Strava, la app recibe tus actividades nuevas. Por las reglas de Strava, esos datos se
          guardan como máximo 7 días, solo tú los ves y nunca se usan con inteligencia artificial. Al desconectar Strava
          se borra todo lo que llegó desde allá.
        </p>

        <h2>Dónde se guardan</h2>
        <p>
          En Supabase, un servicio de base de datos en la nube. Cada fila está protegida para que solo tu cuenta
          pueda leerla o cambiarla.
        </p>

        <h2>Tus derechos</h2>
        <ul>
          <li><strong>Ver y corregir:</strong> todo lo que guardas lo puedes ver y editar en la aplicación.</li>
          <li><strong>Descargar:</strong> en Ajustes → «Exportar mis datos» recibes un archivo con todo.</li>
          <li><strong>Borrar:</strong> en Ajustes → «Borrar mi cuenta» se elimina tu cuenta y todo su contenido, sin posibilidad de recuperarlo.</li>
        </ul>
        <p>
          Esta política sigue los principios de la Ley 1581 de 2012 de protección de datos personales de Colombia.
        </p>

        <h2>Edad</h2>
        <p>La aplicación es para personas mayores de 18 años.</p>

        <h2>Contacto</h2>
        <p>Si tienes preguntas, escríbele a la persona que administra este grupo de prueba.</p>

        <p>
          <Link to="/">Volver al inicio</Link>
        </p>
      </article>
    </Page>
  )
}
