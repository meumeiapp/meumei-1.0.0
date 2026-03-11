import type { Account } from '../types';

export type ProjectionAccount = {
  id: string;
  name: string;
  currentBalance: number;
  color?: string;
};

export type ProjectionYieldRecord = {
  id?: string;
  accountId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  notes?: string;
};

export type ProjectionSeriesPoint = {
  day: number;
  date: string; // YYYY-MM-DD
  label: string; // DD/MM/YY
  value: number;
};

export type ProjectionSeries = {
  accountId: string;
  accountName: string;
  color: string;
  points: ProjectionSeriesPoint[];
};

export type ProjectionRateEstimate = {
  accountId: string;
  accountName: string;
  recordCount: number;
  daysWithYield: number;
  totalYield: number;
  dailyRateRaw: number;
  dailyRate: number;
  clampedMin: boolean;
  clampedMax: boolean;
};

export type ProjectionRatesMap = Map<string, ProjectionRateEstimate>;

/**
 * Projection data lineage (read-only):
 * - Novo Rendimento grava em: users/{licenseId}/yields/{yieldId}
 *   (serviço: services/yieldsService.ts -> addYield/buildYieldRef)
 * - Estrutura principal do rendimento:
 *   { accountId, date(YYYY-MM-DD), amountEncrypted -> amount, notes, source, cryptoEpoch, ... }
 * - Compatibilidade legada:
 *   account.yieldHistory[] em users/{licenseId}/accounts/{accountId}
 * - Saldo base por conta para projeção:
 *   account.currentBalance (mesma fonte exibida na tela de Rendimentos).
 */

const parseIsoDate = (value: string): Date | null => {
  if (!value) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const formatDateLabel = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;

const formatIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const eachDayInclusive = (start: Date, end: Date): Date[] => {
  if (end.getTime() < start.getTime()) return [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12, 0, 0, 0);
  const days: Date[] = [];
  while (cursor.getTime() <= limit.getTime()) {
    days.push(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const defaultProjectionColor = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes('ale')) return '#06b6d4';
  if (normalized.includes('dk')) return '#f59e0b';
  if (normalized.includes('nati')) return '#ef4444';
  if (normalized.includes('nubank')) return '#a855f7';
  return '#22c55e';
};

export const loadAccounts = (accounts: Account[]): ProjectionAccount[] => {
  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    currentBalance: Number.isFinite(account.currentBalance) ? account.currentBalance : 0,
    color: account.color
  }));
};

export const loadRecentYieldsByAccount = (params: {
  yields: ProjectionYieldRecord[];
  accountIds: string[];
  windowStart: Date;
  windowEnd: Date;
}) => {
  const accountIdSet = new Set(params.accountIds);
  const byAccount = new Map<string, ProjectionYieldRecord[]>();
  let totalRecords = 0;
  params.yields.forEach(item => {
    if (!accountIdSet.has(item.accountId)) return;
    const parsed = parseIsoDate(item.date);
    if (!parsed) return;
    if (parsed.getTime() < params.windowStart.getTime() || parsed.getTime() > params.windowEnd.getTime()) return;
    const current = byAccount.get(item.accountId) ?? [];
    current.push(item);
    byAccount.set(item.accountId, current);
    totalRecords += 1;
  });
  byAccount.forEach((items) => {
    items.sort((a, b) => {
      const dateA = parseIsoDate(a.date)?.getTime() ?? 0;
      const dateB = parseIsoDate(b.date)?.getTime() ?? 0;
      return dateA - dateB;
    });
  });
  return {
    byAccount,
    totalRecords
  };
};

export const estimateDailyRate = (params: {
  account: ProjectionAccount;
  yields: ProjectionYieldRecord[];
  maxDailyRate?: number;
}) : ProjectionRateEstimate => {
  const maxDailyRate = Number.isFinite(params.maxDailyRate) ? Number(params.maxDailyRate) : 0.01;
  const baseBalance = Math.max(Number(params.account.currentBalance) || 0, 0);
  const dayTotals = new Map<string, number>();
  let totalYield = 0;
  params.yields.forEach(item => {
    const amount = Number(item.amount) || 0;
    totalYield += amount;
    dayTotals.set(item.date, (dayTotals.get(item.date) || 0) + amount);
  });

  const daysWithYield = dayTotals.size;
  const recordCount = params.yields.length;
  const dailyReturns = Array.from(dayTotals.values())
    .map(dayYield => (baseBalance > 0 ? dayYield / baseBalance : 0))
    .filter(value => Number.isFinite(value));

  let dailyRateRaw = 0;
  if (dailyReturns.length > 0) {
    // Preferida: média de rendimento diário relativo ao saldo base da conta.
    dailyRateRaw = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  } else if (baseBalance > 0 && daysWithYield > 0) {
    // Fallback explícito solicitado.
    dailyRateRaw = (totalYield / daysWithYield) / baseBalance;
  }

  let dailyRate = dailyRateRaw;
  let clampedMin = false;
  let clampedMax = false;

  if (dailyRate < 0) {
    dailyRate = 0;
    clampedMin = true;
  }
  if (dailyRate > maxDailyRate) {
    dailyRate = maxDailyRate;
    clampedMax = true;
  }

  return {
    accountId: params.account.id,
    accountName: params.account.name,
    recordCount,
    daysWithYield,
    totalYield: round2(totalYield),
    dailyRateRaw,
    dailyRate,
    clampedMin,
    clampedMax
  };
};

export const buildProjectionSeries = (params: {
  accountId: string;
  accountName: string;
  color?: string;
  startDate: Date;
  endDate: Date;
  startBalance: number;
  dailyRate: number;
  dailyContribution?: number;
}) : ProjectionSeries => {
  const dailyContribution = Number.isFinite(params.dailyContribution) ? Number(params.dailyContribution) : 0;
  const safeRate = Number.isFinite(params.dailyRate) ? params.dailyRate : 0;
  const safeStartBalance = Math.max(Number(params.startBalance) || 0, 0);
  const days = eachDayInclusive(params.startDate, params.endDate);
  let current = safeStartBalance;
  const points: ProjectionSeriesPoint[] = days.map((date, index) => {
    if (index > 0) {
      current = current * (1 + safeRate) + dailyContribution;
    }
    return {
      day: index + 1,
      date: formatIsoDate(date),
      label: formatDateLabel(date),
      value: round2(current)
    };
  });

  return {
    accountId: params.accountId,
    accountName: params.accountName,
    color: params.color || defaultProjectionColor(params.accountName),
    points
  };
};

export const buildConsolidatedSeries = (params: {
  series: ProjectionSeries[];
  accountId?: string;
  accountName?: string;
  color?: string;
}) : ProjectionSeries => {
  const source = params.series;
  if (!source.length) {
    return {
      accountId: params.accountId || 'projection-total',
      accountName: params.accountName || 'Total consolidado',
      color: params.color || '#22c55e',
      points: []
    };
  }
  const length = source[0].points.length;
  const points: ProjectionSeriesPoint[] = [];

  for (let index = 0; index < length; index += 1) {
    const seed = source[0].points[index];
    const totalValue = source.reduce((sum, line) => sum + (line.points[index]?.value || 0), 0);
    points.push({
      day: seed.day,
      date: seed.date,
      label: seed.label,
      value: round2(totalValue)
    });
  }

  return {
    accountId: params.accountId || 'projection-total',
    accountName: params.accountName || 'Total consolidado',
    color: params.color || '#22c55e',
    points
  };
};
