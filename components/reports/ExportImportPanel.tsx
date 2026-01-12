import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, UploadCloud, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import type { Account, CreditCard, Expense, Income } from '../../types';
import { categoryService } from '../../services/categoryService';
import { dataService } from '../../services/dataService';
import { yieldsService, YieldRecord } from '../../services/yieldsService';
import { auth } from '../../services/firebase';
import { formatCurrency, normalizeText, toISODate } from './reportUtils';
import {
  consumeRedirectToken,
  hasGoogleProvider,
  requestSheetsAccess
} from './googleSheetsAuth';
import {
  batchUpdate,
  batchUpdateValues,
  clearSheetValues,
  createSpreadsheet,
  getSpreadsheetMeta,
  getSheetValues
} from './googleSheetsApi';
import { driveSessionManager } from './driveSessionManager';
import { googleSheetsStore } from './googleSheetsStore';
import { shouldApplyLegacyBalanceMutation } from '../../utils/legacyBalanceMutation';
import {
  incomeStatusLabel,
  expenseStatusLabel,
  normalizeIncomeStatus,
  normalizeExpenseStatus,
  parseIncomeStatus,
  parseExpenseStatus,
  statusExportValue
} from '../../utils/statusUtils';

interface ExportImportPanelProps {
  licenseId?: string;
  defaultStart: Date;
  defaultEnd: Date;
  allIncomes: Income[];
  allExpenses: Expense[];
  creditCards: CreditCard[];
}

type ExportMode = 'month' | 'custom';

type SheetName = 'ENTRADAS' | 'DESPESAS' | 'RENDIMENTOS' | 'CONTAS' | 'CARTOES' | 'LISTAS' | 'AJUDA';

type ImportKind = 'income' | 'expense' | 'yield';

type ImportStatus = 'valid' | 'warning' | 'error' | 'ignored';

type IssueCode = 'missing_category' | 'duplicate';

interface ImportIssue {
  level: 'error' | 'warning';
  message: string;
  column?: string;
  code?: IssueCode;
}

interface ParsedIncome {
  date: string;
  competenceDate?: string;
  description: string;
  category: string;
  amount: number;
  accountId: string;
  paymentMethod?: string;
  status: 'received' | 'pending';
  taxStatus: 'PJ' | 'PF';
  notes?: string;
}

interface ParsedExpense {
  date: string;
  dueDate: string;
  description: string;
  category: string;
  amount: number;
  type: 'fixed' | 'variable' | 'personal';
  paymentMethod: string;
  accountId?: string;
  cardId?: string;
  status: 'paid' | 'pending';
  taxStatus: 'PJ' | 'PF';
  notes?: string;
}

interface ParsedYield {
  accountId: string;
  date: string;
  amount: number;
  notes?: string;
}

interface ImportRow {
  id: string;
  sheet: SheetName;
  rowIndex: number;
  kind: ImportKind;
  payload: ParsedIncome | ParsedExpense | ParsedYield;
  issues: ImportIssue[];
  duplicate: boolean;
}

const DATA_SHEET_NAMES: SheetName[] = ['ENTRADAS', 'DESPESAS', 'RENDIMENTOS', 'CONTAS', 'CARTOES'];
const ALL_SHEET_NAMES: SheetName[] = [...DATA_SHEET_NAMES, 'LISTAS', 'AJUDA'];

const ENTRADAS_HEADERS = [
  'Data_Recebimento',
  'Data_Competencia',
  'Descricao',
  'Categoria',
  'Valor',
  'Conta_Destino',
  'Forma_Pagamento',
  'Status',
  'Natureza_Fiscal',
  'Observacoes'
];

const DESPESAS_HEADERS = [
  'Data_Lancamento',
  'Data_Vencimento',
  'Descricao',
  'Categoria',
  'Valor',
  'Tipo',
  'Forma_Pagamento',
  'Conta_Pagamento',
  'Cartao',
  'Status',
  'Natureza_Fiscal',
  'Observacoes'
];

const RENDIMENTOS_HEADERS = ['Conta', 'Data', 'Valor', 'Observacoes'];
const CONTAS_HEADERS = [
  'Nome',
  'Tipo',
  'Saldo_Inicial',
  'Saldo_Atual',
  'Observacoes',
  'Cor',
  'YieldRate',
  'YieldIndex'
];
const CARTOES_HEADERS = ['Nome', 'Bandeira', 'Fechamento', 'Vencimento', 'Limite', 'Cor'];

const LIST_COLUMNS = [
  'Contas',
  'Contas_Rendimentos',
  'Categorias_Entradas',
  'Categorias_Despesas',
  'Cartoes',
  'Status_Entradas',
  'Status_Despesas',
  'Tipo_Despesa',
  'Natureza_Fiscal',
  'Forma_Pagamento_Entradas',
  'Forma_Pagamento_Despesas'
];

const HELP_TEXT = [
  'Bem-vindo ao template do meumei.',
  'Use as abas ENTRADAS, DESPESAS e RENDIMENTOS para preencher os dados.',
  'Nao altere os cabecalhos da linha 1 e utilize os dropdowns quando existirem.',
  'Datas devem estar no formato YYYY-MM-DD (ex: 2026-01-07).',
  'Valores devem ser numericos (ex: 1200.50).',
  'Para despesas com Forma_Pagamento = Crédito, informe o Cartao e deixe Conta_Pagamento vazia.',
  'Para demais despesas, informe Conta_Pagamento e deixe Cartao vazio.',
  'Ao terminar, volte ao app e use "Importar desta Planilha".'
];

const VALIDATION_ROW_LIMIT = 5000;

const STATUS_INCOME = [incomeStatusLabel('received'), incomeStatusLabel('pending')];
const STATUS_EXPENSE = [expenseStatusLabel('paid'), expenseStatusLabel('pending')];
const TYPE_EXPENSE = ['fixed', 'variable', 'personal'];
const TAX_STATUS = ['PJ', 'PF'];
const PAYMENT_INCOME = ['Pix', 'Dinheiro', 'Transferência', 'Boleto', 'Crédito', 'Débito'];
const PAYMENT_EXPENSE = ['Débito', 'Crédito', 'PIX', 'Boleto', 'Transferência', 'Dinheiro'];

const columnToLetter = (index: number) => {
  let result = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

const buildRange = (sheet: string, columnCount: number, rowCount: number, startRow = 1) => {
  const endColumn = columnToLetter(columnCount - 1);
  const endRow = startRow + rowCount - 1;
  return `${sheet}!A${startRow}:${endColumn}${endRow}`;
};

const normalizeHeaderKey = (value: string) => normalizeText(value.replace(/_/g, ' '));

const parseAmount = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let normalized = trimmed.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const sheetDateToIso = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toISODate(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) {
      return toISODate(date);
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split('/');
      return `${y}-${m}-${d}`;
    }
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return toISODate(date);
    }
  }
  return null;
};

const normalizePaymentKey = (value: unknown) => normalizeText(value).replace(/\s+/g, '');

const normalizeIncomePaymentMethod = (value: unknown) => {
  const key = normalizePaymentKey(value);
  if (!key) return undefined;
  if (key.includes('pix')) return 'Pix';
  if (key.includes('dinheiro') || key.includes('cash')) return 'Dinheiro';
  if (key.includes('transfer')) return 'Transferência';
  if (key.includes('boleto')) return 'Boleto';
  if (key.includes('credito')) return 'Crédito';
  if (key.includes('debito')) return 'Débito';
  return null;
};

const normalizeExpensePaymentMethod = (value: unknown) => {
  const key = normalizePaymentKey(value);
  if (!key) return undefined;
  if (key.includes('pix')) return 'PIX';
  if (key.includes('dinheiro') || key.includes('cash')) return 'Dinheiro';
  if (key.includes('transfer')) return 'Transferência';
  if (key.includes('boleto')) return 'Boleto';
  if (key.includes('credito')) return 'Crédito';
  if (key.includes('debito')) return 'Débito';
  return null;
};

