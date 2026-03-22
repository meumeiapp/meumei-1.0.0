import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `yields-small-res-audit-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const storageStatePath = path.join(outDir, '.storage-state.json');

const viewports = [
  { id: 'desktop-1920x1080', width: 1920, height: 1080, mobile: false },
  { id: 'desktop-1728x1117', width: 1728, height: 1117, mobile: false },
  { id: 'desktop-1680x1050', width: 1680, height: 1050, mobile: false },
  { id: 'desktop-1600x900', width: 1600, height: 900, mobile: false },
  { id: 'desktop-1536x960', width: 1536, height: 960, mobile: false },
  { id: 'desktop-1512x982', width: 1512, height: 982, mobile: false },
  { id: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
  { id: 'desktop-1366x768', width: 1366, height: 768, mobile: false },
  { id: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
  { id: 'desktop-1280x720', width: 1280, height: 720, mobile: false },
  { id: 'desktop-1180x700', width: 1180, height: 700, mobile: false },
  { id: 'desktop-1152x720', width: 1152, height: 720, mobile: false },
  { id: 'desktop-1024x768', width: 1024, height: 768, mobile: false },
  { id: 'desktop-1024x640', width: 1024, height: 640, mobile: false },
  { id: 'desktop-960x600', width: 960, height: 600, mobile: false },
  { id: 'mobile-430x932', width: 430, height: 932, mobile: true },
  { id: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { id: 'mobile-375x812', width: 375, height: 812, mobile: true },
  { id: 'mobile-360x640', width: 360, height: 640, mobile: true },
  { id: 'mobile-320x568', width: 320, height: 568, mobile: true }
];
const viewportFilter = process.env.VIEWPORTS
  ? process.env.VIEWPORTS.split(',').map((value) => value.trim()).filter(Boolean)
  : null;
const selectedViewports = viewportFilter
  ? viewports.filter((viewport) => viewportFilter.includes(viewport.id))
  : viewports;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const summary = {
  baseUrl,
  loginEmail,
  generatedAt: new Date().toISOString(),
  outDir,
  viewports: []
};

const dismissOverlays = async (page, timeoutMs = 2800) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let acted = false;
    const tourTitle = page.getByText(/Tour guiado inicial/i).first();
    if (await tourTitle.isVisible().catch(() => false)) {
      const tourModal = tourTitle.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      const closeTour = tourModal.getByRole('button', { name: /^Fechar$/i }).first();
      if (await closeTour.isVisible().catch(() => false)) {
        await closeTour.click({ force: true }).catch(() => {});
        acted = true;
      } else {
        const nowNoTour = tourModal.getByRole('button', { name: /agora n[aã]o/i }).first();
        if (await nowNoTour.isVisible().catch(() => false)) {
          await nowNoTour.click({ force: true }).catch(() => {});
          acted = true;
        }
      }
    } else {
      const installTitle = page.getByText(/Instale seu app/i).first();
      if (await installTitle.isVisible().catch(() => false)) {
        const installModal = installTitle.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
        const closeInstall = installModal.getByRole('button', { name: /^Fechar$/i }).first();
        if (await closeInstall.isVisible().catch(() => false)) {
          await closeInstall.click({ force: true }).catch(() => {});
          acted = true;
        } else {
          const nowNoInstall = installModal.getByRole('button', { name: /agora n[aã]o/i }).first();
          if (await nowNoInstall.isVisible().catch(() => false)) {
            await nowNoInstall.click({ force: true }).catch(() => {});
            acted = true;
          }
        }
      }
    }

    if (!acted) {
      const skipTour = page.getByRole('button', { name: /pular tour/i }).first();
      if (await skipTour.isVisible().catch(() => false)) {
        await skipTour.click({ force: true }).catch(() => {});
        acted = true;
      }
    }
    if (!acted) {
      await sleep(180);
    } else {
      await sleep(140);
    }
  }
};

const fillOnboarding = async (page) => {
  await page.locator('input[placeholder*="Studio MEI"]').fill('Empresa Teste QA');
  await page.locator('input[placeholder*="00.000.000/0000-00"]').fill('12.345.678/0001-90');
  await page.locator('input[placeholder*="contato@empresa.com"]').fill('contato.qa@example.com');
  await page.locator('input[placeholder*="(00) 00000-0000"]').fill('(11) 98888-7777');
  await page.locator('input[placeholder*="Rua, número"]').fill('Rua Exemplo, 123 - Centro');
  await page.getByRole('button', { name: /Ir para o painel/i }).click();
};

const ensureAuthAndPersistState = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="seuemail@dominio.com"]').fill(loginEmail);
  await page.locator('input[placeholder="Sua senha"]').fill(loginPassword);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

  const onboarding = page.getByText('Primeiros passos').first();
  const desktopDock = page.locator('button[data-dock-item-id="home"]').first();
  const mobileDock = page.locator('.mobile-quick-access-footer');

  await Promise.race([
    onboarding.waitFor({ state: 'visible', timeout: 45000 }),
    desktopDock.waitFor({ state: 'visible', timeout: 45000 }),
    mobileDock.waitFor({ state: 'visible', timeout: 45000 })
  ]);

  if (await onboarding.isVisible().catch(() => false)) {
    await fillOnboarding(page);
  }

  await Promise.race([
    desktopDock.waitFor({ state: 'visible', timeout: 45000 }),
    mobileDock.waitFor({ state: 'visible', timeout: 45000 })
  ]);
  await dismissOverlays(page);
  await context.storageState({ path: storageStatePath });
  await context.close();
};

const clickYieldsDock = async (page, isMobile) => {
  if (isMobile) {
    const dock = page.locator('.mobile-quick-access-footer');
    await dock.waitFor({ state: 'visible', timeout: 25000 });
    const byLabel = dock.getByRole('button', { name: /Rend\.?|Rendimentos/i }).first();
    if (await byLabel.isVisible().catch(() => false)) {
      await byLabel.click({ force: true });
      return;
    }
    await dock.locator('button[data-dock-item-id="yields"]').first().click({ force: true });
    return;
  }

  const dockButton = page.locator('button[data-dock-item-id="yields"]').first();
  await dockButton.waitFor({ state: 'visible', timeout: 25000 });
  await dockButton.click({ force: true });
};

const ensureYieldsView = async (page, isMobile) => {
  const yieldsScreen = page.locator('[data-tour-screen="yields"]').first();
  const newYieldButton = page.getByRole('button', { name: /Novo Rendimento/i }).first();
  try {
    await Promise.race([
      yieldsScreen.waitFor({ state: 'visible', timeout: 12000 }),
      newYieldButton.waitFor({ state: 'visible', timeout: 12000 })
    ]);
    return;
  } catch {
    await dismissOverlays(page);
    await clickYieldsDock(page, isMobile);
    await Promise.race([
      yieldsScreen.waitFor({ state: 'visible', timeout: 12000 }),
      newYieldButton.waitFor({ state: 'visible', timeout: 12000 })
    ]);
  }
};

const getRect = (node) => {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
};

const collectBaseMetrics = async (page) => {
  return await page.evaluate(() => {
    const getRectLocal = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const body = document.body;
    const header = document.querySelector('[data-mm-global-header="true"]');
    const desktopDock = document.querySelector('[data-mm-desktop-dock-shell="true"]');
    const mobileDock = document.querySelector('.mobile-quick-access-footer');
    const yieldsScreen = document.querySelector('[data-tour-screen="yields"]');
    const addButton = Array.from(document.querySelectorAll('button')).find((button) =>
      /novo rendimento/i.test(button.textContent || '')
    );
    const compactButtons = Array.from(document.querySelectorAll('button')).filter((button) =>
      /simular|meta/i.test(button.textContent || '')
    );
    const compactPanel = compactButtons.length > 0 ? compactButtons[0].closest('div') : null;

    return {
      viewport,
      hasHorizontalOverflow:
        root.scrollWidth > window.innerWidth + 1 || body.scrollWidth > window.innerWidth + 1,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      headerRect: getRectLocal(header),
      desktopDockRect: getRectLocal(desktopDock),
      mobileDockRect: getRectLocal(mobileDock),
      yieldsRect: getRectLocal(yieldsScreen),
      addButtonRect: getRectLocal(addButton),
      compactPanelRect: getRectLocal(compactPanel),
      cssVars: {
        mmHeaderHeight: getComputedStyle(root).getPropertyValue('--mm-header-height').trim(),
        mmDockHeight: getComputedStyle(root).getPropertyValue('--mm-dock-height').trim(),
        mmDesktopDockHeight: getComputedStyle(root).getPropertyValue('--mm-desktop-dock-height').trim(),
        mmMobileDockHeight: getComputedStyle(root).getPropertyValue('--mm-mobile-dock-height').trim()
      }
    };
  });
};

const collectModalMetrics = async (page) => {
  return await page.evaluate(() => {
    const getRectLocal = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const root = document.documentElement;
    const header = document.querySelector('[data-mm-global-header="true"]');
    const desktopDock = document.querySelector('[data-mm-desktop-dock-shell="true"]');
    const mobileDock = document.querySelector('.mobile-quick-access-footer');
    const modalRoot = document.querySelector('[data-modal-root="true"]');
    const modalPanel =
      modalRoot &&
      Array.from(modalRoot.children).find((node) => node instanceof HTMLElement && node.tagName !== 'BUTTON');
    const saveButton = Array.from(modalRoot?.querySelectorAll('button') || []).find((button) =>
      /salvar|adicionar rendimento|atualizar rendimento/i.test(button.textContent || '')
    );
    const cancelButton = Array.from(modalRoot?.querySelectorAll('button') || []).find((button) =>
      /cancelar/i.test(button.textContent || '')
    );

    const headerRect = getRectLocal(header);
    const desktopDockRect = getRectLocal(desktopDock);
    const mobileDockRect = getRectLocal(mobileDock);
    const dockRect = desktopDockRect || mobileDockRect;
    const panelRect = getRectLocal(modalPanel);
    const saveRect = getRectLocal(saveButton);
    const cancelRect = getRectLocal(cancelButton);

    const headerBottom = headerRect?.bottom ?? null;
    const dockTop = dockRect?.top ?? null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      modalRootRect: getRectLocal(modalRoot),
      modalPanelRect: panelRect,
      saveButtonRect: saveRect,
      cancelButtonRect: cancelRect,
      headerRect,
      desktopDockRect,
      mobileDockRect,
      overlapsHeader: Boolean(panelRect && headerBottom !== null && panelRect.top < headerBottom - 1),
      overlapsDock: Boolean(panelRect && dockTop !== null && panelRect.bottom > dockTop + 1),
      saveOccludedByDock: Boolean(saveRect && dockTop !== null && saveRect.bottom > dockTop + 1),
      cancelOccludedByDock: Boolean(cancelRect && dockTop !== null && cancelRect.bottom > dockTop + 1),
      cssVars: {
        mmHeaderHeight: getComputedStyle(root).getPropertyValue('--mm-header-height').trim(),
        mmDockHeight: getComputedStyle(root).getPropertyValue('--mm-dock-height').trim()
      }
    };
  });
};

const collectListboxMetrics = async (page) => {
  return await page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    if (!listbox) return null;
    const rect = listbox.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      overflowTop: Math.max(0, Math.round(0 - rect.top)),
      overflowBottom: Math.max(0, Math.round(rect.bottom - window.innerHeight)),
      overflowLeft: Math.max(0, Math.round(0 - rect.left)),
      overflowRight: Math.max(0, Math.round(rect.right - window.innerWidth))
    };
  });
};

const openNewYieldModal = async (page) => {
  const newYieldButton = page.getByRole('button', { name: /Novo Rendimento/i }).first();
  await newYieldButton.waitFor({ state: 'visible', timeout: 15000 });
  await newYieldButton.click({ force: true });
  await page.locator('[data-modal-root="true"]').first().waitFor({ state: 'visible', timeout: 15000 });
};

const closeNewYieldModal = async (page) => {
  const modal = page.locator('[data-modal-root="true"]').first();
  if (!(await modal.isVisible().catch(() => false))) return;

  const closeByX = page.getByRole('button', { name: /Fechar rendimento/i }).last();
  if (await closeByX.isVisible().catch(() => false)) {
    await closeByX.click({ force: true }).catch(() => {});
  } else {
    const cancel = page.getByRole('button', { name: /^Cancelar$/i }).last();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await modal.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
};

const capture = async (page, fileName) => {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
};

const auditViewport = async (browser, viewportConfig) => {
  const context = await browser.newContext({
    viewport: { width: viewportConfig.width, height: viewportConfig.height },
    storageState: storageStatePath,
    isMobile: viewportConfig.mobile,
    hasTouch: viewportConfig.mobile
  });
  const page = await context.newPage();

  const viewportResult = {
    id: viewportConfig.id,
    width: viewportConfig.width,
    height: viewportConfig.height,
    mobile: viewportConfig.mobile,
    screenshots: {},
    metrics: {},
    issues: []
  };

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await clickYieldsDock(page, viewportConfig.mobile);
    await ensureYieldsView(page, viewportConfig.mobile);
    await dismissOverlays(page);
    await sleep(700);

    viewportResult.screenshots.yields = await capture(page, `${viewportConfig.id}-01-yields.png`);
    const baseMetrics = await collectBaseMetrics(page);
    viewportResult.metrics.base = baseMetrics;

    if (baseMetrics.hasHorizontalOverflow) {
      viewportResult.issues.push('overflow-horizontal-na-tela-base');
    }

    await dismissOverlays(page);
    await openNewYieldModal(page);
    await dismissOverlays(page);
    await sleep(220);
    viewportResult.screenshots.modal = await capture(page, `${viewportConfig.id}-02-new-yield-modal.png`);

    const modalMetrics = await collectModalMetrics(page);
    viewportResult.metrics.modal = modalMetrics;

    if (modalMetrics?.overlapsHeader) viewportResult.issues.push('modal-sobrepoe-header');
    if (modalMetrics?.overlapsDock) viewportResult.issues.push('modal-sobrepoe-dock');
    if (modalMetrics?.saveOccludedByDock) viewportResult.issues.push('botao-salvar-encoberto-pelo-dock');
    if (modalMetrics?.cancelOccludedByDock) viewportResult.issues.push('botao-cancelar-encoberto-pelo-dock');

    const modal = page.locator('[data-modal-root="true"]').first();
    const accountLabel = modal.getByText(/^Conta$/i).first();
    const accountSelectButton = accountLabel.locator('xpath=following::button[@aria-haspopup="listbox"][1]');
    let listboxMetrics = null;
    if (await accountSelectButton.isVisible().catch(() => false)) {
      await accountSelectButton.click({ force: true });
      await page.locator('[role="listbox"]').last().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await sleep(180);
      viewportResult.screenshots.modalAccountList = await capture(
        page,
        `${viewportConfig.id}-03-new-yield-account-list.png`
      );
      listboxMetrics = await collectListboxMetrics(page);
      viewportResult.metrics.accountListbox = listboxMetrics;
      if (listboxMetrics) {
        if (listboxMetrics.overflowBottom > 0) {
          viewportResult.issues.push(`lista-conta-cortada-embaixo-${listboxMetrics.overflowBottom}px`);
        }
        if (listboxMetrics.overflowTop > 0) {
          viewportResult.issues.push(`lista-conta-cortada-emcima-${listboxMetrics.overflowTop}px`);
        }
        if (listboxMetrics.overflowRight > 0 || listboxMetrics.overflowLeft > 0) {
          viewportResult.issues.push('lista-conta-com-overflow-horizontal');
        }
      }
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(100);
    } else {
      viewportResult.issues.push('nao-foi-possivel-abrir-seletor-de-conta');
    }

    await closeNewYieldModal(page);
    await sleep(180);
  } catch (error) {
    viewportResult.error = String(error?.message || error);
    viewportResult.issues.push('falha-na-auditoria-desta-resolucao');
  } finally {
    await context.close().catch(() => {});
  }

  return viewportResult;
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
  await ensureAuthAndPersistState(browser);

  for (const viewportConfig of selectedViewports) {
    console.log(`AUDIT ${viewportConfig.id}`);
    const result = await auditViewport(browser, viewportConfig);
    summary.viewports.push(result);
  }

  const totals = summary.viewports.reduce(
    (acc, viewport) => {
      acc.viewports += 1;
      acc.issues += viewport.issues.length;
      if (viewport.error) acc.errors += 1;
      return acc;
    },
    { viewports: 0, issues: 0, errors: 0 }
  );
  summary.totals = totals;

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`DONE outDir=${outDir}`);
  console.log(`VIEWPORTS=${totals.viewports} ISSUES=${totals.issues} ERRORS=${totals.errors}`);
} catch (error) {
  console.error('YIELDS_SMALL_RES_AUDIT_FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
