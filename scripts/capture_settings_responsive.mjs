import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `settings-responsive-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const resolutions = [
  { name: 'hd-1280x720', width: 1280, height: 720 },
  { name: 'wxga-1366x768', width: 1366, height: 768 },
  { name: 'fhd-1920x1080', width: 1920, height: 1080 },
  { name: 'ultrawide-1728x1117', width: 1728, height: 1117 }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const captures = [];
const metrics = [];

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

const openSettings = async (page) => {
  const dashboardScreen = page.locator('[data-tour-screen="dashboard"]');
  const onboardingTitle = page.getByText('Primeiros passos');

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

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
  await sleep(400);
};

const activateMembersPanelIfPresent = async (page) => {
  const btn = page.getByRole('button', { name: /Membros/i }).first();
  if ((await btn.count()) === 0) return false;
  await btn.click({ timeout: 5000 }).catch(() => {});
  await sleep(250);
  return true;
};

const collectDockMetrics = async (page, resolutionName) => {
  const snapshot = await page.evaluate(() => {
    const dock = document.querySelector('[data-mm-desktop-dock-shell="true"]');
    const mmContent = document.querySelector('.mm-content.mm-content--desktop');
    const settingsMain = document.querySelector('main');
    const visibleSections = Array.from(document.querySelectorAll('main section'));
    const lastSection = visibleSections.length ? visibleSections[visibleSections.length - 1] : null;

    const dockRect = dock?.getBoundingClientRect() || null;
    const mmRect = mmContent?.getBoundingClientRect() || null;
    const mainRect = settingsMain?.getBoundingClientRect() || null;
    const lastRect = lastSection?.getBoundingClientRect() || null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dockTop: dockRect ? Math.round(dockRect.top) : null,
      dockHeight: dockRect ? Math.round(dockRect.height) : null,
      mmContentBottom: mmRect ? Math.round(mmRect.bottom) : null,
      settingsMainBottom: mainRect ? Math.round(mainRect.bottom) : null,
      lastSectionBottom: lastRect ? Math.round(lastRect.bottom) : null,
      gapMainToDock: dockRect && mainRect ? Math.round(dockRect.top - mainRect.bottom) : null,
      gapLastSectionToDock: dockRect && lastRect ? Math.round(dockRect.top - lastRect.bottom) : null,
      mmScrollTop: mmContent && 'scrollTop' in mmContent ? Math.round(mmContent.scrollTop) : null,
      mmScrollHeight: mmContent && 'scrollHeight' in mmContent ? Math.round(mmContent.scrollHeight) : null,
      mmClientHeight: mmContent && 'clientHeight' in mmContent ? Math.round(mmContent.clientHeight) : null
    };
  });

  metrics.push({ resolution: resolutionName, ...snapshot });
};

let browser;
let context;

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await openSettings(page);

  for (const res of resolutions) {
    await page.setViewportSize({ width: res.width, height: res.height });
    await sleep(350);

    const membersPanel = await activateMembersPanelIfPresent(page);
    await shot(page, `01-${res.name}-settings-top-${membersPanel ? 'members' : 'overview'}.png`);
    await collectDockMetrics(page, `${res.name}-top`);

    await page.evaluate(() => {
      const mmContent = document.querySelector('.mm-content.mm-content--desktop');
      if (!mmContent) return;
      mmContent.scrollTo({ top: mmContent.scrollHeight, behavior: 'instant' });
    });
    await sleep(350);

    await shot(page, `02-${res.name}-settings-bottom-${membersPanel ? 'members' : 'overview'}.png`);
    await collectDockMetrics(page, `${res.name}-bottom`);

    await page.evaluate(() => {
      const mmContent = document.querySelector('.mm-content.mm-content--desktop');
      if (!mmContent) return;
      mmContent.scrollTo({ top: 0, behavior: 'instant' });
    });
    await sleep(200);
  }

  const report = {
    ok: true,
    baseUrl,
    loginEmail,
    generatedAt: new Date().toISOString(),
    outDir,
    captures,
    metrics
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`DONE outDir=${outDir} captures=${captures.length}`);
} catch (error) {
  console.error('SETTINGS_RESPONSIVE_CAPTURE_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
