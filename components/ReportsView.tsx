import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PieChart,
  X
} from 'lucide-react';
import type { Account, Expense, Income, CreditCard, ExpenseTypeOption } from '../types';
import type { YieldRecord } from '../services/yieldsService';
import {
  getAnnualTrend,
  getReportSummary,
  getTransactionsForPeriod,
  ReportContext,
  ReportFilters,
  TaxFilter,
  ViewMode
} from '../services/reportService';
import { dataService } from '../services/dataService';
import { yieldsService } from '../services/yieldsService';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import FinancialMap from './reports/FinancialMap';
import EventMap from './reports/EventMap';
import ExecutiveSummary from './reports/ExecutiveSummary';
import ExportImportPanel from './reports/ExportImportPanel';
import { formatCurrency } from './reports/reportUtils';
import { getCreditCardInvoiceTotalForMonth } from '../services/invoiceUtils';
import { computeCategoryTotals } from '../utils/categoryTotals';

type PeriodMode = 'month' | 'custom';

type ReportTab = 'map' | 'summary' | 'export';
type MapMode = 'financial' | 'events';

interface ReportsViewProps {
  onBack: () => void;
  incomes: Income[];
  expenses: Expense[];
  creditCards: CreditCard[];
  viewDate: Date;
  companyName: string;
  licenseId?: string;
  expenseTypeOptions?: ExpenseTypeOption[];
}

const buildMonthLabel = (date: Date) =>
  date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const CATEGORY_TREND_COLORS = ['#a855f7', '#38bdf8', '#f97316', '#22c55e', '#ec4899', '#facc15', '#0ea5e9', '#f472b6', '#94a3b8', '#fb923c'];

