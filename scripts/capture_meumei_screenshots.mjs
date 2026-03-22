import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `screenshots-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const captures = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const screenshotFile = async (page, fileName, opts = {}) => {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({
    path: filePath,
    fullPage: opts.fullPage ?? false
  });
  captures.push(filePath);
  console.log(`captured: ${fileName}`);
};

const clickDock = async (page, id) => {
  const selector = `button[data-dock-item-id="${id}"]`;
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: 12000 });
  await page.keyboard.press('Escape').catch(() => {});
  const dismissCandidates = [
    page.getByRole('button', { name: /pular tour/i }).first(),
    page.getByRole('button', { name: /fechar/i }).first(),
    page.getByRole('button', { name: /entendi/i }).first(),
    page.getByRole('button', { name: /ok/i }).first()
  ];
  for (const candidate of dismissCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ force: true }).catch(() => {});
      await sleep(120);
    }
  }
  await button.click({ force: true });
};

const fillOnboarding = async (page) => {
  await page.locator('input[placeholder*="Studio MEI"]').fill('Empresa Teste QA');
  await page.locator('input[placeholder*="00.000.000/0000-00"]').fill('12.345.678/0001-90');
  await page.locator('input[placeholder*="contato@empresa.com"]').fill('contato.qa@example.com');
  await page.locator('input[placeholder*="(00) 00000-0000"]').fill('(11) 98888-7777');
  await page.locator('input[placeholder*="Rua, número"]').fill('Rua Exemplo, 123 - Centro');
};

let browser;
let desktopContext;

try {
  browser = await chromium.launch({ headless: true });
  desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await sleep(1800);
  await screenshotFile(page, '01-landing-home.png');

  await page.locator('#planos').scrollIntoViewIfNeeded();
  await sleep(1000);
  await screenshotFile(page, '02-landing-planos.png');

  await page.goto(`${baseUrl}/termos`, { waitUntil: 'domcontentloaded' });
  await sleep(1100);
  await screenshotFile(page, '03-termos.png', { fullPage: true });

  await page.goto(`${baseUrl}/privacidade`, { waitUntil: 'domcontentloaded' });
  await sleep(1100);
  await screenshotFile(page, '04-privacidade.png', { fullPage: true });

  await page.goto(`${baseUrl}/reembolso`, { waitUntil: 'domcontentloaded' });
  await sleep(1100);
  await screenshotFile(page, '05-reembolso.png', { fullPage: true });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1300);
  await screenshotFile(page, '06-login.png');

  const registerToggle = page.getByRole('button', { name: /Não tenho conta/i }).first();
  if (await registerToggle.count()) {
    await registerToggle.click();
    await page.locator('input[placeholder="Confirme sua senha"]').waitFor({ state: 'visible', timeout: 10000 });
    await sleep(700);
    await screenshotFile(page, '07-cadastro-view.png');
    const backToLogin = page.getByRole('button', { name: /Já tenho conta/i }).first();
    if (await backToLogin.count()) {
      await backToLogin.click();
      await page.locator('button:has-text("Entrar")').first().waitFor({ state: 'visible', timeout: 10000 });
    }
  }

  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

  const onboardingTitle = page.getByText('Primeiros passos');
  const dashboardScreen = page.locator('[data-tour-screen="dashboard"]');

  let onOnboarding = false;
  try {
    await Promise.race([
      onboardingTitle.waitFor({ state: 'visible', timeout: 45000 }),
      dashboardScreen.waitFor({ state: 'visible', timeout: 45000 })
    ]);
    onOnboarding = await onboardingTitle.isVisible().catch(() => false);
  } catch {
    onOnboarding = false;
  }

  if (onOnboarding) {
    await fillOnboarding(page);
    await screenshotFile(page, '08-onboarding.png');
    await page.getByRole('button', { name: /Ir para o painel/i }).click();
  }

  await dashboardScreen.waitFor({ state: 'visible', timeout: 45000 });
  await sleep(1300);
  await screenshotFile(page, '09-dashboard.png');

  const desktopViews = [
    { id: 'accounts', screen: 'accounts', file: '10-accounts.png' },
    { id: 'incomes', screen: 'incomes', file: '11-incomes.png' },
    { id: 'fixed_expenses', screen: 'fixed_expenses', file: '12-fixed-expenses.png' },
    { id: 'variable_expenses', screen: 'variable_expenses', file: '13-variable-expenses.png' },
    { id: 'personal_expenses', screen: 'personal_expenses', file: '14-personal-expenses.png' },
    { id: 'yields', screen: 'yields', file: '15-yields.png' },
    { id: 'invoices', screen: 'invoices', file: '16-invoices.png' },
    { id: 'reports', screen: 'reports', file: '17-reports.png' },
    { id: 'das', screen: 'das', file: '18-das.png' },
    { id: 'agenda', screen: 'agenda', file: '19-agenda.png' }
  ];

  for (const view of desktopViews) {
    await clickDock(page, view.id);
    try {
      await page.locator(`[data-tour-screen="${view.screen}"]`).waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      console.warn(`warn: data-tour-screen not visible for ${view.id}, capturando mesmo assim`);
    }
    await sleep(1200);
    await screenshotFile(page, view.file);
  }

  await page.getByRole('button', { name: /Abrir configurações/i }).click();
  await page.getByRole('heading', { name: /Configurações/i }).waitFor({ state: 'visible', timeout: 30000 });
  await sleep(900);
  await screenshotFile(page, '20-settings.png');

  await clickDock(page, 'home');
  await page.locator('[data-tour-screen="dashboard"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1000);
  await page.locator('[data-tour-screen="dashboard"]').waitFor({ state: 'visible', timeout: 20000 });
  await screenshotFile(page, '21-mobile-dashboard.png');

  const launchesButton = page.getByRole('button', { name: /Lanç\./i }).first();
  if (await launchesButton.count()) {
    await launchesButton.click();
  } else {
    await page.getByRole('button', { name: /Lançamentos/i }).first().click();
  }
  await page.getByText(/Lançamentos/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(1000);
  await screenshotFile(page, '22-mobile-launches.png');

  const manifest = {
    baseUrl,
    loginEmail,
    generatedAt: new Date().toISOString(),
    outDir,
    total: captures.length,
    captures
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nDONE\noutDir=${outDir}\ncount=${captures.length}`);
} catch (error) {
  console.error('SCREENSHOT_FLOW_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (desktopContext) await desktopContext.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
