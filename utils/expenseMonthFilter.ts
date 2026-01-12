import type { Expense } from '../types';

type MonthExpenseResult = {
  monthLabel: string;
  monthExpensesAll: Expense[];
  monthExpensesPaid: Expense[];
  paidCount: number;
  pendingCount: number;
  totalAll: number;
  totalPaid: number;
  totalPending: number;
};

type MonthExpenseOptions = {
  source?: string;
  variant?: string;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : `${value}T12:00:00`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === 'number') {
      const d = new Date(seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
};

export const resolveExpenseDate = (expense: Expense): Date | null => {
  const primary = toDate(expense.date);
  if (primary) return primary;
  const paidAt = toDate((expense as { paidAt?: unknown }).paidAt);
  if (paidAt) return paidAt;
  const createdAt = toDate((expense as { createdAt?: unknown }).createdAt);
  if (createdAt) return createdAt;
  return null;
};

export const getMonthExpenses = (
  expenses: Expense[],
  options: MonthExpenseOptions & { viewDate?: Date; startDate?: Date; endDate?: Date }
): MonthExpenseResult => {
  const referenceDate = options.viewDate ?? new Date();
  const start = options.startDate ? new Date(options.startDate) : new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = options.endDate ? new Date(options.endDate) : new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const monthLabel = options.startDate && options.endDate
    ? `${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`
    : `${start.toLocaleDateString('pt-BR', { month: 'long' })}/${start.getFullYear()}`;

  const monthExpensesAll = expenses.filter(expense => {
    const date = resolveExpenseDate(expense);
    if (!date) return false;
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  });

  const monthExpensesPaid = monthExpensesAll.filter(expense => expense.status === 'paid');
  const paidCount = monthExpensesPaid.length;
  const pendingCount = monthExpensesAll.filter(expense => expense.status === 'pending').length;
  const totalAll = monthExpensesAll.reduce((sum, expense) => sum + expense.amount, 0);
  const totalPaid = monthExpensesPaid.reduce((sum, expense) => sum + expense.amount, 0);
  const totalPending = totalAll - totalPaid;

  console.info('[month-expenses] summary', {
    source: options?.source || null,
    variant: options?.variant || null,
    monthLabel,
    allCount: monthExpensesAll.length,
    paidCount,
    pendingCount,
    totalAll: Number(totalAll.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalPending: Number(totalPending.toFixed(2))
  });

  return {
    monthLabel,
    monthExpensesAll,
    monthExpensesPaid,
    paidCount,
    pendingCount,
    totalAll: Number(totalAll.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalPending: Number(totalPending.toFixed(2))
  };
};
