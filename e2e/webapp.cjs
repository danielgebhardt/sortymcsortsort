/**
 * Checks the built web app the way GitHub Pages serves it: dist/ under /sortymcsortsort/.
 *   1. Chrome reports no installability errors (manifest, icons, service worker).
 *   2. After a reload, the service worker controls the page.
 *   3. Offline (context.setOffline), a reload still boots the game; a level can be played and the
 *      progress survives another offline reload.
 *
 * Usage: npm run build && node e2e/webapp.cjs
 * Needs the `playwright` package (preinstalled in the cloud dev container; not a project dependency).
 */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = 'sortymcsortsort';
const DIST = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (!url.startsWith(`/${REPO}/`)) {
      res.writeHead(404).end();
      return;
    }
    let file = path.join(DIST, url.slice(REPO.length + 2));
    if (file.endsWith(path.sep) || url === `/${REPO}/`) file = path.join(file, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/${REPO}/`;
  const exe = '/opt/pw-browsers/chromium';
  // A persistent (normal) profile: Chrome never offers to install a web app in an incognito context.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'webapp-check-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...(fs.existsSync(exe) && fs.statSync(exe).isFile() ? { executablePath: exe } : {}),
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const booted = () => page.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).length > 0, null, { timeout: 15000 });

  try {
    await page.goto(url);
    await booted();

    // 1. Installability
    const cdp = await context.newCDPSession(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    if (installabilityErrors.length) fail(`installability errors: ${JSON.stringify(installabilityErrors)}`);
    else console.log('ok: no installability errors');

    // 2. Service worker controls the page after a reload
    await page.reload();
    await booted();
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (!controlled) fail('service worker does not control the page after reload');
    else console.log('ok: service worker controls the page');

    // 3. Offline: boots, plays level 1, progress survives a reload
    await context.setOffline(true);
    await page.reload();
    await booted();
    console.log('ok: game boots offline');
    await page.evaluate(() => window.__game.scene.getScenes(true)[0].scene.start('Play', { level: 1 }));
    await page.waitForTimeout(1200);
    const solution = await page.evaluate(() => window.__game.scene.getScene('Play').level.solution);
    for (const id of solution) {
      await page.waitForFunction(() => window.__game.scene.getScene('Play').animating === 0);
      const pt = await page.evaluate((id) => {
        const s = window.__game.scene.getScene('Play');
        const b = s.board.blocks.get(id);
        const dpr = window.__game.registry.get('dpr');
        return { x: (s.ox + (b.x + 0.5) * s.cs) / dpr, y: (s.oy + (b.y + 0.5) * s.cs) / dpr };
      }, id);
      await page.mouse.click(pt.x, pt.y);
    }
    await page.waitForFunction(() => window.__game.scene.getScene('Play').board.cleared, null, { timeout: 5000 });
    await page.waitForTimeout(800);
    await page.reload();
    await booted();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.progress.v1') || 'null'));
    if (!saved || saved.unlocked < 2 || !saved.stars['1']) fail(`progress not saved offline: ${JSON.stringify(saved)}`);
    else console.log(`ok: level 1 cleared offline and saved (unlocked ${saved.unlocked}, ${saved.stars['1']} stars)`);

    if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    await context.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (!process.exitCode) console.log('web app check passed');
})();
