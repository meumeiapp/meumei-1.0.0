import type { Account, Expense, Income, Transfer } from '../types';
import type { YieldRecord } from './yieldsService';

type BalanceTrailType = 'base' | 'income' | 'expense' | 'transfer' | 'yield';

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
  transfers: number;
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
  transfers: Transfer[];
  yields: YieldRecord[];
  viewDate: Date;
  options?: {
    includeUpToEndOfMonth?: boolean;
    debug?: boolean;
  };
};

const roundToCents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('T')) {
    const iso = new Date(trimmed);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const parsed = new Date(`${year}-${month}-${day}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const parsed = new Date(`${trimmed}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashMatch) {
    const parsed = new Date(`${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const buildCutoffDate = (viewDate: Date, includeUpToEndOfMonth: boolean) => {
  if (!viewDate) return new Date();
  if (includeUpToEndOfMonth) {
    return new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return new Date(viewDate);
};

const resolveBalanceAnchor = (account: Account, cutoffDate: Date) => {
  let anchorDate: Date | null = null;
  let anchorValue: number | null = null;
  if (Array.isArray(account.balanceHistory) && account.balanceHistory.length) {
    const sorted = [...account.balanceHistory]
      .map(entry => {
        const parsed = parseDate(entry.date);
        const value = toFiniteNumber(entry.value);
        const previousValue = toFiniteNumber((entry as any).previousValue);
        const newValue = toFiniteNumber((entry as any).newValue);
        const delta = toFiniteNumber((entry as any).delta);
        const source = String((entry as any).source || '').trim().toLowerCase();
        return Number.isFinite(entry.value) && parsed
          ? { ...entry, value: Number(entry.value), previousValue, newValue, delta, source, parsed }
          : (value !== null && parsed
              ? { ...entry, value, previousValue, newValue, delta, source, parsed }
              : null);
      })
      .filter(
        (
          entry
        ): entry is {
          date: string;
          value: number;
          previousValue: number | null;
          newValue: number | null;
          delta: number | null;
          source: string;
          parsed: Date;
        } => Boolean(entry)
      )
      .filter(entry => !['invoice_pay', 'invoice_reopen', 'invoice_payment', 'invoice_reversal'].includes(entry.source))
      .filter(entry => {
        // Legacy snapshots with no source and empty deltas are auto-generated checkpoints.
        // Using them as anchors can freeze stale balances after deletes.
        const hasSource = entry.source.length > 0;
        if (hasSource) return true;
        const previous = Math.abs(Number(entry.previousValue || 0));
        const next = Math.abs(Number(entry.newValue || 0));
        const delta = Math.abs(Number(entry.delta || 0));
        return previous > 0.0001 || next > 0.0001 || delta > 0.0001;
      })
      .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());
    if (sorted.length) {
      const preferred = sorted.filter(entry =>
        ['manual_edit', 'manual_adjustment'].includes(entry.source)
      );
      const pool = preferred.length ? preferred : sorted;
      const eligible = pool.filter(entry => entry.parsed.getTime() <= cutoffDate.getTime());
      const chosen = eligible.length ? eligible[eligible.length - 1] : null;
      if (chosen) {
        anchorDate = chosen.parsed;
        anchorValue = chosen.value;
      }
    }
  }
  if (anchorValue === null) {
    const initial = Number.isFinite(account.initialBalance) ? account.initialBalance : null;
    if (initial !== null) {
      anchorValue = initial;
    } else {
      anchorValue = 0;
    }
  }
  return {
    value: roundToCents(anchorValue),
    date: anchorDate
  };
};

export const computeRealBalances = ({
  accounts,
  incomes,
  expenses,
  transfers,
  yields,
  viewDate,
  options
}: ComputeParams): RealBalanceResult => {
  const includeUpToEndOfMonth = options?.includeUpToEndOfMonth ?? true;
  const debugEnabled = Boolean(options?.debug);
  const cutoffDate = buildCutoffDate(viewDate, includeUpToEndOfMonth);
  const cutoffLabel = cutoffDate.toISOString().split('T')[0];

  console.info('[balances] recompute start', {
    cutoff: cutoffLabel,
    accounts: accounts.length,
    incomes: incomes.length,
    expenses: expenses.length,
    transfers: transfers.length,
    yields: yields.length
  });

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
  const anchorByAccountId: Record<string, Date | null> = {};

  accounts.forEach(account => {
    const anchor = resolveBalanceAnchor(account, cutoffDate);
    anchorByAccountId[account.id] = anchor.date;
    byAccountId[account.id] = anchor.value;
    pushTrail(account.id, {
      type: 'base',
      id: account.id,
      date: anchor.date ? anchor.date.toISOString().split('T')[0] : cutoffLabel,
      amount: anchor.value,
      sign: 0,
      reason: anchor.date ? 'manual_adjustment' : 'initial_balance'
    });
  });

  let countedIncomes = 0;
  let countedExpenses = 0;
  let countedTransfers = 0;
  let countedYields = 0;

  incomes.forEach(income => {
    if (income.status !== 'received') return;
    if (!income.accountId || !accountIds.has(income.accountId)) return;
    const dateValue = income.competenceDate || income.date;
    const parsed = parseDate(dateValue);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const anchorDate = anchorByAccountId[income.accountId];
    // Using <= here drops same-day launches created after a manual anchor and causes
    // "received but not credited" behavior in accounts. Keep only strictly older items out.
    if (anchorDate && parsed.getTime() < anchorDate.getTime()) return;
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
    if (expense.origin === 'invoice_payment' || expense.origin === 'invoice_reversal') {
      // allow invoice ledger to impact cash
    } else if (expense.cardId && expense.paymentMethod === 'Crédito') {
      // credit card purchases do not impact cash directly
      return;
    }
    const dateValue = (expense as { paidAt?: string }).paidAt || expense.dueDate || expense.date;
    const parsed = parseDate(dateValue);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const anchorDate = anchorByAccountId[expense.accountId];
    if (anchorDate && parsed.getTime() < anchorDate.getTime()) return;
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

  transfers.forEach(transfer => {
    if (transfer.status !== 'completed') return;
    if (!transfer.fromAccountId || !transfer.toAccountId) return;
    if (transfer.fromAccountId === transfer.toAccountId) return;
    if (!accountIds.has(transfer.fromAccountId) || !accountIds.has(transfer.toAccountId)) return;
    const parsed = parseDate(transfer.date);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;

    const amount = roundToCents(transfer.amount);
    if (amount <= 0) return;

    let applied = false;

    const fromAnchorDate = anchorByAccountId[transfer.fromAccountId];
    if (!fromAnchorDate || parsed.getTime() >= fromAnchorDate.getTime()) {
      const nextFrom = roundToCents((byAccountId[transfer.fromAccountId] || 0) - amount);
      byAccountId[transfer.fromAccountId] = nextFrom;
      applied = true;
      pushTrail(transfer.fromAccountId, {
        type: 'transfer',
        id: transfer.id,
        date: transfer.date,
        amount,
        sign: -1,
        reason: 'transfer_out'
      });
    }

    const toAnchorDate = anchorByAccountId[transfer.toAccountId];
    // Transfer on the same day must be applied; otherwise one side can remain stale
    // when a manual anchor exists for that day (observed in production on accounts view).
    if (!toAnchorDate || parsed.getTime() >= toAnchorDate.getTime()) {
      const nextTo = roundToCents((byAccountId[transfer.toAccountId] || 0) + amount);
      byAccountId[transfer.toAccountId] = nextTo;
      applied = true;
      pushTrail(transfer.toAccountId, {
        type: 'transfer',
        id: transfer.id,
        date: transfer.date,
        amount,
        sign: 1,
        reason: 'transfer_in'
      });
    }

    if (applied) {
      countedTransfers += 1;
    }
  });

  yields.forEach(yieldRecord => {
    if (!yieldRecord.accountId || !accountIds.has(yieldRecord.accountId)) return;
    const parsed = parseDate(yieldRecord.date);
    if (!parsed || parsed.getTime() > cutoffDate.getTime()) return;
    const anchorDate = anchorByAccountId[yieldRecord.accountId];
    if (anchorDate && parsed.getTime() < anchorDate.getTime()) return;
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

  console.info('[balances] recompute result', {
    total,
    accounts: byAccountId
  });

  return {
    byAccountId,
    total,
    diffs,
    stats: {
      incomes: countedIncomes,
      expenses: countedExpenses,
      transfers: countedTransfers,
      yields: countedYields,
      cutoff: cutoffLabel
    },
    debug: debugEnabled ? { trailsByAccountId } : undefined
  };
};
