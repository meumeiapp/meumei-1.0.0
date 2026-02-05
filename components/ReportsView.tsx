import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Home
} from 'lucide-react';
import type { Account, Expense, Income, CreditCard } from '../types';
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
import FinancialMap from './reports/FinancialMap';
import EventMap from './reports/EventMap';
import ExecutiveSummary from './reports/ExecutiveSummary';
import ExportImportPanel from './reports/ExportImportPanel';
import { formatCurrency } from './reports/reportUtils';
import { getCreditCardInvoiceTotalForMonth } from '../services/invoiceUtils';

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
}

const buildMonthLabel = (date: Date) =>
  date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const ReportsView: React.FC<ReportsViewProps> = ({
  onBack,
  incomes,
  expenses,
  creditCards,
  viewDate,
  companyName,
  licenseId
}) => {
  const isMobile = useIsMobile();
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
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });

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

  const headerSummary = useMemo(() => {
    const totalComprometido = summary.totalDespesas;
    const totalDisponivel = summary.totalReceitas - summary.totalDespesas;
    return {
      totalReceitas: summary.totalReceitas,
      totalComprometido,
      totalDisponivel
    };
  }, [summary.totalDespesas, summary.totalReceitas]);

  const handleMonthChange = (increment: number) => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + increment);
    setCurrentMonth(next);
    setPeriodMode('month');
  };

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
    const shouldLock = !isMobile;
    document.documentElement.classList.toggle('lock-scroll', shouldLock);
    document.body.classList.toggle('lock-scroll', shouldLock);
    return () => {
      document.documentElement.classList.remove('lock-scroll');
      document.body.classList.remove('lock-scroll');
    };
  }, [isMobile]);

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

  const desktopControlBase = 'px-3.5 py-2 rounded-full text-[11px] font-semibold transition';
  const desktopControlActive = 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm';
  const desktopControlInactive =
    'bg-zinc-100 text-zinc-600 hover:text-zinc-900 dark:bg-white/10 dark:text-slate-200 dark:hover:text-white';
  const getDesktopControlClass = (active: boolean) =>
    `${desktopControlBase} ${active ? desktopControlActive : desktopControlInactive}`;

  const mapSelector = isMobile ? (
    <div className="flex flex-col gap-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-1 w-full justify-between">
        {([
          ...(isMobile ? [] : [{ id: 'financial', label: 'Mapa Financeiro' }]),
          { id: 'events', label: 'Mapa de Eventos' }
        ] as { id: MapMode; label: string }[]).map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleMapModeChange(item.id)}
            className={`px-3 py-1.5 rounded-full text-[10px] flex-1 font-semibold transition ${
              mapMode === item.id
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 dark:text-slate-200/80 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {([
        { id: 'financial', label: 'Mapa Financeiro' },
        { id: 'events', label: 'Mapa de Eventos' }
      ] as { id: MapMode; label: string }[]).map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleMapModeChange(item.id)}
          className={getDesktopControlClass(mapMode === item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const periodControls = (
    <div className={`flex items-center gap-2 bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-full px-4 py-2 ${isMobile ? 'text-xs flex-wrap' : ''}`}>
      <button
        onClick={() => handleMonthChange(-1)}
        className="p-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:text-slate-200 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-slate-200">
        <Calendar size={16} /> {periodLabel}
      </div>
      <button
        onClick={() => handleMonthChange(1)}
        className="p-2 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:text-slate-200 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
      <button
        onClick={handleOpenCustomRange}
        className={`${isMobile ? 'w-full' : 'ml-2'} px-3 py-1 text-xs rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-white/10`}
      >
        Personalizar
      </button>
    </div>
  );

  const periodControlsMobile = (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
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
        className="mt-2 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-[#151517] py-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
      >
        Personalizar
      </button>
    </div>
  );

  const summaryCards = (
    <div className={isMobile ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
      <div className={`${isMobile ? 'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[7px] text-zinc-500 dark:text-zinc-400' : 'text-[10px] text-emerald-600 dark:text-emerald-300/80'}`}>
          Receita total
        </div>
        <div className={`${isMobile ? 'text-[11px] text-amber-600 dark:text-amber-400' : 'text-lg text-amber-600 dark:text-amber-300'} font-semibold mt-1`}>
          {formatCurrency(headerSummary.totalReceitas)}
        </div>
      </div>
      <div className={`${isMobile ? 'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[7px] text-zinc-500 dark:text-zinc-400' : 'text-[10px] text-rose-600 dark:text-rose-300/80'}`}>
          Total gasto
        </div>
        <div className={`${isMobile ? 'text-[11px] text-rose-600 dark:text-rose-400' : 'text-lg text-rose-600 dark:text-rose-300'} font-semibold mt-1`}>
          {formatCurrency(headerSummary.totalComprometido)}
        </div>
      </div>
      <div className={`${isMobile ? 'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] ${isMobile ? 'text-[7px] text-zinc-500 dark:text-zinc-400' : 'text-[10px] text-cyan-600 dark:text-cyan-300/80'}`}>
          Total disponível
        </div>
        <div className={`${isMobile ? 'text-[11px] text-emerald-600 dark:text-emerald-400' : 'text-lg text-emerald-600 dark:text-emerald-300'} font-semibold mt-1`}>
          {formatCurrency(headerSummary.totalDisponivel)}
        </div>
      </div>
    </div>
  );

  const desktopSummaryCards = (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300/80">
          Receita total
        </div>
        <div className="text-[14px] font-semibold text-amber-600 dark:text-amber-300 mt-1">
          {formatCurrency(headerSummary.totalReceitas)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-rose-600 dark:text-rose-300/80">
          Total gasto
        </div>
        <div className="text-[14px] font-semibold text-rose-600 dark:text-rose-300 mt-1">
          {formatCurrency(headerSummary.totalComprometido)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-300/80">
          Total disponível
        </div>
        <div className="text-[14px] font-semibold text-emerald-600 dark:text-emerald-300 mt-1">
          {formatCurrency(headerSummary.totalDisponivel)}
        </div>
      </div>
    </div>
  );

  const filtersSection = (
    <div className={`${isMobile ? 'rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] p-3' : 'rounded-3xl border border-zinc-200 bg-white/90 dark:bg-[#141418] dark:border-white/10 p-5 shadow-[0_8px_18px_rgba(0,0,0,0.12)]'}`}>
      <div className={`flex flex-col ${isMobile ? 'gap-3' : 'gap-5'}`}>
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-[1.3fr_1fr] gap-6'}`}>
          <div className="flex flex-col gap-3">
            <div className={`${isMobile ? 'text-[10px]' : 'text-[11px]'} uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400`}>Filtros</div>
            {isMobile ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 dark:text-slate-400">Natureza</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setTaxFilter(option)}
                        className={`rounded-lg px-2 py-1.5 text-[9px] font-semibold transition ${
                          taxFilter === option
                            ? 'bg-white text-zinc-900 shadow-sm'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-slate-200 dark:hover:text-white'
                        }`}
                      >
                        {option === 'all' ? 'Tudo' : option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 dark:text-slate-400">Visão</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                      <button
                        key={option}
                        onClick={() => setViewMode(option)}
                        className={`rounded-lg px-2 py-1.5 text-[9px] font-semibold transition ${
                          viewMode === option
                            ? 'bg-cyan-500/90 text-white'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-slate-200 dark:hover:text-white'
                        }`}
                      >
                        {option === 'caixa' ? 'Caixa' : 'Compet.'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                  <button
                    key={option}
                    onClick={() => setTaxFilter(option)}
                    className={getDesktopControlClass(taxFilter === option)}
                  >
                    {option === 'all' ? 'Tudo' : option}
                  </button>
                ))}
                {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                  <button
                    key={option}
                    onClick={() => setViewMode(option)}
                    className={getDesktopControlClass(viewMode === option)}
                  >
                    {option === 'caixa' ? 'Visão Caixa' : 'Visão Competência'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isMobile && (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 dark:text-slate-400">Modos</div>
              <div className="flex flex-wrap gap-2">
                {mapSelector}
                <button
                  type="button"
                  onClick={() => setTab('summary')}
                  className={getDesktopControlClass(tab === 'summary')}
                >
                  Resumo
                </button>
                <button
                  type="button"
                  onClick={() => setTab('export')}
                  className="px-3.5 py-2 rounded-full text-[11px] font-semibold transition bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  Exportar
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  const reportContent = (
    <div className={`${isMobile ? 'rounded-none border-0 bg-transparent p-0' : 'bg-white border border-zinc-200 dark:bg-white/5 dark:border-white/10 rounded-[32px] px-6 pb-4 pt-3 md:px-8 md:pb-4 md:pt-3 flex flex-col overflow-hidden h-[800px]'}`}>
      {!isMobile && (
        <div className="flex justify-center mb-3">
          {periodControls}
        </div>
      )}
      <div
        className={
          isMobile
            ? ''
            : `flex-1 min-h-0 ${tab === 'map' ? 'overflow-hidden' : 'overflow-y-auto'}`
        }
      >
        {tab === 'map' && (
          <div className={`space-y-4 ${isMobile ? '' : 'flex flex-col h-full min-h-0'}`}>
            {isMobile ? (
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 text-center text-sm text-zinc-600 dark:text-slate-200">
                Os mapas estão disponíveis apenas no computador.
              </div>
            ) : (
              <div className="flex-1 min-h-0">
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
          <ExecutiveSummary
            expensesByType={expensesByType}
            totalReceitas={summary.totalReceitas}
            totalContas={totalContas}
            totalFaturas={totalFaturas}
            annualTrend={annualTrend}
            periodLabel={periodLabel}
            isMobile={isMobile}
          />
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 relative z-10">
      <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
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
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Relatórios</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{periodLabel}</p>
            </div>
            <div className="min-w-[32px]" />
          </div>

          {desktopSummaryCards}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
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
            <div className="space-y-4">
              {reportContent}
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 pb-6 overflow-hidden">
      {desktopSummarySection}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-4 pb-0">
        <div className="space-y-3">
          {filtersSection}
          {reportContent}
        </div>
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
