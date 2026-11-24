// Prueba de punta a punta en modo local: onboarding, datos de prueba, todas las
// pantallas a 360 px (solo tema claro) con axe (WCAG 2.2 AA) y URL ajena.
// Uso: npm run build && npx vite preview --port 4173 & npm run test:e2e
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const out = process.env.SHOTS_DIR || require('os').tmpdir() + '/';
const base = process.env.APP_URL || 'http://localhost:4173/';
async function makeUploadFiles() {
  const fs = require('fs'), path = require('path'), os = require('os');
  const root = path.resolve(__dirname, '..');
  const { Encoder, Profile } = await import(path.join(root, 'node_modules/@garmin/fitsdk/src/index.js'));
  const { zipSync, gzipSync, strToU8 } = await import(path.join(root, 'node_modules/fflate/esm/index.mjs'));
  const fit = (start, secs, km) => {
    const e = new Encoder();
    e.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 77, timeCreated: start });
    for (let i = 0; i <= secs; i++) e.writeMesg({ mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(start.getTime() + i * 1000), heartRate: 130 + (i % 20), distance: (km * 1000 * i) / secs });
    e.writeMesg({ mesgNum: Profile.MesgNum.SESSION, timestamp: new Date(start.getTime() + secs * 1000), startTime: start, sport: 'cycling', subSport: 'road', totalElapsedTime: secs, totalTimerTime: secs, totalDistance: km * 1000 });
    return e.close();
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const a = path.join(dir, 'salida.fit');
  // Fechas recientes (hace unas horas) para que aparezcan arriba en la lista
  const h = 3600 * 1000, now = Math.floor(Date.now() / 1000) * 1000;
  fs.writeFileSync(a, fit(new Date(now - 4 * h), 3600, 30));
  const d2 = new Date(now - 2 * h);
  const stravaDate = d2.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const csv = '"Activity ID","Activity Date","Activity Name","Activity Type","Filename"\n"1","' + stravaDate + '","Prueba de subida","Gravel Ride","activities/1.fit.gz"\n';
  const z = path.join(dir, 'export_strava.zip');
  fs.writeFileSync(z, zipSync({ 'activities.csv': strToU8(csv), 'activities/1.fit.gz': gzipSync(fit(d2, 5400, 40)) }));
  return [a, z];
}

