import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `settings-grid-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const captures = [];
const checks = [];

const shot = async (page, fileName) => {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  captures.push(filePath);
  console.log(`captured: ${fileName}`);
};

const fillOnboarding = async (page) => {
  await page.locator('input[placeholder*="Studio MEI"]').fill('Empresa Teste QA');
  await page.locator('input[placeholder*="00.000.000/0000-00"]').fill('12.345.678/0001-90');
  await page.locator('input[placeholder*="contato@empresa.com"]').fill('contato.qa@example.com');
  await page.locator('input[placeholder*="(00) 00000-0000"]').fill('(11) 98888-7777');
  await page.locator('input[placeholder*="Rua, número"]').fill('Rua Exemplo, 123 - Centro');
};

const verifyPanel = async (page, cardTitle, expectedText, fileName) => {
  const card = page.getByRole('button', { name: new RegExp(cardTitle, 'i') }).first();
  await card.waitFor({ state: 'visible', timeout: 12000 });
  await card.click();
  await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
  checks.push({ card: cardTitle, expectedText, ok: true });
  await sleep(300);
  await shot(page, fileName);
};

let browser;
let context;

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1728, height: 1117 } });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
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
    await page.getByRole('button', { name: /Ir para o painel/i }).click();
  }

  await dashboardScreen.waitFor({ state: 'visible', timeout: 45000 });
  await page.getByRole('button', { name: /Abrir configurações/i }).click();
  await page.getByRole('heading', { name: /Configurações/i }).waitFor({ state: 'visible', timeout: 30000 });
  await sleep(500);
  await shot(page, '00-settings-grid-overview.png');

  const commonPanels = [
    ['Instalar', 'Instalar app', '01-settings-install.png'],
    ['Feedback', 'Reportar bug ou melhoria', '02-settings-feedback.png']
  ];
  for (const [card, title, file] of commonPanels) {
    await verifyPanel(page, card, title, file);
  }

  const desktopPanels = [
    ['Empresa', 'Gestão da Empresa', '03-settings-company.png'],
    ['Membros', 'Membros e acessos', '04-settings-members.png'],
    ['Dicas', 'Dicas do meumei', '05-settings-tips.png'],
    ['Atalhos', 'Atalhos do teclado', '06-settings-shortcuts.png'],
    ['Zona de perigo', 'Zona de Perigo', '07-settings-danger.png']
  ];
  for (const [card, title, file] of desktopPanels) {
    const candidate = page.getByRole('button', { name: new RegExp(card, 'i') }).first();
    if (await candidate.count()) {
      await verifyPanel(page, card, title, file);
    }
  }

  const report = {
    ok: true,
    baseUrl,
    loginEmail,
    generatedAt: new Date().toISOString(),
    outDir,
    checks,
    captures
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nDONE\noutDir=${outDir}\ncaptures=${captures.length}`);
} catch (error) {
  console.error('SETTINGS_GRID_CAPTURE_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}

