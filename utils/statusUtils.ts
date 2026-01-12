export type IncomeStatusNormalized = 'received' | 'pending';
export type ExpenseStatusNormalized = 'paid' | 'pending';

const normalizeToken = (value?: string | null) => {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const parseIncomeStatus = (raw?: string | null): IncomeStatusNormalized | null => {
  const token = normalizeToken(raw);
  if (!token) return null;
  if (token.includes('receb') || token.includes('received')) return 'received';
  if (token.includes('pend')) return 'pending';
  return null;
};

export const parseExpenseStatus = (raw?: string | null): ExpenseStatusNormalized | null => {
  const token = normalizeToken(raw);
  if (!token) return null;
  if (token.includes('pago') || token.includes('paid')) return 'paid';
  if (token.includes('pend')) return 'pending';
  return null;
};

export const normalizeIncomeStatus = (raw?: string | null): IncomeStatusNormalized => {
  return parseIncomeStatus(raw) ?? 'pending';
};

export const normalizeExpenseStatus = (raw?: string | null): ExpenseStatusNormalized => {
  return parseExpenseStatus(raw) ?? 'pending';
};

export const incomeStatusLabel = (status?: string | null) =>
  normalizeIncomeStatus(status) === 'received' ? 'Recebido' : 'Pendente';

export const expenseStatusLabel = (status?: string | null) =>
  normalizeExpenseStatus(status) === 'paid' ? 'Pago' : 'Pendente';

export const statusExportValue = (
  entityType: 'income' | 'expense',
  status?: string | null
) => {
  return entityType === 'income' ? incomeStatusLabel(status) : expenseStatusLabel(status);
};
