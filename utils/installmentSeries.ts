import { Expense, Income } from '../types';

const INSTALLMENT_SUFFIX_RE = /\s*\(\d+\/\d+\)\s*$/;

const getMonthIndex = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return date.getFullYear() * 12 + date.getMonth();
};

export const normalizeInstallmentDescription = (value: string) =>
  value.replace(INSTALLMENT_SUFFIX_RE, '').trim();

export const buildInstallmentDescription = (
  base: string,
  installmentNumber?: number,
  totalInstallments?: number
) => {
  const label = base.trim();
  if (!installmentNumber || !totalInstallments) return label;
  return `${label} (${installmentNumber}/${totalInstallments})`;
};

const hasInstallmentSuffix = (value: string) => INSTALLMENT_SUFFIX_RE.test(value);

const isMonthlySequence = <T extends { installmentNumber?: number }>(
  items: T[],
  referenceNumber: number,
  referenceIndex: number,
  getDate: (item: T) => string
) => {
  return items.every(item => {
    if (!item.installmentNumber) return false;
    const diff = getMonthIndex(getDate(item)) - referenceIndex;
    return diff === item.installmentNumber - referenceNumber;
  });
};

export const getExpenseInstallmentSeries = (
  expenses: Expense[],
  reference: Expense
) => {
  if (!reference.installments || !reference.totalInstallments || !reference.installmentNumber) {
    return { items: [] as Expense[], source: 'none' as const };
  }

  if (reference.installmentGroupId) {
    return {
      items: expenses.filter(exp => exp.installmentGroupId === reference.installmentGroupId),
      source: 'group' as const
    };
  }

  if (!hasInstallmentSuffix(reference.description)) {
    return { items: [] as Expense[], source: 'none' as const };
  }

  const baseDescription = normalizeInstallmentDescription(reference.description);
  const candidates = expenses.filter(exp => {
    if (!exp.installments) return false;
    if (exp.totalInstallments !== reference.totalInstallments) return false;
    if (!exp.installmentNumber) return false;
    if (normalizeInstallmentDescription(exp.description) !== baseDescription) return false;
    if (exp.amount !== reference.amount) return false;
    if (exp.accountId !== reference.accountId) return false;
    if (exp.cardId !== reference.cardId) return false;
    if (exp.paymentMethod !== reference.paymentMethod) return false;
    if (exp.type !== reference.type) return false;
    return true;
  });

  if (candidates.length < 2 || !candidates.some(exp => exp.id === reference.id)) {
    return { items: [] as Expense[], source: 'none' as const };
  }

  const referenceNumber = reference.installmentNumber;
  const ordered = [...candidates].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
  const referenceIndex = getMonthIndex(reference.dueDate);
  const isValidSequence = isMonthlySequence(ordered, referenceNumber, referenceIndex, item => item.dueDate);
  if (!isValidSequence) {
    return { items: [] as Expense[], source: 'none' as const };
  }

  return { items: ordered, source: 'heuristic' as const };
};

export const getIncomeInstallmentSeries = (
  incomes: Income[],
  reference: Income
) => {
  if (!reference.installments || !reference.totalInstallments || !reference.installmentNumber) {
    return { items: [] as Income[], source: 'none' as const };
  }

  if (reference.installmentGroupId) {
    return {
      items: incomes.filter(inc => inc.installmentGroupId === reference.installmentGroupId),
      source: 'group' as const
    };
  }

  if (!hasInstallmentSuffix(reference.description)) {
    return { items: [] as Income[], source: 'none' as const };
  }

  const baseDescription = normalizeInstallmentDescription(reference.description);
  const candidates = incomes.filter(inc => {
    if (!inc.installments) return false;
    if (inc.totalInstallments !== reference.totalInstallments) return false;
    if (!inc.installmentNumber) return false;
    if (normalizeInstallmentDescription(inc.description) !== baseDescription) return false;
    if (inc.amount !== reference.amount) return false;
    if (inc.accountId !== reference.accountId) return false;
    if (inc.paymentMethod !== reference.paymentMethod) return false;
    return true;
  });

  if (candidates.length < 2 || !candidates.some(inc => inc.id === reference.id)) {
    return { items: [] as Income[], source: 'none' as const };
  }

  const referenceNumber = reference.installmentNumber;
  const ordered = [...candidates].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
  const referenceIndex = getMonthIndex(reference.date);
  const isValidSequence = isMonthlySequence(ordered, referenceNumber, referenceIndex, item => item.date);
  if (!isValidSequence) {
    return { items: [] as Income[], source: 'none' as const };
  }

  return { items: ordered, source: 'heuristic' as const };
};
