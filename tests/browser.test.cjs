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
    await page.clock.install({ time: new Date(2026, 10, 18, 12) });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('.app-version').waitFor();
    assert.equal(await page.locator('.app-version').textContent(), 'v1.6.1');
    assert.equal(await page.locator('.timer-start').first().textContent(), 'Ещё не запускался');
    await page.locator('[data-toggle]').first().click();
    assert.match(await page.locator('.timer-start').first().textContent(), /^Начат \d{2}:\d{2}$/);
    const startLabel = await page.locator('.timer-start').first().textContent();
    await page.locator('[data-toggle]').first().click();
    assert.equal(await page.locator('.timer-start').first().textContent(), startLabel);
    const cdp = await page.context().newCDPSession(page);
    async function drag(x, y, dx, dy) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const active = () => page.locator('.chip.active').textContent();
    const tabs = await page.locator('.tabs-scroll').boundingBox();
    assert.equal(await active(), 'Общее');
    await drag(90, tabs.y + 10, 140, 10);
    assert.equal(await active(), 'Еда');
    assert(await page.locator('.carousel-outgoing').count() > 0);
    await drag(260, tabs.y + 10, -140, 10);
    assert.equal(await active(), 'Общее');
    await page.waitForFunction(() => !document.querySelector('.carousel-outgoing'));
    const card = await page.locator('.timer-card').first().boundingBox();
    await drag(260, card.y + 30, -140, 40);
    assert.equal(await active(), 'Воздух');
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
    await page.locator('#timeline-nav').click();
    assert.equal(await page.locator('.timeline-track').count(), 1);
    assert.equal(await page.locator('.timeline-clip').count(), 1);
    assert.equal(await page.locator('.timeline-mark').first().textContent(), '12:00');
    assert.equal(await page.locator('.timeline-clip').evaluate(el => el.style.getPropertyValue('--at')), '0%');
    await page.locator('.timeline-clip').click();
    assert.match(await page.locator('#timeline-detail').textContent(), /Работа: .* → /);
    const scroll = page.locator('.timeline-scroll');
    await scroll.evaluate(el => { el.scrollLeft = 0; });
    const board = await scroll.boundingBox();
    await drag(300, board.y + 40, -140, 0);
    await page.waitForFunction(() => document.querySelector('.timeline-scroll').scrollLeft > 30);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    assert.match(await page.locator('.timeline-mark').first().textContent(), /^18 .*12:00$/);
    await page.getByRole('button', { name: 'Месяц', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Месяц', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.timeline-mark').first().textContent(), /^18 .*12:00$/);
    await page.locator('.timeline-filter summary').click();
    await page.getByRole('checkbox', { name: 'Работа · Общее' }).uncheck();
    assert.equal(await page.locator('.timeline-track').count(), 0);
    assert.equal(await page.locator('.timeline-filter').getAttribute('open'), '');
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    assert.equal(await page.locator('.timeline-track').count(), 0);
    await page.reload();
    await page.locator('#timeline-nav').click();
    assert.equal(await page.locator('.timeline-track').count(), 0);
    await page.locator('.timeline-filter summary').click();
    await page.getByRole('checkbox', { name: 'Работа · Общее' }).check();
    assert.equal(await page.locator('.timeline-track').count(), 1);
    await page.getByRole('checkbox', { name: 'Работа · Общее' }).uncheck();
    await page.getByRole('button', { name: 'Показать все дорожки' }).click();
    assert.equal(await page.locator('.timeline-track').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: mobile Chrome native touch swipes, diagonal gesture, group strip, button safety, vertical scroll, version, narrow viewport');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
