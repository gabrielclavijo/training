# Reglas del plan de entrenamiento

Estas reglas son **las mismas para todas las personas**. El plan de cada una
cambia solo por sus datos: metas, tiempo disponible, días con piscina, pausas,
historial y «Tu fuerza». No hay reglas especiales por persona.
Los valores están en `src/core/planner/rules.ts`, `diagnosis.ts` y `season`.

## 1. Etapas
- **Base → Desarrollo → Disminución previa → Evento → Recuperación.**
- 3 semanas subiendo y 1 de descarga (≈ −35 %).
- La carga sube como máximo ~10 % por semana y la forma ≈ 5 puntos por semana.
- Nunca más que el tiempo disponible de cada día. Mínimo 1 día de descanso por semana.
- Las sesiones que no se hicieron no se recuperan doblando otras.

### Punto de partida, sesión larga e intensidad
- La primera sesión larga parte de **la más larga reciente** de la persona (30 min si no hay
  historial) y crece como máximo ~10 % por semana, y nunca más de un 10 % sobre la sesión más
  larga de las 3 semanas anteriores (también al cambiar de meta).
- **Bloques de carga:** cuando la semana ya usa todo el tiempo disponible, el bloque ondula
  (90 % → 95 % → 100 %) en vez de repetir semanas idénticas.
- **Tope de la sesión larga:** running 3 h, ciclismo 5,5 h, natación 2 h. Nunca se alarga para
  completar la carga semanal; el resto de la carga va a otras sesiones.
- **Principiante** (forma < 15): sin sesiones de calidad las primeras 3 semanas; después,
  máximo 1 por semana. Con **3 días de entreno o menos**, también máximo 1 por semana.
- La fuerza no reemplaza una sesión de resistencia si la semana queda con 3 o menos.

## 2. Varias metas (retos)
- Todas las metas aparecen en el calendario con sus días de evento, aunque
  caigan en la misma semana o con pocos días de diferencia.
- La **principal** tiene disminución previa de 10 días; la **secundaria**, de 4–5
  y se toma como parte del entrenamiento.
- **Mientras se prepara una secundaria y hay una principal después**, la base y el desarrollo
  siguen a la principal (deporte, disciplinas y salida larga). Ej.: IRONMAN principal con un
  maratón antes → las semanas de desarrollo mantienen natación, bici y running.
- Después de una meta, su recuperación **cede ante la preparación de la
  siguiente** si esta ya está cerca: el entrenamiento es acumulativo.
- Si hay poco tiempo entre metas, la temporada avisa y sugiere opciones.

## 3. Después de un evento
- **Descanso total:** 1 día (evento de un día) o 2 días (varios días).
- **Recuperación corta:** los 3 días siguientes (5 si fue de varios días),
  sesiones suaves de máximo 45 min que el volumen semanal no alarga.
- Si la siguiente meta está cerca, la activación previa se recupera más
  adelante en la semana.
- Recuperación total según el evento: 3–10 días (un día) o 7 + 2 por etapa,
  máximo 21 (por etapas).

## 4. Antes de un evento
- Dos días antes: activación corta. La víspera: muy suave (máx. 30 min).

## 5. Fuerza y core (activa por defecto; se puede apagar en «Tu fuerza»)
- Sesiones completas por semana: base y desarrollo 2, descarga y disminución 1,
  recuperación 1 (movilidad y core, 25 min), semana del evento 0.
- **Core corto (~20 min)** en días suaves: 2 por semana en base y desarrollo,
  1 en descarga y disminución, si hay tiempo ese día.
- **Toda rutina de fuerza lleva al menos 2 ejercicios de core**, intercalados.
- Nunca: la víspera de la salida larga, de un evento o de una clave de running;
  ni el día después de la larga; con al menos un día entre sesiones de fuerza.
- Sin fuerza en los 5 días antes de un evento ni en los 7 días después
  (10 si fue de varios días). Sin core en los 3 días antes de un evento ni
  en los 7 días después (10 si fue de varios días), igual que la fuerza.
- **Toda rutina termina con 5 min de movilidad y estiramientos** según el deporte
  (cadera, parte de atrás del muslo, pantorrilla, espalda alta, pecho); con molestia de
  rodilla, sin apoyar la rodilla; con molestia de hombro, sin estiramiento de pecho.
- La fuerza cuenta con carga reducida (~0,5 puntos por minuto) para no
  quitarle tiempo a la salida larga.
- Ejercicios según el lugar (casa/gimnasio), el equipo, la experiencia y las
  molestias (rodilla, espalda baja, hombro). Por deporte: ciclismo piernas y
  core; running una pierna, pantorrillas y saltos; natación espalda, hombros y
  core; triatlón una de piernas y otra de tronco y espalda.

## 6. Salud: lo que la app NO calcula
- **Lesión:** la pausa no programa entrenamientos y el regreso es solo una guía general. La app
  lo avisa en el formulario, en el Plan y en las sesiones del regreso: el plan exacto se ajusta a
  mano según el fisioterapeuta o médico.
- **Medicamentos que alteran el pulso:** no se usan zonas de pulso (solo esfuerzo percibido) y se
  avisa que el plan es una guía general que se ajusta con el médico.
- **Molestias en «Tu fuerza»:** solo se evitan ejercicios; la rutina avisa que no es rehabilitación.

## 7. Pausas
- Enfermedad o lesión: descanso y regreso gradual según los días parados.
- Viajes y vacaciones: solo lo que se pueda hacer, el tiempo que se pueda.

## 8. Cuándo se recalcula el plan
- Al cambiar metas, pausas, tiempo disponible o «Tu fuerza», cada semana, y
  cuando cambian estas reglas (versión del plan): el plan de todas las
  personas se recalcula solo desde hoy; lo ya hecho no cambia.
