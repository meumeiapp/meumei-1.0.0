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

export const isTaxExpense = (expense: Expense) => {
  const haystack = `${expense.category || ''} ${expense.description || ''}`;
  const key = normalizeText(haystack);
  const tokens = ['imposto', 'taxa', 'mei', 'das', 'simples', 'iss', 'icms'];
  return tokens.some(token => key.includes(token));
};
