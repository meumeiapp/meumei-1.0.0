import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
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

  const rendimentosTotal = useMemo(() => {
    return periodYields.reduce((sum, item) => sum + item.amount, 0);
  }, [periodYields]);

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

  const mapSelector = (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Mapas</div>
      <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {([
          { id: 'financial', label: 'Mapa Financeiro' },
          { id: 'events', label: 'Mapa de Eventos' }
        ] as { id: MapMode; label: string }[]).map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleMapModeChange(item.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
              mapMode === item.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-200/80 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const periodControls = (
    <div className={`flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 ${isMobile ? 'text-xs' : ''}`}>
      <button
        onClick={() => handleMonthChange(-1)}
        className="p-2 rounded-full hover:bg-white/10"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2 text-sm text-slate-200">
        <Calendar size={16} /> {periodLabel}
      </div>
      <button
        onClick={() => handleMonthChange(1)}
        className="p-2 rounded-full hover:bg-white/10"
        aria-label="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
      <button
        onClick={handleOpenCustomRange}
        className="ml-2 px-3 py-1 text-xs rounded-full border border-white/10 text-slate-200 hover:bg-white/10"
      >
        Personalizar
      </button>
    </div>
  );

  const summaryCards = (
    <div className={isMobile ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-3'}>
      <div className={`bg-white/5 border border-white/10 ${isMobile ? 'rounded-xl px-2 py-1.5' : 'rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] text-emerald-300/80 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>
          Receita total
        </div>
        <div className={`${isMobile ? 'text-[12px]' : 'text-lg'} font-semibold text-white mt-1`}>
          {formatCurrency(headerSummary.totalReceitas)}
        </div>
      </div>
      <div className={`bg-white/5 border border-white/10 ${isMobile ? 'rounded-xl px-2 py-1.5' : 'rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] text-rose-300/80 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>
          Total comprometido
        </div>
        <div className={`${isMobile ? 'text-[12px]' : 'text-lg'} font-semibold text-white mt-1`}>
          {formatCurrency(headerSummary.totalComprometido)}
        </div>
      </div>
      <div className={`bg-white/5 border border-white/10 ${isMobile ? 'rounded-xl px-2 py-1.5' : 'rounded-2xl px-4 py-3'}`}>
        <div className={`uppercase tracking-[0.25em] text-cyan-300/80 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>
          Total disponível
        </div>
        <div className={`${isMobile ? 'text-[12px]' : 'text-lg'} font-semibold text-white mt-1`}>
          {formatCurrency(headerSummary.totalDisponivel)}
        </div>
      </div>
    </div>
  );

  const filtersSection = (
    <div className={`flex flex-col lg:flex-row ${isMobile ? 'gap-3' : 'gap-4'}`}>
      <div className={`flex-1 bg-white/5 border border-white/10 ${isMobile ? 'rounded-2xl p-3' : 'rounded-3xl p-4'} flex flex-col gap-4`}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtros</div>
        {isMobile ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Natureza</span>
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                  <button
                    key={option}
                    onClick={() => setTaxFilter(option)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition ${
                      taxFilter === option
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-200/80 hover:text-white'
                    }`}
                  >
                    {option === 'all' ? 'Tudo' : option}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                <button
                  key={option}
                  onClick={() => setViewMode(option)}
                  className={`px-2 py-2 rounded-xl text-[10px] font-semibold transition ${
                    viewMode === option
                      ? 'bg-cyan-400/90 text-slate-900'
                      : 'bg-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  {option === 'caixa' ? 'Visão Caixa' : 'Visão Competência'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
              <button
                key={option}
                onClick={() => setTaxFilter(option)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  taxFilter === option
                    ? 'bg-white text-slate-900'
                    : 'bg-white/10 text-slate-200'
                }`}
              >
                {option === 'all' ? 'Tudo' : option}
              </button>
            ))}
            {(['caixa', 'competencia'] as ViewMode[]).map(option => (
              <button
                key={option}
                onClick={() => setViewMode(option)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  viewMode === option
                    ? 'bg-cyan-400/90 text-slate-900'
                    : 'bg-white/10 text-slate-200'
                }`}
              >
                {option === 'caixa' ? 'Visão Caixa' : 'Visão Competência'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`flex-1 bg-white/5 border border-white/10 ${isMobile ? 'rounded-2xl p-3' : 'rounded-3xl p-4'}`}>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Modos</div>
        <div className={`mt-3 ${isMobile ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-2'}`}>
          {([
            { id: 'map', label: 'Mapa Financeiro' },
            { id: 'summary', label: 'Resumo Executivo' },
            { id: 'export', label: 'Exportar / Importar' }
          ] as { id: ReportTab; label: string }[]).map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`${isMobile ? 'px-2 py-2 rounded-xl text-[10px]' : 'px-4 py-2 rounded-full text-sm'} font-semibold ${
                tab === item.id
                  ? 'bg-emerald-400/90 text-slate-900'
                  : 'bg-white/10 text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const reportContent = (
    <div className={`bg-white/5 border border-white/10 ${isMobile ? 'rounded-2xl p-4' : 'rounded-[32px] p-6 md:p-8'}`}>
      {tab === 'map' && (
        <div className="space-y-4">
          {mapSelector}
          {mapMode === 'financial' ? (
            <FinancialMap
              summary={summary}
              transactions={transactions}
              yields={periodYields}
              accounts={reportAccounts}
              creditCards={creditCards}
              periodLabel={periodLabel}
              isMobile={isMobile}
            />
          ) : (
            <EventMap
              periodLabel={periodLabel}
              transactions={transactions}
              accounts={reportAccounts}
              creditCards={creditCards}
              isMobile={isMobile}
            />
          )}
        </div>
      )}
      {tab === 'summary' && (
        <ExecutiveSummary
          summary={summary}
          expensesByType={expensesByType}
          rendimentosTotal={rendimentosTotal}
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
  );

  const mobileHeader = (
    <div className="space-y-1">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-white/10 text-slate-300 hover:text-white transition-colors"
          aria-label="Voltar para o início"
        >
          <Home size={16} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-white truncate">Relatórios</p>
          <p className="text-[10px] text-slate-400 truncate">{periodLabel}</p>
        </div>
        <div className="min-w-[32px]" />
      </div>
      {periodControls}
      {summaryCards}
    </div>
  );

  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
        <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
          {headerFill.height > 0 && (
            <div
              className="fixed left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl"
              style={{ top: headerFill.top, height: headerFill.height }}
            />
          )}
          <div
            className="fixed left-0 right-0 z-30"
            style={{ top: 'var(--mm-mobile-top, 0px)' }}
          >
            <div
              ref={subHeaderRef}
              className="w-full border-b border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-sm"
            >
              <div className="px-4 pb-0 pt-1">
                {mobileHeader}
              </div>
            </div>
          </div>
          <div
            className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+96px)]"
            style={{ paddingTop: subHeaderHeight ? Math.max(0, subHeaderHeight - 40) : undefined }}
          >
            <div className="space-y-1 -mt-8">
              {filtersSection}
              {reportContent}
            </div>
          </div>
        </div>

        {isRangeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-slate-950 border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4">
              <h4 className="text-lg font-semibold text-white">Selecionar período personalizado</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Data inicial</label>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, start: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Data final</label>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={event =>
                      setCustomRange(prev => ({ ...prev, end: event.target.value }))
                    }
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleResetCustomRange}
                  className="px-4 py-2 rounded-full border border-white/10 text-sm text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCustomRange}
                  className="px-4 py-2 rounded-full bg-emerald-400/90 text-slate-900 text-sm font-semibold"
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
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 space-y-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Voltar ao Dashboard
        </button>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">Relatórios</p>
            <h1 className="text-3xl font-semibold mt-2">Mapa financeiro e exportações</h1>
            <p className="text-sm text-slate-400">{companyName}</p>
          </div>
          {periodControls}
        </div>

        {summaryCards}
        {filtersSection}
        {reportContent}
      </div>

      {isRangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-950 border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4">
            <h4 className="text-lg font-semibold text-white">Selecionar período personalizado</h4>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Data inicial</label>
                <input
                  type="date"
                  value={customRange.start}
                  onChange={event =>
                    setCustomRange(prev => ({ ...prev, start: event.target.value }))
                  }
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Data final</label>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={event =>
                    setCustomRange(prev => ({ ...prev, end: event.target.value }))
                  }
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleResetCustomRange}
                className="px-4 py-2 rounded-full border border-white/10 text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCustomRange}
                className="px-4 py-2 rounded-full bg-emerald-400/90 text-slate-900 text-sm font-semibold"
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
