# Sistema de agentes de QA (personas simuladas)

Agentes que recorren Entreno como personas reales y revisores expertos que evalúan los planes que
esas personas generan. Detectan **errores técnicos** (bugs, datos perdidos, pantallas rotas,
cálculos incorrectos) y **errores de contenido** (cargas incoherentes, progresiones irreales,
ejercicios inadecuados, falta de adaptación al perfil). Un consolidador cruza todo en un informe
único, priorizado por **riesgo para la salud** y luego por **impacto en la experiencia**.

Código: `scripts/qa/sistema/` · Ejecutar: `npm run qa:sistema` (ver «Ejecución»).

## 1. Arquitectura

```
personas.cjs ── datos simulados de 5 usuarios + 4 expertos
lib.cjs ─────── navegador aislado por agente, registro de hallazgos, revisión UX en cada pantalla
usuarios.cjs ── flujos: registro → perfil → tiempo/fuerza → seguimiento → metas → cambios → plan → salir/volver
expertos.cjs ── deportólogo, entrenador y fisiatra leen el plan que la app generó para cada usuario
consolidar.cjs  cruce de hallazgos, priorización e informe
run.cjs ─────── orquestador: usuarios en paralelo → expertos → informe
```

- **Fuente de verdad para los expertos:** el estado que la app guarda (modo local) más el texto de
  cada sesión y rutina que el usuario abrió. Los expertos juzgan con **criterios profesionales
  propios**, no con las reglas de la app, para poder detectar reglas mal pensadas.
- **El experto UX** no recorre por separado: acompaña a cada usuario y revisa cada pantalla que
  abre (así evalúa los flujos reales de cada perfil).

## 2. Seguridad y aislamiento

- Solo corre contra un **build local sin Supabase** («Probar en modo local»). Si la app no ofrece
  ese modo (producción), el orquestador **se detiene sin hacer nada**.
- Cada agente tiene su propio navegador (almacenamiento, sesión y datos separados), nombre
  «QA-…» y datos inventados.
- Toda petición fuera de `localhost` se bloquea y se reporta (Supabase, IA, Strava).
- No se toca producción, cuentas reales ni planes de usuarios.

## 3. Agentes usuarios

Comunes a todos: registro (onboarding), perfil, tiempo disponible, «Tu fuerza», metas, revisión del
plan (Semana/Mes, 6 semanas de sesiones abiertas), seguimiento, modificación, **cierre de sesión y
regreso** (los datos deben seguir).

| Agente | Objetivo | Datos de entrada | Comportamiento y flujos propios |
|---|---|---|---|
| **Usuario normal** (QA-Normal) | Que alguien sin experiencia cree su primer plan sin errores y el plan sea prudente | 34 años, sin historial, 3 días × 30–45 min, meta 5K en 10 semanas, sin equipo | Se equivoca al escribir (vacíos, «cinco»), consulta Ayuda y Glosario, registro diario «Mal / Dormí mal» |
| **Deportista** (QA-Deportista) | Precisión y progresión con experiencia | 31 años, historial cargado, FC reposo 46 / máx 191 / umbral 172, FTP 300, gimnasio, gran fondo + vuelta de 3 días | Datos fisiológicos, **cambia la fecha** de una meta y verifica que el evento se mueve |
| **Intensidad alta** (QA-Alta) | Que el plan proteja la recuperación aunque pida mucho | 27 años, historial, 7 días con 2–6 h, piscina L/X/V, IRONMAN + maratón + media a 2 días | Disponibilidad todos los días, metas casi seguidas, objetivos exigentes |
| **Intensidad media** (QA-Media) | Uso constante durante semanas y continuidad de datos | 43 años, 6 actividades a mano, 5 días, mancuernas 8 kg y bandas, 10K + media maratón | Registra actividades, **pausa por viaje**, cierra sesión y vuelve |
| **Intensidad baja** (QA-Baja) | Adaptación a edad, molestias, medicamento y lesión | 68 años, rodilla y espalda baja, betabloqueador, 4 días × 30–45 min, ciclismo suave 25 km | Registra medicamento que altera el pulso, **pausa por lesión**, revisa rutinas con molestias |

## 4. Revisores expertos

