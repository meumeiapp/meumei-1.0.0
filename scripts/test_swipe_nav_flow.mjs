import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4176';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getFlags = async (page) => page.evaluate(() => {
  const text = document.body.innerText || '';
  return {
    hasDashboard: /Seu dinheiro agora/i.test(text),
    hasLaunches: /Visão Caixa/i.test(text) && /Filtros/i.test(text),
    hasAccounts: /Contas Bancárias/i.test(text),
    hasYields: /Rendimentos/i.test(text) && /Novo Rendimento/i.test(text),
    hasInvoices: /Faturas/i.test(text) && /Novo cartão/i.test(text),
    hasReports: /Relatórios/i.test(text) && /Receitas/i.test(text),
    hasAgenda: /Calendário/i.test(text) && /Novo agendamento/i.test(text),
  };
});

const swipe = async (page, { fromX, toX, y }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round((fromX + toX) / 2), y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: toX, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();
  await page.locator('.mobile-quick-access-footer').waitFor({ state: 'visible', timeout: 45000 });

  await page.locator('.mobile-quick-access-footer').getByRole('button', { name: /Início/i }).first().click();
  await sleep(900);

  const out = [];
  const snap = async (name) => {
    const flags = await getFlags(page);
    out.push({ name, flags });
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: false });
  };

  await snap('swipe_step_0_home');
  await swipe(page, { fromX: 300, toX: 120, y: 520 });
  await sleep(350);
  await snap('swipe_step_1_left');

  await swipe(page, { fromX: 300, toX: 120, y: 520 });
  await sleep(350);
  await snap('swipe_step_2_left');

  await swipe(page, { fromX: 120, toX: 300, y: 520 });
  await sleep(350);
  await snap('swipe_step_3_right');

  await swipe(page, { fromX: 120, toX: 300, y: 520 });
  await sleep(350);
  await snap('swipe_step_4_right');

  console.log(JSON.stringify(out, null, 2));
} finally {
  await context.close();
  await browser.close();
}