(async () => {
  const b = await chromium.launch();
  // Sin animaciones: axe mide los colores finales, no los de la transición de entrada
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(base);
  await p.getByRole('button', { name: 'Probar en modo local' }).click();
  await p.waitForURL(/bienvenida/);
  await p.getByLabel('Nombre').fill('Gabriel');
  await p.getByLabel('Confirmo que soy mayor de 18 años').check();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('heading', { name: 'Datos fisiológicos (opcional)' }).waitFor();
  await p.getByRole('button', { name: 'Saltar por ahora' }).click();
  await p.getByRole('heading', { name: 'Trae tus actividades' }).waitFor();
  await p.getByRole('button', { name: 'Cargar datos de prueba' }).click();
  await p.getByText('Listo: datos de prueba cargados.').waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: 'Hacerlo después' }).click();
  await p.waitForURL(u => u.hash === '#/' );
  const routes = ['/', '/plan', '/plan/disponibilidad', '/actividades', '/subir', '/metas', '/temporada', '/metricas', '/importacion', '/ayuda', '/ayuda?tema=pausa', '/ayuda?tema=meta', '/perfil', '/glosario', '/ajustes', '/mas', '/actividades/nueva', '/metas/nueva', '/nutricion', '/laboratorio', '/privacidad'];
  for (const scheme of ['light']) {
    await p.emulateMedia({ colorScheme: scheme });
    for (const r of routes) {
      await p.goto(base + '#' + r); await p.waitForTimeout(500);
      const res = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      const v = res.violations.map(v => `${v.id}(${v.nodes.length}): ${v.nodes[0].target} ${v.nodes[0].failureSummary?.split('\n')[1] ?? ''}`);
      console.log(scheme, r, v.length ? v.join(' | ') : 'ok', sw > 360 ? 'OVERFLOW ' + sw : '');
      if (scheme === 'light' || r === '/') await p.screenshot({ path: out + 'e2e_' + scheme + r.replace(/\//g, '_') + '.png', fullPage: true });
    }
  }
  // Subida real de archivos: un .FIT suelto y un .zip con formato de exportación de Strava
  const files = await makeUploadFiles();
  await p.goto(base + '#/subir'); await p.waitForTimeout(400);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Elegir archivos' }).click()]);
  await fc.setFiles(files);
  await p.getByText('Importación terminada').waitFor({ timeout: 30000 });
  const summary = await p.locator('[role=status], [role=alert]').allInnerTexts();
  console.log('subida:', summary.join(' | ').replace(/\n/g, ' '));
  if (!/2 nuevas/.test(summary.join(' '))) throw new Error('La subida de archivos no importó las 2 actividades');
  await p.getByRole('link', { name: 'Ver mis actividades' }).click();
  await p.getByRole('link', { name: /Prueba de subida/ }).first().waitFor();
  console.log('subida: la actividad aparece en la lista');

  // Fase 2: plan, sesión y diagnóstico
  await p.goto(base + '#/plan'); await p.waitForTimeout(800);
  const planText = await p.locator('main').innerText();
  if (!/orientativo y no reemplaza/.test(planText)) throw new Error('Falta el aviso legal en el plan');
  await p.locator('.session-card').first().click(); await p.waitForTimeout(500);
  const sres = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  console.log('sesión', sres.violations.map(v => v.id).join(',') || 'ok', '|', (await p.locator('h1').innerText()));
  await p.goto(base + '#/metas'); await p.waitForTimeout(500);
  await p.getByRole('link', { name: /Vuelta de 3 días/ }).first().click(); await p.waitForTimeout(800);
  const gtxt = await p.locator('main').innerText();
  const dres = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  console.log('diagnóstico', dres.violations.map(v => v.id).join(',') || 'ok', '|', (gtxt.match(/Vas (bien|justo|atrasado)/) || ['SIN DIAGNÓSTICO'])[0], '|', (gtxt.match(/Tiempo estimado[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' '));
  if (!/Vas (bien|justo|atrasado)/.test(gtxt)) throw new Error('Falta el diagnóstico de la meta');
  await p.screenshot({ path: out + 'e2e_diagnostico.png', fullPage: true });
  await p.goto(base + '#/plan'); await p.waitForTimeout(500);
  await p.screenshot({ path: out + 'e2e_plan.png', fullPage: true });

  // Fase 3: alimentación (menú de ejemplo en modo local), exámenes y recomendaciones
  const axe = async (name) => {
    const r = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, r.violations.map(v => `${v.id}(${v.nodes.length}): ${v.nodes[0].target}`).join(' | ') || 'ok', sw > 360 ? 'OVERFLOW ' + sw : '');
    if (r.violations.length || sw > 360) throw new Error('Problemas de accesibilidad o desborde en ' + name);
  };
  await p.goto(base + '#/nutricion'); await p.waitForTimeout(800);
  if (!/no reemplaza a un nutricionista/.test(await p.locator('main').innerText())) throw new Error('Falta el aviso en alimentación');
  await p.getByLabel('Alergias e intolerancias de comida').fill('maní, mariscos');
  await p.getByLabel('Alimentos que tienes en casa').fill('arroz, lentejas');
  await p.getByRole('button', { name: 'Guardar perfil de alimentación' }).click();
  await p.getByText('Alergias: maní, mariscos').waitFor();
  await p.getByRole('heading', { name: 'Lo que necesitas cada día' }).waitFor();
  await axe('alimentación (necesidades)');
  await p.getByRole('button', { name: 'Generar menú de la semana' }).click();
  await p.getByRole('heading', { name: 'Lista de mercado' }).waitFor({ timeout: 20000 });
  await p.locator('.meal-card').first().waitFor();
  await p.getByRole('button', { name: /^Otra opción para/ }).first().click(); await p.waitForTimeout(300);
  await p.getByText('Lo que se envió a la IA').click();
  const sent = await p.locator('details.sent pre').innerText();
  for (const banned of ['Gabriel', 'Persona de prueba', 'Gravel', 'strava', 'Vuelta', 'weight', 'birth', 'hr']) if (sent.includes(banned)) throw new Error('Se enviaría a la IA: ' + banned);
  if (!sent.includes('maní')) throw new Error('Las alergias no llegan a la IA');
  console.log('alimentación: menú de ejemplo con', await p.locator('.meal-card').count(), 'comidas en el día elegido; lo enviado no tiene nombre, actividades ni peso');
  await p.locator('.shop-list input[type=checkbox]').first().check();
  await p.getByText(/1 de \d+ en el carrito/).waitFor();
  await axe('alimentación (menú)');
  await p.screenshot({ path: out + 'e2e_nutricion.png', fullPage: true });

  await p.goto(base + '#/perfil'); await p.waitForTimeout(500);
  // Foto de perfil: sin foto se ve el avatar estándar; al subir una, aparece arriba y en el perfil
  if (await p.locator('.topbar-avatar img').count()) throw new Error('Sin foto debería verse el avatar estándar');
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: 300, height: 200 } });
  await p.locator('.photo-controls input[type=file]').setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png });
  await p.getByText('Foto de perfil guardada.').waitFor();
  await p.locator('.topbar-avatar img').waitFor();
  await p.getByRole('button', { name: 'Cambiar foto' }).waitFor();
  console.log('foto de perfil: subida, recortada y visible en la barra superior');
  await p.getByRole('button', { name: 'Cerrar sesión' }).waitFor();
  console.log('perfil: tiene «Cerrar sesión»');
  await axe('perfil con foto');
  await p.screenshot({ path: out + 'e2e_perfil_foto.png' });
  p.once('dialog', d => d.accept());
  await p.getByRole('button', { name: 'Quitar foto' }).click();
  await p.getByText('ahora ves el avatar estándar').waitFor();
  await p.waitForFunction(() => !document.querySelector('.topbar-avatar img'), null, { timeout: 5000 }).catch(() => { throw new Error('Al quitar la foto debe volver el avatar estándar'); });
  await p.getByRole('button', { name: 'Acepto que se guarden mis datos de salud' }).click(); await p.waitForTimeout(300);
  await p.goto(base + '#/laboratorio'); await p.waitForTimeout(500);
  await p.getByLabel('Examen', { exact: true }).selectOption('ferritin');
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  await p.getByLabel('Fecha del examen').fill(day(120));
  await p.getByLabel('Resultado', { exact: true }).fill('42');
  await p.getByRole('button', { name: 'Guardar resultado' }).click();
  await p.getByText('Resultado guardado.').waitFor();
  await p.getByLabel('Fecha del examen').fill(day(3));
  await p.getByLabel('Resultado', { exact: true }).fill('18');
  await p.getByRole('button', { name: 'Guardar resultado' }).click();
  await p.getByText('Por debajo del rango').waitFor();
  await p.getByText('Evolución de Ferritina').waitFor();
  console.log('exámenes: ferritina 42 → 18, «Por debajo del rango» con gráfica');
  await axe('exámenes');
  await p.screenshot({ path: out + 'e2e_laboratorio.png', fullPage: true });

  await p.goto(base + '#/'); await p.waitForTimeout(1000);
  await p.getByRole('heading', { name: 'Recomendaciones' }).waitFor();
  const recs = await p.locator('.rec h3').allInnerTexts();
  console.log('recomendaciones:', recs.join(' | '));
  if (recs.length < 1 || recs.length > 3) throw new Error('Se esperaban de 1 a 3 recomendaciones');
  if (!recs.some(r => /examen está fuera del rango/.test(r))) throw new Error('Falta la recomendación del examen');
  await axe('inicio con recomendaciones');
  await p.getByRole('button', { name: /^Entendido: Un examen/ }).click(); await p.waitForTimeout(500);
  const after = await p.locator('.rec h3').allInnerTexts();
  if (after.some(r => /examen está fuera del rango/.test(r))) throw new Error('«Entendido» no ocultó la recomendación');
  console.log('recomendaciones tras «Entendido»:', after.join(' | ') || '(ninguna)');
  await p.screenshot({ path: out + 'e2e_inicio_recs.png', fullPage: true });

  // Privacidad con sesión: dentro de la app, con su menú
  await p.goto(base + '#/privacidad'); await p.waitForTimeout(500);
  if (!(await p.locator('.bottom-nav').count())) throw new Error('La política de privacidad debe mostrarse con el menú');
  console.log('privacidad: dentro de la app, con menú');

  // detalle de la actividad fusionada
  await p.goto(base + '#/actividades'); await p.waitForTimeout(400);
  await p.getByRole('link', { name: /Gravel por la Sabana con el parche/ }).first().click();
  await p.waitForTimeout(500);
  const res = await new AxeBuilder({ page: p }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  console.log('detalle', res.violations.map(v => v.id).join(',') || 'ok');
  await p.screenshot({ path: out + 'e2e_detalle.png', fullPage: true });
  // URL manipulada
  await p.goto(base + '#/actividades/00000000-0000-0000-0000-000000000099'); await p.waitForTimeout(400);
  console.log('url ajena:', await p.locator('h1').innerText());
  console.log('errors:', errors.slice(0, 10));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
