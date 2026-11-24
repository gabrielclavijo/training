# Entreno

Aplicación web para centralizar los entrenamientos de un grupo pequeño (hasta 10 personas). Cada persona crea su cuenta, sube sus actividades y ve **solo sus propios datos**: carga de cada entrenamiento, forma física, métricas por deporte, metas y temporada.

- Deportes: ciclismo (ruta, MTB, gravel), running, natación y gimnasio.
- Funciona con y sin sensores (potenciómetro, banda o pulso de muñeca, o solo tiempo y distancia). Siempre dice con qué método calculó cada cosa.
- **Plan de entrenamiento adaptativo (fase 2):** diagnóstico por meta (vas bien, justo o atrasado, con tiempo estimado), plan semana a semana hasta cada meta, ajuste automático según lo que de verdad entrenaste y pausas (enfermedad, lesión, viajes) que reajustan toda la temporada. Todo con reglas de entrenamiento conocidas, sin IA, y con el aviso de que no reemplaza a un entrenador.
- **Alimentación, exámenes y recomendaciones (fase 3):** calorías y macronutrientes de cada día según tu plan (fórmulas), menú semanal con lista de mercado hecho por IA (Claude) con solo lo que escribes a mano, evolución de tus exámenes de laboratorio (cifrados, nunca a la IA) y hasta 3 recomendaciones por reglas en Inicio.
- Español de Colombia, sistema métrico, fechas día/mes/año y hora de Colombia.
- Hecha para el celular primero; también se ve bien en tablet y computador.

> **Nombre provisional:** «Entreno». Se cambia en `src/i18n/es-CO/base.json` (`app.name`) e `index.html`.

---

## Índice

