import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, History, LineChart, Pencil, Plus, Sparkles, Target, TrendingUp } from 'lucide-react';
import { Account } from '../types';
import MobilePageShell from './mobile/MobilePageShell';

interface YieldEntry {
  id?: string;
  accountId: string;
  date: string;
  amount: number;
  notes?: string;
}

interface MonthlySummaryItem {
  account: Account;
  total: number;
  count: number;
  entries: YieldEntry[];
  color: string;
}

interface LineSeriesPoint {
  day: number;
  value: number;
}

interface LineSeries {
  accountId: string;
  color: string;
  points: LineSeriesPoint[];
}

interface MonthlyLineData {
  daysInMonth: number;
  series: LineSeries[];
  maxValue: number;
}

interface YieldsMobileV2Props {
  onBack: () => void;
  investmentAccounts: Account[];
  viewDate: Date;
  totalInvested: number;
  monthlyDelta: number;
  monthlyDeltaText: string;
  monthlySummary: MonthlySummaryItem[];
  monthlyLineData: MonthlyLineData;
  onAddYield: () => void;
  onEditYield: (entry: YieldEntry) => void;
  onOpenCalculator: () => void;
  onOpenGoal: () => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const YieldsMobileV2: React.FC<YieldsMobileV2Props> = ({
  onBack,
  investmentAccounts,
  viewDate,
  totalInvested,
  monthlyDelta,
  monthlyDeltaText,
  monthlySummary,
  monthlyLineData,
  onAddYield,
  onEditYield,
  onOpenCalculator,
  onOpenGoal
}) => {
  const loggedRef = useRef(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const selectedYear = viewDate.getFullYear();
  const selectedMonthIndex = viewDate.getMonth();
  const monthLabel = useMemo(() => {
    const monthName = viewDate.toLocaleDateString('pt-BR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}/${selectedYear}`;
  }, [selectedYear, viewDate]);

  useEffect(() => {
    if (loggedRef.current) return;
    console.info('[layout][mobile] yields_v2_loaded');
    loggedRef.current = true;
  }, []);

  const summaryCountLabel = `${investmentAccounts.length} contas`;
  const monthlyTotal = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.total, 0),
    [monthlySummary]
  );

  const compactLine = useMemo(() => {
    if (!monthlyLineData.series.length) return null;
    const dayCount = monthlyLineData.daysInMonth;
    const totals = Array.from({ length: dayCount }, (_, idx) =>
      monthlyLineData.series.reduce((sum, line) => sum + (line.points[idx]?.value ?? 0), 0)
    );
    const hasData = totals.some(value => value !== 0);
    if (!hasData) return null;
    const maxValue = Math.max(...totals);
    const minValue = Math.min(...totals);
    return {
      dayCount,
      totals,
      maxValue,
      minValue
    };
  }, [monthlyLineData]);

  const pieSegments = useMemo(() => {
    if (monthlyTotal <= 0) return [];
    return monthlySummary.filter(item => item.total > 0);
  }, [monthlySummary, monthlyTotal]);

  const pieGradient = useMemo(() => {
    if (!pieSegments.length) return '';
    let start = 0;
    const stops = pieSegments.map((item, index) => {
      const rawPercent = (item.total / monthlyTotal) * 100;
      const end = index === pieSegments.length - 1 ? 100 : start + rawPercent;
      const stop = `${item.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [pieSegments, monthlyTotal]);

  const monthEntriesByAccount = useMemo(() => {
    const map = new Map<string, YieldEntry[]>();
    monthlySummary.forEach(item => {
      const filtered = item.entries.filter(entry => {
        const date = new Date(`${entry.date}T12:00:00`);
        return date.getFullYear() === selectedYear && date.getMonth() === selectedMonthIndex;
      });
      filtered.sort((a, b) => new Date(`${b.date}T12:00:00`).getTime() - new Date(`${a.date}T12:00:00`).getTime());
      map.set(item.account.id, filtered);
    });
    return map;
  }, [monthlySummary, selectedMonthIndex, selectedYear]);

  const handleToggleAccount = (accountId: string) => {
    setOpenAccountId(prev => {
      const next = prev === accountId ? null : accountId;
      if (next) {
        const countInMonth = monthEntriesByAccount.get(accountId)?.length ?? 0;
        console.info('[yields][mobile] expand_account', {
          accountId,
          monthLabel,
          countInMonth
        });
      }
      return next;
    });
  };

  const handleEditEntry = (entry: YieldEntry) => {
    const yieldId = entry.id ?? `${entry.accountId.replace(/\//g, '_')}_${entry.date}`;
    console.info('[yields][mobile] edit_open', { accountId: entry.accountId, yieldId });
    onEditYield(entry);
  };

  const formatEntryDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const handleScrollToHistory = () => {
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <MobilePageShell title="Rendimentos" subtitle={summaryCountLabel} onBack={onBack} contentClassName="space-y-5">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Patrimônio em aplicações</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white truncate">
                {formatCurrency(totalInvested)}
              </p>
              <p
                className={`text-[11px] font-semibold ${
                  monthlyDelta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : monthlyDelta < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {monthlyDeltaText}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <TrendingUp size={18} />
            </div>
          </div>

          <button
            type="button"
            onClick={onAddYield}
            className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 text-sm shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Adicionar rendimento
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-4 py-3 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">Ações rápidas</p>
          <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            <button
              type="button"
              onClick={onOpenCalculator}
              className="w-full flex items-center justify-between py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500" />
                Simular crescimento
              </span>
              <ChevronRight size={16} className="text-zinc-400" />
            </button>
            <button
              type="button"
              onClick={onOpenGoal}
              className="w-full flex items-center justify-between py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <Target size={16} className="text-emerald-500" />
                Definir meta
              </span>
              <ChevronRight size={16} className="text-zinc-400" />
            </button>
            <button
              type="button"
              onClick={handleScrollToHistory}
              className="w-full flex items-center justify-between py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            >
              <span className="flex items-center gap-2">
                <History size={16} className="text-amber-500" />
                Ver histórico completo
              </span>
              <ChevronRight size={16} className="text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Resumo por conta</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Rendimentos do mês selecionado.</p>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">{summaryCountLabel}</span>
          </div>
          <div className="mt-3 space-y-3">
            {monthlySummary.map(item => {
              const lastEntry = item.entries[0];
              const lastLabel = lastEntry
                ? `Último: ${formatCurrency(lastEntry.amount)} • ${new Date(`${lastEntry.date}T12:00:00`).toLocaleDateString('pt-BR')}`
                : 'Sem rendimento no mês';
              return (
                <div key={item.account.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.account.name}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{lastLabel}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${item.total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                      {formatCurrency(item.total)}
                    </p>
                  </div>
                </div>
              );
            })}
            {monthlySummary.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhuma conta de rendimento cadastrada.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Curva de crescimento</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Acumulado do mês.</p>
            </div>
            <LineChart size={16} className="text-indigo-400" />
          </div>
          <div className="mt-3">
            {!compactLine ? (
              <div className="h-24 flex items-center justify-center text-sm text-zinc-500">
                Sem rendimentos no mês.
              </div>
            ) : (
              <svg viewBox="0 0 320 120" className="w-full h-24">
                <polyline
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={compactLine.totals
                    .map((value, index) => {
                      const padding = 12;
                      const width = 320;
                      const height = 120;
                      const x = padding + ((width - padding * 2) * (index / Math.max(compactLine.dayCount - 1, 1)));
                      const range = compactLine.maxValue - compactLine.minValue || 1;
                      const y =
                        height -
                        padding -
                        ((value - compactLine.minValue) / range) * (height - padding * 2);
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Onde rende mais</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Distribuicao percentual por conta.</p>
          <div className="mt-4 flex items-start gap-4">
            {pieSegments.length === 0 ? (
              <div className="text-sm text-zinc-500">Sem rendimentos no mês.</div>
            ) : (
              <>
                <div
                  className="h-24 w-24 rounded-full border border-zinc-200 dark:border-zinc-800"
                  style={{ background: pieGradient }}
                />
                <div className="flex-1 space-y-2 min-w-0">
                  {pieSegments.map(item => {
                    const percent = monthlyTotal > 0 ? (item.total / monthlyTotal) * 100 : 0;
                    return (
                      <div key={item.account.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                          <span className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate">{item.account.name}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                          {percent.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div ref={historyRef} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Detalhamento por conta</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Toque para ver detalhes.</p>
          <div className="mt-3 space-y-3">
            {investmentAccounts.map(account => {
              const isOpen = openAccountId === account.id;
              const lastYieldLabel = account.lastYieldDate
                ? new Date(`${account.lastYieldDate}T12:00:00`).toLocaleDateString('pt-BR')
                : 'Sem data';
              const lastYieldValue =
                account.lastYield !== undefined ? formatCurrency(account.lastYield) : 'Sem rendimento';
              const monthEntries = monthEntriesByAccount.get(account.id) ?? [];
              return (
                <div key={account.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleAccount(account.id)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{account.name}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Saldo atual</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">
                        {formatCurrency(account.currentBalance)}
                      </p>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Taxa</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {account.yieldRate !== undefined ? `${account.yieldRate}% do CDI` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Último rendimento</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{lastYieldValue}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400">{lastYieldLabel}</p>
                      <div className="pt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Lançamentos no mês</p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{monthLabel}</p>
                          </div>
                          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                            {monthEntries.length} itens
                          </span>
                        </div>
                        {monthEntries.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">
                            Nenhum rendimento lançado neste mês para esta conta.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {monthEntries.map(entry => (
                              <div
                                key={entry.id ?? `${entry.accountId}-${entry.date}-${entry.amount}`}
                                className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/30 px-3 py-2 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                    {formatEntryDate(entry.date)}
                                  </p>
                                  {entry.notes && (
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                      {entry.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                    +{formatCurrency(entry.amount)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleEditEntry(entry)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700"
                                  >
                                    <Pencil size={12} />
                                    Editar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {investmentAccounts.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhuma conta de investimento cadastrada.</p>
            )}
          </div>
        </div>
    </MobilePageShell>
  );
};

export default YieldsMobileV2;
