import type { Expense } from '../types';
import { getMonthExpenses, resolveExpenseDate } from './expenseMonthFilter';

export type CategoryTotalsStatusRule = 'paid' | 'paid+pending';
export type CategoryTotalsDateField = 'date';

export type CategoryTotalItem = {
  key: string;
  category: string;
  total: number;
  percent: number;
  count: number;
};

type CategoryTotalsOptions = {
  viewDate?: Date;
  startDate?: Date;
  endDate?: Date;
  statusRule: CategoryTotalsStatusRule;
  dateField: CategoryTotalsDateField;
  topN?: number;
  includeOthers?: boolean;
  source: 'dashboard' | 'reports';
  variant: string;
  expensesRevision?: number;
  refreshNonce?: number;
  expandedCategory?: string | null;
};

type CategoryTotalsResult = {
  items: CategoryTotalItem[];
  displayItems: CategoryTotalItem[];
  totalSum: number;
  totalPaid: number;
  paidCount: number;
  pendingCount: number;
  monthLabel: string;
  categoryItems: Record<string, Expense[]>;
  monthExpensesAll: Expense[];
  monthExpensesPaid: Expense[];
};

export const CATEGORY_ITEMS_PREVIEW_LIMIT = 20;

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const hasDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '') !== value;

export const computeCategoryTotals = (
  expenses: Expense[],
  options: CategoryTotalsOptions
): CategoryTotalsResult => {
  const monthData = getMonthExpenses(expenses, {
    viewDate: options.viewDate,
    startDate: options.startDate,
    endDate: options.endDate,
    source: options.source,
    variant: options.variant
  });
  const {
    monthLabel,
    monthExpensesAll,
    monthExpensesPaid,
    paidCount,
    pendingCount,
    totalAll,
    totalPaid
  } = monthData;

  console.info('[category-totals] input', {
    source: options.source,
    variant: options.variant,
    monthLabel,
    expensesLen: expenses.length,
    expensesRevision: options.expensesRevision ?? null,
    refreshNonce: options.refreshNonce ?? null,
    paidLen: paidCount,
    pendingLen: pendingCount,
    statusRule: options.statusRule,
    dateField: options.dateField
  });

  const totalsByKey = new Map<string, { label: string; totalCents: number; count: number }>();
  const categoryItemsByKey = new Map<string, Expense[]>();

  monthExpensesAll.forEach(exp => {
    const raw = (exp.category || '').trim();
    const label = raw ? raw.replace(/\s+/g, ' ') : 'Sem categoria';
    const key = normalizeKey(label) || 'sem-categoria';
    const current = totalsByKey.get(key);
    const nextLabel = label;
    if (!current) {
      totalsByKey.set(key, {
        label: nextLabel,
        totalCents: Math.round(exp.amount * 100),
        count: 1
      });
    } else {
      const preferredLabel =
        !hasDiacritics(current.label) && hasDiacritics(nextLabel) ? nextLabel : current.label;
      totalsByKey.set(key, {
        label: preferredLabel,
        totalCents: current.totalCents + Math.round(exp.amount * 100),
        count: current.count + 1
      });
    }

    const currentItems = categoryItemsByKey.get(key);
    if (currentItems) {
      currentItems.push(exp);
    } else {
      categoryItemsByKey.set(key, [exp]);
    }
  });

  const totalSumCents = Array.from(totalsByKey.values()).reduce((sum, item) => sum + item.totalCents, 0);
  const totalAllCents = Math.round(totalAll * 100);
  const totalSum = totalSumCents / 100;
  const items = Array.from(totalsByKey.entries())
    .map(([key, item]) => ({
      key,
      category: item.label,
      total: item.totalCents / 100,
      percent: totalAllCents > 0 ? (item.totalCents / totalAllCents) * 100 : 0,
      count: item.count
    }))
    .sort((a, b) => b.total - a.total);

  const topN = options.topN && options.topN > 0 ? options.topN : items.length;
  const topItems = items.slice(0, topN);
  const remainder = items.slice(topN);
  const remainderSum = remainder.reduce((sum, item) => sum + item.total, 0);
  const displayItems =
    options.includeOthers && remainderSum > 0
      ? [
          ...topItems,
          {
            key: 'outros__rest',
            category: 'Outros',
            total: Number(remainderSum.toFixed(2)),
            percent: totalAllCents > 0 ? (remainderSum / (totalAllCents / 100)) * 100 : 0,
            count: remainder.reduce((sum, item) => sum + item.count, 0)
          }
        ]
      : topItems;

  const categoryItems: Record<string, Expense[]> = {};
  categoryItemsByKey.forEach((itemsList, key) => {
    const sorted = [...itemsList].sort((a, b) => {
      const dateA = resolveExpenseDate(a)?.getTime() ?? 0;
      const dateB = resolveExpenseDate(b)?.getTime() ?? 0;
      if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
      if (Number.isNaN(dateA)) return 1;
      if (Number.isNaN(dateB)) return -1;
      return dateB - dateA;
    });
    categoryItems[key] = sorted;
  });

  const expandedCategory = options.expandedCategory || null;
  const expandedItems = expandedCategory ? categoryItems[expandedCategory] || [] : [];
  const itemsShownCount = expandedCategory
    ? Math.min(expandedItems.length, CATEGORY_ITEMS_PREVIEW_LIMIT)
    : 0;

  if (options.expandedCategory !== undefined) {
    console.info('[category-totals] expanded', {
      source: options.source,
      variant: options.variant,
      monthLabel,
      expandedCategory,
      itemsShownCount
    });
  }

  console.info('[category-totals] top', {
    source: options.source,
    variant: options.variant,
    monthLabel,
    topN,
    first3: displayItems.slice(0, 3).map(item => ({
      category: item.category,
      total: item.total
    })),
    totalSum: Number(totalSum.toFixed(2))
  });

  return {
    items,
    displayItems,
    totalSum: Number(totalAll.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    paidCount,
    pendingCount,
    monthLabel,
    categoryItems,
    monthExpensesAll,
    monthExpensesPaid
  };
};
