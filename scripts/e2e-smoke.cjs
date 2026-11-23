// Prueba de punta a punta en modo local: onboarding, datos de prueba, todas las
// pantallas a 360 px en tema claro y oscuro con axe (WCAG 2.2 AA) y URL ajena.
// Uso: npm run build && npx vite preview --port 4173 & npm run test:e2e
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const out = process.env.SHOTS_DIR || require('os').tmpdir() + '/';
const base = process.env.APP_URL || 'http://localhost:4173/';
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