const normalizeTaxStatus = (value: unknown) => {
  const key = normalizeText(value);
  if (!key) return undefined;
  if (key === 'pj' || key.includes('mei') || key.includes('empresa')) return 'PJ';
  if (key === 'pf' || key.includes('pessoal')) return 'PF';
  return null;
};

const normalizeExpenseType = (value: unknown) => {
  const key = normalizeText(value);
  if (!key) return null;
  if (key.includes('fix') || key === 'fixed') return 'fixed';
  if (key.includes('vari') || key === 'variable') return 'variable';
  if (key.includes('pesso') || key === 'personal') return 'personal';
  return null;
};

const isRowEmpty = (row: unknown[]) => {
  return row.every(cell => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === 'string') return cell.trim() === '';
    return false;
  });
};

const buildIncomeKey = (payload: ParsedIncome) =>
  `${payload.date}|${payload.amount.toFixed(2)}|${normalizeText(payload.description)}|${normalizeText(payload.accountId)}|${normalizeText(payload.category)}|income`;

const buildExpenseKey = (payload: ParsedExpense) =>
  `${payload.date}|${payload.amount.toFixed(2)}|${normalizeText(payload.description)}|${normalizeText(payload.accountId || payload.cardId || '')}|${payload.type}|${normalizeText(payload.category)}`;

const buildYieldKey = (payload: ParsedYield) =>
  `${payload.date}|${payload.amount.toFixed(2)}|${normalizeText(payload.accountId)}`;

const resolveStatus = (row: ImportRow, allowMissingCategories: boolean): ImportStatus => {
  if (row.duplicate) return 'ignored';
  const hasErrors = row.issues.some(issue => issue.level === 'error');
  const hasBlockingWarning = row.issues.some(issue => issue.code === 'missing_category' && !allowMissingCategories);
  const hasWarnings = row.issues.some(issue => issue.level === 'warning');
  if (hasErrors || hasBlockingWarning) return 'error';
  if (hasWarnings) return 'warning';
  return 'valid';
};

const extractSpreadsheetId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
};

const isDateWithinRange = (dateIso: string, start: Date, end: Date) => {
  if (!dateIso) return false;
  const date = new Date(dateIso + 'T12:00:00');
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
};

