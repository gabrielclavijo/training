// Prueba de punta a punta en modo local: onboarding, datos de prueba, todas las
// pantallas a 360 px en tema claro y oscuro con axe (WCAG 2.2 AA) y URL ajena.
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
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
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
  const routes = ['/', '/actividades', '/subir', '/metas', '/temporada', '/metricas', '/importacion', '/guias', '/perfil', '/glosario', '/ajustes', '/mas', '/actividades/nueva', '/metas/nueva'];
  for (const scheme of ['light', 'dark']) {
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
