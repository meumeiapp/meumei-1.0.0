import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4176';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `mobile-swipe-debug-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const swipeState = async (page) => page.evaluate(() => {
  const content = document.querySelector('.mm-content');
  const indicator = Array.from(document.querySelectorAll('.mm-content .rounded-full'))
    .find((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      return txt === 'proxima' || txt === 'anterior';
    });
  return {
    transform: content instanceof HTMLElement ? content.style.transform || null : null,
    transition: content instanceof HTMLElement ? content.style.transition || null : null,
    indicatorText: indicator ? (indicator.textContent || '').trim() : null,
  };
});

let browser;
let context;

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

  const dock = page.locator('.mobile-quick-access-footer');
  await dock.waitFor({ state: 'visible', timeout: 45000 });
  await dock.getByRole('button', { name: /Início/i }).first().click();
  await page.getByText(/Seu dinheiro agora/i).first().waitFor({ state: 'visible', timeout: 30000 });

  await sleep(800);
  await page.screenshot({ path: path.join(outDir, '01-home-before-swipe.png'), fullPage: false });

  const startX = 290;
  const startY = 530;

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 220, y: 532, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  await sleep(80);
  await page.screenshot({ path: path.join(outDir, '02-swipe-mid.png'), fullPage: false });

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 160, y: 534, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  await sleep(80);
  await page.screenshot({ path: path.join(outDir, '03-swipe-strong.png'), fullPage: false });

  const midState = await swipeState(page);

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await sleep(260);
  await page.screenshot({ path: path.join(outDir, '04-after-release.png'), fullPage: false });

  const afterState = await swipeState(page);

  const manifest = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    outDir,
    midState,
    afterState,
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`DONE outDir=${outDir}`);
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  console.error('CAPTURE_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
