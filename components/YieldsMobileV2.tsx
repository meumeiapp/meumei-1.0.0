import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { ChevronRight, History, Pencil } from 'lucide-react';
import { Account } from '../types';
import MobileEmptyState from './mobile/MobileEmptyState';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';

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
  monthlyLineData: _monthlyLineData,
  onAddYield,
  onEditYield,
  onOpenCalculator,
  onOpenGoal,
  onOpenAudit
}) => {
  const loggedRef = useRef(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstSectionRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [topAdjust, setTopAdjust] = useState(0);
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

  useLayoutEffect(() => {
    const headerNode = subHeaderRef.current;
    const sectionNode = firstSectionRef.current;
    if (!headerNode || !sectionNode) return;

    const measureGap = () => {
      const headerBottom = headerNode.getBoundingClientRect().bottom;
      const sectionTop = sectionNode.getBoundingClientRect().top;
      const gap = Math.round(sectionTop - headerBottom);
      const desired = 5;
      const nextAdjust = Math.max(0, gap - desired + topAdjust);
      setTopAdjust(prev => (prev === nextAdjust ? prev : nextAdjust));
    };

    measureGap();
    window.addEventListener('resize', measureGap);
    return () => window.removeEventListener('resize', measureGap);
  }, [subHeaderHeight, topAdjust]);

  const summaryCountLabel = `${investmentAccounts.length} contas`;
  const monthlyTotal = useMemo(
    () => monthlySummary.reduce((sum, item) => sum + item.total, 0),
    [monthlySummary]
  );


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

  const mobileHeader = (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <div className="h-8 w-8" aria-hidden="true" />
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Rendimentos</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
            {monthLabel} • {summaryCountLabel}
          </p>
        </div>
        <div className="min-w-[32px]" />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Patrimônio</p>
          <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
            {formatCurrency(totalInvested)}
          </p>
        </div>
        <div className="rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Mês</p>
          <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
            {formatCurrency(monthlyTotal)}
          </p>
        </div>
        <div className="rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center">
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
            className="flex items-center justify-center gap-2 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
          >
            <History size={14} />
            Auditoria
          </button>
        )}
        <button
          type="button"
          onClick={onAddYield}
          className="w-full rounded-none bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 text-sm flex items-center justify-center gap-2"
        >
          Novo Rendimento
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
      <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
        {headerFill.height > 0 && (
          <div
            className="fixed left-0 right-0 z-20 bg-white dark:bg-[#151517] backdrop-blur-xl"
            style={{ top: headerFill.top, height: headerFill.height }}
          />
        )}
        <div
          className="fixed left-0 right-0 z-30"
          style={{ top: 'var(--mm-mobile-top, 0px)' }}
        >
          <div
            ref={subHeaderRef}
            className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
          >
            <div className="px-3 pb-0 pt-2">
              {mobileHeader}
            </div>
          </div>
        </div>
        <div
          className="h-full overflow-y-auto px-0 pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px)+72px)]"
          style={{
            paddingTop: subHeaderHeight
              ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px - ${topAdjust}px)`
              : 'calc(var(--mm-mobile-top, 0px))'
          }}
        >
          <div className="space-y-0">
            <div ref={firstSectionRef}>
              <MobileFullWidthSection contentClassName="px-3 pt-[5px] pb-3">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Resumo por conta</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Rendimentos do mês selecionado.</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-400">{summaryCountLabel}</span>
                  </div>
                  <div className="mt-2 space-y-2">
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
              </MobileFullWidthSection>
            </div>



            <MobileFullWidthSection contentClassName="px-3 py-3" withDivider={false}>
              <div ref={historyRef}>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Detalhamento por conta</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Toque para ver detalhes.</p>
                <div className="mt-2 space-y-2">
                {investmentAccounts.map(account => {
                  const isOpen = openAccountId === account.id;
                  const lastYieldLabel = account.lastYieldDate
                    ? new Date(`${account.lastYieldDate}T12:00:00`).toLocaleDateString('pt-BR')
                    : 'Sem data';
                  const lastYieldValue =
                    account.lastYield !== undefined ? formatCurrency(account.lastYield) : 'Sem rendimento';
                  const monthEntries = monthEntriesByAccount.get(account.id) ?? [];
                  return (
                    <div key={account.id} className="rounded-none border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-2.5">
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
                        <div className="mt-2 border-t border-zinc-200 dark:border-zinc-800 pt-2 space-y-2">
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
                          <div className="pt-1.5 space-y-2">
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
                              <div className="space-y-1.5">
                                {monthEntries.map(entry => (
                                  <div
                                    key={entry.id ?? `${entry.accountId}-${entry.date}-${entry.amount}`}
                                    className="rounded-none border border-zinc-200/70 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/30 px-2.5 py-1.5 flex items-center justify-between gap-3"
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
            </MobileFullWidthSection>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 z-40"
          style={{ bottom: 'var(--mm-mobile-dock-height, 68px)' }}
        >
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenCalculator}
                className="w-full min-h-[44px] flex items-center justify-center rounded-none border border-indigo-400/50 bg-indigo-950/30 py-3 text-sm font-semibold text-indigo-200 hover:bg-indigo-900/40 transition"
              >
                Simular
              </button>
              <button
                type="button"
                onClick={onOpenGoal}
                className="w-full min-h-[44px] flex items-center justify-center rounded-none border border-indigo-500/40 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition"
              >
                Meta
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YieldsMobileV2;
