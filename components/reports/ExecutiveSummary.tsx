import React, { useMemo } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Wallet,
  TrendingUp
} from 'lucide-react';
import { formatCurrency } from './reportUtils';

interface ExecutiveSummaryProps {
  summary: {
    totalReceitas: number;
    totalDespesas: number;
  };
  expensesByType: {
    fixed: number;
    variable: number;
    personal: number;
  };
  rendimentosTotal: number;
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
  summary,
  expensesByType,
  rendimentosTotal,
  annualTrend,
  periodLabel,
  isMobile
}) => {
  const totalComprometido = summary.totalDespesas;
  const totalDisponivel = summary.totalReceitas - summary.totalDespesas;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Resumo Executivo</h2>
          <p className="text-sm text-slate-300">{periodLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold uppercase">
            <ArrowUpCircle size={18} /> Receita total
          </div>
          <div className="text-3xl font-semibold text-white mt-3">
            {formatCurrency(summary.totalReceitas)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center gap-2 text-rose-400 text-sm font-semibold uppercase">
            <ArrowDownCircle size={18} /> Total comprometido
          </div>
          <div className="text-3xl font-semibold text-white mt-3">
            {formatCurrency(totalComprometido)}
          </div>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6">
          <div className="flex items-center gap-2 text-cyan-300 text-sm font-semibold uppercase">
            <Wallet size={18} /> Total disponível
          </div>
          <div className="text-3xl font-semibold text-white mt-3">
            {formatCurrency(totalDisponivel)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Despesas fixas</div>
          <div className="text-2xl font-semibold text-white mt-2">
            {formatCurrency(expensesByType.fixed)}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Despesas variáveis</div>
          <div className="text-2xl font-semibold text-white mt-2">
            {formatCurrency(expensesByType.variable)}
          </div>
        </div>
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Rendimentos</div>
          <div className="text-2xl font-semibold text-white mt-2">
            {formatCurrency(rendimentosTotal)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <PiggyBank size={18} /> Distribuição de despesas
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
            {expenseDistribution.map(item => (
              <div
                key={item.label}
                className={item.color}
                style={{ width: `${item.percent}%` }}
              />
            ))}
          </div>
          <div className="space-y-2">
            {expenseDistribution.map(item => (
              <div key={item.label} className="flex items-center justify-between text-sm text-slate-300">
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

        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <TrendingUp size={18} /> Evolução mensal
          </div>
          <div className="flex items-end gap-3 h-40">
            {annualTrend.map(item => {
              const incomeHeight = (item.totalReceitas / maxTrend) * 100;
              const expenseHeight = (item.totalDespesas / maxTrend) * 100;
              return (
                <div key={item.mes} className="flex flex-col items-center gap-2 text-[10px] text-slate-400">
                  <div className="flex items-end gap-1 h-28">
                    <div
                      className="w-3 rounded-t-full bg-emerald-400/80"
                      style={{ height: `${incomeHeight}%` }}
                    />
                    <div
                      className="w-3 rounded-t-full bg-rose-400/80"
                      style={{ height: `${expenseHeight}%` }}
                    />
                  </div>
                  <div>{monthLabel(item.mes)}</div>
                </div>
              );
            })}
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
        </div>
      </div>
    </div>
  );
};

export default ExecutiveSummary;
