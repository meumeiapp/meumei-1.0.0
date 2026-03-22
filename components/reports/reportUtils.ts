import type { Expense } from '../../types';

export const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatCompactCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1
  });

export const formatShortDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
};

export const toISODate = (value: Date) => value.toISOString().split('T')[0];

export const normalizeText = (value: unknown) =>
  (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const TAX_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'imposto', pattern: /\bimpostos?\b/ },
  { label: 'mei', pattern: /\bmei\b/ },
  { label: 'das mei', pattern: /\bdas(?:\s*-\s*mei|\s+mei)\b|\bguia\s+das\b/ },
  { label: 'simples nacional', pattern: /\bsimples\s+nacional\b|\bsimei\b/ },
  { label: 'iss', pattern: /\biss\b/ },
  { label: 'icms', pattern: /\bicms\b/ },
  { label: 'inss', pattern: /\binss\b/ },
  { label: 'imposto de renda', pattern: /\bimposto de renda\b|\birrf\b|\birpj\b|\birpf\b/ },
  { label: 'pis', pattern: /\bpis\b/ },
  { label: 'cofins', pattern: /\bcofins\b/ },
  { label: 'csll', pattern: /\bcsll\b/ },
  { label: 'iptu', pattern: /\biptu\b/ },
  { label: 'ipva', pattern: /\bipva\b/ },
  { label: 'taxa fiscal', pattern: /\btaxa(?:s)?\s+(fiscal|tributaria|tributario|municipal|estadual|federal)\b/ }
];

export const getTaxMatchTokens = (expense: Expense) => {
  const haystack = `${expense.category || ''} ${expense.description || ''}`;
  const key = normalizeText(haystack);
  return TAX_RULES.filter(rule => rule.pattern.test(key)).map(rule => rule.label);
};

export const isTaxExpense = (expense: Expense) => {
  return getTaxMatchTokens(expense).length > 0;
};
