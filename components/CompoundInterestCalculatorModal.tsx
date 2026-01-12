import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, X, Calculator, DollarSign, Percent, RefreshCw } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import MobileModalShell from './mobile/MobileModalShell';

export type RatePeriod = 'month' | 'year';
export type DurationUnit = 'months' | 'years';

export interface CompoundCalculatorDefaults {
  initialInvestment: number;
  monthlyContribution: number;
  rate: number; // percentage
  ratePeriod: RatePeriod;
  duration: number;
  durationUnit: DurationUnit;
}

export interface CompoundCalculatorResult {
  finalAmount: number;
  totalInvested: number;
  totalInterest: number;
  periodMonths: number;
  series: Array<{ month: number; invested: number; total: number }>;
}

interface CompoundInterestCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaults: CompoundCalculatorDefaults;
  onResult?: (result: CompoundCalculatorResult) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const parseCurrency = (value: string): number => {
  if (!value) return 0;
  const normalized = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatTimeline = (months: number) => {
  if (months < 12) {
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  }
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remainingMonths} ${remainingMonths === 1 ? 'mês' : 'meses'}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatCurrencyInput = (raw: string) => {
  if (!raw.trim()) return '';
  const parsed = parseCurrency(raw);
  return parsed === 0 ? '' : formatCurrency(parsed).replace('R$', 'R$ ').trim();
};

const parseRateInput = (value: string): number => {
  if (!value) return 0;
  const normalized = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatRateInput = (raw: string) => {
  if (!raw.trim()) return '';
  const parsed = parseRateInput(raw);
  return parsed === 0 ? '' : parsed.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 4 });
};

const handleCurrencyBlur = (value: string, setter: (next: string) => void) => {
  setter(formatCurrencyInput(value));
};

const handleRateBlur = (value: string, setter: (next: string) => void) => {
  setter(formatRateInput(value));
};

const handleFocusSelect = (value: string) => (event: React.FocusEvent<HTMLInputElement>) => {
  if (value.trim()) {
    event.target.select();
  }
};

