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
  annualTrend: Array<{
    mes: number;
    totalReceitas: number;
    totalDespesas: number;
    resultado: number;
  }>;
  periodLabel: string;
  isMobile: boolean;
}

const monthLabel = (monthIndex: number) =>
  new Date(2000, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase();

const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  totalReceitas,
  totalContas,
  totalFaturas,
  expensesByType,
  annualTrend,
  periodLabel,
  isMobile
}) => {
  const [isTrendOpen, setIsTrendOpen] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => new Date().getMonth());
  const expenseDistribution = useMemo(() => {
    const total = Math.max(expensesByType.fixed + expensesByType.variable + expensesByType.personal, 1);
    return [
      { label: 'Fixas', value: expensesByType.fixed, color: 'bg-sky-400' },
      { label: 'Variáveis', value: expensesByType.variable, color: 'bg-amber-400' },
      { label: 'Pessoais', value: expensesByType.personal, color: 'bg-pink-400' }
    ].map(item => ({
      ...item,
      percent: (item.value / total) * 100
    }));
  }, [expensesByType]);

  const maxTrend = useMemo(() => {
    return Math.max(
      1,
      ...annualTrend.map(item => Math.max(item.totalReceitas, item.totalDespesas))
    );
  }, [annualTrend]);

  const incomeSeries = useMemo(() => annualTrend.map(item => item.totalReceitas || 0), [annualTrend]);
  const expenseSeries = useMemo(() => annualTrend.map(item => item.totalDespesas || 0), [annualTrend]);
  const safeSelectedMonth = Math.min(Math.max(selectedMonthIndex, 0), 11);
  const selectedIncome = incomeSeries[safeSelectedMonth] || 0;
  const selectedExpense = expenseSeries[safeSelectedMonth] || 0;
  const selectedSaldo = selectedIncome - selectedExpense;
  const annualIncome = useMemo(() => incomeSeries.reduce((sum, value) => sum + value, 0), [incomeSeries]);
  const annualExpense = useMemo(() => expenseSeries.reduce((sum, value) => sum + value, 0), [expenseSeries]);
  const annualSaldo = annualIncome - annualExpense;
  const trendModal = isMobile && isTrendOpen ? (
    <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm">
      <div
        className="fixed inset-0 w-screen bg-white dark:bg-[#111114] text-zinc-900 dark:text-white p-3 pt-[calc(env(safe-area-inset-top)+6px)] pb-[calc(env(safe-area-inset-bottom)+34px)] overflow-hidden flex flex-col gap-1"
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
            {annualTrend.map((item, idx) => {
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
                            className="w-full rounded-full bg-rose-500/80"
                            style={{ height: `${expenseHeight}%`, minHeight: item.totalDespesas > 0 ? 6 : 0 }}
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
          {annualTrend.map((item, idx) => (
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
            <span className="text-rose-500 font-semibold">R$ {annualExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span className={`font-semibold ${annualSaldo >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              R$ {annualSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-1.5 text-[10px] text-zinc-700 dark:text-zinc-200">
          <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-zinc-400">
            <span>{monthLabel(safeSelectedMonth)}</span>
            <span>Resumo do mês</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-emerald-500 font-semibold">R$ {selectedIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span className="text-rose-500 font-semibold">R$ {selectedExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            <span className={`font-semibold ${selectedSaldo >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              R$ {selectedSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={isMobile ? 'space-y-4' : 'h-full flex flex-col gap-6'}>
      <div className={`flex ${isMobile ? 'items-center justify-between' : 'items-start justify-start'}`}>
        <div>
          <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-white`}>Resumo</h2>
          <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-slate-400`}>{periodLabel}</p>
        </div>
      </div>

      <div className={`grid ${isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-1 md:grid-cols-3 gap-4'}`}>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Desp.fixas</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-sky-300 mt-1.5`}>
            {formatCurrency(expensesByType.fixed)}
          </div>
        </div>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Desp.variáveis</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-amber-300 mt-1.5`}>
            {formatCurrency(expensesByType.variable)}
          </div>
        </div>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Desp.pessoais</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-pink-300 mt-1.5`}>
            {formatCurrency(expensesByType.personal)}
          </div>
        </div>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Entradas</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-slate-100 mt-1.5`}>
            {formatCurrency(totalReceitas)}
          </div>
        </div>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Contas</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-slate-100 mt-1.5`}>
            {formatCurrency(totalContas)}
          </div>
        </div>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl px-2 py-2' : 'rounded-3xl p-5'}`}>
          <div className={`${isMobile ? 'text-[8px] tracking-[0.22em]' : 'text-xs'} uppercase text-slate-400`}>Faturas</div>
          <div className={`${isMobile ? 'text-[13px]' : 'text-2xl'} font-semibold text-slate-100 mt-1.5`}>
            {formatCurrency(totalFaturas)}
          </div>
        </div>
      </div>

      <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 lg:grid-cols-2 gap-6 flex-1'}`}>
        <div className={`bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl p-4' : 'rounded-3xl p-6 h-full'} space-y-3`}>
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <PiggyBank size={isMobile ? 14 : 18} /> Distribuição de despesas
          </div>
          <div className={`${isMobile ? 'h-2' : 'h-3'} bg-white/5 rounded-full overflow-hidden flex`}>
            {expenseDistribution.map(item => (
              <div
                key={item.label}
                className={item.color}
                style={{ width: `${item.percent}%` }}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {expenseDistribution.map(item => (
              <div key={item.label} className={`flex items-center justify-between ${isMobile ? 'text-[11px]' : 'text-sm'} text-slate-300`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  {item.label}
                </div>
                <div>
                  {formatCurrency(item.value)} • {item.percent.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsTrendOpen(true)}
          className={`text-left bg-slate-900/60 border border-white/10 ${isMobile ? 'rounded-2xl p-4' : 'rounded-3xl p-6 h-full'} space-y-3 hover:border-white/20 transition`}
        >
          <div className="flex items-center justify-between gap-2 text-white font-semibold text-sm">
            <span className="flex items-center gap-2">
              <TrendingUp size={isMobile ? 14 : 18} /> Evolução mensal
            </span>
            {isMobile && <span className="text-[10px] text-slate-400">Toque para expandir</span>}
          </div>
          <div className={`${isMobile ? 'overflow-hidden' : ''}`}>
            <div className={`${isMobile ? 'grid grid-cols-12 gap-1 h-16' : 'flex items-end gap-3 h-40'}`}>
              {annualTrend.map(item => {
                const incomeHeight = (item.totalReceitas / maxTrend) * 100;
                const expenseHeight = (item.totalDespesas / maxTrend) * 100;
                const hasData = item.totalReceitas > 0 || item.totalDespesas > 0;
                return (
                  <div key={item.mes} className={`flex flex-col items-center ${isMobile ? 'min-w-0 gap-1' : 'gap-2 text-[10px] text-slate-400'}`}>
                    <div className={`flex items-end gap-1 ${isMobile ? 'h-12 w-full' : 'h-28'}`}>
                      {hasData ? (
                        <>
                          <div className="flex-1 h-full rounded-full bg-white/5 flex items-end">
                            <div
                              className="w-full rounded-full bg-emerald-400/80"
                              style={{ height: `${incomeHeight}%`, minHeight: item.totalReceitas > 0 ? (isMobile ? 4 : 6) : 0 }}
                            />
                          </div>
                          <div className="flex-1 h-full rounded-full bg-white/5 flex items-end">
                            <div
                              className="w-full rounded-full bg-rose-400/80"
                              style={{ height: `${expenseHeight}%`, minHeight: item.totalDespesas > 0 ? (isMobile ? 4 : 6) : 0 }}
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
                    <div className={`${isMobile ? 'text-[9px] text-slate-400' : ''}`}>{monthLabel(item.mes)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {!isMobile && (
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400/80" /> Receita
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400/80" /> Despesa
              </span>
            </div>
          )}
        </button>
      </div>

      {trendModal && (typeof document !== 'undefined' ? createPortal(trendModal, document.body) : trendModal)}
    </div>
  );
};

export default ExecutiveSummary;
