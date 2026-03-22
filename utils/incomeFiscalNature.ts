import type { Income } from '../types';
import { normalizeIncomeStatus } from './statusUtils';

export type IncomeFiscalNature =
  | 'RECEITA_OPERACIONAL'
  | 'EMPRESTIMO'
  | 'TRANSFERENCIA'
  | 'DISTRIBUICAO_LUCROS'
  | 'APORTE'
  | 'RENDIMENTO'
  | 'OUTROS';

export const INCOME_FISCAL_NATURE_OPTIONS: Array<{ value: IncomeFiscalNature; label: string }> = [
  { value: 'RECEITA_OPERACIONAL', label: 'Receita Operacional' },
  { value: 'EMPRESTIMO', label: 'Empréstimo' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'DISTRIBUICAO_LUCROS', label: 'Distribuição de Lucros' },
  { value: 'APORTE', label: 'Aporte' },
  { value: 'RENDIMENTO', label: 'Rendimento' },
  { value: 'OUTROS', label: 'Outros' }
];

export const INCOME_FISCAL_NATURE_LABEL: Record<IncomeFiscalNature, string> = {
  RECEITA_OPERACIONAL: 'Receita Operacional',
  EMPRESTIMO: 'Empréstimo',
  TRANSFERENCIA: 'Transferência',
  DISTRIBUICAO_LUCROS: 'Distribuição de Lucros',
  APORTE: 'Aporte',
  RENDIMENTO: 'Rendimento',
  OUTROS: 'Outros'
};

const normalizeToken = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const containsAny = (haystack: string, needles: string[]) => needles.some((needle) => haystack.includes(needle));

const normalizeEnumToken = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeIncomeFiscalNature = (value: unknown): IncomeFiscalNature | null => {
  if (typeof value !== 'string') return null;
  const token = normalizeEnumToken(value);
  switch (token) {
    case 'RECEITA_OPERACIONAL':
      return 'RECEITA_OPERACIONAL';
    case 'EMPRESTIMO':
      return 'EMPRESTIMO';
    case 'TRANSFERENCIA':
      return 'TRANSFERENCIA';
    case 'DISTRIBUICAO_LUCROS':
      return 'DISTRIBUICAO_LUCROS';
    case 'APORTE':
      return 'APORTE';
    case 'RENDIMENTO':
      return 'RENDIMENTO';
    case 'OUTROS':
      return 'OUTROS';
    default:
      return null;
  }
};

export const inferIncomeFiscalNature = (input: {
  description?: string | null;
  category?: string | null;
}): IncomeFiscalNature => {
  const description = normalizeToken(input.description);
  const category = normalizeToken(input.category);
  const base = `${description} ${category}`.trim();

  if (category === 'transferencia' || base.includes('transferencia para') || base.includes('transferencia')) {
    return 'TRANSFERENCIA';
  }

  if (
    containsAny(base, ['emprestimo', 'fomento', 'financiamento'])
  ) {
    return 'EMPRESTIMO';
  }

  if (containsAny(base, ['distribuicao de lucros'])) {
    return 'DISTRIBUICAO_LUCROS';
  }

  if (containsAny(base, ['aporte', 'capital'])) {
    return 'APORTE';
  }

  return 'RECEITA_OPERACIONAL';
};

export const resolveIncomeFiscalNature = (input: {
  naturezaFiscal?: unknown;
  description?: string | null;
  category?: string | null;
}): IncomeFiscalNature => {
  return (
    normalizeIncomeFiscalNature(input.naturezaFiscal) ||
    inferIncomeFiscalNature({ description: input.description, category: input.category })
  );
};

export const getIncomeFiscalNatureLabel = (value?: string | null): string => {
  const normalized = normalizeIncomeFiscalNature(value);
  if (!normalized) return INCOME_FISCAL_NATURE_LABEL.RECEITA_OPERACIONAL;
  return INCOME_FISCAL_NATURE_LABEL[normalized];
};

export const isIncomeOperationalForMei = (
  income: Pick<Income, 'status' | 'naturezaFiscal' | 'description' | 'category'>
): boolean => {
  return (
    normalizeIncomeStatus(income.status) === 'received' &&
    resolveIncomeFiscalNature(income) === 'RECEITA_OPERACIONAL'
  );
};