const CompoundInterestCalculatorModal: React.FC<CompoundInterestCalculatorModalProps> = ({
  isOpen,
  onClose,
  defaults,
  onResult
}) => {
  const isMobile = useIsMobile();
  const offsetLoggedRef = useRef(false);
  const [initialInput, setInitialInput] = useState('');
  const [monthlyInput, setMonthlyInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>(defaults.ratePeriod);
  const [durationInput, setDurationInput] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(defaults.durationUnit);
  const [result, setResult] = useState<CompoundCalculatorResult | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; month: number; invested: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const fieldId = (suffix: string) => `simulator-${suffix}`;

  useEffect(() => {
    if (!isOpen) return;
    setInitialInput('');
    setMonthlyInput('');
    setRateInput('');
    setDurationInput('');
    setRatePeriod(defaults.ratePeriod);
    setDurationUnit(defaults.durationUnit);
    setResult(null);
    setError('');
  }, [isOpen, defaults.ratePeriod, defaults.durationUnit]);

  useEffect(() => {
    if (!isOpen || !isMobile || offsetLoggedRef.current) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const mobileTop = getComputedStyle(document.documentElement)
      .getPropertyValue('--mm-mobile-top')
      .trim();
    console.info('[layout][mobile-offset] simulator_open', { mobileTop });
    console.info('[layout][mobile] simulator_header_back_enabled', { top: mobileTop });
    offsetLoggedRef.current = true;
  }, [isOpen, isMobile]);

  if (!isOpen) return null;

  const handleCalculate = () => {
    const initial = parseCurrency(initialInput);
    const monthly = parseCurrency(monthlyInput);
    const rate = parseRateInput(rateInput);
    const duration = Number(durationInput);

    if (isNaN(initial) || isNaN(monthly) || isNaN(rate) || isNaN(duration)) {
      setError('Preencha todos os campos numéricos corretamente.');
      return;
    }

    if (duration <= 0 || !durationInput.trim()) {
      setError('Informe o período do investimento.');
      return;
    }

    if (initial <= 0 && monthly <= 0) {
      setError('Preencha pelo menos o valor inicial ou o valor mensal para simular.');
      return;
    }

    if (rate <= 0) {
      setError('Informe uma taxa de juros válida.');
      return;
    }

    const monthlyRate = ratePeriod === 'year'
      ? Math.pow(1 + rate / 100, 1 / 12) - 1
      : rate / 100;
    const months = durationUnit === 'years' ? duration * 12 : duration;

    // Build monthly series applying compound interest so we can chart invested vs total
    const series: Array<{ month: number; invested: number; total: number }> = [];
    let balance = initial;
    let invested = initial;
    series.push({ month: 0, invested, total: balance });

    for (let i = 1; i <= months; i += 1) {
      balance = balance * (1 + monthlyRate) + monthly;
      invested += monthly;
      series.push({ month: i, invested, total: balance });
    }

    const totalInvested = series[series.length - 1].invested;
    const finalAmount = balance;
    const totalInterest = finalAmount - totalInvested;
    const calcResult: CompoundCalculatorResult = {
      finalAmount,
      totalInvested,
      totalInterest,
      periodMonths: months,
      series
    };

    setResult(calcResult);
    setError('');
    onResult?.(calcResult);
  };

  const handleReset = () => {
    setInitialInput('');
    setMonthlyInput('');
    setRateInput('');
    setDurationInput('');
    setRatePeriod(defaults.ratePeriod);
    setDurationUnit(defaults.durationUnit);
    setResult(null);
    setError('');
  };

  // Custom SVG line chart comparing invested capital vs compounded total
  const renderChart = () => {
    if (!result || result.series.length < 2) return null;

    const width = 720;
    const height = 240;
    const padding = 48;
    const values = result.series.flatMap((point) => [point.invested, point.total]);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    const maxMonth = result.series[result.series.length - 1].month;

    const getX = (month: number) => {
      if (maxMonth === 0) return padding;
      return padding + ((width - padding * 2) * (month / maxMonth));
    };

    const getY = (value: number) => {
      if (valueRange === 0) return height / 2;
      return height - padding - ((value - minValue) / valueRange) * (height - padding * 2);
    };

    const generatePointAttr = (key: 'invested' | 'total') =>
      result.series.map((point) => `${getX(point.month)},${getY(point[key])}`).join(' ');

    const monthTicks: number[] = [];
    const steps = Math.min(5, maxMonth + 1);
    for (let i = 0; i <= steps; i += 1) {
      monthTicks.push(Math.round((maxMonth / steps) * i));
    }

    const valueTicks: number[] = [];
    for (let i = 0; i <= 4; i += 1) {
      valueTicks.push(minValue + (valueRange * i) / 4);
    }

    return (
      <div className="mt-6 relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding + (height - padding * 2) * ratio;
            return <line key={ratio} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#27272a" strokeWidth="1" strokeDasharray="4" />;
          })}
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#3f3f46" strokeWidth="1.5" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#3f3f46" strokeWidth="1.5" />
          <polyline points={generatePointAttr('invested')} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={generatePointAttr('total')} fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {result.series.map((point) => (
            <g key={point.month}>
              <circle
                cx={getX(point.month)}
                cy={getY(point.total)}
                r={3.5}
                fill="#a855f7"
                onMouseEnter={() => setTooltip({ x: getX(point.month), y: getY(point.total), ...point })}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          ))}
          {monthTicks.map((tick) => (
            <text key={tick} x={getX(tick)} y={height - padding + 16} textAnchor="middle" className="text-[10px] fill-zinc-500">
              {tick}m
            </text>
          ))}
          {valueTicks.map((tick, index) => (
            <text key={index} x={padding - 8} y={getY(tick)} textAnchor="end" className="text-[10px] fill-zinc-500">
              {formatCurrency(tick)}
            </text>
          ))}
        </svg>
        {tooltip && (
          <div
            className="absolute bg-zinc-900/90 border border-zinc-700 text-xs text-white px-3 py-2 rounded-xl shadow-2xl"
            style={{ left: tooltip.x - 60, top: tooltip.y - 70 }}
          >
            <p className="font-semibold">Mês {tooltip.month}</p>
            <p className="text-zinc-300">Investido: {formatCurrency(tooltip.invested)}</p>
            <p className="text-zinc-300">Montante: {formatCurrency(tooltip.total)}</p>
          </div>
        )}
        <div className="flex gap-4 justify-center text-[11px] text-zinc-500 mt-3">
          <span className="flex items-center gap-1"><span className="w-3 h-1 rounded-full bg-[#38bdf8]"></span>Valor Investido</span>
          <span className="flex items-center gap-1"><span className="w-3 h-1 rounded-full bg-[#a855f7]"></span>Montante Total</span>
        </div>
      </div>
    );
  };

  const contentWrapperClassName = isMobile
    ? 'space-y-6'
    : 'p-6 space-y-6 max-h-[80vh] overflow-y-auto';

  const modalBody = (
    <div className={contentWrapperClassName}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={fieldId('initial')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Valor Inicial
          </label>
          <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <input
              id={fieldId('initial')}
              name="initialInvestment"
              type="text"
              inputMode="decimal"
              value={initialInput}
              onChange={(e) => setInitialInput(e.target.value)}
              onFocus={handleFocusSelect(initialInput)}
              onBlur={() => handleCurrencyBlur(initialInput, setInitialInput)}
              className="flex-1 bg-transparent outline-none text-zinc-900 dark:text-white font-semibold"
              placeholder="R$ 0,00"
            />
          </div>
        </div>

        <div>
          <label htmlFor={fieldId('monthly')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Valor Mensal (aporte)
          </label>
          <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <input
              id={fieldId('monthly')}
              name="monthlyContribution"
              type="text"
              inputMode="decimal"
              value={monthlyInput}
              onChange={(e) => setMonthlyInput(e.target.value)}
              onFocus={handleFocusSelect(monthlyInput)}
              onBlur={() => handleCurrencyBlur(monthlyInput, setMonthlyInput)}
              className="flex-1 bg-transparent outline-none text-zinc-900 dark:text-white font-semibold"
              placeholder="R$ 0,00"
            />
          </div>
        </div>

        <div>
          <label htmlFor={fieldId('rate')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Taxa de Juros
          </label>
          <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <Percent className="text-amber-500" size={18} />
            <input
              id={fieldId('rate')}
              name="rate"
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onFocus={handleFocusSelect(rateInput)}
              onBlur={() => handleRateBlur(rateInput, setRateInput)}
              className="flex-1 bg-transparent outline-none text-zinc-900 dark:text-white font-semibold"
              placeholder="0,0"
            />
            <select
              id={fieldId('rate-period')}
              name="ratePeriod"
              value={ratePeriod}
              onChange={(e) => setRatePeriod(e.target.value as RatePeriod)}
              className="bg-transparent text-xs uppercase tracking-wide text-zinc-500"
              aria-label="Período da taxa"
            >
              <option value="year">a.a.</option>
              <option value="month">a.m.</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={fieldId('duration')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
            Período
          </label>
          <div className="mt-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <RefreshCw className="text-blue-500" size={18} />
            <input
              id={fieldId('duration')}
              name="duration"
              type="number"
              min={1}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={handleFocusSelect(durationInput)}
              className="flex-1 bg-transparent outline-none text-zinc-900 dark:text-white font-semibold"
              placeholder="1"
            />
            <select
              id={fieldId('duration-unit')}
              name="durationUnit"
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              className="bg-transparent text-xs uppercase tracking-wide text-zinc-500"
              aria-label="Unidade do período"
            >
              <option value="years">anos</option>
              <option value="months">meses</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-5 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          Limpar
        </button>
        <button
          onClick={handleCalculate}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2"
        >
          Calcular
        </button>
      </div>

      {result && (
        <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 space-y-6">
          <div>
            <p className="text-xs uppercase text-zinc-500 font-semibold">Montante projetado</p>
            <h4 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{formatCurrency(result.finalAmount)}</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Horizonte de {formatTimeline(result.periodMonths)}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase text-zinc-500 font-semibold">Total investido</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">{formatCurrency(result.totalInvested)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500 font-semibold">Total em juros</p>
              <p className="text-lg font-bold text-emerald-500 mt-1">{formatCurrency(result.totalInterest)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500 font-semibold">Rentabilidade (%)</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                {result.totalInvested > 0 ? ((result.totalInterest / result.totalInvested) * 100).toFixed(1) : '0,0'}%
              </p>
            </div>
          </div>

          {renderChart()}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    const mobileHeader = (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="justify-self-start inline-flex items-center gap-2 px-2 min-h-[44px] text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar
        </button>
        <h1 className="text-sm font-bold text-zinc-900 dark:text-white text-center">Simular crescimento</h1>
        <span className="justify-self-end w-10" aria-hidden="true" />
      </div>
    );

    return (
      <MobileModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Simule o crescimento do seu patrimônio"
        subtitle="Calculadora de Juros Compostos"
        modalName="compound_calculator"
        hideHeader
      >
        <div className="space-y-3">
          {mobileHeader}
          {modalBody}
        </div>
      </MobileModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-[#111114] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-violet-500 flex items-center gap-2">
              <Calculator size={16} /> Calculadora de Juros Compostos
            </p>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Simule o crescimento do seu patrimônio</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Preencha os campos abaixo para projetar cenários de longo prazo.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar simulador"
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
          >
            <X size={18} />
          </button>
        </div>

        {modalBody}
      </div>
    </div>
  );
};

export default CompoundInterestCalculatorModal;