| Experto | Objetivo | Criterios (error de contenido salvo que se indique) | Se detiene y consulta a una persona si… |
|---|---|---|---|
| **Médico deportólogo** | Seguridad, cargas, contraindicaciones, coherencia fisiológica | Pulsaciones con medicamento que altera el pulso (**crítica**); entrenamiento dentro de una pausa por enfermedad o lesión (**crítica**); sin aviso de que el plan no es exacto con medicamentos; volumen semanal +20 % o más; intensidad alta a los 65+ sin valoración; más de 5 días/semana a los 65+; intensidad en las 3 primeras semanas sin historial; semana sin descanso; sesión de entreno > 3 h corriendo, > 6 h en bici, > 2,5 h nadando; semana de carrera más pesada que la disminución | hay condición médica, embarazo, exámenes fuera de rango o la persona tiene < 18 años |
| **Entrenador** | Progresión, periodización, variedad, especificidad | Meta sin evento en el plan (técnico); > 5 semanas de carga sin descarga; larga que crece > 15 % sobre la mayor de las 3 semanas anteriores; > 40 % de sesiones fuertes con ≤ 4 días; 4 semanas de desarrollo idénticas; meta principal sin disminución previa; triatlón sin las 3 disciplinas en desarrollo (salvo semanas con pausa); natación en días sin piscina | el cambio sube cargas en principiantes, mayores o lesionados |
| **Fisiatra** | Lesiones, movilidad, rehabilitación, ejercicios inadecuados | Ejercicios que cargan la zona con molestia (rodilla: zancadas, saltos, prensa, extensiones…; espalda baja: peso muerto, swing, superman, hiperextensiones…; hombro: flexiones, press, dominadas, jalón…); saltos a los 65+; rutina con molestia sin aviso de que no es rehabilitación; regreso de lesión con > 4 sesiones la 1ª semana o intensidad en 2 semanas; sesiones de regreso sin aviso; entreno el día después de un evento; fuerza 7 días después de un evento largo (3 tras uno corto); rutinas sin movilidad (mejora) | hay lesión o dolor: nunca propone cargas, solo señala |
| **Experto UX/UI** | Navegación, claridad, accesibilidad, flujos | Accesibilidad WCAG 2.2 AA (axe); pantalla que se sale del ancho; sin título principal; áreas de toque < 44 px; textos < 12 px; error de campo sin mensaje; pantalla vacía; tarea común > 20 s; números inválidos («NaN», «undefined») (técnico) | — |

Los agentes usuarios reportan además, como **errores técnicos**: pasos que no se completan,
errores de JavaScript o de consola, datos válidos rechazados, metas que no se guardan, eventos que
no aparecen o no se mueven, sesiones que no se encuentran, datos perdidos al salir y volver,
peticiones externas.

## 5. Formato de cada hallazgo

```json
{
  "agente": "Fisiatra", "tipoAgente": "experto", "persona": "QA-Baja",
  "categoria": "técnico | contenido | ux",
  "severidad": "crítica | alta | media | baja",
  "riesgoSalud": 0-3, "impactoUX": 0-3,
  "titulo": "…", "clave": "cont:ejercicio-contra-knee",
  "pasos": ["…"], "esperado": "…", "obtenido": "…",
  "evidencia": { "url": "…", "captura": "archivo.png", "datos": "…" }
}
```

Severidad: **crítica** = daño probable a la salud o pérdida de datos · **alta** = riesgo de lesión,
flujo roto o dato incorrecto importante · **media** = contenido cuestionable o fricción clara ·
**baja** = mejora o detalle.

## 6. Consolidación (informe único)

1. **Misma clave = mismo problema:** se fusionan los reportes de distintos agentes y personas
   (p. ej. el usuario no encuentra su evento y el entrenador no lo ve en el plan).
2. **Confirmación:** más agentes y más personas → más prioridad.
3. **Sistémico:** si aparece en 2+ personas, es una regla general rota.
4. **Escalamiento:** con riesgo para la salud (≥ 2) confirmado por 2+ expertos sube un nivel.
5. **Orden:** riesgo para la salud → severidad → impacto en la experiencia → confirmación.
   `prioridad = riesgoSalud×100 + severidad×10 + impactoUX×5 + (agentes−1)×3 + (personas−1)×2`.

Salida en `qa-out/sistema/`: `informe.md`, `consolidado.json`, `hallazgos.json` (crudo),
`bitacora.txt`, `casos.json` (evidencia) y capturas.

## 7. Ejecución

```bash
npm run build
npx vite preview --port 4173
APP_URL=http://localhost:4173/ npm run qa:sistema      # todos (≈ 1 min)
AGENTES=normal,baja APP_URL=http://localhost:4173/ npm run qa:sistema
```

## 8. Límites

- Revisa reglas verificables; no reemplaza el juicio de profesionales reales: los hallazgos de
  salud deben validarse con ellos antes de cambiar la app.
- No cubre lo que el modo local no tiene: entrar con Google, Strava, menú con IA, exportar/borrar
  cuenta en el servidor (requiere un Supabase de pruebas separado).
- Personas inventadas y fijas; ampliar el catálogo en `personas.cjs` para nuevos casos.
