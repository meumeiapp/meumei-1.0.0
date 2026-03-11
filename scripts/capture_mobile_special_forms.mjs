import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `mobile-special-forms-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeClickDock = async (page, labelRegex) => {
  const dock = page.locator('.mobile-quick-access-footer');
  await dock.waitFor({ state: 'visible', timeout: 20000 });
  const btn = dock.getByRole('button', { name: labelRegex }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
};

let browser;
let context;

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

  const onboarding = page.getByText('Primeiros passos').first();
  const dock = page.locator('.mobile-quick-access-footer');
  await Promise.race([
    dock.waitFor({ state: 'visible', timeout: 45000 }),
    onboarding.waitFor({ state: 'visible', timeout: 45000 })
  ]);

  if (await onboarding.isVisible().catch(() => false)) {
    await page.locator('input[placeholder*="Studio MEI"]').fill('Empresa Teste QA');
    await page.locator('input[placeholder*="00.000.000/0000-00"]').fill('12.345.678/0001-90');
    await page.locator('input[placeholder*="contato@empresa.com"]').fill('contato.qa@example.com');
    await page.locator('input[placeholder*="(00) 00000-0000"]').fill('(11) 98888-7777');
    await page.locator('input[placeholder*="Rua, número"]').fill('Rua Exemplo, 123 - Centro');
    await page.getByRole('button', { name: /Ir para o painel/i }).click();
    await dock.waitFor({ state: 'visible', timeout: 30000 });
  }

  // Nova Conta
  await safeClickDock(page, /Contas/i);
  await page.getByRole('button', { name: /Nova Conta/i }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Nova Conta/i }).first().click();
  await page.getByRole('button', { name: /Fechar nova conta/i }).first().waitFor({ state: 'visible', timeout: 12000 });
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, '01-nova-conta.png'), fullPage: false });
  await page.getByRole('button', { name: /Fechar nova conta/i }).last().click({ force: true });
  await sleep(500);

  // Novo Rendimento
  await safeClickDock(page, /Rend\.?/i);
  await page.getByRole('button', { name: /Novo Rendimento/i }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Novo Rendimento/i }).first().click();
  await page.getByRole('button', { name: /Fechar rendimento/i }).first().waitFor({ state: 'visible', timeout: 12000 });
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, '02-novo-rendimento.png'), fullPage: false });
  await page.getByRole('button', { name: /Fechar rendimento/i }).last().click({ force: true });
  await sleep(500);

  // Novo Cartão
  await safeClickDock(page, /Faturas/i);
  await page.getByRole('button', { name: /Novo cartão/i }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Novo cartão/i }).first().click();
  await page.getByRole('button', { name: /Fechar cartão/i }).first().waitFor({ state: 'visible', timeout: 12000 });
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, '03-novo-cartao.png'), fullPage: false });
  await page.getByRole('button', { name: /Fechar cartão/i }).last().click({ force: true });
  await sleep(500);

  // Novo Agendamento
  await safeClickDock(page, /Agenda/i);
  await page.getByRole('button', { name: /Novo agendamento/i }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Novo agendamento/i }).first().click();
  await page.getByText(/Novo agendamento/i).first().waitFor({ state: 'visible', timeout: 12000 });
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, '04-novo-agendamento.png'), fullPage: false });

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ baseUrl, outDir }, null, 2));
  console.log(`DONE outDir=${outDir}`);
} catch (error) {
  console.error('CAPTURE_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
