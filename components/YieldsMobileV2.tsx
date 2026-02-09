import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, History, Home, LineChart, Pencil, Plus, Sparkles, Target } from 'lucide-react';
import { Account } from '../types';
import MobileEmptyState from './mobile/MobileEmptyState';

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
  onOpenAudit?: () => void;
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
  onOpenGoal,
  onOpenAudit
}) => {
  const loggedRef = useRef(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
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

  useEffect(() => {
    const node = subHeaderRef.current;
    if (!node) return;

    const updateMetrics = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.round(rect.height);
      setSubHeaderHeight(prev => (prev === height ? prev : height));
      const fillHeight = Math.max(0, Math.round(rect.top));
      setHeaderFill(prev => (prev.top === 0 && prev.height === fillHeight ? prev : { top: 0, height: fillHeight }));
    };

    updateMetrics();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMetrics) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateMetrics);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
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

  const mobileHeader = (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          aria-label="Voltar para o início"
        >
          <Home size={16} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Rendimentos</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
            {monthLabel} • {summaryCountLabel}
          </p>
        </div>
        <div className="min-w-[32px]" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Patrimônio</p>
          <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
            {formatCurrency(totalInvested)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Mês</p>
          <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
            {formatCurrency(monthlyTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Variação</p>
          <p
            className={`text-[12px] font-semibold truncate ${
              monthlyDelta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : monthlyDelta < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-zinc-500 dark:text-zinc-400'
            }`}
            title={monthlyDeltaText}
          >
            {formatCurrency(monthlyDelta)}
          </p>
        </div>
      </div>

      <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        {onOpenAudit && (
          <button
            type="button"
            onClick={onOpenAudit}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
          >
            <History size={14} />
            Auditoria
          </button>
        )}
        <button
          type="button"
          onClick={onAddYield}
          className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
        >
          Novo Rendimento
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
      <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
        {headerFill.height > 0 && (
          <div
            className="fixed left-0 right-0 z-20 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl"
            style={{ top: headerFill.top, height: headerFill.height }}
          />
        )}
        <div
          className="fixed left-0 right-0 z-30"
          style={{ top: 'var(--mm-mobile-top, 0px)' }}
        >
          <div
            ref={subHeaderRef}
            className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl shadow-sm"
          >
            <div className="px-4 pb-3 pt-2">
              {mobileHeader}
            </div>
          </div>
        </div>
        <div
          className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]"
          style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 28 : undefined }}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onOpenCalculator}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] py-2.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
              >
                <Sparkles size={16} className="text-indigo-500" />
                Simular
              </button>
              <button
                type="button"
                onClick={onOpenGoal}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] py-2.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
              >
                <Target size={16} className="text-emerald-500" />
                Meta
              </button>
              <button
                type="button"
                onClick={handleScrollToHistory}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] py-2.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 shadow-sm"
              >
                <History size={16} className="text-amber-500" />
                Histórico
              </button>
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
                  <MobileEmptyState
                    message="Nenhuma conta de rendimento cadastrada."
                    className="mt-2"
                  />
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
                  <MobileEmptyState
                    message="Nenhuma conta de investimento cadastrada."
                    className="mt-2"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YieldsMobileV2;