const ReportsView: React.FC<ReportsViewProps> = ({
  onBack,
  incomes,
  expenses,
  creditCards,
  viewDate,
  companyName,
  licenseId,
  expenseTypeOptions
}) => {
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const [tab, setTab] = useState<ReportTab>('map');
  const [mapMode, setMapMode] = useState<MapMode>('financial');
  const [taxFilter, setTaxFilter] = useState<TaxFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('caixa');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [currentMonth, setCurrentMonth] = useState(viewDate);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [reportAccounts, setReportAccounts] = useState<Account[]>([]);
  const [reportYields, setReportYields] = useState<YieldRecord[]>([]);
  const summaryContainerRef = useRef<HTMLDivElement | null>(null);
  const [isSummaryFullscreen, setIsSummaryFullscreen] = useState(false);
  const [supportsSummaryFullscreen, setSupportsSummaryFullscreen] = useState(false);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstSectionRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [topAdjust, setTopAdjust] = useState(0);

  const defaultStart = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);

  const defaultEnd = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
  }, [currentMonth]);

  const selectedStart =
    periodMode === 'custom' && customRange.start
      ? new Date(customRange.start + 'T00:00:00')
      : defaultStart;
  const selectedEnd =
    periodMode === 'custom' && customRange.end
      ? new Date(customRange.end + 'T23:59:59')
      : defaultEnd;

  const periodLabel =
    periodMode === 'custom'
      ? `${selectedStart.toLocaleDateString('pt-BR')} até ${selectedEnd.toLocaleDateString('pt-BR')}`
      : buildMonthLabel(currentMonth);

  const context: ReportContext = useMemo(
    () => ({
      incomes,
      expenses,
      creditCards
    }),
    [incomes, expenses, creditCards]
  );

  useEffect(() => {
    let isMounted = true;
    const loadReportData = async () => {
      if (!licenseId) {
        if (isMounted) {
          setReportAccounts([]);
          setReportYields([]);
        }
        return;
      }
      try {
        const epoch = await dataService.ensureCryptoEpoch(licenseId);
        const [accounts, yields] = await Promise.all([
          dataService.getAccounts(licenseId, epoch),
          yieldsService.loadYields(licenseId, epoch)
        ]);
        if (!isMounted) return;
        setReportAccounts(accounts);
        setReportYields(yields);
      } catch (error) {
        console.error('[reports] load_failed', error);
      }
    };
    void loadReportData();
    return () => {
      isMounted = false;
    };
  }, [licenseId]);

  const filters: ReportFilters = useMemo(
    () => ({
      taxFilter,
      viewMode
    }),
    [taxFilter, viewMode]
  );

  const summary = useMemo(
    () =>
      getReportSummary(
        licenseId || 'local',
        selectedStart,
        selectedEnd,
        context,
        filters
      ),
    [licenseId, selectedStart, selectedEnd, context, filters]
  );

  const transactions = useMemo(
    () =>
      getTransactionsForPeriod(
        licenseId || 'local',
        selectedStart,
        selectedEnd,
        context,
        filters
      ),
    [licenseId, selectedStart, selectedEnd, context, filters]
  );

  const annualTrend = useMemo(
    () =>
      getAnnualTrend(
        licenseId || 'local',
        selectedStart.getFullYear(),
        context,
        filters
      ),
    [licenseId, selectedStart, context, filters]
  );

  const expensesByType = useMemo(() => {
    return {
      fixed: transactions.expenses.filter(exp => exp.type === 'fixed').reduce((sum, exp) => sum + exp.amount, 0),
      variable: transactions.expenses.filter(exp => exp.type === 'variable').reduce((sum, exp) => sum + exp.amount, 0),
      personal: transactions.expenses.filter(exp => exp.type === 'personal').reduce((sum, exp) => sum + exp.amount, 0)
    };
  }, [transactions.expenses]);

  const categoryTotals = useMemo(() => {
    if (!isMobile) return null;
    return computeCategoryTotals(transactions.expenses, {
      startDate: selectedStart,
      endDate: selectedEnd,
      statusRule: 'paid+pending',
      dateField: 'date',
      topN: 8,
      includeOthers: true,
      source: 'reports',
      variant: 'mobile'
    });
  }, [isMobile, selectedEnd, selectedStart, transactions.expenses]);

  const maxCategoryTotal = useMemo(() => {
    if (!categoryTotals || !categoryTotals.items.length) return 0;
    return Math.max(...categoryTotals.items.map(item => item.total), 0);
  }, [categoryTotals]);

  const periodYields = useMemo(() => {
    return reportYields.filter(item => {
      const date = new Date(item.date + 'T12:00:00');
      return date.getTime() >= selectedStart.getTime() && date.getTime() <= selectedEnd.getTime();
    });
  }, [reportYields, selectedEnd, selectedStart]);

  const totalContas = useMemo(() => {
    return reportAccounts.reduce((sum, account) => sum + (account.currentBalance || 0), 0);
  }, [reportAccounts]);

  const totalFaturas = useMemo(() => {
    return creditCards.reduce((sum, card) => {
      return sum + getCreditCardInvoiceTotalForMonth(expenses, card.id, currentMonth, card);
    }, 0);
  }, [creditCards, expenses, currentMonth]);

  const summaryExpensesTotal = useMemo(
    () => expensesByType.fixed + expensesByType.variable + expensesByType.personal,
    [expensesByType]
  );
  const summaryNet = useMemo(
    () => summary.totalReceitas - summaryExpensesTotal,
    [summary.totalReceitas, summaryExpensesTotal]
  );
  const summaryMargin = useMemo(
    () => (summary.totalReceitas > 0 ? summaryNet / summary.totalReceitas : 0),
    [summary.totalReceitas, summaryNet]
  );
  const summaryCommitment = useMemo(
    () => (summary.totalReceitas > 0 ? summaryExpensesTotal / summary.totalReceitas : 0),
    [summary.totalReceitas, summaryExpensesTotal]
  );
  const summaryCoverage = useMemo(
    () => (summaryExpensesTotal > 0 ? totalContas / summaryExpensesTotal : 0),
    [summaryExpensesTotal, totalContas]
  );

  const headerSummary = useMemo(() => {
    const totalComprometido = summary.totalDespesas;
    const totalDisponivel = summary.totalReceitas - summary.totalDespesas;
    return {
      totalReceitas: summary.totalReceitas,
      totalComprometido,
      totalDisponivel
    };
  }, [summary.totalDespesas, summary.totalReceitas]);

  const expenseTypeColors = useMemo(() => {
    const defaults = {
      fixed: '#f59e0b',
      variable: '#ef4444',
      personal: '#22d3ee'
    };
    if (!expenseTypeOptions || expenseTypeOptions.length === 0) return defaults;
    const next = { ...defaults };
    expenseTypeOptions.forEach(option => {
      if (!option?.id || !option?.color) return;
      const normalized = option.id === 'variable' && option.color.toLowerCase() === '#ec4899'
        ? '#ef4444'
        : option.color;
      next[option.id] = normalized;
    });
    return next;
  }, [expenseTypeOptions]);
  const incomeAccent = '#10b981';
  const expenseAccent = expenseTypeColors.variable;

  const handleMonthChange = (increment: number) => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + increment);
    setCurrentMonth(next);
    setPeriodMode('month');
  };

  useEffect(() => {
    setCurrentMonth(viewDate);
    setPeriodMode('month');
  }, [viewDate]);

  const handleOpenCustomRange = () => {
    setIsRangeModalOpen(true);
  };

  const handleSaveCustomRange = () => {
    if (customRange.start && customRange.end) {
      setPeriodMode('custom');
      setIsRangeModalOpen(false);
    }
  };

  const handleResetCustomRange = () => {
    setCustomRange({ start: '', end: '' });
    setPeriodMode('month');
    setIsRangeModalOpen(false);
  };

  const handleMapModeChange = (nextMode: MapMode) => {
    setMapMode(nextMode);
    if (tab !== 'map') {
      setTab('map');
    }
  };

  useEffect(() => {
    if (!isMobile) return;
    if (tab !== 'summary') {
      setTab('summary');
    }
  }, [isMobile, tab]);

  useEffect(() => {
    const shouldLock = false;
    document.documentElement.classList.toggle('lock-scroll', shouldLock);
    document.body.classList.toggle('lock-scroll', shouldLock);
    return () => {
      document.documentElement.classList.remove('lock-scroll');
      document.body.classList.remove('lock-scroll');
    };
  }, [isMobile]);

  useLayoutEffect(() => {
    const headerNode = subHeaderRef.current;
    const sectionNode = firstSectionRef.current;
    if (!headerNode || !sectionNode) return;

    const measureGap = () => {
      const headerBottom = headerNode.getBoundingClientRect().bottom;
      const sectionTop = sectionNode.getBoundingClientRect().top;
      const gap = Math.round(sectionTop - headerBottom);
      const desired = 0;
      setTopAdjust((prev) => {
        const nextAdjust = Math.max(0, gap - desired + prev);
        return prev === nextAdjust ? prev : nextAdjust;
      });
    };

    measureGap();
    window.addEventListener('resize', measureGap);
    return () => window.removeEventListener('resize', measureGap);
  }, [subHeaderHeight, topAdjust]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (tab !== 'summary') return;
    const element = summaryContainerRef.current;
    setSupportsSummaryFullscreen(Boolean(document.fullscreenEnabled && element?.requestFullscreen));
  }, [tab]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!supportsSummaryFullscreen) return;
    const handleChange = () => {
      setIsSummaryFullscreen(document.fullscreenElement === summaryContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [supportsSummaryFullscreen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (tab !== 'summary' && isSummaryFullscreen) {
      if (document.fullscreenElement === summaryContainerRef.current) {
        void document.exitFullscreen();
      } else {
        setIsSummaryFullscreen(false);
      }
    }
  }, [isSummaryFullscreen, tab]);

  const isSummaryOverlay = isSummaryFullscreen && !supportsSummaryFullscreen;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isSummaryOverlay) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    style.overflow = 'hidden';
    return () => {
      style.overflow = prevOverflow;
    };
  }, [isSummaryOverlay]);

  const handleSummaryFullscreenToggle = async () => {
    if (typeof document === 'undefined') return;
    const element = summaryContainerRef.current;
    if (!element) return;
    if (!supportsSummaryFullscreen) {
      setIsSummaryFullscreen(prev => !prev);
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (error) {
      console.warn('[summary fullscreen] fallback', error);
      setSupportsSummaryFullscreen(false);
      setIsSummaryFullscreen(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isRangeModalOpen) {
        setIsRangeModalOpen(false);
        return;
      }
      onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isRangeModalOpen, onBack]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return;
    const handleDockClick = () => {
      setIsRangeModalOpen(false);
      setIsSummaryFullscreen(false);
    };
    window.addEventListener('mm:mobile-dock-click', handleDockClick);
    return () => window.removeEventListener('mm:mobile-dock-click', handleDockClick);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
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
  }, [isMobile]);

  const desktopControlBase = 'mm-btn-chip shrink-0 whitespace-nowrap';
  const desktopControlActive = 'mm-btn-chip-active-neutral';
  const desktopControlInactive = '';
  const getDesktopControlClass = (active: boolean) =>
    `${desktopControlBase} ${active ? desktopControlActive : desktopControlInactive}`;
  const desktopHeaderControlButtonBase =
    'mm-btn-chip h-7 px-3 justify-center text-[11px] shrink-0 whitespace-nowrap';
  const getDesktopHeaderControlClass = (active: boolean) =>
    `${desktopHeaderControlButtonBase} ${active ? desktopControlActive : desktopControlInactive}`;

  const periodControlsMobile = (
    <div className="rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <button
          onClick={() => handleMonthChange(-1)}
          className="h-7 w-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} className="mx-auto" />
        </button>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
          <Calendar size={14} /> {periodLabel}
        </div>
        <button
          onClick={() => handleMonthChange(1)}
          className="h-7 w-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} className="mx-auto" />
        </button>
      </div>
      <button
        onClick={handleOpenCustomRange}
        className="mt-2 w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-[#151517] py-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
      >
        Personalizar
      </button>
    </div>
  );

  const summaryCards = (
    <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
      <div className={isMobile ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
        <div className={`${isMobile ? 'rounded-xl mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
          <div
            className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[10px]' : 'text-[10px]'}`}
            style={{ color: incomeAccent }}
          >
            Receita total
          </div>
          <div
            className={`${isMobile ? 'text-[11px]' : 'text-lg'} font-semibold mt-1`}
            style={{ color: incomeAccent }}
          >
            {formatCurrency(headerSummary.totalReceitas)}
          </div>
        </div>
        <div className={`${isMobile ? 'rounded-xl mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
          <div
            className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[10px]' : 'text-[10px]'}`}
            style={{ color: expenseAccent }}
          >
            Total gasto
          </div>
          <div
            className={`${isMobile ? 'text-[11px]' : 'text-lg'} font-semibold mt-1`}
            style={{ color: expenseAccent }}
          >
            {formatCurrency(headerSummary.totalComprometido)}
          </div>
        </div>
        <div className={`${isMobile ? 'rounded-xl mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
          <div
            className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[10px]' : 'text-[10px]'}`}
            style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
          >
            Total disponível
          </div>
          <div
            className={`${isMobile ? 'text-[11px]' : 'text-lg'} font-semibold mt-1`}
            style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
          >
            {formatCurrency(headerSummary.totalDisponivel)}
          </div>
        </div>
      </div>
    </div>
  );

  const expenseBreakdownCard = isMobile && categoryTotals ? (
    <section className="bg-white dark:bg-[#151517] rounded-none p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <PieChart size={18} className="text-indigo-500" />
            Onde foi parar seu dinheiro?
          </h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Ranking das despesas do período ({periodLabel}).
          </p>
        </div>
        <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col items-end gap-1">
          <span className="uppercase tracking-wide font-semibold">Total</span>
          <div className="text-xs font-semibold text-zinc-900 dark:text-white">
            {formatCurrency(categoryTotals.totalSum)}
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Pagas: {formatCurrency(categoryTotals.totalPaid)}
          </span>
        </div>
      </div>
      {categoryTotals.displayItems.length > 0 && categoryTotals.totalSum > 0 ? (
        <div className="space-y-3">
          <ul className="space-y-2.5">
            {categoryTotals.displayItems.map((item, index) => {
              const pct = categoryTotals.totalSum > 0 ? (item.total / categoryTotals.totalSum) * 100 : 0;
              const barWidth = maxCategoryTotal > 0 ? (item.total / maxCategoryTotal) * 100 : 0;
              const barColor =
                item.category === 'Outros'
                  ? '#94a3b8'
                  : CATEGORY_TREND_COLORS[index % CATEGORY_TREND_COLORS.length];
              return (
                <li key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                      {formatCurrency(item.total)} • {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
          Nenhuma despesa registrada neste período.
        </div>
      )}
    </section>
  ) : null;

  const desktopSummaryCards = (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-1.5">
        <div className="text-[9px] uppercase tracking-[0.25em]" style={{ color: incomeAccent }}>
          Receita total
        </div>
        <div className="text-[13px] font-semibold mt-0.5" style={{ color: incomeAccent }}>
          {formatCurrency(headerSummary.totalReceitas)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-1.5">
        <div className="text-[9px] uppercase tracking-[0.25em]" style={{ color: expenseAccent }}>
          Total gasto
        </div>
        <div className="text-[13px] font-semibold mt-0.5" style={{ color: expenseAccent }}>
          {formatCurrency(headerSummary.totalComprometido)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-1.5">
        <div
          className="text-[9px] uppercase tracking-[0.25em]"
          style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
        >
          Total disponível
        </div>
        <div
          className="text-[13px] font-semibold mt-0.5"
          style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
        >
          {formatCurrency(headerSummary.totalDisponivel)}
        </div>
      </div>
    </div>
  );

  const desktopHeaderControls = !isMobile ? (
    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#101014]/80 px-3 py-1.5">
      <div className="grid grid-cols-2 gap-2 items-center">
        <div className="min-w-0 flex items-center justify-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-slate-400">
            Filtros
          </span>
          {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
            <button
              key={option}
              onClick={() => setTaxFilter(option)}
              title={
                option === 'all'
                  ? 'Mostra lançamentos PF e PJ juntos.'
                  : option === 'PJ'
                    ? 'Mostra apenas lançamentos de Pessoa Jurídica (PJ).'
                    : 'Mostra apenas lançamentos de Pessoa Física (PF).'
              }
              className={getDesktopHeaderControlClass(taxFilter === option)}
            >
              {option === 'all' ? 'Tudo' : option}
            </button>
          ))}
          {(['caixa', 'competencia'] as ViewMode[]).map(option => (
            <button
              key={option}
              onClick={() => setViewMode(option)}
              title={
                option === 'caixa'
                  ? 'Considera quando o dinheiro entrou/saiu (fluxo de caixa).'
                  : 'Considera quando a transação ocorreu, mesmo que pago depois.'
              }
              className={getDesktopHeaderControlClass(viewMode === option)}
            >
              {option === 'caixa' ? 'Caixa' : 'Competência'}
            </button>
          ))}
        </div>

        <div className="min-w-0 flex items-center justify-end gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-slate-400">
            Modos
          </span>
          {([
            { id: 'financial', label: 'Mapa Financeiro' },
            { id: 'events', label: 'Mapa de Eventos' }
          ] as { id: MapMode; label: string }[]).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMapModeChange(item.id)}
              title={
                item.id === 'financial'
                  ? 'Distribuição de receitas e despesas do período em um mapa.'
                  : 'Sequência de entradas e saídas por conta/cartão no período.'
              }
              className={getDesktopHeaderControlClass(mapMode === item.id)}
            >
              {item.id === 'financial' ? 'Financeiro' : 'Eventos'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab('summary')}
            title="Resumo com totais, distribuição e evolução do período."
            className={getDesktopHeaderControlClass(tab === 'summary')}
          >
            Resumo
          </button>
          <button
            type="button"
            onClick={() => setTab('export')}
            title="Exportar relatórios ou importar dados para análise externa."
            className={getDesktopHeaderControlClass(tab === 'export')}
          >
            Exportar
          </button>
          <button
            type="button"
            onClick={handleOpenCustomRange}
            title="Definir um intervalo de datas personalizado."
            className={getDesktopHeaderControlClass(periodMode === 'custom')}
          >
            Personalizar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const reportContent = (
    <div className={`${isMobile ? 'rounded-none border-0 bg-transparent p-0' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-[32px] px-5 pb-2 pt-2 md:px-6 md:pb-2 md:pt-2 flex flex-1 flex-col h-full min-h-0'}`}>
      <div
        className={
          isMobile
            ? ''
            : `min-h-0 flex-1 flex flex-col ${
                tab === 'export' || (isCompactHeight && tab === 'summary')
                  ? 'overflow-y-auto'
                  : ''
              }`
        }
      >
        {tab === 'map' && (
          <div className={`space-y-4 ${isMobile ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
            {isMobile ? (
              <div className="rounded-none border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 text-center text-sm text-zinc-600 dark:text-slate-200">
                Os mapas estão disponíveis apenas no computador.
              </div>
            ) : (
              <div className="min-h-[420px] flex-1 flex flex-col" data-tour-anchor="reports-map">
                {mapMode === 'financial' ? (
                  <FinancialMap
                    summary={summary}
                    transactions={transactions}
                    yields={periodYields}
                    accounts={reportAccounts}
                    creditCards={creditCards}
                    isMobile={isMobile}
                  />
                ) : (
                  <EventMap
                    transactions={transactions}
                    accounts={reportAccounts}
                    creditCards={creditCards}
                    isMobile={isMobile}
                  />
                )}
              </div>
            )}
          </div>
        )}
        {(tab === 'summary' || isMobile) && (
          isMobile ? (
            <>
              <ExecutiveSummary
                expensesByType={expensesByType}
                totalReceitas={summary.totalReceitas}
                totalContas={totalContas}
                totalFaturas={totalFaturas}
                expenseTypeColors={expenseTypeColors}
                annualTrend={annualTrend}
                periodLabel={periodLabel}
                isMobile={isMobile}
              />
              {expenseBreakdownCard}
            </>
          ) : (
            <div
              className={`relative ${isSummaryOverlay ? 'fixed inset-0 z-[90] h-[100dvh] w-[100dvw]' : 'flex-1 min-h-0 flex flex-col'}`}
              style={{
                paddingTop: isSummaryOverlay ? 'env(safe-area-inset-top)' : undefined,
                paddingBottom: isSummaryOverlay ? 'env(safe-area-inset-bottom)' : undefined
              }}
            >
              <div className="flex flex-1 min-h-0 flex-col gap-2">
                <div className="flex gap-2 items-stretch flex-1 min-h-0">
                <div
                  ref={summaryContainerRef}
                  className={`relative flex-1 ${
                    isSummaryFullscreen
                      ? 'border border-white/10 overflow-hidden rounded-none h-full w-full box-border bg-slate-950/60'
                      : 'min-h-[360px] overflow-visible self-stretch flex flex-col'
                  }`}
                >
                  <div className={isSummaryFullscreen ? 'h-full p-4 pb-[170px]' : 'flex flex-1 min-h-0 flex-col'}>
                    <ExecutiveSummary
                      expensesByType={expensesByType}
                      totalReceitas={summary.totalReceitas}
                      totalContas={totalContas}
                      totalFaturas={totalFaturas}
                      expenseTypeColors={expenseTypeColors}
                      annualTrend={annualTrend}
                      periodLabel={periodLabel}
                      isMobile={isMobile}
                      isFullscreen={isSummaryFullscreen}
                      hideHeader={!isSummaryFullscreen}
                    />
                  </div>
                  {isSummaryFullscreen && (
                    <div className="absolute bottom-0 left-0 right-0 z-20">
                      <div
                        className="relative flex items-center justify-center rounded-t-[26px] border-t border-white/20 bg-white/5 px-10 py-6 shadow-[0_-10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl min-h-[150px]"
                        onPointerDown={event => event.stopPropagation()}
                      >
                        <div className="mx-auto w-full max-w-[1200px] text-center">
                          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4">
                            <div className="min-w-[180px] max-w-[240px]">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Resultado</div>
                              <div
                                className="text-[16px] font-semibold"
                                style={{ color: summaryNet >= 0 ? incomeAccent : expenseAccent }}
                              >
                                {formatCurrency(summaryNet)}
                              </div>
                              <div className="text-[11px] text-slate-500">Receita menos despesas do período.</div>
                            </div>
                            <div className="min-w-[180px] max-w-[240px]">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Margem líquida</div>
                              <div className="text-[16px] font-semibold text-slate-100">
                                {(summaryMargin * 100).toFixed(1)}%
                              </div>
                              <div className="text-[11px] text-slate-500">Quanto sobra da receita.</div>
                            </div>
                            <div className="min-w-[180px] max-w-[240px]">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Comprometimento</div>
                              <div className="text-[16px] font-semibold text-slate-100">
                                {(summaryCommitment * 100).toFixed(1)}%
                              </div>
                              <div className="text-[11px] text-slate-500">Percentual da receita gasto.</div>
                            </div>
                            <div className="min-w-[180px] max-w-[240px]">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Fôlego</div>
                              <div className="text-[16px] font-semibold text-slate-100">
                                {summaryCoverage.toFixed(1)} meses
                              </div>
                              <div className="text-[11px] text-slate-500">Cobertura das despesas atuais.</div>
                            </div>
                            <div className="min-w-[180px] max-w-[240px]">
                              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Despesas totais</div>
                              <div className="text-[16px] font-semibold text-slate-100">
                                {formatCurrency(summaryExpensesTotal)}
                              </div>
                              <div className="text-[11px] text-slate-500">Soma de fixas + variáveis + pessoais.</div>
                            </div>
                          </div>
                        </div>
                        <div className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSummaryFullscreenToggle}
                            className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
                            aria-label="Sair da tela cheia"
                            title="Sair da tela cheia e voltar ao layout normal."
                          >
                            <Minimize2 size={16} className="mx-auto" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!isSummaryFullscreen && (
                  <div className="flex flex-col items-center gap-2 self-stretch rounded-2xl border border-white/10 bg-slate-950/40 px-2 py-3 min-w-[52px]">
                    <button
                      type="button"
                      onClick={handleSummaryFullscreenToggle}
                      className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
                      aria-label="Abrir em tela cheia"
                      title="Abrir resumo em tela cheia."
                    >
                      <Maximize2 size={16} className="mx-auto" />
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>
          )
        )}
        {tab === 'export' && (
          <ExportImportPanel
            licenseId={licenseId}
            defaultStart={selectedStart}
            defaultEnd={selectedEnd}
            allIncomes={incomes}
            allExpenses={expenses}
            creditCards={creditCards}
          />
        )}
      </div>
    </div>
  );

  const mobileHeader = (
    <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable mm-mobile-header-stable-tight">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <div className="h-8 w-8" aria-hidden="true" />
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Relatórios</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{periodLabel}</p>
        </div>
        <div className="min-w-[32px]" />
      </div>
      {summaryCards}
      {periodControlsMobile}
    </div>
  );

  const desktopSummarySection = (
    <div className="w-full px-4 sm:px-6 pt-6 relative z-10">
      <div className="mm-subheader w-full rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
        <div className="space-y-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <div className="h-8 w-8" aria-hidden="true" />
            <div className="min-w-0 text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Relatórios</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{periodLabel}</p>
            </div>
            <div className="min-w-[32px]" />
          </div>

          {desktopSummaryCards}
          {desktopHeaderControls}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
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
              <div className="mm-mobile-subheader-pad mm-mobile-subheader-pad-tight">
                {mobileHeader}
              </div>
            </div>
          </div>
          <div
            className="h-full overflow-y-auto px-0 pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px))]"
            style={{
              paddingTop: subHeaderHeight
                ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px - ${topAdjust}px)`
                : 'calc(var(--mm-mobile-top, 0px))'
            }}
          >
            <div className="space-y-0">
              <div ref={firstSectionRef}>
                <MobileFullWidthSection contentClassName="mm-mobile-section-pad mm-mobile-section-pad-tight-top" withDivider={false}>
                  {reportContent}
                </MobileFullWidthSection>
              </div>
            </div>
          </div>
        </div>

        {isRangeModalOpen && (
          <div className="fixed inset-0 z-[1300]">
            <button
              type="button"
              onClick={() => setIsRangeModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              aria-label="Fechar personalização"
            />
            <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 p-4 pb-6 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Selecionar período personalizado</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRangeModalOpen(false)}
                  aria-label="Fechar personalização"
                  className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wide text-zinc-400">Data inicial</label>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, start: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-900 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wide text-zinc-400">Data final</label>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, end: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-400">Natureza</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setTaxFilter(option)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          taxFilter === option
                            ? 'bg-white text-zinc-900 shadow-sm'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        {option === 'all' ? 'Tudo' : option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-400">Visão</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setViewMode(option)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          viewMode === option
                            ? 'bg-emerald-500/90 text-white'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        {option === 'caixa' ? 'Caixa' : 'Compet.'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={handleResetCustomRange}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCustomRange}
                  className="rounded-xl bg-emerald-500 text-white py-2.5 text-sm font-semibold hover:bg-emerald-600"
                >
                  Aplicar período
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const desktopReportContentHeight =
    'max(320px, calc(var(--mm-content-available-height, 720px) - var(--mm-subheader-height, 184px) - var(--mm-content-gap, 16px)))';

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 flex flex-col">
      {desktopSummarySection}
      <main
        className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-[var(--mm-content-gap)] flex-1 min-h-0 flex flex-col"
        style={{
          height: desktopReportContentHeight,
          minHeight: desktopReportContentHeight,
          maxHeight: desktopReportContentHeight
        }}
      >
        <div className="flex flex-1 min-h-0 flex-col gap-0">{reportContent}</div>
      </main>

      {isRangeModalOpen && (
        <div className="fixed inset-0 z-[1200]">
          <button
            type="button"
            onClick={() => setIsRangeModalOpen(false)}
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar personalização"
          />
          <div className="absolute left-1/2 bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] -translate-x-1/2 px-6 bg-white/80 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] flex flex-col w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">Selecionar período personalizado</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Ajuste o intervalo para atualizar o relatório.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRangeModalOpen(false)}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                aria-label="Fechar personalização"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="pt-3 flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400">Data inicial</label>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, start: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white/90 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-2 text-sm text-zinc-900 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400">Data final</label>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, end: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white/90 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-2 text-sm text-zinc-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#101014]/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400">Natureza</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setTaxFilter(option)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                          taxFilter === option
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-slate-200'
                        }`}
                      >
                        {option === 'all' ? 'Tudo' : option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#101014]/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400">Visão</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setViewMode(option)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold ${
                          viewMode === option
                            ? 'bg-emerald-500/90 text-white'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-slate-200'
                        }`}
                      >
                        {option === 'caixa' ? 'Caixa' : 'Compet.'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-3">
              <button
                onClick={handleResetCustomRange}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCustomRange}
                className="rounded-lg py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition"
              >
                Aplicar período
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
