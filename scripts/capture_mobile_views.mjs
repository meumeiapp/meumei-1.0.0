import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const tag = process.env.CAPTURE_TAG || 'before';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `mobile-${tag}-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeClickDock = async (page, labelRegex) => {
  const dock = page.locator('.mobile-quick-access-footer');
  await dock.waitFor({ state: 'visible', timeout: 15000 });
  const btn = dock.getByRole('button', { name: labelRegex }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
};

const waitForView = async (page, view) => {
  if (view.screen) {
    try {
      await page.locator(`[data-tour-screen="${view.screen}"]`).first().waitFor({ state: 'visible', timeout: 7000 });
      return;
    } catch {
      // fallback to text-based visibility below
    }
  }
  if (view.text) {
    await page.getByText(view.text).first().waitFor({ state: 'visible', timeout: 20000 });
    return;
  }
  await sleep(800);
};

const measure = async (page) => {
  return await page.evaluate(() => {
    const viewportH = window.innerHeight;
    const top = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-mobile-top') || '0') || 0;
    const subHeader = document.querySelector('.mm-mobile-subheader-pad')?.parentElement;
    const subRect = subHeader?.getBoundingClientRect();
    const cta = document.querySelector('.mm-mobile-primary-cta');
    const ctaRect = cta?.getBoundingClientRect();
    const contentSection = document.querySelector('[data-mm-section="true"]') || document.querySelector('.mm-mobile-section-pad');
    const contentRect = contentSection?.getBoundingClientRect();
    return {
      viewportH,
      mmMobileTop: Math.round(top),
      subHeaderTop: subRect ? Math.round(subRect.top) : null,
      subHeaderHeight: subRect ? Math.round(subRect.height) : null,
      contentTop: contentRect ? Math.round(contentRect.top) : null,
      ctaTop: ctaRect ? Math.round(ctaRect.top) : null,
      ctaHeight: ctaRect ? Math.round(ctaRect.height) : null
    };
  });
};

const manifest = {
  baseUrl,
  loginEmail,
  generatedAt: new Date().toISOString(),
  tag,
  outDir,
  items: []
};

const views = [
  { id: 'home', labelRegex: /Início/i, screen: 'dashboard', text: /Seu dinheiro agora/i, file: '01-home.png' },
  { id: 'launches', labelRegex: /Lanç\.?/i, text: /Lançamentos/i, file: '02-launches.png' },
  { id: 'accounts', labelRegex: /Contas/i, screen: 'accounts', text: /Contas Bancárias/i, file: '03-accounts.png' },
  { id: 'yields', labelRegex: /Rend\.?/i, screen: 'yields', text: /Rendimentos/i, file: '04-yields.png' },
  { id: 'invoices', labelRegex: /Faturas/i, screen: 'invoices', text: /Faturas/i, file: '05-invoices.png' },
  { id: 'reports', labelRegex: /Relatórios/i, screen: 'reports', text: /Relatórios/i, file: '06-reports.png' },
  { id: 'agenda', labelRegex: /Agenda/i, screen: 'agenda', text: /Calendário/i, file: '07-agenda.png' }
];

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

  await safeClickDock(page, /Início/i);
  await page.getByText(/Seu dinheiro agora/i).first().waitFor({ state: 'visible', timeout: 30000 });

  await sleep(1200);

  for (const view of views) {
    await safeClickDock(page, view.labelRegex);
    await waitForView(page, view);
    await sleep(900);
    const filePath = path.join(outDir, view.file);
    await page.screenshot({ path: filePath, fullPage: false });
    const metrics = await measure(page);
    manifest.items.push({ ...view, filePath, metrics });
    console.log(`captured ${view.id}: ${view.file}`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`DONE outDir=${outDir}`);
} catch (error) {
  console.error('CAPTURE_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
