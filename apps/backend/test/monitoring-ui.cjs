const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('progress survives route changes and network errors; labels and history remain consistent', { timeout: 60000 }, async () => {
  const webRoot = path.resolve(__dirname, '../../web');
  const server = spawn(process.execPath, [path.join(webRoot, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: webRoot, stdio: 'ignore', windowsHide: true });
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch('http://127.0.0.1:5174')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let running = true;
    let offline = false;
    let shutdownFails = true;
    const entity = { id: 'e', name: 'Ana Pérez', aliases: ['AP'], description: '', active: true };
    const publication = { id: 'p', reviewRunId: 12, title: 'Texto', content: 'AP: se reporta una acusación.', url: 'https://example.com/post', createdAt: '2026-09-10T12:00:00Z', images: [], source: { name: 'Fuente de prueba' }, entities: [{ entity }], analysis: { status: 'COMPLETED', relevant: true, category: 'ALLEGATION', severity: 'HIGH', summary: 'AP: se reporta una acusación.', reason: 'Se reporta una acusación.', claims: [{ text: 'se reporta una acusación', type: 'ALLEGATION' }] } };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.port === '5174') return route.continue();
      let data = [];
      if (url.pathname === '/facebook/check/status') {
        if (offline) return route.abort();
        data = { id: 'review-12', phase: running ? 'RUNNING' : 'INTERRUPTED', error: running ? null : 'Sesión vencida', completedSources: 1, running, cancellationRequested: false, startedAt: '2026-09-10T11:00:00Z', sourceName: 'Fuente de prueba', sourceIndex: 2, totalSources: 4, reviewRunId: 12, warnings: [] };
      } else if (url.pathname === '/facebook/sources/check-all') {
        running = true;
        return route.abort(); // The response is lost, but the backend keeps working.
      } else if (url.pathname === '/system/shutdown') {
        assert.equal(route.request().method(), 'POST');
        assert.equal(route.request().headers()['x-scrapping-control'], 'shutdown');
        if (shutdownFails) return route.fulfill({ status: 503, json: { message: 'Sin supervisor' } });
        data = { accepted: true };
      } else if (url.pathname === '/facebook/session') data = { status: 'active' };
      else if (url.pathname === '/facebook/auto-check') data = { enabled: false, intervalMinutes: 60 };
      else if (url.pathname === '/sources') data = [{ id: 's', name: 'Fuente de prueba', url: 'https://example.com', type: 'FACEBOOK', status: 'ACTIVE', publicationsCount: 1 }];
      else if (url.pathname === '/entities') data = [entity];
      else if (url.pathname === '/analysis') data = [publication, { ...publication, id: 'irrelevant', content: 'NO DEBE MOSTRARSE', analysis: { ...publication.analysis, relevant: false } }];
      else if (url.pathname === '/alerts') data = [{ id: 'a', category: 'ALLEGATION', severity: 'HIGH', confidence: 0.9, summary: publication.analysis.summary, analysis: publication.analysis, publication, entity, createdAt: publication.createdAt, notifications: [] }];
      await route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:5174/monitoreo/alertas');
    await page.getByText('Ejecutando revisión', { exact: true }).waitFor();
    assert.match(await page.getByRole('status').innerText(), /2\/4/);
    await page.locator('a[href="/monitoreo/fuentes"]').first().click();
    await page.waitForURL('**/monitoreo/fuentes');
    assert.equal(await page.getByRole('status').isVisible(), true);
    await page.locator('a[href="/monitoreo/entidades"]').first().click();
    await page.waitForURL('**/monitoreo/entidades');
    assert.equal(await page.getByRole('status').isVisible(), true);
    offline = true;
    await page.getByText('No se puede verificar el estado. Reconectando…').waitFor();
    assert.equal(await page.getByRole('status').isVisible(), true);
    offline = false;
    await page.locator('a[href="/monitoreo/alertas"]').first().click();
    await page.getByRole('button', { name: 'Detener revisión' }).waitFor();
    assert.match(await page.getByRole('button', { name: 'Detener revisión' }).getAttribute('class'), /bg-red/);
    assert.equal(await page.getByPlaceholder('Search or type command...').count(), 0);
    assert.equal(await page.getByText('NO DEBE MOSTRARSE').count(), 0);
    assert.ok(await page.getByText('Alegación', { exact: true }).count());
    assert.ok(await page.getByText('Alta', { exact: true }).count());
    assert.ok(await page.locator('strong').filter({ hasText: 'AP' }).count());
    assert.ok(await page.getByText('Revisión #12', { exact: true }).count());
    running = false;
    await page.getByText('Revisión interrumpida', { exact: true }).waitFor();
    assert.match(await page.getByRole('status').innerText(), /Sesión vencida/);
    await page.getByRole('button', { name: 'Cerrar aviso' }).click();
    const start = page.getByRole('button', { name: /Iniciar revisión/ });
    await start.waitFor();
    assert.match(await start.getAttribute('class'), /bg-green/);
    await start.click();
    await page.getByRole('button', { name: 'Detener revisión' }).waitFor();
    assert.match(await page.getByRole('status').innerText(), /Ejecutando revisión/);
    offline = true;
    await page.getByRole('button', { name: 'Verificando estado...' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Verificando estado...' }).isDisabled(), true);
    assert.match(await page.getByRole('button', { name: 'Verificando estado...' }).getAttribute('class'), /bg-amber/);
    await page.getByRole('button', { name: 'Apagar sistema', exact: true }).click();
    await page.getByRole('button', { name: 'Apagar', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /detener.bat/);
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    shutdownFails = false;
    await page.getByRole('button', { name: 'Apagar sistema', exact: true }).click();
    await page.getByRole('button', { name: 'Apagar', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /Apagado solicitado/);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
  }
});
