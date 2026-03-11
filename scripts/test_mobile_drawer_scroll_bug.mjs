import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `mobile-drawer-scroll-fix-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const manifest = {
  baseUrl,
  loginEmail,
  generatedAt: new Date().toISOString(),
  outDir,
  captures: [],
  checks: [],
  skips: []
};

const screenshotFile = async (page, fileName, note) => {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  manifest.captures.push({ fileName, filePath, note });
  console.log(`captured ${fileName}`);
};

const addCheck = (name, pass, details) => {
  manifest.checks.push({ name, pass, details });
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}`);
};

const addSkip = (name, reason) => {
  manifest.skips.push({ name, reason });
  console.warn(`[SKIP] ${name}: ${reason}`);
};

const safeClickDock = async (page, labelRegex) => {
  const dock = page.locator('.mobile-quick-access-footer');
  await dock.waitFor({ state: 'visible', timeout: 20000 });
  const btn = dock.getByRole('button', { name: labelRegex }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
};

const waitForDashboard = async (page) => {
  await page.locator('button.mm-mobile-primary-cta').filter({ hasText: /Entrada/i }).first().waitFor({ state: 'visible', timeout: 30000 });
};

const getSelectByLabel = (page, labelRegex) => {
  const label = page.getByText(labelRegex).first();
  const button = label.locator('xpath=following::button[@aria-haspopup="listbox"][1]');
  return { label, button };
};

const ensureIncomeCategoryEnabled = async (page) => {
  const { button, label } = getSelectByLabel(page, /^Categoria$/i);
  if (!(await button.count())) return false;
  if (!(await button.isDisabled())) return true;

  const editButton = label.locator('xpath=following::button[contains(normalize-space(),"Editar")][1]');
  if (!(await editButton.count())) return false;
  await editButton.click();

  await page.getByText(/^Categorias$/i).first().waitFor({ state: 'visible', timeout: 10000 });
  const input = page.getByRole('textbox', { name: /Nova categoria/i }).first();
  await input.fill(`QA CAT ${Date.now().toString().slice(-4)}`);
  await page.getByRole('button', { name: /Adicionar categoria/i }).first().click();
  await sleep(220);
  await page.getByRole('button', { name: /Fechar categorias/i }).last().click({ force: true });
  await sleep(220);

  return !(await button.isDisabled());
};

const closeOpenSelect = async (page, button, listbox) => {
  if (await listbox.isVisible().catch(() => false)) {
    await button.click().catch(() => {});
    await listbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
};

const runSelectScrollGestureCheck = async (page, opts) => {
  const { name, labelRegex, beforeFile, afterFile } = opts;
  const { label, button } = getSelectByLabel(page, labelRegex);

  if (!(await label.count())) {
    addSkip(name, `label nao encontrada: ${String(labelRegex)}`);
    return;
  }

  await label.waitFor({ state: 'visible', timeout: 12000 });
  await label.scrollIntoViewIfNeeded();
  await sleep(120);

  if (!(await button.count())) {
    addSkip(name, `botao nao encontrado para ${String(labelRegex)}`);
    return;
  }

  if (await button.isDisabled()) {
    addSkip(name, `botao desabilitado para ${String(labelRegex)}`);
    return;
  }

  const selectedBefore = (await button.innerText()).trim();
  await button.click();

  const listbox = page.locator('[role="listbox"]').last();
  await listbox.waitFor({ state: 'visible', timeout: 10000 });
  await sleep(180);

  await screenshotFile(page, beforeFile, `${name} aberto antes do gesto`);

  const firstOption = listbox.locator('[role="option"]').first();
  await firstOption.waitFor({ state: 'visible', timeout: 6000 });
  const optionBox = await firstOption.boundingBox();
  if (!optionBox) {
    addSkip(name, 'nao foi possivel obter dimensao da primeira opcao');
    await closeOpenSelect(page, button, listbox);
    return;
  }

  await page.mouse.move(optionBox.x + optionBox.width / 2, optionBox.y + Math.min(16, optionBox.height / 2));
  await page.mouse.down();
  await sleep(100);

  const stayedOpenAfterPointerDown = await listbox.isVisible().catch(() => false);

  await page.mouse.move(optionBox.x + optionBox.width / 2, Math.max(optionBox.y - 120, 12), { steps: 10 });
  await page.mouse.up();
  await sleep(100);

  const listBoxArea = await listbox.boundingBox();
  if (listBoxArea) {
    await page.mouse.move(listBoxArea.x + listBoxArea.width / 2, listBoxArea.y + Math.min(40, listBoxArea.height / 2));
    await page.mouse.wheel(0, 280);
    await sleep(120);
  }

  const scrollMetrics = await listbox.evaluate((el) => {
    const node = el;
    return {
      scrollTop: Math.round(node.scrollTop),
      scrollHeight: Math.round(node.scrollHeight),
      clientHeight: Math.round(node.clientHeight)
    };
  });

  const selectedAfter = (await button.innerText()).trim();
  const unchangedSelectionAfterDrag = selectedAfter === selectedBefore;
  const listIsScrollable = scrollMetrics.scrollHeight > scrollMetrics.clientHeight;
  const scrolled = scrollMetrics.scrollTop > 0;

  await screenshotFile(page, afterFile, `${name} após gesto de arraste/rolagem`);

  addCheck(`${name}: dropdown permanece aberto no pointer down`, stayedOpenAfterPointerDown, {
    selectedBefore,
    selectedAfter
  });
  addCheck(`${name}: arraste nao seleciona opcao`, unchangedSelectionAfterDrag, {
    selectedBefore,
    selectedAfter
  });

  if (listIsScrollable) {
    addCheck(`${name}: lista rolou`, scrolled, scrollMetrics);
  } else {
    addSkip(`${name}: lista rolou`, 'lista sem overflow suficiente para rolagem');
  }

  await closeOpenSelect(page, button, listbox);
};

let browser;
let context;

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ ...devices['iPhone 13'] });
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

  await waitForDashboard(page);
  await screenshotFile(page, '01-dashboard-mobile.png', 'Dashboard mobile (emulacao iPhone)');

  await page.locator('button.mm-mobile-primary-cta').filter({ hasText: /Entrada/i }).first().click();
  await page.getByText(/Nova Entrada/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(350);
  await screenshotFile(page, '10-income-form-mobile.png', 'Formulario Nova Entrada em mobile');

  const incomeCategoryEnabled = await ensureIncomeCategoryEnabled(page);
  if (!incomeCategoryEnabled) {
    addSkip('Entrada: categoria habilitada', 'nao foi possivel habilitar categoria neste ambiente');
  }

  await runSelectScrollGestureCheck(page, {
    name: 'Entrada/Categoria',
    labelRegex: /^Categoria$/i,
    beforeFile: '11-income-category-open-before.png',
    afterFile: '12-income-category-open-after.png'
  });

  await runSelectScrollGestureCheck(page, {
    name: 'Entrada/Forma de Pagamento',
    labelRegex: /Forma de Pagamento/i,
    beforeFile: '13-income-payment-open-before.png',
    afterFile: '14-income-payment-open-after.png'
  });

  await page.getByRole('button', { name: /Fechar nova entrada/i }).last().click({ force: true });
  await waitForDashboard(page);
  await sleep(220);

  await page.locator('button.mm-mobile-primary-cta').filter({ hasText: /Sa[íi]da/i }).first().click();
  await page.getByText(/Nova Despesa/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(350);
  await screenshotFile(page, '20-expense-form-mobile.png', 'Formulario Nova Despesa em mobile');

  await runSelectScrollGestureCheck(page, {
    name: 'Saida/Categoria',
    labelRegex: /^Categoria$/i,
    beforeFile: '21-expense-category-open-before.png',
    afterFile: '22-expense-category-open-after.png'
  });

  await runSelectScrollGestureCheck(page, {
    name: 'Saida/Forma de Pagamento',
    labelRegex: /Forma de Pagamento/i,
    beforeFile: '23-expense-payment-open-before.png',
    afterFile: '24-expense-payment-open-after.png'
  });

  await page.getByRole('button', { name: /Fechar nova despesa/i }).last().click({ force: true });
  await waitForDashboard(page);
  await screenshotFile(page, '30-dashboard-final-mobile.png', 'Dashboard mobile apos testes');

  const failedChecks = manifest.checks.filter((check) => !check.pass);
  manifest.summary = {
    totalChecks: manifest.checks.length,
    failedChecks: failedChecks.length,
    passedChecks: manifest.checks.length - failedChecks.length,
    skipCount: manifest.skips.length
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  if (failedChecks.length > 0) {
    console.error('MOBILE_SCROLL_CHECK_FAILED');
    process.exitCode = 1;
  } else {
    console.log(`DONE outDir=${outDir}`);
  }
} catch (error) {
  console.error('MOBILE_SCROLL_CHECK_CRASHED');
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
