import type { Account, Expense, Income } from '../types';
import type { YieldRecord } from './yieldsService';

type BalanceTrailType = 'base' | 'income' | 'expense' | 'yield';

export type BalanceTrailEntry = {
  type: BalanceTrailType;
  id: string;
  date: string;
  amount: number;
  sign: 1 | -1 | 0;
  reason: string;
};

export type RealBalanceDebug = {
  trailsByAccountId: Record<string, BalanceTrailEntry[]>;
};

export type RealBalanceStats = {
  incomes: number;
  expenses: number;
  yields: number;
  cutoff: string;
};

export type RealBalanceResult = {
  byAccountId: Record<string, number>;
  total: number;
  diffs: Record<string, number>;
  stats: RealBalanceStats;
  debug?: RealBalanceDebug;
};

type ComputeParams = {
  accounts: Account[];
  incomes: Income[];
  expenses: Expense[];
  yields: YieldRecord[];
  viewDate: Date;
  options?: {
    includeUpToEndOfMonth?: boolean;
    debug?: boolean;
  };
};

const roundToCents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildCutoffDate = (viewDate: Date, includeUpToEndOfMonth: boolean) => {
  if (!viewDate) return new Date();
  if (includeUpToEndOfMonth) {
    return new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return new Date(viewDate);
};

const resolveBaseBalance = (account: Account) => {
  const initial = Number.isFinite(account.initialBalance) ? account.initialBalance : null;
  if (initial !== null) return roundToCents(initial);
  if (Array.isArray(account.balanceHistory) && account.balanceHistory.length) {
    const sorted = [...account.balanceHistory]
      .filter(entry => Number.isFinite(entry.value))
      .sort((a, b) => new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime());
    if (sorted.length) return roundToCents(sorted[0].value);
  }
  return 0;
};

export const computeRealBalances = ({
  accounts,
  incomes,
  expenses,
  yields,
  viewDate,
  options
}: ComputeParams): RealBalanceResult => {
  const includeUpToEndOfMonth = options?.includeUpToEndOfMonth ?? true;
  const debugEnabled = Boolean(options?.debug);
  const cutoffDate = buildCutoffDate(viewDate, includeUpToEndOfMonth);
  const cutoffLabel = cutoffDate.toISOString().split('T')[0];

  const accountIds = new Set(accounts.map(account => account.id));
  const trailsByAccountId: Record<string, BalanceTrailEntry[]> = {};

  const pushTrail = (accountId: string, entry: BalanceTrailEntry) => {
    if (!debugEnabled) return;
    if (!trailsByAccountId[accountId]) {
      trailsByAccountId[accountId] = [];
    }
    trailsByAccountId[accountId].push(entry);
  };

  const byAccountId: Record<string, number> = {};
  accounts.forEach(account => {
    const base = resolveBaseBalance(account);
    byAccountId[account.id] = base;
    pushTrail(account.id, {
      type: 'base',
      id: account.id,
      date: cutoffLabel,
      amount: base,
      sign: 0,
      reason: 'initial_balance'
    });
  });

  let countedIncomes = 0;
  let countedExpenses = 0;
  let countedYields = 0;

  incomes.forEach(income => {
    if (income.status !== 'received') return;
    if (!income.accountId || !accountIds.has(income.accountId)) return;
    const dateValue = income.competenceDate || income.date;
    const parsed = parseDate(dateValue);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const amount = roundToCents(income.amount);
    const next = roundToCents((byAccountId[income.accountId] || 0) + amount);
    byAccountId[income.accountId] = next;
    countedIncomes += 1;
    pushTrail(income.accountId, {
      type: 'income',
      id: income.id,
      date: dateValue,
      amount,
      sign: 1,
      reason: 'received'
    });
  });

  expenses.forEach(expense => {
    if (expense.status !== 'paid') return;
    if (!expense.accountId || !accountIds.has(expense.accountId)) return;
    const dateValue = expense.dueDate || expense.date;
    const parsed = parseDate(dateValue);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const amount = roundToCents(expense.amount);
    const next = roundToCents((byAccountId[expense.accountId] || 0) - amount);
    byAccountId[expense.accountId] = next;
    countedExpenses += 1;
    pushTrail(expense.accountId, {
      type: 'expense',
      id: expense.id,
      date: dateValue,
      amount,
      sign: -1,
      reason: 'paid'
    });
  });

  yields.forEach(yieldRecord => {
    if (!yieldRecord.accountId || !accountIds.has(yieldRecord.accountId)) return;
    const parsed = parseDate(yieldRecord.date);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const amount = roundToCents(yieldRecord.amount);
    const next = roundToCents((byAccountId[yieldRecord.accountId] || 0) + amount);
    byAccountId[yieldRecord.accountId] = next;
    countedYields += 1;
    pushTrail(yieldRecord.accountId, {
      type: 'yield',
      id: yieldRecord.id,
      date: yieldRecord.date,
      amount,
      sign: 1,
      reason: 'yield'
    });
  });

  const diffs: Record<string, number> = {};
  let total = 0;
  accounts.forEach(account => {
    const computed = roundToCents(byAccountId[account.id] || 0);
    total = roundToCents(total + computed);
    diffs[account.id] = roundToCents(computed - (account.currentBalance || 0));
  });

  return {
    byAccountId,
    total,
    diffs,
    stats: {
      incomes: countedIncomes,
      expenses: countedExpenses,
      yields: countedYields,
      cutoff: cutoffLabel
    },
    debug: debugEnabled ? { trailsByAccountId } : undefined
  };
};