1. [Probarla ya, sin configurar nada](#1-probarla-ya-sin-configurar-nada)
2. [Publicarla en GitHub Pages](#2-publicarla-en-github-pages)
3. [Conectarla a Supabase (cuentas reales)](#3-conectarla-a-supabase-cuentas-reales)
4. [Activar el inicio de sesión con Google](#4-activar-el-inicio-de-sesión-con-google)
5. [Invitar a las demás personas](#5-invitar-a-las-demás-personas)
6. [Conectar Strava (opcional)](#6-conectar-strava-opcional)
7. [Activar los menús con IA (opcional)](#7-activar-los-menús-con-ia-opcional)
8. [Cómo se cumplen los requisitos](#8-cómo-se-cumplen-los-requisitos-de-la-fase-1)
9. [Para desarrolladores](#9-para-desarrolladores)

---

## 1. Probarla ya, sin configurar nada

Mientras la app no esté conectada a Supabase, funciona en **modo local de prueba**:

1. Abre **https://gabrielclavijo.github.io/training/** (ver el paso 2 si todavía no abre).
2. Toca **«Probar en modo local»**.
3. Completa tus datos básicos y, en el paso 3, toca **«Cargar datos de prueba»**.

En modo local todo funciona (subir archivos, duplicados, forma física, metas…), pero **los datos quedan solo en ese navegador**. Para que cada persona tenga su cuenta, sigue el paso 3.

---

## 2. Publicarla en GitHub Pages

Cada vez que hay cambios en la rama `main`, GitHub compila la app y la deja en la rama `gh-pages` (lo hace solo, con el archivo `.github/workflows/deploy.yml`).

La primera vez hay que decirle a GitHub que publique esa rama:

1. En GitHub, abre el repositorio → **Settings** (Configuración) → **Pages**.
2. En **Source** elige **«Deploy from a branch»**.
3. En **Branch** elige **`gh-pages`** y la carpeta **`/ (root)`**. Toca **Save**.
4. Espera 1–2 minutos. La dirección será **https://gabrielclavijo.github.io/training/**.

Si en algún momento no se actualiza: pestaña **Actions** → **«Publicar en GitHub Pages»** → **Run workflow**.

---

## 3. Conectarla a Supabase (cuentas reales)

Supabase es el servicio (gratuito para este uso) que guarda las cuentas y los datos. La seguridad entre personas la hace la base de datos: cada fila tiene dueño y nadie puede leer las de otro, ni siquiera cambiando la dirección o las consultas.

### 3.1 Crear el proyecto

1. Entra a **https://supabase.com** y crea una cuenta (puedes usar GitHub).
2. **New project**:
   - **Name:** `entreno` (o el que quieras).
   - **Database password:** toca **Generate a password** y **guárdala** (la necesitarás en 3.3).
   - **Region:** *South America (São Paulo)* es la más cercana a Colombia.
   - Plan **Free**.
3. Espera a que el proyecto termine de crearse.

### 3.2 Copiar tres datos

En Supabase, dentro del proyecto:

- **Project Settings → General → Project ID**: algo como `abcdefghijklmnop`. Es el **Project ref**.
- **Project Settings → API** (o **API Keys**):
  - **Project URL**: `https://abcdefghijklmnop.supabase.co`
  - **Publishable key** (o *anon public key*): empieza por `sb_publishable_` o `eyJ…`. **Es pública**: está bien que vaya en la app.
  - ⚠️ **Nunca** copies la *secret key* / *service_role key* en GitHub ni en la app.

Y crea un token para que GitHub pueda configurar Supabase por ti:

- Arriba a la derecha, tu foto → **Account preferences → Access Tokens → Generate new token**. Nómbralo `github` y copia el token.

### 3.3 Darle esos datos a GitHub

En GitHub: repositorio → **Settings → Secrets and variables → Actions**.

En la pestaña **Secrets** → **New repository secret**, crea:

| Nombre | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | el token del paso anterior |
| `SUPABASE_DB_PASSWORD` | la contraseña de la base de datos (3.1) |

En la pestaña **Variables** → **New repository variable**, crea:

| Nombre | Valor |
|---|---|
| `SUPABASE_PROJECT_REF` | el Project ref (ej. `abcdefghijklmnop`) |
| `VITE_SUPABASE_URL` | la Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la Publishable key |

### 3.4 Dejar que GitHub configure todo

1. Pestaña **Actions** → **«Configurar Supabase»** → **Run workflow**.
   Esto crea las tablas con su seguridad, genera la **clave de cifrado** de los datos de salud (solo la primera vez; queda guardada en Supabase) y publica las funciones del servidor.
2. Luego **Actions** → **«Publicar en GitHub Pages»** → **Run workflow**, para que la app tome los datos de Supabase.

> ⚠️ No cambies ni borres el secreto `HEALTH_ENCRYPTION_KEY` en Supabase: sin él no se pueden leer los datos de salud ya guardados.

### 3.5 Direcciones permitidas para iniciar sesión

En Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://gabrielclavijo.github.io/training/`
- **Redirect URLs** → **Add URL:** `https://gabrielclavijo.github.io/training/**`
  (y, si vas a probar en tu computador, también `http://localhost:5173/**`).

Con esto ya funciona **crear cuenta con correo y contraseña**. Supabase envía el correo de confirmación.

> El correo que trae Supabase de fábrica permite muy pocos envíos por hora. Para 10 personas suele bastar; si alguien no recibe el correo, espera una hora o configura un SMTP propio en **Authentication → Emails → SMTP Settings**.

---

## 4. Activar el inicio de sesión con Google

Solo necesitas **tu cuenta de Google** (no hace falta pagar ni poner tarjeta). El botón «Continuar con Google» aparece en la app únicamente cuando terminas estos pasos.

1. Entra a **https://console.cloud.google.com** con tu cuenta de Google y acepta los términos si es la primera vez.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `entreno` → **Crear**. Asegúrate de que quede seleccionado.
3. Menú ☰ → **APIs y servicios → Pantalla de consentimiento de OAuth** (o **Google Auth Platform → Branding**):
   - Nombre de la app: `Entreno`. Correo de asistencia: el tuyo.
   - Tipo de usuario / Público: **Externo**.
   - Correo de contacto del desarrollador: el tuyo → **Guardar**.
   - En **Usuarios de prueba** (o **Público → Test users**) agrega los correos de Gmail de las personas del grupo, incluido el tuyo. Mientras la app esté «en prueba», solo ellas pueden entrar con Google (hasta 100).
4. **APIs y servicios → Credenciales** (o **Clientes**) → **Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**. Nombre: `Entreno web`.
   - **URI de redireccionamiento autorizados → Agregar URI:** `https://TU-PROJECT-ID.supabase.co/auth/v1/callback` (cambia `TU-PROJECT-ID` por tu Project ID de Supabase).
   - **Crear** y copia el **ID de cliente** y el **Secreto del cliente**.
5. En Supabase → **Authentication → Sign In / Providers → Google**: actívalo, pega el ID de cliente y el secreto → **Save**.
6. En GitHub → **Settings → Secrets and variables → Actions → Variables → New repository variable**: nombre `VITE_GOOGLE_LOGIN`, valor `true`.
7. **Actions → «Publicar en GitHub Pages» → Run workflow.** Al terminar, aparece el botón de Google.

El secreto de Google queda solo en Supabase; nunca en la app ni en GitHub.

---

## 5. Invitar a las demás personas

1. Comparte la dirección **https://gabrielclavijo.github.io/training/**.
2. Cada persona crea su cuenta (Google o correo), completa sus datos básicos y sube sus actividades siguiendo **«Guías»** dentro de la app:
   - **Historial completo:** la exportación de su cuenta de Strava («Descargar tu cuenta», desde el computador) o de Garmin Connect. Se sube el .zip tal cual.
   - **Actividades nuevas:** «Exportar original» desde Strava o Garmin Connect y subir el archivo (menos de 1 minuto desde el celular).
   - **Gimnasio o sin reloj:** «Registrar a mano».
3. Para explorar con los datos de prueba, crea una cuenta aparte (por ejemplo, con otro correo) y usa **Ajustes → Cargar datos de prueba**. Se borran con un clic.

**Bueno saberlo (plan gratuito de Supabase):**
- Si nadie usa la app durante **7 días**, Supabase pausa el proyecto. Se reactiva desde el panel de Supabase con **Restore project**.
- Límites: 500 MB de base de datos y 1 GB de archivos. Para cuidarlos, las series detalladas (pulso, GPS) solo se guardan para los últimos 12 meses; de lo anterior queda el resumen y lo necesario para los cálculos.

---

## 6. Conectar Strava (opcional)

Con esto, cada persona toca «Connect with Strava» una vez y **sus actividades nuevas llegan solas** (Garmin → Strava → app). Requisitos de Strava (verificados el 23/11/2026):

- Quien crea la app (tú) debe tener **suscripción de Strava**.
- Las apps nuevas arrancan con capacidad para 1 atleta; se sube a **10 sin revisión** desde el panel.
- Lo que llega de Strava se guarda **solo 7 días** y **nunca se usa con IA** (la app lo cumple sola: se borra automáticamente y la base de datos impide marcarlo para IA). Para conservar una actividad en el historial, la persona sube también su archivo o la exportación de su cuenta; la app no la duplica.

### 6.1 Crear la app en Strava

1. Con tu cuenta (la de suscripción), entra a **https://www.strava.com/settings/api**.
2. Llena el formulario:
   - **Application Name:** `Entreno`
   - **Category:** `Training`
   - **Website:** `https://gabrielclavijo.github.io/training/`
   - **Authorization Callback Domain:** `gabrielclavijo.github.io` (solo el dominio, sin `https://` ni rutas)
   - Sube un ícono (cualquier imagen cuadrada) y acepta los términos → **Create**.
3. Copia el **Client ID** (un número) y el **Client Secret** (toca *show*).
4. En esa misma página, busca **Athlete Capacity** y súbela a **10**.

### 6.2 Darle los datos a GitHub

En **Settings → Secrets and variables → Actions**:

| Pestaña | Nombre | Valor |
|---|---|---|
| Variables | `STRAVA_CLIENT_ID` | el Client ID |
| Secrets | `STRAVA_CLIENT_SECRET` | el Client Secret |

### 6.3 Activarlo

1. **Actions → «Configurar Supabase» → Run workflow.** Publica las funciones de Strava y registra el **webhook** (el aviso automático de actividades nuevas). Debe terminar con «Webhook de Strava activo».
2. **Actions → «Publicar en GitHub Pages» → Run workflow.**
3. Logos oficiales (las guías de marca de Strava lo exigen): descarga el paquete de **https://developers.strava.com/guidelines**, y en GitHub → carpeta `public/brand/strava/` → **Add file → Upload files** sube estos dos archivos con **exactamente** estos nombres:
   - `btn_strava_connect_with_orange.svg` (botón «Connect with Strava» naranja)
   - `api_logo_pwrdBy_strava_horiz_orange.svg` (logo «Powered by Strava» horizontal naranja)

   Mientras no estén, la app muestra una versión en texto.
4. Prueba: en la app, **Más → Importación → Connect with Strava** → autoriza (deja marcada «Ver datos de tus actividades»). Vuelves a la app y trae las actividades de los últimos 7 días.

Cada persona del grupo hace solo el paso 4. Si alguien con cuenta gratuita de Strava no logra conectar, avísame: la política de Strava no es del todo clara sobre si la suscripción del creador basta.

### Garmin

El Garmin Connect Developer Program reabrió el 21/10/2026 (niveles *Personal*, *Starter* y *Enterprise*). La interfaz de proveedor está lista para conectar *Starter* cuando Garmin lo apruebe. Mientras tanto: Garmin → Strava (automático) o la exportación de Garmin Connect.

Fuentes: [Política de API de Strava](https://www.strava.com/legal/api_policy) · [Anuncio del programa de desarrolladores de Strava](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428) · [Límites de Strava](https://developers.strava.com/docs/rate-limits/) · [Guías de marca de Strava](https://developers.strava.com/guidelines/) · [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/)

---

## 7. Activar los menús con IA (opcional)

Los menús de la sección **Alimentación** los arma Claude (Anthropic). Todo lo demás (cálculo de calorías, exámenes, recomendaciones) funciona sin esto.

1. Entra a **https://console.anthropic.com**, crea la cuenta y en **Billing** recarga saldo (el mínimo suele ser 5 USD). Con 10 personas y un menú por semana cada una, el gasto es de unos 4 USD al mes con el modelo Claude Opus 5.5.
2. Opcional pero recomendado: en **Billing → Limits** pon un límite mensual (por ejemplo, 10 USD).
3. En **API keys → Create key**, nómbrala `entreno` y cópiala (empieza por `sk-ant-`; solo se muestra una vez).
4. En GitHub → **Settings → Secrets and variables → Actions → Secrets → New repository secret**: nombre `ANTHROPIC_API_KEY`, valor la clave.
5. **Actions → «Configurar Supabase» → Run workflow.** El paso «Menús con IA» debe decir «Clave de la IA guardada en Supabase».

No hace falta volver a publicar la app. Límite por persona: 3 menús y 15 cambios de plato al día.

**Qué recibe la IA:** el perfil de alimentación (objetivo, tipo de alimentación, alergias e intolerancias de comida, alimentos que no come o tiene en casa, comidas al día, tiempo de cocina y presupuesto) y, por día, calorías, macronutrientes y tipo/duración de la sesión planeada. Nunca actividades, datos de Strava, exámenes, nombre ni correo. La función lee el perfil de la base de datos y descarta cualquier otro campo (`supabase/functions/_shared/menu.ts`, probado en `src/core/nutrition/menuPayload.test.ts`). En la app, «Lo que se envió a la IA» muestra el contenido exacto.

---

## 8. Cómo se cumplen los requisitos de la fase 1

| Requisito | Cómo | Prueba automática |
|---|---|---|
| Nadie ve datos de otro, ni manipulando la URL o las consultas | Row Level Security en todas las tablas; llaves compuestas para no colgar filas de filas ajenas; tokens y datos de salud sin escritura desde el navegador | `npm run test:db` (34 casos) y `npm run test:e2e` (URL ajena → «No encontramos esta página») |
| La misma actividad por dos vías aparece una sola vez | Mismo archivo (hash), mismo dispositivo o identificador; o deporte + inicio ±5 min + duración ±5 % + distancia ±3 %. Se conserva lo mejor de cada fuente y se puede deshacer («No son la misma actividad») | `src/core/dedupe/dedupe.test.ts`, `src/data/importer.test.ts` |
| Indicadores con y sin sensores, indicando el método | Potencia (TSS) → pulso (hrTSS o TRIMP) → esfuerzo percibido; con nivel de confianza; si falta el dato, lo dice | `src/core/load/load.test.ts` |
| Datos de salud cifrados y con consentimiento | AES-256-GCM en la Edge Function `health-crypto`; la base de datos rechaza guardarlos sin consentimiento vigente | `npm run test:db` |
| Exportar todo y borrar la cuenta | Ajustes → «Exportar mis datos» (.zip con JSON, CSV y series) y «Borrar mi cuenta» (Edge Function `account-delete`) | `npm run test:db` (borrado en cascada) |
| Accesibilidad y 360 px | WCAG 2.2 AA: contraste, etiquetas, teclado, foco visible, gráficas con tabla, estados con texto | `npm run test:e2e`: 0 problemas de axe en 14 pantallas, tema claro y oscuro, sin desbordes a 360 px |

**Cambios frente al pedido original (acordados):** sin conexión directa a Strava (ver sección 6); el criterio «llega sola desde Garmin» se reemplazó por «subir una actividad nueva toma menos de 1 minuto desde el celular».

### Fase 2

| Requisito | Cómo | Prueba automática |
|---|---|---|
| Diagnóstico por meta | Forma recomendada según duración, desnivel y objetivo vs. forma proyectada con un aumento seguro, la disponibilidad y las pausas; tiempo estimado con tus salidas largas | `src/core/planner/planner.test.ts`, `src/data/planService.test.ts` |
| Plan semana a semana | Base → desarrollo → disminución → evento → recuperación; 3 semanas subiendo y 1 de descarga; subida ≤ 10 %; ≥ 1 descanso por semana; combina tus deportes; días seguidos para carreras por etapas | Caso de prueba completo (Gravel + Vuelta + viaje de la semana 7) |
| Ajuste automático | Planeado vs. hecho (hecha, parcial, más dura, no hecha); exceso de fatiga → días suaves; sesiones falladas no se recuperan doblando; cada cambio queda explicado | `planner.test.ts` |
| Pausas | Enfermedad/lesión: descanso y regreso gradual según los días parados. Viajes: solo lo disponible, el tiempo disponible. Reajustan toda la temporada | `planService.test.ts` |
| Strava | Conexión con OAuth en Edge Function, webhook (crear/editar/borrar/revocar), sincronización de respaldo, caché de 7 días, nunca para IA | `src/data/stravaInbox.test.ts`, `npm run test:db` |

### Fase 3

| Requisito | Cómo | Prueba automática |
|---|---|---|
| Recomendaciones por reglas | 12 reglas (fatiga, subida de carga, semanas sin descarga, sesiones no hechas, salida larga y desnivel frente a la meta, pulso en reposo, peso, exámenes fuera de rango, datos que faltan); máximo 3 en Inicio, con el porqué y «Entendido / No aplica» (7 días) | `src/core/recommendations/rules.test.ts` |
| Calorías y macronutrientes sin IA | Mifflin-St Jeor + MET de la sesión planeada; carbohidratos según el tipo de día; comida e hidratación antes, durante y después | `src/core/nutrition/needs.test.ts` |
| Menús con IA solo con datos manuales | Edge Function `nutrition-menu` (Claude Opus 5.5, salida estructurada); el perfil se lee en el servidor; lista blanca de campos; límite diario; nunca datos de Strava | `menuPayload.test.ts`, `npm run test:db` (el navegador no puede escribir menús ni su uso de IA) |
| Evolución de exámenes | Cifrados en `health_records` con consentimiento; rango del laboratorio o general; gráfica y tabla; nunca a la IA | `src/core/labs/catalog.test.ts` |

---

## 9. Para desarrolladores

```bash
npm install
npm run dev          # http://localhost:5173 (sin .env.local entra en modo local)
npm test             # pruebas del núcleo (lectores, duplicados, carga, forma, temporada, importación)
npm run test:db      # esquema + RLS en un Postgres local desechable (necesita PostgreSQL 15+)
npm run build && npx vite preview --port 4173 &
npm run test:e2e     # recorrido completo con Playwright + axe
```

Para usar un Supabase real en local, copia `.env.example` como `.env.local` y llena los valores.

### Estructura

```
src/
  app/          enrutador, diseño general (navegación), tema claro/oscuro/sistema
  features/     una carpeta por pantalla o funcionalidad (auth, onboarding, activities, upload,
                import, dashboard, metrics, goals, season, guides, glossary, profile, settings, legal)
  core/         lógica pura y probada, sin React:
    parsers/      .FIT (SDK oficial de Garmin), .GPX, .TCX, exportaciones de Strava y Garmin
    activity/     resumen de una grabación (distancia, desnivel, potencia normalizada, histogramas)
    dedupe/       detección y fusión de duplicados
    load/         carga por entrenamiento (TSS, hrTSS, TRIMP, esfuerzo percibido)
    fitness/      forma crónica, fatiga, estado de forma, carga semanal
    season/       bloques de temporada y avisos entre metas
    planner/      zonas, diagnóstico, generador del plan y ajuste automático (fase 2)
    nutrition/    calorías, macronutrientes e hidratación por día (fase 3)
    labs/         catálogo de exámenes y rangos de referencia (fase 3)
    recommendations/ reglas de recomendación (fase 3)
    units/ dates/ conversión de unidades y fechas (único lugar donde se formatea)
  data/         acceso a datos: Supabase o memoria (modo local/pruebas), importador, análisis
  providers/    proveedores de datos (archivos y manual activos; Strava y Garmin apagados)
  workers/      lectura de archivos en segundo plano (no congela la pantalla)
  demo/         generador de datos y archivos de prueba
  i18n/es-CO/   todos los textos (para otro idioma: copiar la carpeta y traducir)
supabase/
  migrations/   esquema SQL con RLS
  functions/    Edge Functions (health-crypto, account-delete, nutrition-menu, strava-connect,
                strava-webhook, strava-sync, strava-disconnect)
  tests/        pruebas de aislamiento entre usuarios
scripts/        test-db.sh, e2e-smoke.cjs
.github/workflows/  pruebas, publicación en Pages y configuración de Supabase
```
