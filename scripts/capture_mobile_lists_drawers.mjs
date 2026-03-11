import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const loginEmail = process.env.MEUMEI_LOGIN_EMAIL || 'qa.screenshots.bot@example.com';
const loginPassword = process.env.MEUMEI_LOGIN_PASSWORD || 'Meumei@12345';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(process.cwd(), 'test-results', `mobile-lists-drawers-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const manifest = {
  baseUrl,
  loginEmail,
  generatedAt: new Date().toISOString(),
  outDir,
  captures: [],
  skips: []
};

const screenshotFile = async (page, fileName, note) => {
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  manifest.captures.push({ fileName, filePath, note });
  console.log(`captured ${fileName}`);
};

const recordSkip = (fileName, reason) => {
  manifest.skips.push({ fileName, reason });
  console.warn(`skip ${fileName}: ${reason}`);
};

const safeClickDock = async (page, labelRegex) => {
  const dock = page.locator('.mobile-quick-access-footer');
  await dock.waitFor({ state: 'visible', timeout: 20000 });
  const btn = dock.getByRole('button', { name: labelRegex }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
};

const waitForDashboard = async (page) => {
  const entryButton = page.locator('button.mm-mobile-primary-cta').filter({ hasText: /Entrada/i }).first();
  await entryButton.waitFor({ state: 'visible', timeout: 30000 });
};

const waitForView = async (page, view) => {
  if (view.text) {
    await page.getByText(view.text).first().waitFor({ state: 'visible', timeout: 20000 });
    return;
  }
  if (view.screen) {
    await page.locator(`[data-tour-screen="${view.screen}"]`).first().waitFor({ state: 'attached', timeout: 20000 });
    return;
  }
  await sleep(600);
};

const getSelectButtonByLabel = (page, labelRegex) => {
  const label = page.getByText(labelRegex).first();
  const button = label.locator('xpath=following::button[@aria-haspopup="listbox"][1]');
  return { label, button };
};

const closeAnyListbox = async (page) => {
  const listbox = page.locator('[role="listbox"]').last();
  if (await listbox.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(12, 12).catch(() => {});
    await listbox.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  }
};

const selectOptionByLabel = async (page, labelRegex, optionRegex = null) => {
  try {
    const { label, button } = getSelectButtonByLabel(page, labelRegex);
    await label.waitFor({ state: 'visible', timeout: 10000 });
    await label.scrollIntoViewIfNeeded();
    await sleep(120);

    if (!(await button.count())) return false;
    if (await button.isDisabled()) return false;

    await button.click();
    const listbox = page.locator('[role="listbox"]').last();
    await listbox.waitFor({ state: 'visible', timeout: 10000 });

    let option = null;
    if (optionRegex) {
      option = listbox.getByRole('option', { name: optionRegex }).first();
      if (!(await option.count())) {
        option = null;
      }
    }
    if (!option) {
      option = listbox.locator('[role="option"]').first();
    }

    if (!(await option.count())) {
      await closeAnyListbox(page);
      return false;
    }

    await option.click();
    await listbox.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await sleep(120);
    return true;
  } catch {
    await closeAnyListbox(page);
    return false;
  }
};

const captureSelectOpen = async (page, { labelRegex, fileName, note }) => {
  try {
    const { label, button } = getSelectButtonByLabel(page, labelRegex);
    await label.waitFor({ state: 'visible', timeout: 12000 });
    await label.scrollIntoViewIfNeeded();
    await sleep(150);

    if (!(await button.count())) {
      recordSkip(fileName, `botao nao encontrado para ${String(labelRegex)}`);
      return false;
    }

    if (await button.isDisabled()) {
      recordSkip(fileName, `botao desabilitado para ${String(labelRegex)}`);
      return false;
    }

    await button.click();
    const listbox = page.locator('[role="listbox"]').last();
    await listbox.waitFor({ state: 'visible', timeout: 12000 });
    await sleep(240);
    await screenshotFile(page, fileName, note);

    await button.click();
    await listbox.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await sleep(120);
    return true;
  } catch (error) {
    recordSkip(fileName, `erro ao abrir seletor ${String(labelRegex)}: ${String(error)}`);
    await closeAnyListbox(page);
    return false;
  }
};

const clickMainCta = async (page, textRegex) => {
  const btn = page.locator('button.mm-mobile-primary-cta').filter({ hasText: textRegex }).first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.click();
};

const ensureCategoryForCurrentForm = async (page, prefix) => {
  try {
    const categoryLabel = page.getByText(/^Categoria$/i).first();
    await categoryLabel.waitFor({ state: 'visible', timeout: 8000 });
    const editButton = categoryLabel.locator('xpath=following::button[contains(normalize-space(),\"Editar\")][1]');

    if (!(await editButton.count())) return false;

    await editButton.click();
    await page.getByText(/^Categorias$/i).first().waitFor({ state: 'visible', timeout: 10000 });

    const newCategoryInput = page.getByRole('textbox', { name: /Nova categoria/i }).first();
    const categoryName = `${prefix}-${Date.now().toString().slice(-5)}`;
    await newCategoryInput.fill(categoryName);
    await page.getByRole('button', { name: /Adicionar categoria/i }).first().click();
    await sleep(250);

    await page.getByRole('button', { name: /Fechar categorias/i }).last().click({ force: true });
    await page.getByText(/^Categorias$/i).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await sleep(150);
    return true;
  } catch {
    return false;
  }
};

const ensureSupportAccount = async (page) => {
  try {
    await safeClickDock(page, /Contas/i);
    await waitForView(page, { text: /Contas Bancárias/i });
    await sleep(450);

    const accountName = `Conta QA ${Date.now().toString().slice(-5)}`;
    const newButton = page.getByRole('button', { name: /Nova Conta/i }).first();
    await newButton.waitFor({ state: 'visible', timeout: 12000 });
    await newButton.click();

    const nameInput = page.locator('input[placeholder*="Conta corrente PJ"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 12000 });
    await nameInput.fill(accountName);

    const selectedType = await selectOptionByLabel(page, /Tipo de conta|Tipo/i, null);
    if (!selectedType) {
      recordSkip('support-account', 'nao foi possivel selecionar tipo de conta');
    }

    const selectedNature = await selectOptionByLabel(page, /Natureza Fiscal/i, /Pessoa Jur[ií]dica/i);
    if (!selectedNature) {
      recordSkip('support-account', 'nao foi possivel selecionar natureza fiscal');
    }

    const saveButton = page.getByRole('button', { name: /^Salvar$/i }).last();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click({ force: true });
      await page.getByRole('button', { name: /Fechar nova conta/i }).first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await sleep(350);
    } else {
      recordSkip('support-account', 'botao Salvar nao ficou visivel');
    }
  } catch (error) {
    recordSkip('support-account', `erro ao criar conta: ${String(error)}`);
  } finally {
    const closeNew = page.getByRole('button', { name: /Fechar nova conta/i }).last();
    if (await closeNew.isVisible().catch(() => false)) {
      await closeNew.click({ force: true }).catch(() => {});
      await sleep(200);
    }
  }
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

  const dockViews = [
    { id: 'home', labelRegex: /In[ií]cio/i, text: /SEU DINHEIRO AGORA|Seu dinheiro agora/i, file: '01-home.png', note: 'Tela Início (dashboard)' },
    { id: 'launches', labelRegex: /Lanç\.?/i, text: /^Lançamentos$/i, file: '02-launches.png', note: 'Tela Lançamentos' },
    { id: 'accounts', labelRegex: /Contas/i, text: /Contas Bancárias/i, file: '03-accounts.png', note: 'Tela Contas' },
    { id: 'yields', labelRegex: /Rend\.?/i, text: /Rendimentos/i, file: '04-yields.png', note: 'Tela Rendimentos' },
    { id: 'invoices', labelRegex: /Faturas/i, text: /^Faturas$/i, file: '05-invoices.png', note: 'Tela Faturas' },
    { id: 'reports', labelRegex: /Relat[oó]rios/i, text: /^Relatórios$/i, file: '06-reports.png', note: 'Tela Relatórios' },
    { id: 'agenda', labelRegex: /Agenda/i, text: /Calendário|Agenda/i, file: '07-agenda.png', note: 'Tela Agenda' }
  ];

  for (const view of dockViews) {
    await safeClickDock(page, view.labelRegex);
    await waitForView(page, view);
    await sleep(820);
    await screenshotFile(page, view.file, view.note);
  }

  await ensureSupportAccount(page).catch((error) => {
    recordSkip('support-account', `falha ao criar conta de apoio: ${String(error)}`);
  });

  await safeClickDock(page, /In[ií]cio/i);
  await waitForDashboard(page);
  await sleep(650);

  await clickMainCta(page, /Entrada/i);
  await page.getByText(/Nova Entrada/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(600);
  await screenshotFile(page, '10-income-form.png', 'Formulário Nova Entrada');

  await captureSelectOpen(page, {
    labelRegex: /Natureza Fiscal/i,
    fileName: '11-income-select-tax-status-open.png',
    note: 'Seletor Natureza Fiscal (Entrada) aberto'
  });

  let incomeCategoryCaptured = await captureSelectOpen(page, {
    labelRegex: /^Categoria$/i,
    fileName: '12-income-select-category-open.png',
    note: 'Seletor Categoria (Entrada) aberto'
  });
  if (!incomeCategoryCaptured) {
    const categoryCreated = await ensureCategoryForCurrentForm(page, 'ENTRADA QA');
    if (categoryCreated) {
      await captureSelectOpen(page, {
        labelRegex: /^Categoria$/i,
        fileName: '12-income-select-category-open.png',
        note: 'Seletor Categoria (Entrada) aberto'
      });
    }
  }

  await captureSelectOpen(page, {
    labelRegex: /Forma de Pagamento/i,
    fileName: '13-income-select-payment-method-open.png',
    note: 'Seletor Forma de Pagamento (Entrada) aberto'
  });

  await selectOptionByLabel(page, /Forma de Pagamento/i, null);

  await captureSelectOpen(page, {
    labelRegex: /Conta de Destino/i,
    fileName: '14-income-select-account-open.png',
    note: 'Seletor Conta de Destino (Entrada) aberto'
  });

  await page.getByRole('button', { name: /Fechar nova entrada/i }).last().click({ force: true });
  await waitForDashboard(page);
  await sleep(450);
  await screenshotFile(page, '15-dashboard-after-income-close.png', 'Dashboard após fechar Nova Entrada');

  await clickMainCta(page, /Sa[íi]da/i);
  await page.getByText(/Nova Despesa/i).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(600);
  await screenshotFile(page, '20-expense-form.png', 'Formulário Nova Despesa');

  await captureSelectOpen(page, {
    labelRegex: /Tipo de despesa/i,
    fileName: '21-expense-select-type-open.png',
    note: 'Seletor Tipo de despesa (Saída) aberto'
  });

  let expenseCategoryCaptured = await captureSelectOpen(page, {
    labelRegex: /^Categoria$/i,
    fileName: '22-expense-select-category-open.png',
    note: 'Seletor Categoria (Saída) aberto'
  });
  if (!expenseCategoryCaptured) {
    const categoryCreated = await ensureCategoryForCurrentForm(page, 'SAIDA QA');
    if (categoryCreated) {
      await captureSelectOpen(page, {
        labelRegex: /^Categoria$/i,
        fileName: '22-expense-select-category-open.png',
        note: 'Seletor Categoria (Saída) aberto'
      });
    }
  }

  await captureSelectOpen(page, {
    labelRegex: /Forma de Pagamento/i,
    fileName: '23-expense-select-payment-method-open.png',
    note: 'Seletor Forma de Pagamento (Saída) aberto'
  });

  await selectOptionByLabel(page, /Forma de Pagamento/i, null);

  await captureSelectOpen(page, {
    labelRegex: /Conta de Pagamento/i,
    fileName: '24-expense-select-account-open.png',
    note: 'Seletor Conta de Pagamento (Saída) aberto'
  });

  await page.getByRole('button', { name: /Fechar nova despesa/i }).last().click({ force: true });
  await waitForDashboard(page);
  await sleep(450);
  await screenshotFile(page, '25-dashboard-after-expense-close.png', 'Dashboard após fechar Nova Despesa');

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
