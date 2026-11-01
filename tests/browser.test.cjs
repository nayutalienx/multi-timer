// Run with Playwright installed: node tests/browser.test.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'].includes(file)) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('.app-version').waitFor();
    assert.equal(await page.locator('.app-version').textContent(), 'v1.2.1');
    const cdp = await page.context().newCDPSession(page);
    async function drag(x, y, dx, dy) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const active = () => page.locator('.chip.active').textContent();
    assert.equal(await active(), 'Общее');
    const card = await page.locator('.timer-card').first().boundingBox();
    await drag(260, card.y + 30, -140, 40);
    assert.equal(await active(), 'Воздух');
    const tabs = await page.locator('.tabs-scroll').boundingBox();
    await drag(90, tabs.y + 10, 140, 10);
    assert.equal(await active(), 'Общее');
    // Swiping across a start button must not accidentally start a timer.
    const button = await page.locator('[data-toggle]').first().boundingBox();
    await drag(button.x + button.width / 2, button.y + 10, -100, 5);
    assert.equal(await active(), 'Воздух');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('moyo-vremya-data-v1')).timers.some(t => t.runningSince !== null)), false);
    await drag(150, 400, 10, -110);
    assert.equal(await active(), 'Воздух');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: mobile Chrome native touch swipes, diagonal gesture, group strip, button safety, vertical scroll, version, narrow viewport');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