const ExportImportPanel: React.FC<ExportImportPanelProps> = ({
  licenseId,
  defaultStart,
  defaultEnd,
  allIncomes,
  allExpenses,
  creditCards
}) => {
  const [exportMode, setExportMode] = useState<ExportMode>('month');
  const [exportRange, setExportRange] = useState({
    start: toISODate(defaultStart),
    end: toISODate(defaultEnd)
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<{ incomes: string[]; expenses: string[] }>({
    incomes: [],
    expenses: []
  });
  const [yields, setYields] = useState<YieldRecord[]>([]);
  const [licenseEpoch, setLicenseEpoch] = useState<number | null>(null);
  const [allowMissingCategories, setAllowMissingCategories] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{ ok: number; ignored: number; failed: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; type: 'info' | 'success' | 'error'; message: string }>>([]);
  const [sheetInput, setSheetInput] = useState('');
  const [primarySheetId, setPrimarySheetId] = useState<string | null>(null);
  const [primarySheetSource, setPrimarySheetSource] = useState<'cache' | 'firestore' | 'localStorage' | 'new' | null>(null);
  const [importedKeys, setImportedKeys] = useState<{ incomes: string[]; expenses: string[]; yields: string[] }>({
    incomes: [],
    expenses: [],
    yields: []
  });
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null);

  const pushLog = useCallback((type: 'info' | 'success' | 'error', message: string) => {
    setLogs(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, message }
    ].slice(-6));
  }, []);

  const accountLookup = useMemo(() => {
    const map = new Map<string, { id: string; name: string; locked?: boolean }>();
    accounts.forEach(acc => {
      const keyName = normalizeText(acc.name);
      if (keyName) map.set(keyName, { id: acc.id, name: acc.name, locked: acc.locked });
      map.set(normalizeText(acc.id), { id: acc.id, name: acc.name, locked: acc.locked });
    });
    return map;
  }, [accounts]);

  const cardLookup = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    creditCards.forEach(card => {
      const keyName = normalizeText(card.name);
      if (keyName) map.set(keyName, { id: card.id, name: card.name });
      map.set(normalizeText(card.id), { id: card.id, name: card.name });
    });
    return map;
  }, [creditCards]);

  const incomeCategorySet = useMemo(
    () => new Set(categories.incomes.map(item => normalizeText(item))),
    [categories.incomes]
  );

  const expenseCategorySet = useMemo(
    () => new Set(categories.expenses.map(item => normalizeText(item))),
    [categories.expenses]
  );

  const existingIncomeKeys = useMemo(() => {
    const keys = allIncomes.map(inc =>
      `${inc.date}|${inc.amount.toFixed(2)}|${normalizeText(inc.description || '')}|${normalizeText(inc.accountId || '')}|${normalizeText(inc.category || '')}|income`
    );
    return new Set([...keys, ...importedKeys.incomes]);
  }, [allIncomes, importedKeys.incomes]);

  const existingExpenseKeys = useMemo(() => {
    const keys = allExpenses.map(exp =>
      `${exp.date}|${exp.amount.toFixed(2)}|${normalizeText(exp.description || '')}|${normalizeText(exp.accountId || exp.cardId || '')}|${exp.type}|${normalizeText(exp.category || '')}`
    );
    return new Set([...keys, ...importedKeys.expenses]);
  }, [allExpenses, importedKeys.expenses]);

  const existingYieldKeys = useMemo(() => {
    const keys = yields.map(item =>
      `${item.date}|${item.amount.toFixed(2)}|${normalizeText(item.accountId)}`
    );
    return new Set([...keys, ...importedKeys.yields]);
  }, [importedKeys.yields, yields]);

  const loadRefs = useCallback(async () => {
    if (!licenseId) return;
    try {
      const epoch = await dataService.ensureCryptoEpoch(licenseId);
      setLicenseEpoch(epoch);
      const [accountsList, categoriesList, yieldsList] = await Promise.all([
        dataService.getAccounts(licenseId, epoch),
        categoryService.getUserCategories(licenseId),
        yieldsService.loadYields(licenseId, epoch)
      ]);
      setAccounts(accountsList);
      setCategories(categoriesList);
      setYields(yieldsList);
    } catch (error: any) {
      setLoadError(error?.message || 'Erro ao carregar contas, categorias e rendimentos.');
    }
  }, [licenseId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setAuthUid(user?.uid || null);
      setIsGoogleLinked(hasGoogleProvider(user));
      if (!user) {
        setAccessToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const session = driveSessionManager.getToken();
    if (session?.token) {
      setAccessToken(session.token);
      console.info('[drive] token ok', { exp: session.expiresAt });
    }
  }, []);

  useEffect(() => {
    if (!authUid) return;
    const loadIntegration = async () => {
      const { integration, source } = await googleSheetsStore.load(authUid);
      if (integration?.spreadsheetId) {
        setPrimarySheetId(integration.spreadsheetId);
        setPrimarySheetSource(source);
        console.info('[sheets] using spreadsheetId', { spreadsheetId: integration.spreadsheetId, source });
      }
    };
    void loadIntegration();
  }, [authUid]);

  useEffect(() => {
    if (primarySheetId && !sheetInput) {
      setSheetInput(primarySheetId);
    }
  }, [primarySheetId, sheetInput]);

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const { token, expiresAt } = await consumeRedirectToken();
        if (token) {
          const session = driveSessionManager.setToken(token, expiresAt);
          setAccessToken(session.token);
          setAuthError(null);
          console.info('[drive] connected', { user: auth.currentUser?.email || null });
          console.info('[drive] token ok', { exp: session.expiresAt });
          pushLog('success', 'Permissao Google Drive confirmada via redirect.');
          console.log('[reports][sheets-auth] redirect_ok');
        }
      } catch (error: any) {
        console.warn('[reports][sheets-auth] redirect_err', error);
        setAuthError(error?.message || 'Falha ao concluir permissao Google Drive.');
      }
    };
    void checkRedirect();
  }, [pushLog]);

  const resolveExportRange = () => {
    if (exportMode === 'month') {
      return {
        start: new Date(defaultStart),
        end: new Date(defaultEnd)
      };
    }
    return {
      start: new Date(exportRange.start + 'T00:00:00'),
      end: new Date(exportRange.end + 'T23:59:59')
    };
  };

  const ensureAccessToken = async () => {
    const cached = driveSessionManager.getToken();
    if (cached?.token) {
      setAccessToken(cached.token);
      console.info('[drive] token ok', { exp: cached.expiresAt });
      return cached.token;
    }
    if (accessToken) return accessToken;
    setAuthError(null);
    setAuthBusy(true);
    const linked = hasGoogleProvider(auth.currentUser);
    const mode = linked ? 'reauth' : 'link';
    setIsGoogleLinked(linked);
    console.log('[reports][sheets-auth] request_start', { mode });
    try {
      const result = await requestSheetsAccess(mode);
      if (result.method === 'redirect') {
        pushLog('info', 'Redirecionando para concluir permissao do Google Drive.');
        console.log('[reports][sheets-auth] redirect_start');
        return null;
      }
      if (!result.token) {
        throw new Error('Token nao retornado pelo Google.');
      }
      const session = driveSessionManager.setToken(result.token, result.expiresAt);
      setAccessToken(session.token);
      setIsGoogleLinked(true);
      console.info('[drive] connected', { user: auth.currentUser?.email || null });
      console.info('[drive] token ok', { exp: session.expiresAt });
      pushLog('success', 'Google Drive conectado com sucesso.');
      console.log('[reports][sheets-auth] popup_ok');
      return result.token;
    } catch (error: any) {
      console.error('[reports][sheets-auth] auth_error', error);
      setAuthError(error?.message || 'Falha ao conectar Google Drive.');
      pushLog('error', error?.message || 'Falha ao conectar Google Drive.');
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  const buildListRows = () => {
    const accountsSorted = [...accounts].map(acc => acc.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const yieldAccounts = accounts.filter(acc => {
      const type = (acc.type || '').toLowerCase();
      return type.includes('rendimento') || type.includes('investimento');
    });
    const yieldAccountsSorted = (yieldAccounts.length ? yieldAccounts : accounts).map(acc => acc.name).filter(Boolean).sort((a, b) => a.localeCompare(b));

    const listValues = [
      accountsSorted,
      yieldAccountsSorted,
      [...categories.incomes].sort((a, b) => a.localeCompare(b)),
      [...categories.expenses].sort((a, b) => a.localeCompare(b)),
      creditCards.map(card => card.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      STATUS_INCOME,
      STATUS_EXPENSE,
      TYPE_EXPENSE,
      TAX_STATUS,
      PAYMENT_INCOME,
      PAYMENT_EXPENSE
    ];

    const maxRows = Math.max(1, ...listValues.map(values => values.length)) + 1;
    const rows = Array.from({ length: maxRows }, (_, rowIndex) => {
      return LIST_COLUMNS.map((header, colIndex) => {
        if (rowIndex === 0) return header;
        return listValues[colIndex]?.[rowIndex - 1] || '';
      });
    });

    return rows;
  };

  const buildValidationRequest = (sheetId: number, columnIndex: number, listColumnLetter: string, strict: boolean) => ({
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: VALIDATION_ROW_LIMIT,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1
      },
      rule: {
        condition: {
          type: 'ONE_OF_RANGE',
          values: [{ userEnteredValue: `=LISTAS!$${listColumnLetter}$2:$${listColumnLetter}` }]
        },
        showCustomUi: true,
        strict
      }
    }
  });

  const buildExportData = (start: Date, end: Date) => {
    const accountNameMap = new Map(accounts.map(acc => [acc.id, acc.name]));
    const cardNameMap = new Map(creditCards.map(card => [card.id, card.name]));

    const incomesForRange = allIncomes.filter(inc => isDateWithinRange(inc.date, start, end));
    const expensesForRange = allExpenses.filter(exp => isDateWithinRange(exp.date, start, end));
    const yieldsForRange = yields.filter(item => isDateWithinRange(item.date, start, end));

    const incomeRows = incomesForRange.map(inc => [
      inc.date,
      inc.competenceDate || '',
      inc.description || '',
      inc.category || 'Sem categoria',
      inc.amount,
      accountNameMap.get(inc.accountId) || inc.accountId || '',
      inc.paymentMethod || '',
      statusExportValue('income', inc.status),
      inc.taxStatus || 'PJ',
      inc.notes || ''
    ]);

    const expenseRows = expensesForRange.map(exp => [
      exp.date,
      exp.dueDate || '',
      exp.description || '',
      exp.category || 'Sem categoria',
      exp.amount,
      exp.type,
      exp.paymentMethod || '',
      exp.accountId ? accountNameMap.get(exp.accountId) || exp.accountId : '',
      exp.cardId ? cardNameMap.get(exp.cardId) || exp.cardId : '',
      statusExportValue('expense', exp.status),
      exp.taxStatus || 'PJ',
      exp.notes || ''
    ]);

    const yieldRows = yieldsForRange.map(item => [
      accountNameMap.get(item.accountId) || item.accountId,
      item.date,
      item.amount,
      item.notes || ''
    ]);

    const accountRows = accounts.map(acc => [
      acc.name,
      acc.type,
      acc.initialBalance,
      acc.currentBalance,
      acc.notes || '',
      acc.color || '',
      acc.yieldRate ?? '',
      acc.yieldIndex || ''
    ]);

    const cardRows = creditCards.map(card => [
      card.name,
      card.brand,
      card.closingDay,
      card.dueDay,
      card.limit ?? '',
      card.cardColor || ''
    ]);

    return {
      incomeRows,
      expenseRows,
      yieldRows,
      accountRows,
      cardRows,
      counts: {
        incomes: incomesForRange.length,
        expenses: expensesForRange.length,
        yields: yieldsForRange.length,
        accounts: accounts.length,
        cards: creditCards.length
      }
    };
  };

  const ensureSheetStructure = async (token: string, spreadsheetId: string) => {
    const meta = await getSpreadsheetMeta(token, spreadsheetId);
    const existing = new Map<string, number>();
    (meta?.sheets || []).forEach((sheet: any) => {
      const title = sheet?.properties?.title as string | undefined;
      const id = sheet?.properties?.sheetId as number | undefined;
      if (title && typeof id === 'number') {
        existing.set(title, id);
      }
    });

    const missing = ALL_SHEET_NAMES.filter(name => !existing.has(name));
    if (missing.length) {
      const addRequests = missing.map(name => ({ addSheet: { properties: { title: name } } }));
      await batchUpdate(token, spreadsheetId, addRequests);
      const refreshed = await getSpreadsheetMeta(token, spreadsheetId);
      const refreshedMap = new Map<string, number>();
      (refreshed?.sheets || []).forEach((sheet: any) => {
        const title = sheet?.properties?.title as string | undefined;
        const id = sheet?.properties?.sheetId as number | undefined;
        if (title && typeof id === 'number') {
          refreshedMap.set(title, id);
        }
      });
      return refreshedMap;
    }

    return existing;
  };

  const handleCreateSheet = async () => {
    setLoadError(null);
    const token = await ensureAccessToken();
    if (!token) return;

    setCreating(true);
    const { start, end } = resolveExportRange();
    const fileName = `meumei-export-${toISODate(start)}-a-${toISODate(end)}`;
    const exportData = buildExportData(start, end);

    console.info('[export] incomes count', { count: exportData.counts.incomes });
    console.info('[export] expenses count', { count: exportData.counts.expenses });
    console.info('[export] yields count', { count: exportData.counts.yields });
    console.info('[export] accounts count', { count: exportData.counts.accounts });
    console.info('[export] cards count', { count: exportData.counts.cards });

    console.log('[reports][sheets-export] create_start', { fileName });
    pushLog('info', `Atualizando planilha ${fileName}...`);

    try {
      let spreadsheetId = primarySheetId;
      let source = primarySheetSource || null;

      if (!spreadsheetId && authUid) {
        const stored = await googleSheetsStore.load(authUid);
        if (stored.integration?.spreadsheetId) {
          spreadsheetId = stored.integration.spreadsheetId;
          source = stored.source;
          setPrimarySheetId(spreadsheetId);
          setPrimarySheetSource(source);
        }
      }

      if (!spreadsheetId) {
        const createResult = await createSpreadsheet(token, fileName, ALL_SHEET_NAMES);
        spreadsheetId = createResult.spreadsheetId;
        source = 'new';
        const persisted = await googleSheetsStore.save(authUid, spreadsheetId);
        setPrimarySheetId(spreadsheetId);
        setPrimarySheetSource(persisted.source === 'firestore' ? 'firestore' : 'localStorage');
        console.info('[sheets] created spreadsheetId', { spreadsheetId });
        console.info('[sheets] persisted spreadsheetId', { spreadsheetId, source: persisted.source });
      } else {
        console.info('[sheets] using spreadsheetId', { spreadsheetId, source: source || 'cache' });
      }

      if (!spreadsheetId) {
        throw new Error('Falha ao determinar planilha principal.');
      }

      const sheetIdByTitle = await ensureSheetStructure(token, spreadsheetId);
      const listRows = buildListRows();

      const clearRanges: Array<{ sheet: string; columns: number }> = [
        { sheet: 'ENTRADAS', columns: ENTRADAS_HEADERS.length },
        { sheet: 'DESPESAS', columns: DESPESAS_HEADERS.length },
        { sheet: 'RENDIMENTOS', columns: RENDIMENTOS_HEADERS.length },
        { sheet: 'CONTAS', columns: CONTAS_HEADERS.length },
        { sheet: 'CARTOES', columns: CARTOES_HEADERS.length },
        { sheet: 'LISTAS', columns: LIST_COLUMNS.length },
        { sheet: 'AJUDA', columns: 1 }
      ];

      await Promise.all(
        clearRanges.map(item =>
          clearSheetValues(token, spreadsheetId as string, `${item.sheet}!A2:${columnToLetter(item.columns - 1)}`)
        )
      );

      const valuesPayload = [
        { range: buildRange('ENTRADAS', ENTRADAS_HEADERS.length, 1), values: [ENTRADAS_HEADERS] },
        { range: buildRange('DESPESAS', DESPESAS_HEADERS.length, 1), values: [DESPESAS_HEADERS] },
        { range: buildRange('RENDIMENTOS', RENDIMENTOS_HEADERS.length, 1), values: [RENDIMENTOS_HEADERS] },
        { range: buildRange('CONTAS', CONTAS_HEADERS.length, 1), values: [CONTAS_HEADERS] },
        { range: buildRange('CARTOES', CARTOES_HEADERS.length, 1), values: [CARTOES_HEADERS] },
        { range: buildRange('LISTAS', LIST_COLUMNS.length, listRows.length), values: listRows },
        { range: `AJUDA!A1:A${HELP_TEXT.length}`, values: HELP_TEXT.map(line => [line]) }
      ];

      if (exportData.incomeRows.length) {
        valuesPayload.push({
          range: buildRange('ENTRADAS', ENTRADAS_HEADERS.length, exportData.incomeRows.length, 2),
          values: exportData.incomeRows
        });
      }
      if (exportData.expenseRows.length) {
        valuesPayload.push({
          range: buildRange('DESPESAS', DESPESAS_HEADERS.length, exportData.expenseRows.length, 2),
          values: exportData.expenseRows
        });
      }
      if (exportData.yieldRows.length) {
        valuesPayload.push({
          range: buildRange('RENDIMENTOS', RENDIMENTOS_HEADERS.length, exportData.yieldRows.length, 2),
          values: exportData.yieldRows
        });
      }
      if (exportData.accountRows.length) {
        valuesPayload.push({
          range: buildRange('CONTAS', CONTAS_HEADERS.length, exportData.accountRows.length, 2),
          values: exportData.accountRows
        });
      }
      if (exportData.cardRows.length) {
        valuesPayload.push({
          range: buildRange('CARTOES', CARTOES_HEADERS.length, exportData.cardRows.length, 2),
          values: exportData.cardRows
        });
      }

      await batchUpdateValues(token, spreadsheetId, valuesPayload);

      const requests: any[] = [];
      const dataSheetConfig = [
        { title: 'ENTRADAS', headers: ENTRADAS_HEADERS },
        { title: 'DESPESAS', headers: DESPESAS_HEADERS },
        { title: 'RENDIMENTOS', headers: RENDIMENTOS_HEADERS },
        { title: 'CONTAS', headers: CONTAS_HEADERS },
        { title: 'CARTOES', headers: CARTOES_HEADERS }
      ];

      dataSheetConfig.forEach(config => {
        const sheetId = sheetIdByTitle.get(config.title);
        if (sheetId === undefined) return;
        requests.push({
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        });
        requests.push({
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: config.headers.length
              }
            }
          }
        });
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: config.headers.length
            },
            properties: { pixelSize: 180 },
            fields: 'pixelSize'
          }
        });
      });

      const getColumnLetter = (name: string) => {
        const index = LIST_COLUMNS.indexOf(name);
        return columnToLetter(index);
      };

      const entradasId = sheetIdByTitle.get('ENTRADAS');
      if (entradasId !== undefined) {
        requests.push(buildValidationRequest(entradasId, 3, getColumnLetter('Categorias_Entradas'), true));
        requests.push(buildValidationRequest(entradasId, 5, getColumnLetter('Contas'), true));
        requests.push(buildValidationRequest(entradasId, 6, getColumnLetter('Forma_Pagamento_Entradas'), true));
        requests.push(buildValidationRequest(entradasId, 7, getColumnLetter('Status_Entradas'), true));
        requests.push(buildValidationRequest(entradasId, 8, getColumnLetter('Natureza_Fiscal'), true));
      }

      const despesasId = sheetIdByTitle.get('DESPESAS');
      if (despesasId !== undefined) {
        requests.push(buildValidationRequest(despesasId, 3, getColumnLetter('Categorias_Despesas'), true));
        requests.push(buildValidationRequest(despesasId, 5, getColumnLetter('Tipo_Despesa'), true));
        requests.push(buildValidationRequest(despesasId, 6, getColumnLetter('Forma_Pagamento_Despesas'), true));
        requests.push(buildValidationRequest(despesasId, 7, getColumnLetter('Contas'), false));
        requests.push(buildValidationRequest(despesasId, 8, getColumnLetter('Cartoes'), false));
        requests.push(buildValidationRequest(despesasId, 9, getColumnLetter('Status_Despesas'), true));
        requests.push(buildValidationRequest(despesasId, 10, getColumnLetter('Natureza_Fiscal'), true));
      }

      const rendimentosId = sheetIdByTitle.get('RENDIMENTOS');
      if (rendimentosId !== undefined) {
        requests.push(buildValidationRequest(rendimentosId, 0, getColumnLetter('Contas_Rendimentos'), true));
      }

      if (requests.length) {
        await batchUpdate(token, spreadsheetId, requests);
      }

      setPrimarySheetId(spreadsheetId);
      pushLog('success', 'Planilha atualizada no Google Drive.');
      console.log('[reports][sheets-export] create_ok', { spreadsheetId });
    } catch (error: any) {
      console.error('[reports][sheets-export] create_err', error);
      const message = error?.message || 'Falha ao criar planilha no Google Sheets.';
      pushLog('error', message);
      if (error?.status === 401 || error?.status === 403) {
        driveSessionManager.clear();
        setAccessToken(null);
        setAuthError('Permissao expirada. Reconecte o Google Drive.');
      }
    } finally {
      setCreating(false);
    }
  };

  const parseSheetValues = (
    sheet: SheetName,
    values: unknown[][] | undefined,
    expectedHeaders: string[],
    parseRow: (row: Record<string, unknown>, rowIndex: number) => void
  ) => {
    if (!values || values.length === 0) {
      pushLog('info', `Aba ${sheet} esta vazia.`);
      return;
    }

    const headerRow = values[0] as unknown[];
    const headerMap = new Map<string, number>();
    headerRow.forEach((cell, index) => {
      const label = normalizeHeaderKey(String(cell || ''));
      if (label) {
        headerMap.set(label, index);
      }
    });

    const missingHeaders = expectedHeaders.filter(header => !headerMap.has(normalizeHeaderKey(header)));
    if (missingHeaders.length) {
      pushLog('error', `Aba ${sheet} sem cabecalhos: ${missingHeaders.join(', ')}`);
      return;
    }

    values.slice(1).forEach((row, index) => {
      if (isRowEmpty(row)) return;
      const obj: Record<string, unknown> = {};
      expectedHeaders.forEach(header => {
        const idx = headerMap.get(normalizeHeaderKey(header)) ?? -1;
        obj[header] = idx >= 0 ? row[idx] : '';
      });
      parseRow(obj, index + 2);
    });
  };

  const handleLoadSheet = async () => {
    setImportRows([]);
    setImportResult(null);
    setLoadError(null);

    const token = await ensureAccessToken();
    if (!token) return;

    const spreadsheetId = extractSpreadsheetId(sheetInput);
    if (!spreadsheetId) {
      setLoadError('Informe um link ou ID valido do Google Sheets.');
      return;
    }

    setImporting(true);
    console.log('[reports][sheets-import] read_start', { spreadsheetId });
    pushLog('info', 'Lendo planilha e validando dados...');

    const nextRows: ImportRow[] = [];
    const seenIncomeKeys = new Set<string>();
    const seenExpenseKeys = new Set<string>();
    const seenYieldKeys = new Set<string>();

    try {
      const [entradasRes, despesasRes, rendimentosRes] = await Promise.all([
        getSheetValues(token, spreadsheetId, 'ENTRADAS'),
        getSheetValues(token, spreadsheetId, 'DESPESAS'),
        getSheetValues(token, spreadsheetId, 'RENDIMENTOS')
      ]);

      parseSheetValues('ENTRADAS', entradasRes.values, ENTRADAS_HEADERS, (row, rowIndex) => {
        const issues: ImportIssue[] = [];
        const dateIso = sheetDateToIso(row.Data_Recebimento);
        if (!dateIso) {
          issues.push({ level: 'error', column: 'Data_Recebimento', message: 'data invalida' });
        }

        const competenceIso = row.Data_Competencia ? sheetDateToIso(row.Data_Competencia) : null;
        if (row.Data_Competencia && !competenceIso) {
          issues.push({ level: 'error', column: 'Data_Competencia', message: 'data invalida' });
        }

        const description = String(row.Descricao ?? '').trim();
        if (!description) {
          issues.push({ level: 'error', column: 'Descricao', message: 'obrigatoria' });
        }

        const category = String(row.Categoria ?? '').trim();
        if (!category) {
          issues.push({ level: 'error', column: 'Categoria', message: 'obrigatoria' });
        } else if (!incomeCategorySet.has(normalizeText(category))) {
          issues.push({ level: 'warning', column: 'Categoria', message: 'categoria nao cadastrada', code: 'missing_category' });
        }

        const amount = parseAmount(row.Valor);
        if (amount === null || amount <= 0) {
          issues.push({ level: 'error', column: 'Valor', message: 'valor invalido' });
        }

        const accountRaw = String(row.Conta_Destino ?? '').trim();
        let accountId = '';
        if (!accountRaw) {
          issues.push({ level: 'error', column: 'Conta_Destino', message: 'obrigatoria' });
        } else {
          const accountMatch = accountLookup.get(normalizeText(accountRaw));
          if (!accountMatch) {
            issues.push({ level: 'error', column: 'Conta_Destino', message: 'conta nao encontrada' });
          } else if (accountMatch.locked) {
            issues.push({ level: 'error', column: 'Conta_Destino', message: 'conta bloqueada' });
          } else {
            accountId = accountMatch.id;
          }
        }

        let paymentMethod = normalizeIncomePaymentMethod(row.Forma_Pagamento);
        if (row.Forma_Pagamento && !paymentMethod) {
          issues.push({ level: 'error', column: 'Forma_Pagamento', message: 'forma de pagamento invalida' });
        }

        const rawStatus = row.Status;
        const rawStatusText = rawStatus === null || rawStatus === undefined ? '' : String(rawStatus).trim();
        const parsedStatus = parseIncomeStatus(rawStatusText || null);
        if (rawStatusText && !parsedStatus) {
          issues.push({ level: 'error', column: 'Status', message: 'status invalido' });
        }
        let status = parsedStatus || normalizeIncomeStatus(rawStatusText);
        if (!rawStatusText) status = 'received';

        let taxStatus = normalizeTaxStatus(row.Natureza_Fiscal);
        if (row.Natureza_Fiscal && !taxStatus) {
          issues.push({ level: 'error', column: 'Natureza_Fiscal', message: 'natureza fiscal invalida' });
        }
        if (!taxStatus) taxStatus = 'PJ';

        const notes = String(row.Observacoes ?? '').trim();

        const payload: ParsedIncome = {
          date: dateIso || '',
          competenceDate: competenceIso || dateIso || '',
          description,
          category,
          amount: amount || 0,
          accountId,
          paymentMethod: paymentMethod || undefined,
          status,
          taxStatus,
          notes: notes || undefined
        };

        const key = dateIso && amount !== null && accountId ? buildIncomeKey(payload) : '';
        const duplicate = Boolean(key && (existingIncomeKeys.has(key) || seenIncomeKeys.has(key)));
        if (key) seenIncomeKeys.add(key);
        if (duplicate) {
          issues.push({ level: 'warning', message: 'duplicado (ignorado)', code: 'duplicate' });
        }

        nextRows.push({
          id: `income-${rowIndex}-${dateIso || 'row'}`,
          sheet: 'ENTRADAS',
          rowIndex,
          kind: 'income',
          payload,
          issues,
          duplicate
        });
      });

      parseSheetValues('DESPESAS', despesasRes.values, DESPESAS_HEADERS, (row, rowIndex) => {
        const issues: ImportIssue[] = [];
        const dateIso = sheetDateToIso(row.Data_Lancamento);
        if (!dateIso) {
          issues.push({ level: 'error', column: 'Data_Lancamento', message: 'data invalida' });
        }

        const dueIso = row.Data_Vencimento ? sheetDateToIso(row.Data_Vencimento) : null;
        if (row.Data_Vencimento && !dueIso) {
          issues.push({ level: 'error', column: 'Data_Vencimento', message: 'data invalida' });
        }

        const description = String(row.Descricao ?? '').trim();
        if (!description) {
          issues.push({ level: 'error', column: 'Descricao', message: 'obrigatoria' });
        }

        const category = String(row.Categoria ?? '').trim();
        if (!category) {
          issues.push({ level: 'error', column: 'Categoria', message: 'obrigatoria' });
        } else if (!expenseCategorySet.has(normalizeText(category))) {
          issues.push({ level: 'warning', column: 'Categoria', message: 'categoria nao cadastrada', code: 'missing_category' });
        }

        const amount = parseAmount(row.Valor);
        if (amount === null || amount <= 0) {
          issues.push({ level: 'error', column: 'Valor', message: 'valor invalido' });
        }

        const type = normalizeExpenseType(row.Tipo);
        if (!type) {
          issues.push({ level: 'error', column: 'Tipo', message: 'tipo invalido' });
        }

        let paymentMethod = normalizeExpensePaymentMethod(row.Forma_Pagamento);
        if (row.Forma_Pagamento && !paymentMethod) {
          issues.push({ level: 'error', column: 'Forma_Pagamento', message: 'forma de pagamento invalida' });
        }

        const isCredit = paymentMethod === 'Crédito';
        const isBoleto = paymentMethod === 'Boleto';

        const accountRaw = String(row.Conta_Pagamento ?? '').trim();
        const cardRaw = String(row.Cartao ?? '').trim();

        let accountId: string | undefined;
        let cardId: string | undefined;

        if (isCredit) {
          if (!cardRaw) {
            issues.push({ level: 'error', column: 'Cartao', message: 'cartao obrigatorio para credito' });
          } else {
            const cardMatch = cardLookup.get(normalizeText(cardRaw));
            if (!cardMatch) {
              issues.push({ level: 'error', column: 'Cartao', message: 'cartao nao encontrado' });
            } else {
              cardId = cardMatch.id;
            }
          }
          if (accountRaw) {
            issues.push({ level: 'error', column: 'Conta_Pagamento', message: 'nao usar conta quando for credito' });
          }
        } else {
          if (!accountRaw) {
            issues.push({ level: 'error', column: 'Conta_Pagamento', message: 'conta obrigatoria' });
          } else {
            const accountMatch = accountLookup.get(normalizeText(accountRaw));
            if (!accountMatch) {
              issues.push({ level: 'error', column: 'Conta_Pagamento', message: 'conta nao encontrada' });
            } else if (accountMatch.locked) {
              issues.push({ level: 'error', column: 'Conta_Pagamento', message: 'conta bloqueada' });
            } else {
              accountId = accountMatch.id;
            }
          }
          if (cardRaw) {
            issues.push({ level: 'error', column: 'Cartao', message: 'cartao informado sem forma de pagamento credito' });
          }
        }

        const rawStatus = row.Status;
        const rawStatusText = rawStatus === null || rawStatus === undefined ? '' : String(rawStatus).trim();
        const parsedStatus = parseExpenseStatus(rawStatusText || null);
        if (rawStatusText && !parsedStatus) {
          issues.push({ level: 'error', column: 'Status', message: 'status invalido' });
        }
        let status = parsedStatus || normalizeExpenseStatus(rawStatusText);
        if (!rawStatusText) {
          status = isCredit || isBoleto ? 'pending' : 'paid';
        }

        let taxStatus = normalizeTaxStatus(row.Natureza_Fiscal);
        if (row.Natureza_Fiscal && !taxStatus) {
          issues.push({ level: 'error', column: 'Natureza_Fiscal', message: 'natureza fiscal invalida' });
        }
        if (!taxStatus) {
          taxStatus = type === 'personal' ? 'PF' : 'PJ';
        }

        if (!paymentMethod) {
          paymentMethod = 'Débito';
        }

        const notes = String(row.Observacoes ?? '').trim();

        const payload: ParsedExpense = {
          date: dateIso || '',
          dueDate: dueIso || dateIso || '',
          description,
          category,
          amount: amount || 0,
          type: type || 'variable',
          paymentMethod,
          accountId,
          cardId,
          status,
          taxStatus,
          notes: notes || undefined
        };

        const key = dateIso && amount !== null && (accountId || cardId) ? buildExpenseKey(payload) : '';
        const duplicate = Boolean(key && (existingExpenseKeys.has(key) || seenExpenseKeys.has(key)));
        if (key) seenExpenseKeys.add(key);
        if (duplicate) {
          issues.push({ level: 'warning', message: 'duplicado (ignorado)', code: 'duplicate' });
        }

        nextRows.push({
          id: `expense-${rowIndex}-${dateIso || 'row'}`,
          sheet: 'DESPESAS',
          rowIndex,
          kind: 'expense',
          payload,
          issues,
          duplicate
        });
      });

      parseSheetValues('RENDIMENTOS', rendimentosRes.values, RENDIMENTOS_HEADERS, (row, rowIndex) => {
        const issues: ImportIssue[] = [];
        const dateIso = sheetDateToIso(row.Data);
        if (!dateIso) {
          issues.push({ level: 'error', column: 'Data', message: 'data invalida' });
        }

        const amount = parseAmount(row.Valor);
        if (amount === null || amount <= 0) {
          issues.push({ level: 'error', column: 'Valor', message: 'valor invalido' });
        }

        const accountRaw = String(row.Conta ?? '').trim();
        let accountId = '';
        if (!accountRaw) {
          issues.push({ level: 'error', column: 'Conta', message: 'conta obrigatoria' });
        } else {
          const accountMatch = accountLookup.get(normalizeText(accountRaw));
          if (!accountMatch) {
            issues.push({ level: 'error', column: 'Conta', message: 'conta nao encontrada' });
          } else if (accountMatch.locked) {
            issues.push({ level: 'error', column: 'Conta', message: 'conta bloqueada' });
          } else {
            accountId = accountMatch.id;
          }
        }

        const notes = String(row.Observacoes ?? '').trim();

        const payload: ParsedYield = {
          accountId,
          date: dateIso || '',
          amount: amount || 0,
          notes: notes || undefined
        };

        const key = dateIso && amount !== null && accountId ? buildYieldKey(payload) : '';
        const duplicate = Boolean(key && (existingYieldKeys.has(key) || seenYieldKeys.has(key)));
        if (key) seenYieldKeys.add(key);
        if (duplicate) {
          issues.push({ level: 'warning', message: 'duplicado (ignorado)', code: 'duplicate' });
        }

        nextRows.push({
          id: `yield-${rowIndex}-${dateIso || 'row'}`,
          sheet: 'RENDIMENTOS',
          rowIndex,
          kind: 'yield',
          payload,
          issues,
          duplicate
        });
      });

      setImportRows(nextRows);
      console.log('[reports][sheets-import] read_ok', { total: nextRows.length });
      pushLog('success', 'Planilha lida com sucesso. Revise o preview antes de importar.');
    } catch (error: any) {
      console.error('[reports][sheets-import] read_err', error);
      const message = error?.message || 'Falha ao ler planilha do Google Sheets.';
      setLoadError(message);
      pushLog('error', message);
      if (error?.status === 401 || error?.status === 403) {
        driveSessionManager.clear();
        setAccessToken(null);
        setAuthError('Permissao expirada. Reconecte o Google Drive.');
      }
    } finally {
      setImporting(false);
    }
  };

  const resolvedRows = useMemo(() => {
    return importRows.map(row => ({
      ...row,
      status: resolveStatus(row, allowMissingCategories)
    }));
  }, [allowMissingCategories, importRows]);

  const summaryBySheet = useMemo(() => {
    const base = {
      ENTRADAS: { valid: 0, warning: 0, error: 0, ignored: 0 },
      DESPESAS: { valid: 0, warning: 0, error: 0, ignored: 0 },
      RENDIMENTOS: { valid: 0, warning: 0, error: 0, ignored: 0 }
    } as Record<'ENTRADAS' | 'DESPESAS' | 'RENDIMENTOS', Record<ImportStatus, number>>;

    resolvedRows.forEach(row => {
      if (row.sheet === 'ENTRADAS' || row.sheet === 'DESPESAS' || row.sheet === 'RENDIMENTOS') {
        base[row.sheet][row.status] += 1;
      }
    });

    return base;
  }, [resolvedRows]);

  const overallSummary = useMemo(() => {
    const valid = resolvedRows.filter(row => row.status === 'valid').length;
    const warning = resolvedRows.filter(row => row.status === 'warning').length;
    const error = resolvedRows.filter(row => row.status === 'error').length;
    const ignored = resolvedRows.filter(row => row.status === 'ignored').length;
    return { valid, warning, error, ignored };
  }, [resolvedRows]);

  const handleConfirmImport = async () => {
    if (!licenseId || !licenseEpoch) {
      setLoadError('Licenca invalida para importacao.');
      return;
    }

    const importable = resolvedRows.filter(row => row.status === 'valid' || row.status === 'warning');
    if (importable.length === 0) return;

    setImporting(true);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];

    const missingIncomeCategories = new Set<string>();
    const missingExpenseCategories = new Set<string>();

    if (allowMissingCategories) {
      importable.forEach(row => {
        if (row.kind === 'income') {
          const payload = row.payload as ParsedIncome;
          if (payload.category && !incomeCategorySet.has(normalizeText(payload.category))) {
            missingIncomeCategories.add(payload.category);
          }
        }
        if (row.kind === 'expense') {
          const payload = row.payload as ParsedExpense;
          if (payload.category && !expenseCategorySet.has(normalizeText(payload.category))) {
            missingExpenseCategories.add(payload.category);
          }
        }
      });
    }

    try {
      if (allowMissingCategories && (missingIncomeCategories.size || missingExpenseCategories.size)) {
        for (const cat of missingIncomeCategories) {
          await categoryService.addCategory(licenseId, 'incomes', cat);
        }
        for (const cat of missingExpenseCategories) {
          await categoryService.addCategory(licenseId, 'expenses', cat);
        }
        setCategories(prev => ({
          incomes: [...prev.incomes, ...missingIncomeCategories],
          expenses: [...prev.expenses, ...missingExpenseCategories]
        }));
      }

      const incomesToUpsert: Income[] = [];
      const expensesToUpsert: Expense[] = [];
      const yieldRows = importable.filter(row => row.kind === 'yield');

      importable.forEach(row => {
        if (row.kind === 'income') {
          const payload = row.payload as ParsedIncome;
          incomesToUpsert.push({
            id: Math.random().toString(36).slice(2, 9),
            description: payload.description,
            amount: payload.amount,
            category: payload.category || 'Sem categoria',
            date: payload.date,
            competenceDate: payload.competenceDate || payload.date,
            accountId: payload.accountId,
            status: payload.status,
            paymentMethod: payload.paymentMethod,
            taxStatus: payload.taxStatus,
            notes: payload.notes
          });
        }
        if (row.kind === 'expense') {
          const payload = row.payload as ParsedExpense;
          expensesToUpsert.push({
            id: Math.random().toString(36).slice(2, 9),
            description: payload.description,
            amount: payload.amount,
            category: payload.category || 'Sem categoria',
            date: payload.date,
            dueDate: payload.dueDate || payload.date,
            paymentMethod: payload.paymentMethod,
            accountId: payload.accountId,
            cardId: payload.cardId,
            status: payload.status,
            type: payload.type,
            taxStatus: payload.taxStatus,
            notes: payload.notes
          });
        }
      });

      if (incomesToUpsert.length > 0) {
        try {
          await dataService.upsertIncomes(incomesToUpsert, licenseId, licenseEpoch);
          ok += incomesToUpsert.length;
        } catch (error: any) {
          failed += incomesToUpsert.length;
          errors.push(error?.message || 'Falha ao importar entradas.');
        }
      }

      if (expensesToUpsert.length > 0) {
        try {
          await dataService.upsertExpenses(expensesToUpsert, licenseId, licenseEpoch);
          ok += expensesToUpsert.length;
        } catch (error: any) {
          failed += expensesToUpsert.length;
          errors.push(error?.message || 'Falha ao importar despesas.');
        }
      }

      const updatedAccounts = new Map(accounts.map(acc => [acc.id, { ...acc }]));
      const updatedAccountIds = new Set<string>();

      for (const row of yieldRows) {
        const payload = row.payload as ParsedYield;
        try {
          await yieldsService.addYield(
            licenseId,
            {
              accountId: payload.accountId,
              amount: payload.amount,
              date: payload.date,
              notes: payload.notes
            },
            licenseEpoch
          );
          ok += 1;

          const account = updatedAccounts.get(payload.accountId);
          const mutationId = `yield:import:${payload.accountId}:${payload.date}:${payload.amount}`;
          const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
            source: 'reports_import',
            action: 'yield_import',
            accountId: payload.accountId,
            entityId: payload.accountId,
            amount: payload.amount,
            status: 'applied'
          });
          if (account && !account.locked && shouldApply) {
            const baseBalance = Number.isFinite(account.currentBalance) ? account.currentBalance : 0;
            const nextBalance = baseBalance + payload.amount;
            const history = account.balanceHistory ? [...account.balanceHistory] : [];
            const historyIndex = history.findIndex(entry => entry.date === payload.date);
            if (historyIndex >= 0) {
              const existing = history[historyIndex];
              const existingValue = typeof existing.value === 'number' ? existing.value : baseBalance;
              history[historyIndex] = { ...existing, value: existingValue + payload.amount };
            } else {
              history.push({ date: payload.date, value: nextBalance });
              history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            }

            const yieldHistory = account.yieldHistory ? [...account.yieldHistory] : [];
            const yieldIndex = yieldHistory.findIndex(entry => entry.date === payload.date);
            if (yieldIndex >= 0) {
              yieldHistory[yieldIndex] = {
                ...yieldHistory[yieldIndex],
                amount: payload.amount,
                notes: payload.notes
              };
            } else {
              yieldHistory.push({ date: payload.date, amount: payload.amount, notes: payload.notes });
            }

            updatedAccounts.set(payload.accountId, {
              ...account,
              currentBalance: nextBalance,
              lastYield: payload.amount,
              lastYieldDate: payload.date,
              lastYieldNote: payload.notes,
              balanceHistory: history,
              yieldHistory
            });
            updatedAccountIds.add(payload.accountId);
          }
        } catch (error: any) {
          failed += 1;
          errors.push(error?.message || 'Falha ao importar rendimentos.');
        }
      }

      if (updatedAccountIds.size > 0) {
        const toUpdate = Array.from(updatedAccountIds).map(id => updatedAccounts.get(id)).filter(Boolean) as Account[];
        try {
          await dataService.upsertAccounts(toUpdate, licenseId, licenseEpoch);
          setAccounts(prev => prev.map(acc => updatedAccounts.get(acc.id) || acc));
        } catch (error) {
          console.error('[reports][sheets-import] account_update_failed', error);
        }
      }

      const newIncomeKeys = incomesToUpsert.map(item => buildIncomeKey({
        date: item.date,
        competenceDate: item.competenceDate,
        description: item.description,
        category: item.category,
        amount: item.amount,
        accountId: item.accountId,
        paymentMethod: item.paymentMethod,
        status: item.status,
        taxStatus: item.taxStatus || 'PJ',
        notes: item.notes
      }));
      const newExpenseKeys = expensesToUpsert.map(item => buildExpenseKey({
        date: item.date,
        dueDate: item.dueDate,
        description: item.description,
        category: item.category,
        amount: item.amount,
        type: item.type,
        paymentMethod: item.paymentMethod,
        accountId: item.accountId,
        cardId: item.cardId,
        status: item.status,
        taxStatus: item.taxStatus || 'PJ',
        notes: item.notes
      }));
      const newYieldKeys = yieldRows.map(row => buildYieldKey(row.payload as ParsedYield));

      setImportedKeys(prev => ({
        incomes: [...prev.incomes, ...newIncomeKeys],
        expenses: [...prev.expenses, ...newExpenseKeys],
        yields: [...prev.yields, ...newYieldKeys]
      }));

      const ignoredCount = resolvedRows.filter(row => row.status === 'ignored').length;
      setImportResult({ ok, ignored: ignoredCount, failed, errors });
      pushLog('success', `Importacao concluida. ${ok} importados, ${ignoredCount} ignorados, ${failed} falharam.`);
      console.log('[reports][sheets-import] import_ok', { ok, ignored: ignoredCount, failed });
    } finally {
      setImporting(false);
    }
  };

  const rowLabel = (row: ImportRow) => {
    if (row.kind === 'income') {
      const payload = row.payload as ParsedIncome;
      return payload.description || 'Entrada';
    }
    if (row.kind === 'expense') {
      const payload = row.payload as ParsedExpense;
      return payload.description || 'Despesa';
    }
    const payload = row.payload as ParsedYield;
    const accountName = accounts.find(acc => acc.id === payload.accountId)?.name || 'Conta';
    return accountName;
  };

  const rowDate = (row: ImportRow) => {
    if (row.kind === 'yield') return (row.payload as ParsedYield).date;
    return (row.payload as ParsedIncome | ParsedExpense).date;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Exportar / Importar</h2>
        <p className="text-sm text-slate-300">
          Conecte seu Google Drive para criar uma planilha com dropdowns e importar os dados.
        </p>
      </div>

      {!accessToken && (
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="text-sm text-slate-300">
            <p className="font-semibold text-white">Conectar Google Drive</p>
            <p className="mt-2">
              Para criar a planilha no seu Drive, precisamos de permissao para criar e editar este arquivo.
              Usamos apenas o escopo <span className="text-white">drive.file</span> para arquivos criados pelo app.
            </p>
          </div>
          {authError && (
            <div className="text-sm text-rose-400 flex items-center gap-2">
              <AlertTriangle size={16} /> {authError}
            </div>
          )}
          <button
            onClick={ensureAccessToken}
            disabled={authBusy}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-400/90 text-slate-900 px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {authBusy ? 'Conectando...' : 'Conectar Google Drive'}
          </button>
        </div>
      )}

      {accessToken && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Download size={18} /> Criar planilha
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setExportMode('month')}
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  exportMode === 'month'
                    ? 'bg-white text-slate-900'
                    : 'bg-white/10 text-slate-200'
                }`}
              >
                Periodo selecionado
              </button>
              <button
                onClick={() => setExportMode('custom')}
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  exportMode === 'custom'
                    ? 'bg-white text-slate-900'
                    : 'bg-white/10 text-slate-200'
                }`}
              >
                Intervalo personalizado
              </button>
            </div>
            {exportMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-400">Inicio</label>
                  <input
                    type="date"
                    value={exportRange.start}
                    onChange={event => setExportRange(prev => ({ ...prev, start: event.target.value }))}
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-400">Fim</label>
                  <input
                    type="date"
                    value={exportRange.end}
                    onChange={event => setExportRange(prev => ({ ...prev, end: event.target.value }))}
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleCreateSheet}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400/90 text-slate-900 px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {creating ? 'Criando...' : 'Criar Planilha no Google Sheets'}
            </button>
            {primarySheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${primarySheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
              >
                <Link2 size={16} /> Abrir Planilha
              </a>
            )}
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <UploadCloud size={18} /> Importar de planilha existente
            </div>
            <input
              type="text"
              value={sheetInput}
              onChange={event => setSheetInput(event.target.value)}
              placeholder="Cole o link ou ID da planilha"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
            <button
              onClick={handleLoadSheet}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-400/90 text-slate-900 px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {importing ? 'Lendo...' : 'Importar desta Planilha'}
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={allowMissingCategories}
                onChange={event => setAllowMissingCategories(event.target.checked)}
              />
              Criar categorias ausentes automaticamente
            </label>
          </div>
        </div>
      )}

      {loadError && (
        <div className="text-sm text-rose-400 flex items-center gap-2">
          <AlertTriangle size={16} /> {loadError}
        </div>
      )}

      {logs.length > 0 && (
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              className={`text-xs rounded-xl px-3 py-2 border ${
                log.type === 'success'
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                  : log.type === 'error'
                    ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                    : 'border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              {log.message}
            </div>
          ))}
        </div>
      )}

      {resolvedRows.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Validos</div>
              <div className="text-lg font-semibold text-white">{overallSummary.valid}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Com alerta</div>
              <div className="text-lg font-semibold text-amber-300">{overallSummary.warning}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Com erro</div>
              <div className="text-lg font-semibold text-rose-300">{overallSummary.error}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-slate-400">Ignorados</div>
              <div className="text-lg font-semibold text-slate-300">{overallSummary.ignored}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">Entradas</div>
              <div className="mt-2 space-y-1">
                <div>Validas: {summaryBySheet.ENTRADAS.valid}</div>
                <div>Erros: {summaryBySheet.ENTRADAS.error}</div>
                <div>Ignoradas: {summaryBySheet.ENTRADAS.ignored}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">Despesas</div>
              <div className="mt-2 space-y-1">
                <div>Validas: {summaryBySheet.DESPESAS.valid}</div>
                <div>Erros: {summaryBySheet.DESPESAS.error}</div>
                <div>Ignoradas: {summaryBySheet.DESPESAS.ignored}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs uppercase tracking-widest text-slate-400">Rendimentos</div>
              <div className="mt-2 space-y-1">
                <div>Validas: {summaryBySheet.RENDIMENTOS.valid}</div>
                <div>Erros: {summaryBySheet.RENDIMENTOS.error}</div>
                <div>Ignoradas: {summaryBySheet.RENDIMENTOS.ignored}</div>
              </div>
            </div>
          </div>

          <button
            onClick={handleConfirmImport}
            disabled={importing || (!allowMissingCategories && overallSummary.valid === 0)}
            className="w-full rounded-full bg-cyan-400/90 text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {importing ? 'Importando...' : 'Confirmar importacao'}
          </button>

          {importResult && (
            <div className="text-sm text-slate-200 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {importResult.ok} importados • {importResult.ignored} ignorados • {importResult.failed} falharam
            </div>
          )}

          {importResult?.errors?.length ? (
            <div className="text-xs text-rose-300">
              {importResult.errors.join(' • ')}
            </div>
          ) : null}

          <div className="max-h-60 overflow-auto text-xs text-slate-300 space-y-2">
            {resolvedRows.map(row => (
              <div
                key={row.id}
                className={`rounded-xl border px-3 py-2 ${
                  row.status === 'valid'
                    ? 'border-emerald-400/40 bg-emerald-400/10'
                    : row.status === 'warning'
                      ? 'border-amber-400/40 bg-amber-400/10'
                      : row.status === 'ignored'
                        ? 'border-slate-500/40 bg-slate-500/10'
                        : 'border-rose-400/40 bg-rose-400/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>
                    {row.sheet} • Linha {row.rowIndex}
                  </span>
                  <span className="uppercase tracking-widest">
                    {row.status === 'valid'
                      ? 'OK'
                      : row.status === 'warning'
                        ? 'ALERTA'
                        : row.status === 'ignored'
                          ? 'IGNORADO'
                          : 'ERRO'}
                  </span>
                </div>
                {row.issues.length > 0 && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    {row.issues
                      .map(issue => issue.column ? `${issue.column}: ${issue.message}` : issue.message)
                      .join(' • ')}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-slate-500">
                  {rowDate(row)} • {row.kind} • {formatCurrency(row.payload.amount)} • {rowLabel(row)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportImportPanel;
