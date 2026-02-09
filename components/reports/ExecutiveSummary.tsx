import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PiggyBank,
  TrendingUp,
  X
} from 'lucide-react';
import { formatCurrency } from './reportUtils';

interface ExecutiveSummaryProps {
  totalReceitas: number;
  totalContas: number;
  totalFaturas: number;
  expensesByType: {
    fixed: number;
    variable: number;
    personal: number;
  };
  expenseTypeColors?: {
    fixed: string;
    variable: string;
    personal: string;
  };
  annualTrend: Array<{
    mes: number;
    totalReceitas: number;
    totalDespesas: number;
    resultado: number;
  }>;
  periodLabel: string;
  isMobile: boolean;
  isFullscreen?: boolean;
  hideHeader?: boolean;
}

const monthLabel = (monthIndex: number) =>
  new Date(2000, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
const monthLabelShort = (monthIndex: number) =>
  new Date(2000, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();

const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  totalReceitas,
  totalContas,
  totalFaturas,
  expensesByType,
  expenseTypeColors,
  annualTrend,
  periodLabel,
  isMobile,
  isFullscreen = false,
  hideHeader = false
}) => {
  const typeColors = expenseTypeColors || {
    fixed: '#f59e0b',
    variable: '#ef4444',
    personal: '#22d3ee'
  };
  const incomeAccent = '#10b981';
  const expenseAccent = typeColors.variable;
  const [isTrendOpen, setIsTrendOpen] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => new Date().getMonth());
  const expenseDistribution = useMemo(() => {
    const total = Math.max(expensesByType.fixed + expensesByType.variable + expensesByType.personal, 1);
    return [
      { label: 'Fixas', value: expensesByType.fixed, color: typeColors.fixed },
      { label: 'Variáveis', value: expensesByType.variable, color: typeColors.variable },
      { label: 'Pessoais', value: expensesByType.personal, color: typeColors.personal }
    ].map(item => ({
      ...item,
      percent: (item.value / total) * 100
    }));
  }, [expensesByType, typeColors.fixed, typeColors.personal, typeColors.variable]);

  const totalDespesas = expensesByType.fixed + expensesByType.variable + expensesByType.personal;
  const safeSelectedMonth = Math.min(Math.max(selectedMonthIndex, 0), 11);
  const hasTrendData = useMemo(
    () => annualTrend.some(item => (item.totalReceitas || 0) > 0 || (item.totalDespesas || 0) > 0),
    [annualTrend]
  );
  const trendSeries = useMemo(() => {
    if (hasTrendData) {
      return annualTrend;
    }
    return annualTrend.map((item, index) => {
      if (index !== safeSelectedMonth) {
        return item;
      }
      return {
        ...item,
        totalReceitas: totalReceitas,
        totalDespesas: totalDespesas,
        resultado: totalReceitas - totalDespesas
      };
    });
  }, [annualTrend, hasTrendData, safeSelectedMonth, totalReceitas, totalDespesas]);

  const safeValue = (value: number | string | undefined | null) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const maxTrend = useMemo(() => {
    return Math.max(
      1,
      ...trendSeries.map(item => Math.max(safeValue(item.totalReceitas), safeValue(item.totalDespesas)))
    );
  }, [trendSeries]);

  const incomeSeries = useMemo(() => trendSeries.map(item => safeValue(item.totalReceitas)), [trendSeries]);
  const expenseSeries = useMemo(() => trendSeries.map(item => safeValue(item.totalDespesas)), [trendSeries]);
  const selectedIncome = incomeSeries[safeSelectedMonth] || 0;
  const selectedExpense = expenseSeries[safeSelectedMonth] || 0;
  const selectedSaldo = selectedIncome - selectedExpense;
  const displayIncome = hasTrendData ? selectedIncome : totalReceitas;
  const displayExpense = hasTrendData ? selectedExpense : totalDespesas;
  const displaySaldo = displayIncome - displayExpense;
  const displayLabel = hasTrendData ? monthLabel(safeSelectedMonth) : periodLabel;
  const annualIncome = useMemo(() => incomeSeries.reduce((sum, value) => sum + value, 0), [incomeSeries]);
  const annualExpense = useMemo(() => expenseSeries.reduce((sum, value) => sum + value, 0), [expenseSeries]);
  const annualSaldo = annualIncome - annualExpense;
  const saldoPeriodo = totalReceitas - totalDespesas;
  const margemLiquida = totalReceitas > 0 ? saldoPeriodo / totalReceitas : 0;
  const comprometimento = totalReceitas > 0 ? totalDespesas / totalReceitas : 0;
  const shareFixas = totalReceitas > 0 ? expensesByType.fixed / totalReceitas : 0;
  const reservaMinima = expensesByType.fixed * 3;
  const metaReceita = totalDespesas > 0 ? totalDespesas / 0.8 : 0;
  const folegoMeses = totalDespesas > 0 ? totalContas / totalDespesas : 0;
  const percentValue = (value: number) => `${(value * 100).toFixed(1)}%`;
  const progressValue = (value: number) => Math.min(Math.max(value * 100, 0), 100);
  const toneForPositive = (value: number, warn: number, danger: number) =>
    value >= warn ? 'text-emerald-300' : value >= danger ? 'text-amber-300' : 'text-red-300';
  const toneForInverse = (value: number, warn: number, danger: number) =>
    value <= warn ? 'text-emerald-300' : value <= danger ? 'text-amber-300' : 'text-red-300';

  const insights = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: string }> = [];
    if (saldoPeriodo < 0) {
      items.push({
        title: 'Gastos acima da receita',
        detail: 'Revise custos fixos e variáveis para voltar ao azul.',
        tone: 'text-red-300'
      });
    }
    if (comprometimento > 0.75) {
      items.push({
        title: 'Comprometimento alto',
        detail: 'Mais de 75% da receita está sendo consumida por despesas.',
        tone: 'text-amber-300'
      });
    }
    if (shareFixas > 0.5) {
      items.push({
        title: 'Fixas muito pesadas',
        detail: 'Despesas fixas acima de 50% limitam sua margem.',
        tone: 'text-amber-300'
      });
    }
    if (folegoMeses < 1) {
      items.push({
        title: 'Fôlego curto',
        detail: 'O caixa cobre menos de 1 mês de despesas.',
        tone: 'text-red-300'
      });
    }
    if (items.length === 0) {
      items.push({
        title: 'Operação saudável',
        detail: 'Receita, despesas e margem estão equilibradas.',
        tone: 'text-emerald-300'
      });
    }
    return items.slice(0, 3);
  }, [saldoPeriodo, comprometimento, shareFixas, folegoMeses]);

  const trendStats = useMemo(() => {
    if (annualTrend.length === 0) {
      return {
        bestIncome: { value: 0, mes: 0 },
        bestExpense: { value: 0, mes: 0 },
        bestSaldo: { value: 0, mes: 0 },
        worstSaldo: { value: 0, mes: 0 },
        avgIncome: 0,
        avgExpense: 0
      };
    }
    const bestIncome = annualTrend.reduce(
      (best, item) => (safeValue(item.totalReceitas) > best.value ? { value: safeValue(item.totalReceitas), mes: item.mes } : best),
      { value: safeValue(annualTrend[0].totalReceitas), mes: annualTrend[0].mes }
    );
    const bestExpense = annualTrend.reduce(
      (best, item) => (safeValue(item.totalDespesas) > best.value ? { value: safeValue(item.totalDespesas), mes: item.mes } : best),
      { value: safeValue(annualTrend[0].totalDespesas), mes: annualTrend[0].mes }
    );
    const bestSaldo = annualTrend.reduce(
      (best, item) => (safeValue(item.resultado) > best.value ? { value: safeValue(item.resultado), mes: item.mes } : best),
      { value: safeValue(annualTrend[0].resultado), mes: annualTrend[0].mes }
    );
    const worstSaldo = annualTrend.reduce(
      (best, item) => (safeValue(item.resultado) < best.value ? { value: safeValue(item.resultado), mes: item.mes } : best),
      { value: safeValue(annualTrend[0].resultado), mes: annualTrend[0].mes }
    );
    return {
      bestIncome,
      bestExpense,
      bestSaldo,
      worstSaldo,
      avgIncome: annualIncome / annualTrend.length,
      avgExpense: annualExpense / annualTrend.length
    };
  }, [annualIncome, annualExpense, annualTrend]);

  const previousMonth = safeSelectedMonth > 0 ? annualTrend[safeSelectedMonth - 1] : undefined;
  const deltaIncome = previousMonth ? selectedIncome - (previousMonth.totalReceitas || 0) : 0;
  const deltaExpense = previousMonth ? selectedExpense - (previousMonth.totalDespesas || 0) : 0;
  const deltaSaldo = previousMonth ? selectedSaldo - (previousMonth.resultado || 0) : 0;
  const formatDelta = (value: number) =>
    `${value >= 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
  const trendModal = isMobile && isTrendOpen ? (
    <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm">
      <div
        className="fixed inset-0 w-screen bg-white dark:bg-[#111114] text-zinc-900 dark:text-white p-3 pt-[calc(env(safe-area-inset-top)+6px)] pb-[calc(env(safe-area-inset-bottom)+34px)] overflow-y-auto flex flex-col gap-2"
        style={{ height: '100dvh', minHeight: '100vh' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Evolução mensal</p>
          </div>
          <button
            type="button"
            onClick={() => setIsTrendOpen(false)}
            aria-label="Fechar evolução mensal"
            className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Evolução mensal (barras)</div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-2 flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-12 gap-1 items-end h-full pb-1">
            {trendSeries.map((item, idx) => {
              const incomeHeight = (item.totalReceitas / maxTrend) * 100;
              const expenseHeight = (item.totalDespesas / maxTrend) * 100;
              const hasData = item.totalReceitas > 0 || item.totalDespesas > 0;
              return (
                <button
                  key={item.mes}
                  type="button"
                  onClick={() => setSelectedMonthIndex(idx)}
                  className={`flex h-full flex-col items-center justify-end gap-1 ${selectedMonthIndex === idx ? 'opacity-100' : 'opacity-70'}`}
                >
                  <div className="flex flex-1 items-end gap-1 w-full min-h-[84px]">
                    {hasData ? (
                      <>
                        <div className="flex-1 h-full rounded-full bg-transparent flex items-end">
                          <div
                            className="w-full rounded-full bg-emerald-500/80"
                            style={{ height: `${incomeHeight}%`, minHeight: item.totalReceitas > 0 ? 6 : 0 }}
                          />
                        </div>
                        <div className="flex-1 h-full rounded-full bg-transparent flex items-end">
                          <div
                            className="w-full rounded-full opacity-80"
                            style={{
                              height: `${expenseHeight}%`,
                              minHeight: item.totalDespesas > 0 ? 6 : 0,
                              backgroundColor: expenseAccent
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 h-full" />
                        <div className="flex-1 h-full" />
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-1 text-[9px] text-zinc-400">
          {trendSeries.map((item, idx) => (
            <button
              key={item.mes}
              type="button"
              onClick={() => setSelectedMonthIndex(idx)}
              className={`text-center ${selectedMonthIndex === idx ? 'text-emerald-400 font-semibold' : ''}`}
            >
              {monthLabel(item.mes)}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-200">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-zinc-400">
            <span>Ano todo</span>
            <span>Resumo anual</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-emerald-500 font-semibold">R$ {annualIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span className="font-semibold" style={{ color: expenseAccent }}>
              R$ {annualExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span
              className="font-semibold"
              style={{ color: annualSaldo >= 0 ? incomeAccent : expenseAccent }}
            >
              R$ {annualSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[10px] text-zinc-700 dark:text-zinc-200">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-zinc-400">
            <span>{monthLabel(safeSelectedMonth)}</span>
            <span>Resumo do mês</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <div className="text-emerald-500 font-semibold">{formatCurrency(selectedIncome)}</div>
              <div className="text-[9px] text-zinc-400">Receita</div>
            </div>
            <div>
              <div className="font-semibold" style={{ color: expenseAccent }}>
                {formatCurrency(selectedExpense)}
              </div>
              <div className="text-[9px] text-zinc-400">Despesa</div>
            </div>
            <div>
              <div
                className="font-semibold"
                style={{ color: selectedSaldo >= 0 ? incomeAccent : expenseAccent }}
              >
                {formatCurrency(selectedSaldo)}
              </div>
              <div className="text-[9px] text-zinc-400">Saldo</div>
            </div>
          </div>
          {previousMonth && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-zinc-400">
              <div>Δ {formatDelta(deltaIncome)}</div>
              <div>Δ {formatDelta(deltaExpense)}</div>
              <div style={{ color: deltaSaldo >= 0 ? incomeAccent : expenseAccent }}>
                Δ {formatDelta(deltaSaldo)}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-700 dark:text-zinc-200">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-zinc-400">Maior receita</div>
            <div className="text-emerald-500 font-semibold">{formatCurrency(trendStats.bestIncome.value)}</div>
            <div className="text-[9px] text-zinc-400">{monthLabel(trendStats.bestIncome.mes)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-zinc-400">Maior despesa</div>
            <div className="font-semibold" style={{ color: expenseAccent }}>
              {formatCurrency(trendStats.bestExpense.value)}
            </div>
            <div className="text-[9px] text-zinc-400">{monthLabel(trendStats.bestExpense.mes)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-zinc-400">Melhor saldo</div>
            <div className="text-emerald-500 font-semibold">{formatCurrency(trendStats.bestSaldo.value)}</div>
            <div className="text-[9px] text-zinc-400">{monthLabel(trendStats.bestSaldo.mes)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-zinc-400">Pior saldo</div>
            <div className="font-semibold" style={{ color: expenseAccent }}>
              {formatCurrency(trendStats.worstSaldo.value)}
            </div>
            <div className="text-[9px] text-zinc-400">{monthLabel(trendStats.worstSaldo.mes)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[10px] text-zinc-700 dark:text-zinc-200">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-zinc-400">
            <span>Médias mensais</span>
            <span>Referência anual</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-emerald-500 font-semibold">{formatCurrency(trendStats.avgIncome)}</span>
            <span className="font-semibold" style={{ color: expenseAccent }}>
              {formatCurrency(trendStats.avgExpense)}
            </span>
            <span
              className="font-semibold"
              style={{ color: annualSaldo >= 0 ? incomeAccent : expenseAccent }}
            >
              {formatCurrency(annualSaldo)}
            </span>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const isExpanded = !isMobile && isFullscreen;
  const desktopCardClass = isExpanded ? 'rounded-3xl px-3 py-2.5' : 'rounded-2xl px-3 py-2';
  const desktopLabelClass = isExpanded ? 'text-[8px] tracking-[0.24em]' : 'text-[8px] tracking-[0.24em]';
  const desktopValueClass = isExpanded ? 'text-[14px] leading-tight' : 'text-[14px] leading-tight';
  const desktopGridGap = isExpanded ? 'gap-2' : 'gap-2';
  const desktopPanelClass = isExpanded ? 'rounded-3xl p-5 h-full' : 'rounded-3xl p-4 h-full';
  const desktopPanelGap = isExpanded ? 'gap-4' : 'gap-3';
  const desktopBarHeight = isExpanded ? 'h-3' : 'h-2';
  const desktopLegendClass = isExpanded ? 'text-[11px]' : 'text-[10px]';
  const desktopTitleClass = isExpanded ? 'text-lg' : 'text-lg';
  const desktopSubtitleClass = isExpanded ? 'text-sm' : 'text-sm';

  const showMeiPanel = !isMobile;

  const renderProgress = (value: number, toneClass: string) => (
    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full ${toneClass}`}
        style={{ width: `${progressValue(value)}%` }}
      />
    </div>
  );

  const isCardView = !isMobile && !isFullscreen;
  const header = (
    <div className={`flex ${isMobile ? 'items-center justify-between' : 'items-start justify-start'}`}>
      <div>
        <h2 className={`${isMobile ? 'text-base' : desktopTitleClass} font-semibold text-white`}>Resumo</h2>
        <p className={`${isMobile ? 'text-[11px]' : desktopSubtitleClass} text-slate-400`}>{periodLabel}</p>
      </div>
    </div>
  );

  const desktopCardsGridClass = isExpanded ? 'grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';
  const summaryCards = (
    <div
      className={`grid ${isMobile ? 'grid-cols-3 gap-2' : `${desktopCardsGridClass} ${desktopGridGap} auto-rows-fr items-stretch`}`}
    >
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Total de despesas fixas no período."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Desp.fixas</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`} style={{ color: typeColors.fixed }}>
          {formatCurrency(expensesByType.fixed)}
        </div>
      </div>
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Despesas variáveis do período (custos que mudam mês a mês)."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Desp.variáveis</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`} style={{ color: typeColors.variable }}>
          {formatCurrency(expensesByType.variable)}
        </div>
      </div>
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Despesas pessoais registradas no período."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Desp.pessoais</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`} style={{ color: typeColors.personal }}>
          {formatCurrency(expensesByType.personal)}
        </div>
      </div>
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Total de entradas (receitas) do período."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Entradas</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold text-slate-100 ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`}>
          {formatCurrency(totalReceitas)}
        </div>
      </div>
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Saldo somado em todas as contas."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Contas</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold text-slate-100 ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`}>
          {formatCurrency(totalContas)}
        </div>
      </div>
      <div
        className={`h-full min-w-0 bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : desktopCardClass}`}
        title="Total das faturas de cartões no mês."
      >
        <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : desktopLabelClass} uppercase text-slate-400`}>Faturas</div>
        <div className={`${isMobile ? 'text-[13px]' : desktopValueClass} font-semibold text-slate-100 ${isExpanded ? 'mt-1.5' : 'mt-1'} whitespace-normal break-words`}>
          {formatCurrency(totalFaturas)}
        </div>
      </div>
    </div>
  );

  const distributionRowGap = isExpanded ? 'space-y-2' : 'space-y-1';
  const distributionItemClass = isExpanded ? 'text-[12px]' : 'text-[11px]';
  const distributionDesktopClass = isExpanded ? 'rounded-3xl px-5 pt-4 pb-3' : 'rounded-3xl px-3 py-2.5';
  const distributionBarArea = isExpanded ? 'flex-1 min-h-0' : 'min-h-[120px]';
  const distributionCardExpanded = (
    <div
      className={`w-full bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl p-4' : distributionDesktopClass} ${isExpanded ? 'flex flex-col min-h-0 h-full overflow-hidden' : 'h-auto self-start overflow-hidden'} space-y-1.5`}
      title="Veja a proporção das despesas por tipo dentro do período selecionado."
    >
      <div className="text-white font-semibold text-sm">
        Distribuição de despesas
      </div>
      {isExpanded ? (
        <div className={`flex items-end justify-center gap-6 ${distributionBarArea}`}>
          {expenseDistribution.map(item => (
            <div
              key={item.label}
              className="flex flex-col items-center h-full gap-2"
              title={`${item.label}: ${formatCurrency(item.value)} (${item.percent.toFixed(1)}% do total).`}
            >
              <div className="flex flex-col items-center gap-1 w-20">
                <div
                  className="w-full h-8 border border-white/10 bg-white/5 flex items-center justify-center text-[10px] font-semibold text-slate-200"
                  title={`Valor total gasto em ${item.label} no período.`}
                >
                  {formatCurrency(item.value)}
                </div>
              </div>
              <div className="flex flex-col items-center flex-1 w-20">
                <div className="relative flex-1 w-full bg-white/5 overflow-hidden">
                  <div className="absolute top-2 inset-x-0 text-center text-[9px] font-semibold text-slate-300">
                    {item.percent.toFixed(1)}%
                  </div>
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: `${item.percent}%`, backgroundColor: item.color }}
                  />
                </div>
                <div
                  className="mt-2 w-full h-8 border border-white/10 bg-white/5 flex items-center justify-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-300"
                  title={`Categoria ${item.label}.`}
                >
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 items-stretch`}>
          <div className={`flex items-end gap-4 ${distributionBarArea}`}>
            {expenseDistribution.map(item => (
              <div
                key={item.label}
                className="flex-1 h-full flex items-end"
                title={`${item.label}: ${formatCurrency(item.value)} (${item.percent.toFixed(1)}% do total).`}
              >
                <div className="w-full h-full rounded-2xl bg-white/5 overflow-hidden flex items-end">
                  <div
                    className="w-full rounded-2xl"
                    style={{ height: `${item.percent}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className={distributionRowGap}>
            {expenseDistribution.map(item => (
              <div
                key={item.label}
                title={`${item.label}: ${formatCurrency(item.value)} (${item.percent.toFixed(1)}% do total).`}
                className={`flex items-center justify-between ${isMobile ? 'text-[11px]' : distributionItemClass} text-slate-300`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </div>
                <div>
                  {formatCurrency(item.value)} • {item.percent.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const distributionCardCompact = (
    <div
      className={`w-full bg-slate-900/60 border border-white/10 ${distributionDesktopClass} flex flex-col overflow-hidden space-y-1.5`}
      title="Veja a proporção das despesas por tipo dentro do período selecionado."
    >
      <div className="text-[11px] font-semibold text-slate-100 leading-none">Distribuição de despesas</div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
        {expenseDistribution.map(item => (
          <div key={item.label} style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-300">
        {expenseDistribution.map(item => (
          <div
            key={item.label}
            title={`${item.label}: ${formatCurrency(item.value)} (${item.percent.toFixed(1)}% do total).`}
            className="flex items-center gap-1"
          >
            <span className="h-2 w-2" style={{ backgroundColor: item.color }} />
            <span className="uppercase tracking-[0.12em]">{item.label}</span>
            <span className="text-slate-400">{item.percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  const distributionPanel = isExpanded ? (
    <div className="grid grid-cols-2 gap-4 h-full min-h-0">
      {distributionCardExpanded}
      <div
        className={`w-full bg-slate-900/60 border border-white/10 ${distributionDesktopClass} flex flex-col min-h-0 h-full overflow-hidden`}
        title="Guia rápido para interpretar a tela de Resumo."
      >
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          Como usar o Resumo
        </div>
        <div className="flex-1 grid grid-rows-3 gap-3 text-[12px] text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Visão geral</div>
            <div className="font-semibold text-slate-100">Entenda a saúde financeira</div>
            <div className="text-[11px] text-slate-400">
              Use os cards superiores para ver receitas, despesas e saldos do período.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Distribuição</div>
            <div className="font-semibold text-slate-100">Identifique o peso dos gastos</div>
            <div className="text-[11px] text-slate-400">
              Compare fixas, variáveis e pessoais para ajustar o orçamento.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Evolução mensal</div>
            <div className="font-semibold text-slate-100">Acompanhe tendência</div>
            <div className="text-[11px] text-slate-400">
              Veja meses fortes e críticos para planejar metas e reservas.
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : (
    distributionCardCompact
  );

  const trendSpacingClass = isExpanded ? 'gap-2' : 'space-y-1';
  const trendBarHeight = isExpanded ? 'h-[10px]' : 'h-[5px]';
  const trendLabelClass = isExpanded ? 'text-[12px]' : 'text-[8px]';
  const trendValueClass = isExpanded ? 'text-[13px]' : 'text-[9px]';
  const trendGridClass = isExpanded ? 'grid-cols-[110px,1fr,110px]' : 'grid-cols-[32px,1fr,100px]';
  const trendPillBase = isExpanded
    ? 'h-[24px] w-[110px] rounded-full border border-white/10 bg-white/5 px-2 flex items-center'
    : '';
  const trendMonthPill = isExpanded ? `${trendPillBase} justify-center text-[11px]` : '';
  const trendValuePill = isExpanded ? `${trendPillBase} justify-end text-[11px]` : '';
  const trendGapClass = isExpanded ? 'gap-3' : 'gap-2';
  const trendPanel = (
    <button
      type="button"
      onClick={() => setIsTrendOpen(true)}
      className={`w-full text-left bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl p-4' : desktopPanelClass} ${isExpanded ? 'flex flex-col min-h-0 overflow-hidden' : 'overflow-hidden'} ${isExpanded ? 'space-y-4' : 'space-y-3'} hover:border-white/20 transition`}
      title="Evolução mensal de receitas e despesas ao longo do ano."
    >
      <div className="flex items-center justify-between gap-2 text-white font-semibold text-sm">
        <span>
          Evolução mensal
        </span>
        {isMobile && <span className="text-[10px] text-slate-400">Toque para expandir</span>}
      </div>
      <div
        className={`${isExpanded ? 'flex flex-col justify-between flex-1 min-h-0 overflow-hidden' : ''} ${trendSpacingClass}`}
      >
        {trendSeries.map(item => {
          const incomeValue = safeValue(item.totalReceitas);
          const expenseValue = safeValue(item.totalDespesas);
          const incomeWidth = (incomeValue / maxTrend) * 100;
          const expenseWidth = (expenseValue / maxTrend) * 100;
          const saldoValue = incomeValue - expenseValue;
          return (
            <div
              key={item.mes}
              title={`${monthLabel(item.mes)} • Receita ${formatCurrency(incomeValue)} • Despesa ${formatCurrency(expenseValue)} • Saldo ${formatCurrency(saldoValue)}`}
              className={`grid ${isMobile ? 'grid-cols-[28px,1fr]' : trendGridClass} ${trendGapClass} items-center`}
            >
              {isExpanded ? (
                <div className={`${trendMonthPill} text-slate-300 uppercase`}>
                  {monthLabel(item.mes)}
                </div>
              ) : (
                <div className={`${trendLabelClass} uppercase text-slate-400`}>
                  {monthLabelShort(item.mes)}
                </div>
              )}
              <div className="space-y-1.5">
                <div className={`${trendBarHeight} rounded-full bg-white/5 overflow-hidden`}>
                    <div
                      className="h-full rounded-full opacity-80"
                      style={{ width: `${incomeWidth}%`, minWidth: incomeValue > 0 ? 6 : 0, backgroundColor: incomeAccent }}
                    />
                </div>
                <div className={`${trendBarHeight} rounded-full bg-white/5 overflow-hidden`}>
                    <div
                      className="h-full rounded-full opacity-80"
                      style={{ width: `${expenseWidth}%`, minWidth: expenseValue > 0 ? 6 : 0, backgroundColor: expenseAccent }}
                    />
                </div>
              </div>
              {!isMobile && (
                isExpanded ? (
                  <div className="flex flex-col gap-2 items-end">
                    <div className={trendValuePill} style={{ color: incomeAccent }}>
                      {formatCurrency(incomeValue)}
                    </div>
                    <div className={trendValuePill} style={{ color: expenseAccent }}>
                      {formatCurrency(expenseValue)}
                    </div>
                  </div>
                ) : (
                  <div className={`flex flex-col gap-0.5 ${trendValueClass} text-slate-400`}>
                    <span style={{ color: incomeAccent }}>{formatCurrency(incomeValue)}</span>
                    <span style={{ color: expenseAccent }}>{formatCurrency(expenseValue)}</span>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        {isFullscreen && !isMobile && (
          <div className="grid grid-cols-2 gap-3 text-[12px] text-slate-300">
            <div
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              title="Mês com maior receita registrada."
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Melhor receita</div>
              <div className="text-sm font-semibold text-emerald-300">{formatCurrency(trendStats.bestIncome.value)}</div>
              <div className="text-[10px] text-slate-500">{monthLabel(trendStats.bestIncome.mes)}</div>
            </div>
            <div
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              title="Mês com maior volume de despesas."
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Maior despesa</div>
              <div className="text-sm font-semibold" style={{ color: expenseAccent }}>
                {formatCurrency(trendStats.bestExpense.value)}
              </div>
              <div className="text-[10px] text-slate-500">{monthLabel(trendStats.bestExpense.mes)}</div>
            </div>
            <div
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              title="Mês com melhor saldo (receita menos despesa)."
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Saldo em destaque</div>
              <div
                className="text-sm font-semibold"
                style={{ color: displaySaldo >= 0 ? incomeAccent : expenseAccent }}
              >
                {formatCurrency(displaySaldo)}
              </div>
              <div className="text-[10px] text-slate-500">{displayLabel}</div>
            </div>
            <div
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              title="Receita média considerando todos os meses do ano."
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Média mensal</div>
              <div className="text-sm font-semibold text-slate-100">{formatCurrency(trendStats.avgIncome)}</div>
              <div className="text-[10px] text-slate-500">Receita média do ano.</div>
            </div>
          </div>
        )}
        {!hasTrendData && !isMobile && (
          <div className="text-[11px] text-slate-500">
            Sem dados mensais suficientes no ano. Mostrando o período selecionado.
          </div>
        )}
        {!isMobile && (
          <div className={`flex items-center justify-between gap-4 ${desktopLegendClass} text-slate-400`} title="Legenda de cores e totais do período.">
            <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: incomeAccent }} /> Receita
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: expenseAccent }} /> Despesa
            </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-300">
              <span className="text-slate-500">{displayLabel}</span>
              <span>Receita: {formatCurrency(displayIncome)}</span>
              <span>Despesa: {formatCurrency(displayExpense)}</span>
              <span style={{ color: displaySaldo >= 0 ? incomeAccent : expenseAccent }}>
                Saldo: {formatCurrency(displaySaldo)}
              </span>
            </div>
          </div>
        )}
      </div>
    </button>
  );

  const diagnosticPanel = showMeiPanel ? (
    <div className={`w-full bg-slate-900/60 border border-white/10 ${isExpanded ? 'rounded-3xl px-5 py-4' : 'rounded-3xl px-3 py-2'} space-y-1.5 overflow-hidden h-full`}>
      <div className="flex items-center gap-2 text-white font-semibold text-sm leading-none">
        Diagnóstico MEI
      </div>
      <div className="space-y-1.5">
        <div>
          <div className={`flex items-center justify-between ${isExpanded ? 'text-[13px]' : 'text-[10px]'} text-slate-200`}>
            <span title="Quanto da receita sobra após todas as despesas.">Margem líquida</span>
            <span className={toneForPositive(margemLiquida, 0.2, 0.1)}>{percentValue(margemLiquida)}</span>
          </div>
          {renderProgress(margemLiquida, margemLiquida >= 0.2 ? 'bg-emerald-400/80' : margemLiquida >= 0.1 ? 'bg-amber-400/80' : 'bg-red-500/80')}
          <div className="text-[10px] text-slate-500">Quanto sobra da receita.</div>
        </div>
        <div>
          <div className={`flex items-center justify-between ${isExpanded ? 'text-[13px]' : 'text-[10px]'} text-slate-200`}>
            <span title="Percentual da receita consumido por despesas.">Comprometimento</span>
            <span className={toneForInverse(comprometimento, 0.7, 0.85)}>{percentValue(comprometimento)}</span>
          </div>
          {renderProgress(comprometimento, comprometimento <= 0.7 ? 'bg-emerald-400/80' : comprometimento <= 0.85 ? 'bg-amber-400/80' : 'bg-red-500/80')}
          <div className="text-[10px] text-slate-500">Percentual da receita gasto.</div>
        </div>
        <div>
          <div className={`flex items-center justify-between ${isExpanded ? 'text-[13px]' : 'text-[10px]'} text-slate-200`}>
            <span title="Porção da receita comprometida por despesas fixas.">Fixas na receita</span>
            <span className={toneForInverse(shareFixas, 0.4, 0.55)}>{percentValue(shareFixas)}</span>
          </div>
          {renderProgress(shareFixas, shareFixas <= 0.4 ? 'bg-emerald-400/80' : shareFixas <= 0.55 ? 'bg-amber-400/80' : 'bg-red-500/80')}
          <div className="text-[10px] text-slate-500">Quanto das receitas vai para fixas.</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5" title="Reserva mínima recomendada para 3 meses de despesas fixas.">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Reserva mínima</div>
          <div className="text-sm font-semibold text-white">{formatCurrency(reservaMinima)}</div>
          <div className="text-[10px] text-slate-500">3x despesas fixas.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5" title="Receita alvo para manter margem saudável.">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Meta de receita</div>
          <div className="text-sm font-semibold text-white">{formatCurrency(metaReceita)}</div>
          <div className="text-[10px] text-slate-500">Margem alvo de 20%.</div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Insights rápidos</div>
        <div className="space-y-2">
          {insights.map(item => (
            <div key={item.title} className="flex flex-col gap-0.5" title={item.detail}>
              <span className={`text-[12px] font-semibold ${item.tone}`}>{item.title}</span>
              <span className="text-[11px] text-slate-400">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  const summaryPanels = isExpanded ? (
    <div className="grid grid-cols-[minmax(0,30%),minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 flex-1 min-h-0 items-stretch">
      <div className="col-start-1 row-start-1 min-h-0 h-full">{distributionPanel}</div>
      {diagnosticPanel && (
        <div className="col-start-1 row-start-2 min-h-0 h-full">{diagnosticPanel}</div>
      )}
      <div className="col-start-2 row-start-1 row-span-2 min-h-0 h-full min-w-0">{trendPanel}</div>
    </div>
  ) : (
    <div className="grid grid-cols-[minmax(0,44%),minmax(0,1fr)] gap-4 flex-1 min-h-0 items-stretch">
      <div className="grid grid-rows-[auto,1fr] gap-3 min-h-0 h-full">
        {distributionPanel}
        {diagnosticPanel}
      </div>
      <div className="min-h-0">{trendPanel}</div>
    </div>
  );

  return (
    <div
      className={
        isMobile
          ? 'space-y-4'
          : isExpanded
            ? 'h-full flex flex-col gap-4'
            : `h-full flex flex-col ${isCardView ? 'gap-4' : 'gap-6'}`
      }
    >
      {!hideHeader && header}
      {isCardView ? (
        <div className="flex-1 min-h-0 rounded-3xl border border-white/10 bg-slate-950/40 p-4">
          <div className="h-full min-h-0 flex flex-col gap-4">
            {summaryCards}
            {summaryPanels}
          </div>
        </div>
      ) : (
        <>
          {summaryCards}
          {summaryPanels}
        </>
      )}
      {trendModal && (typeof document !== 'undefined' ? createPortal(trendModal, document.body) : trendModal)}
    </div>
  );
};

export default ExecutiveSummary;
