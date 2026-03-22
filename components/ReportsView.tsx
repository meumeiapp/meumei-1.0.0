import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
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
  canExportReports?: boolean;
  dashboardBalance?: number;
}

const buildMonthLabel = (date: Date) =>
  date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CATEGORY_TREND_COLORS = ['#a855f7', '#38bdf8', '#f97316', '#22c55e', '#ec4899', '#facc15', '#0ea5e9', '#f472b6', '#94a3b8', '#fb923c'];

const ReportsView: React.FC<ReportsViewProps> = ({
  onBack,
  incomes,
  expenses,
  creditCards,
  viewDate,
  companyName,
  licenseId,
  expenseTypeOptions,
  canExportReports = true,
  dashboardBalance
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
  const [mapFullscreenRequestId, setMapFullscreenRequestId] = useState(0);
  const [isMapFullscreenActive, setIsMapFullscreenActive] = useState(false);
  const summaryContainerRef = useRef<HTMLDivElement | null>(null);
  const tabRef = useRef<ReportTab>('map');
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
  const desktopStartDateValue = useMemo(() => formatDateInputValue(selectedStart), [selectedStart]);
  const desktopEndDateValue = useMemo(() => formatDateInputValue(selectedEnd), [selectedEnd]);

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

  const previousPeriod = useMemo(() => {
    if (periodMode === 'custom' && customRange.start && customRange.end) {
      const currentDurationMs = Math.max(selectedEnd.getTime() - selectedStart.getTime(), 0);
      const previousEnd = new Date(selectedStart.getTime() - 1000);
      const previousStart = new Date(previousEnd.getTime() - currentDurationMs);
      return {
        start: previousStart,
        end: previousEnd,
        label: `${previousStart.toLocaleDateString('pt-BR')} até ${previousEnd.toLocaleDateString('pt-BR')}`
      };
    }

    const monthStart = new Date(selectedStart.getFullYear(), selectedStart.getMonth() - 1, 1);
    const monthEnd = new Date(
      selectedStart.getFullYear(),
      selectedStart.getMonth(),
      0,
      23,
      59,
      59
    );

    return {
      start: monthStart,
      end: monthEnd,
      label: buildMonthLabel(monthStart)
    };
  }, [
    customRange.end,
    customRange.start,
    periodMode,
    selectedEnd,
    selectedStart
  ]);

  const previousSummary = useMemo(
    () =>
      getReportSummary(
        licenseId || 'local',
        previousPeriod.start,
        previousPeriod.end,
        context,
        filters
      ),
    [context, filters, licenseId, previousPeriod.end, previousPeriod.start]
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
    const carryover = periodMode === 'month' ? previousSummary.resultado : 0;
    const shouldMirrorDashboardBalance =
      periodMode === 'month' &&
      taxFilter === 'all' &&
      viewMode === 'caixa' &&
      Number.isFinite(dashboardBalance);
    const totalDisponivel = shouldMirrorDashboardBalance
      ? Number(dashboardBalance)
      : summary.totalReceitas - summary.totalDespesas + carryover;
    return {
      totalReceitas: summary.totalReceitas,
      totalComprometido,
      totalDisponivel
    };
  }, [
    dashboardBalance,
    periodMode,
    previousSummary.resultado,
    summary.totalDespesas,
    summary.totalReceitas,
    taxFilter,
    viewMode
  ]);

  const financialMapIncomeTotal = useMemo(() => {
    const shouldMirrorDashboardBalance =
      periodMode === 'month' &&
      taxFilter === 'all' &&
      viewMode === 'caixa' &&
      Number.isFinite(dashboardBalance);
    if (!shouldMirrorDashboardBalance) return undefined;
    return Math.max(Number(dashboardBalance), 0);
  }, [dashboardBalance, periodMode, taxFilter, viewMode]);

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

  const closeExportPanel = () => {
    if (tab !== 'export') return false;
    tabRef.current = 'map';
    setTab('map');
    return true;
  };

  const handleExportToggle = () => {
    setTab(prev => {
      const next = prev === 'export' ? 'map' : 'export';
      tabRef.current = next;
      return next;
    });
  };

  const handleTaxFilterChange = (option: TaxFilter) => {
    setTaxFilter(option);
    closeExportPanel();
  };

  const handleViewModeChange = (option: ViewMode) => {
    setViewMode(option);
    closeExportPanel();
  };

  const applyInlineCustomRange = (start: string, end: string) => {
    if (!start || !end) return;
    setCustomRange({ start, end });
    setPeriodMode('custom');
    closeExportPanel();
  };

  const handleDesktopStartDateChange = (value: string) => {
    if (!value) {
      handleResetCustomRange();
      closeExportPanel();
      return;
    }
    const nextEnd = value > desktopEndDateValue ? value : desktopEndDateValue;
    applyInlineCustomRange(value, nextEnd);
  };

  const handleDesktopEndDateChange = (value: string) => {
    if (!value) {
      handleResetCustomRange();
      closeExportPanel();
      return;
    }
    const nextStart = value < desktopStartDateValue ? value : desktopStartDateValue;
    applyInlineCustomRange(nextStart, value);
  };

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (!isMobile) return;
    if (tab !== 'summary') {
      setTab('summary');
    }
  }, [isMobile, tab]);

  useEffect(() => {
    if (canExportReports) return;
    if (tab !== 'export') return;
    tabRef.current = 'map';
    setTab('map');
  }, [canExportReports, tab]);

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
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRangeModalOpen) {
        setIsRangeModalOpen(false);
        return;
      }
      if (tabRef.current === 'export') {
        tabRef.current = 'map';
        setTab('map');
        return;
      }
      onBack();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isRangeModalOpen, onBack]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleDockClick = () => {
      setIsRangeModalOpen(false);
      setIsSummaryFullscreen(false);
    };
    window.addEventListener('mm:dock-click', handleDockClick);
    window.addEventListener('mm:mobile-dock-click', handleDockClick);
    return () => {
      window.removeEventListener('mm:dock-click', handleDockClick);
      window.removeEventListener('mm:mobile-dock-click', handleDockClick);
    };
  }, []);

  useEffect(() => {
    if (tab !== 'map') {
      setIsMapFullscreenActive(false);
    }
  }, [tab]);

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

  const desktopHeaderControlButtonBase =
    'mm-btn-base w-[136px] justify-center shrink-0 whitespace-nowrap rounded-xl';
  const desktopHeaderControlInactive = 'mm-btn-secondary';
  const desktopHeaderControlActive =
    'mm-btn-primary mm-btn-primary-indigo text-white border-indigo-300/60 ring-2 ring-indigo-300/75 dark:ring-indigo-400/70 shadow-[0_16px_30px_rgba(79,70,229,0.45)]';
  const getDesktopHeaderControlClass = (active: boolean) =>
    `${desktopHeaderControlButtonBase} ${active ? desktopHeaderControlActive : desktopHeaderControlInactive}`;
  const desktopViewSwitchButtonBase =
    'mm-btn-base w-[136px] justify-center shrink-0 whitespace-nowrap rounded-xl';
  const desktopViewSwitchInactive = desktopHeaderControlInactive;
  const desktopViewSwitchActive = desktopHeaderControlActive;
  const getDesktopViewSwitchClass = (active: boolean) =>
    `${desktopViewSwitchButtonBase} ${active ? desktopViewSwitchActive : desktopViewSwitchInactive}`;

  const periodControlsMobile = (
    <div className="mm-subheader-control-card">
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <button
          onClick={() => handleMonthChange(-1)}
          className="mm-subheader-control-icon-btn"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} className="mx-auto" />
        </button>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
          <Calendar size={14} /> {periodLabel}
        </div>
        <button
          onClick={() => handleMonthChange(1)}
          className="mm-subheader-control-icon-btn"
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} className="mx-auto" />
        </button>
      </div>
      <button
        onClick={handleOpenCustomRange}
        className="mt-2 w-full mm-btn-base mm-btn-secondary mm-mobile-primary-cta text-xs"
      >
        Personalizar
      </button>
    </div>
  );

  const summaryCards = (
    <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
      <div className={isMobile ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
        <div className={`${isMobile ? 'rounded-xl mm-subheader-metric-card mm-mobile-header-card' : 'mm-subheader-metric-card'}`}>
          <div
            className="mm-subheader-metric-label"
            style={{ color: incomeAccent }}
          >
            Receita do período
          </div>
          <div
            className="mm-subheader-metric-value"
            style={{ color: incomeAccent }}
          >
            {formatCurrency(headerSummary.totalReceitas)}
          </div>
        </div>
        <div className={`${isMobile ? 'rounded-xl mm-subheader-metric-card mm-mobile-header-card' : 'mm-subheader-metric-card'}`}>
          <div
            className="mm-subheader-metric-label"
            style={{ color: expenseAccent }}
          >
            Despesas do período
          </div>
          <div
            className="mm-subheader-metric-value"
            style={{ color: expenseAccent }}
          >
            {formatCurrency(headerSummary.totalComprometido)}
          </div>
        </div>
        <div className={`${isMobile ? 'rounded-xl mm-subheader-metric-card mm-mobile-header-card' : 'mm-subheader-metric-card'}`}>
          <div
            className="mm-subheader-metric-label"
            style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
          >
            Saldo atual disponível
          </div>
          <div
            className="mm-subheader-metric-value"
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
      <div className="mm-subheader-metric-card">
        <div className="mm-subheader-metric-label" style={{ color: incomeAccent }}>
          Receita do período
        </div>
        <div className="mm-subheader-metric-value" style={{ color: incomeAccent }}>
          {formatCurrency(headerSummary.totalReceitas)}
        </div>
      </div>
      <div className="mm-subheader-metric-card">
        <div className="mm-subheader-metric-label" style={{ color: expenseAccent }}>
          Despesas do período
        </div>
        <div className="mm-subheader-metric-value" style={{ color: expenseAccent }}>
          {formatCurrency(headerSummary.totalComprometido)}
        </div>
      </div>
      <div className="mm-subheader-metric-card">
        <div
          className="mm-subheader-metric-label"
          style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
        >
          Saldo atual disponível
        </div>
        <div
          className="mm-subheader-metric-value"
          style={{ color: headerSummary.totalDisponivel >= 0 ? incomeAccent : expenseAccent }}
        >
          {formatCurrency(headerSummary.totalDisponivel)}
        </div>
      </div>
    </div>
  );

  const desktopHeaderControls = !isMobile ? (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <div className="flex w-full min-w-max items-center gap-2 pr-1">
        {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
          <button
            key={option}
            onClick={() => handleTaxFilterChange(option)}
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
        {canExportReports && (
          <button
            type="button"
            onClick={handleExportToggle}
            title="Exportar relatórios ou importar dados para análise externa."
            className={getDesktopHeaderControlClass(tab === 'export')}
          >
            Exportar
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(['caixa', 'competencia'] as ViewMode[]).map(option => (
            <button
              key={option}
              onClick={() => handleViewModeChange(option)}
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
      </div>
    </div>
  ) : null;

  const desktopViewSwitchControls = !isMobile && tab !== 'export' ? (
    <div className="mb-3 w-full overflow-x-auto scrollbar-hide px-3 md:px-4">
      <div className="grid w-full min-w-[1120px] grid-cols-[1fr_auto_1fr] items-center gap-2 pr-1">
        <div className="flex items-center justify-start gap-2">
          <button
            type="button"
            onClick={() => handleMapModeChange('financial')}
            title="Distribuição de receitas e despesas do período em um mapa."
            aria-pressed={tab === 'map' && mapMode === 'financial'}
            className={getDesktopViewSwitchClass(tab === 'map' && mapMode === 'financial')}
          >
            Financeiro
          </button>
          <button
            type="button"
            onClick={() => handleMapModeChange('events')}
            title="Sequência de entradas e saídas por conta/cartão no período."
            aria-pressed={tab === 'map' && mapMode === 'events'}
            className={getDesktopViewSwitchClass(tab === 'map' && mapMode === 'events')}
          >
            Eventos
          </button>
          <button
            type="button"
            onClick={() => setTab('summary')}
            title="Resumo com totais, distribuição e evolução do período."
            aria-pressed={tab === 'summary'}
            className={getDesktopViewSwitchClass(tab === 'summary')}
          >
            Resumo
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 px-2">
          <div
            className={`flex h-[42px] min-w-[220px] items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/95 px-3 shadow-[0_10px_20px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-[#101014]/90 dark:shadow-[0_12px_24px_rgba(0,0,0,0.3)] ${
              periodMode === 'custom' ? 'ring-2 ring-indigo-300/70 dark:ring-indigo-400/55' : ''
            }`}
          >
            <label
              htmlFor="reports-desktop-start-date"
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400"
            >
              Data inicial
            </label>
            <input
              id="reports-desktop-start-date"
              type="date"
              value={desktopStartDateValue}
              onChange={event => handleDesktopStartDateChange(event.target.value)}
              className="w-full border-0 bg-transparent p-0 text-[12px] font-semibold text-zinc-700 outline-none focus:ring-0 dark:text-zinc-200"
            />
          </div>
          <div
            className={`flex h-[42px] min-w-[220px] items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/95 px-3 shadow-[0_10px_20px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-[#101014]/90 dark:shadow-[0_12px_24px_rgba(0,0,0,0.3)] ${
              periodMode === 'custom' ? 'ring-2 ring-indigo-300/70 dark:ring-indigo-400/55' : ''
            }`}
          >
            <label
              htmlFor="reports-desktop-end-date"
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400"
            >
              Data final
            </label>
            <input
              id="reports-desktop-end-date"
              type="date"
              value={desktopEndDateValue}
              onChange={event => handleDesktopEndDateChange(event.target.value)}
              className="w-full border-0 bg-transparent p-0 text-[12px] font-semibold text-zinc-700 outline-none focus:ring-0 dark:text-zinc-200"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {(tab === 'map' || tab === 'summary') && (
            <button
              type="button"
              onClick={() =>
                tab === 'map'
                  ? setMapFullscreenRequestId(prev => prev + 1)
                  : handleSummaryFullscreenToggle()
              }
              title={
                tab === 'map'
                  ? isMapFullscreenActive
                    ? 'Sair da tela cheia do mapa.'
                    : 'Abrir mapa em tela cheia.'
                  : isSummaryFullscreen
                    ? 'Sair da tela cheia do resumo.'
                    : 'Abrir resumo em tela cheia.'
              }
              aria-pressed={tab === 'map' ? isMapFullscreenActive : isSummaryFullscreen}
              className={getDesktopViewSwitchClass(
                tab === 'map' ? isMapFullscreenActive : isSummaryFullscreen
              )}
            >
              <span className="inline-flex items-center gap-2">
                {(tab === 'map' ? isMapFullscreenActive : isSummaryFullscreen) ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
                Tela cheia
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const isWideCanvasMode = !isMobile && (tab === 'map' || tab === 'summary');

  const reportContent = (
    <div className={`${isMobile ? 'rounded-none border-0 bg-transparent p-0' : isWideCanvasMode ? 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-[32px] px-0 pb-0 pt-2 md:px-0 md:pb-0 md:pt-2 flex flex-1 flex-col h-full min-h-0' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-[32px] px-5 pb-2 pt-2 md:px-6 md:pb-2 md:pt-2 flex flex-1 flex-col h-full min-h-0'}`}>
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
        {!isMobile && desktopViewSwitchControls}
        {tab === 'map' && (
          <div className={`space-y-0 ${isMobile ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
            {isMobile ? (
              <div className="rounded-none border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 text-center text-sm text-zinc-600 dark:text-slate-200">
                Os mapas estão disponíveis apenas no computador.
              </div>
            ) : (
              <div className="min-h-[var(--mm-map-surface-min-height,320px)] flex-1 flex flex-col" data-tour-anchor="reports-map">
                {mapMode === 'financial' ? (
                  <FinancialMap
                    summary={summary}
                    transactions={transactions}
                    yields={periodYields}
                    accounts={reportAccounts}
                    creditCards={creditCards}
                    isMobile={isMobile}
                    hideDesktopRail={true}
                    fullscreenRequestId={mapFullscreenRequestId}
                    onFullscreenChange={setIsMapFullscreenActive}
                    previousCarryover={previousSummary.resultado}
                    previousPeriodLabel={previousPeriod.label}
                    incomeTotalOverride={financialMapIncomeTotal}
                    currentAvailableBalance={headerSummary.totalDisponivel}
                  />
                ) : (
                  <EventMap
                    transactions={transactions}
                    accounts={reportAccounts}
                    creditCards={creditCards}
                    isMobile={isMobile}
                    hideDesktopRail={true}
                    fullscreenRequestId={mapFullscreenRequestId}
                    onFullscreenChange={setIsMapFullscreenActive}
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
                      : 'min-h-[var(--mm-summary-min-height,320px)] overflow-visible self-stretch flex flex-col'
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
                </div>
              </div>
            </div>
          )
        )}
        {canExportReports && tab === 'export' && (
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
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-6 relative z-10">
      <div className="mm-subheader mm-subheader-panel w-full">
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
                        onClick={() => handleTaxFilterChange(option)}
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
                        onClick={() => handleViewModeChange(option)}
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

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 flex flex-col">
      {desktopSummarySection}
      <main
        className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-[var(--mm-content-gap)] flex-1 min-h-0 flex flex-col"
      >
        <div className="flex flex-1 min-h-0 flex-col gap-0">{reportContent}</div>
      </main>

    </div>
  );
};

export default ReportsView;
