# Entreno

Aplicación web para centralizar los entrenamientos de un grupo pequeño (hasta 10 personas). Cada persona crea su cuenta, sube sus actividades y ve **solo sus propios datos**: carga de cada entrenamiento, forma física, métricas por deporte, metas y temporada.

- Deportes: ciclismo (ruta, MTB, gravel), running, natación y gimnasio.
- Funciona con y sin sensores (potenciómetro, banda o pulso de muñeca, o solo tiempo y distancia). Siempre dice con qué método calculó cada cosa.
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
6. [¿Y Strava? ¿Y Garmin?](#6-y-strava-y-garmin)
7. [Cómo se cumplen los requisitos de la fase 1](#7-cómo-se-cumplen-los-requisitos-de-la-fase-1)
8. [Para desarrolladores](#8-para-desarrolladores)

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

1. Entra a **https://console.cloud.google.com** → crea un proyecto (ej. `entreno`).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo **Externo**, nombre de la app y tu correo. En **Usuarios de prueba** agrega los correos de las personas del grupo (mientras la app esté «en prueba», solo ellas pueden entrar con Google).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **URI de redireccionamiento autorizados:** `https://abcdefghijklmnop.supabase.co/auth/v1/callback` (con tu Project ref).
   - Copia el **ID de cliente** y el **Secreto del cliente**.
4. En Supabase → **Authentication → Sign In / Providers → Google**: actívalo y pega el ID y el secreto. Guarda.

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

## 6. ¿Y Strava? ¿Y Garmin?

Verificado el **23/11/2026**:

- **Strava:** su API exige, desde el 1/06/2026, una **suscripción paga** para quien crea la app; las apps nuevas empiezan con 1 atleta y se suben a 10 sin revisión desde el panel. Su política **no permite guardar sus datos más de 7 días** ni usarlos (ni nada derivado) en IA. Por eso la app **no se conecta directamente a Strava**: usa la **exportación de la cuenta** de cada persona, que es suya, gratuita y no tiene esas restricciones.
  - La conexión directa quedó **preparada y apagada** (`supabase/functions/provider-strava`, `src/providers/index.ts`): la base de datos ya marca esos datos como caché de 7 días, no aptos para IA, y tiene la función de borrado automático.
  - Para activarla algún día: suscripción de Strava → crear la app en **https://www.strava.com/settings/api** (dominio de callback: `abcdefghijklmnop.supabase.co`) → en ese mismo panel subir la capacidad a 10 atletas → poner `STRAVA_ENABLED=true`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` y `STRAVA_VERIFY_TOKEN` en los secretos de Supabase → completar los pasos marcados `TODO`. Respetar las guías de marca (botón oficial «Connect with Strava», «Powered by Strava» y «Ver en Strava»).
- **Garmin:** el Garmin Connect Developer Program reabrió el 21/10/2026 con niveles *Personal* (solo tus datos), *Starter* (organizaciones, con aprobación, sin historial) y *Enterprise* (pago). La interfaz de proveedor está lista para conectar *Starter* cuando haya aprobación. Mientras tanto: exportación de Garmin Connect y archivos .FIT.

Fuentes: [Política de API de Strava](https://www.strava.com/legal/api_policy) · [Anuncio del programa de desarrolladores de Strava](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428) · [Límites de Strava](https://developers.strava.com/docs/rate-limits/) · [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/)

---

## 7. Cómo se cumplen los requisitos de la fase 1

| Requisito | Cómo | Prueba automática |
|---|---|---|
| Nadie ve datos de otro, ni manipulando la URL o las consultas | Row Level Security en todas las tablas; llaves compuestas para no colgar filas de filas ajenas; tokens y datos de salud sin escritura desde el navegador | `npm run test:db` (34 casos) y `npm run test:e2e` (URL ajena → «No encontramos esta página») |
| La misma actividad por dos vías aparece una sola vez | Mismo archivo (hash), mismo dispositivo o identificador; o deporte + inicio ±5 min + duración ±5 % + distancia ±3 %. Se conserva lo mejor de cada fuente y se puede deshacer («No son la misma actividad») | `src/core/dedupe/dedupe.test.ts`, `src/data/importer.test.ts` |
| Indicadores con y sin sensores, indicando el método | Potencia (TSS) → pulso (hrTSS o TRIMP) → esfuerzo percibido; con nivel de confianza; si falta el dato, lo dice | `src/core/load/load.test.ts` |
| Datos de salud cifrados y con consentimiento | AES-256-GCM en la Edge Function `health-crypto`; la base de datos rechaza guardarlos sin consentimiento vigente | `npm run test:db` |
| Exportar todo y borrar la cuenta | Ajustes → «Exportar mis datos» (.zip con JSON, CSV y series) y «Borrar mi cuenta» (Edge Function `account-delete`) | `npm run test:db` (borrado en cascada) |
| Accesibilidad y 360 px | WCAG 2.2 AA: contraste, etiquetas, teclado, foco visible, gráficas con tabla, estados con texto | `npm run test:e2e`: 0 problemas de axe en 14 pantallas, tema claro y oscuro, sin desbordes a 360 px |

**Cambios frente al pedido original (acordados):** sin conexión directa a Strava (ver sección 6); el criterio «llega sola desde Garmin» se reemplazó por «subir una actividad nueva toma menos de 1 minuto desde el celular».

**Fases siguientes:** el modelo de datos ya incluye pausas, bloques de temporada, enlace actividad–sesión planeada, laboratorio cifrado y preferencias de alimentación (lo único que en la fase 3 podrá recibir la IA, nunca datos de Strava).

---

## 8. Para desarrolladores

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
    units/ dates/ conversión de unidades y fechas (único lugar donde se formatea)
  data/         acceso a datos: Supabase o memoria (modo local/pruebas), importador, análisis
  providers/    proveedores de datos (archivos y manual activos; Strava y Garmin apagados)
  workers/      lectura de archivos en segundo plano (no congela la pantalla)
  demo/         generador de datos y archivos de prueba
  i18n/es-CO/   todos los textos (para otro idioma: copiar la carpeta y traducir)
supabase/
  migrations/   esquema SQL con RLS
  functions/    Edge Functions (health-crypto, account-delete, provider-strava apagada)
  tests/        pruebas de aislamiento entre usuarios
scripts/        test-db.sh, e2e-smoke.cjs
.github/workflows/  pruebas, publicación en Pages y configuración de Supabase
```
