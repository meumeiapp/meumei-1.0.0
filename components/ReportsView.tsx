import React, { useMemo, useState } from 'react';
import {
    ArrowLeft,
    Filter,
    Printer,
    Download,
    BarChart3,
    Calendar,
    Briefcase,
    User,
    ArrowUpCircle,
    ArrowDownCircle,
    Scale,
    ChevronLeft,
    ChevronRight,
    ChevronDown
} from 'lucide-react';
import { Expense, Income, CreditCard } from '../types';
import {
    getAnnualTrend,
    getCategoryBreakdown,
    getCreditCardsReport,
    getMeiAnnualReport,
    getReportSummary,
    ReportContext,
    ReportFilters
} from '../services/reportService';
import { exportReportToCsv } from '../services/exportUtils';
import CardTag from './CardTag';

type TaxFilter = 'all' | 'PJ' | 'PF';
type ViewMode = 'caixa' | 'competencia';
type PeriodMode = 'month' | 'custom';

interface ReportsViewProps {
    onBack: () => void;
    incomes: Income[];
    expenses: Expense[];
    creditCards: CreditCard[];
    viewDate: Date;
    companyName: string;
    licenseId?: string;
}

const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

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
    const [taxFilter, setTaxFilter] = useState<TaxFilter>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('caixa');
    const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
    const [currentMonth, setCurrentMonth] = useState(viewDate);
    const [customRange, setCustomRange] = useState<{ start: string; end: string }>({
        start: '',
        end: ''
    });
    const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

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

    const context: ReportContext = useMemo(
        () => ({
            incomes,
            expenses,
            creditCards
        }),
        [incomes, expenses, creditCards]
    );

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

    const previousRange = useMemo(() => {
        const diff = selectedEnd.getTime() - selectedStart.getTime();
        const prevEnd = new Date(selectedStart.getTime() - 24 * 60 * 60 * 1000);
        const prevStart = new Date(prevEnd.getTime() - diff);
        return { prevStart, prevEnd };
    }, [selectedStart, selectedEnd]);

    const previousSummary = useMemo(
        () =>
            getReportSummary(
                licenseId || 'local',
                previousRange.prevStart,
                previousRange.prevEnd,
                context,
                filters
            ),
        [licenseId, previousRange, context, filters]
    );

    const categoryBreakdown = useMemo(
        () =>
            getCategoryBreakdown(
                licenseId || 'local',
                selectedStart,
                selectedEnd,
                context,
                filters
            ),
        [licenseId, selectedStart, selectedEnd, context, filters]
    );

    const cardsReport = useMemo(
        () =>
            getCreditCardsReport(
                licenseId || 'local',
                selectedStart,
                context,
                filters
            ),
        [licenseId, selectedStart, context, filters]
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

    const meiReport = useMemo(
        () =>
            getMeiAnnualReport(
                licenseId || 'local',
                selectedStart.getFullYear(),
                context,
                filters
            ),
        [licenseId, selectedStart, context, filters]
    );

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

    const handleExportAction = (action: 'print' | 'csv') => {
        setIsExportOpen(false);
        if (action === 'print') {
            window.print();
            return;
        }
        exportReportToCsv({
            licenseId: licenseId || 'local',
            startDate: selectedStart,
            endDate: selectedEnd,
            context,
            filters,
            fileName: `meumei-relatorio-${selectedStart.toISOString().slice(0, 10)}.csv`
        });
    };

    const totalReceitas = summary.totalReceitas;
    const totalDespesas = summary.totalDespesas;
    const resultado = summary.resultado;
    const margem = summary.margem;

    const previousResultado = previousSummary.resultado;
    const resultDiff = resultado - previousResultado;
    const resultDiffPercent =
        previousResultado !== 0 ? (resultDiff / Math.abs(previousResultado)) * 100 : 0;

    const topExpenseCategory = categoryBreakdown.find(item => item.tipo === 'expense');

    const periodLabel =
        periodMode === 'custom'
            ? `${selectedStart.toLocaleDateString('pt-BR')} até ${selectedEnd.toLocaleDateString(
                  'pt-BR'
              )}`
            : buildMonthLabel(currentMonth);

    const narrative = [
        `Neste período (${periodLabel}), suas receitas somaram ${formatCurrency(
            totalReceitas
        )} e as despesas ${formatCurrency(totalDespesas)}, resultando em ${
            resultado >= 0 ? 'um lucro' : 'um prejuízo'
        } de ${formatCurrency(Math.abs(resultado))}.`,
        `Comparado ao período anterior, seu resultado ${
            resultDiff >= 0 ? 'melhorou' : 'piorou'
        } em ${formatCurrency(Math.abs(resultDiff))} (${resultDiffPercent.toFixed(1)}%).`,
        topExpenseCategory
            ? `A categoria que mais pesou nas despesas foi ${
                  topExpenseCategory.categoria
              }, representando ${topExpenseCategory.percentual.toFixed(1)}% do total.`
            : 'Não foram identificadas categorias de despesa relevantes neste período.'
    ];

    const printFilters = `Filtro: ${
        taxFilter === 'all' ? 'Consolidado' : taxFilter
    } • Visão: ${viewMode === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'}`;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300 print:bg-white print:text-black">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6 relative z-10 print:hidden">
                <button
                    onClick={onBack}
                    className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                    <ArrowLeft size={16} /> Voltar ao Dashboard
                </button>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
                            <BarChart3 className="text-indigo-600 dark:text-indigo-400" />
                            Relatórios & Análises
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400">
                            Painel analítico do período selecionado
                        </p>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => {
                                setIsExportOpen(prev => !prev);
                            }}
                            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-lg transition-all active:scale-95"
                        >
                            <Printer size={18} />
                            Exportar / Imprimir
                            <ChevronDown size={16} />
                        </button>
                        {isExportOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-2 z-20">
                                <button
                                    onClick={() => handleExportAction('print')}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                                >
                                    <Printer size={16} /> Imprimir relatório
                                </button>
                                <button
                                    onClick={() => handleExportAction('csv')}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                                >
                                    <Download size={16} /> Exportar CSV
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-8 space-y-4 print:hidden">
                <div className="bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
                            <Filter size={16} /> Filtros
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleMonthChange(-1)}
                                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div className="text-sm font-semibold flex items-center gap-2">
                                <Calendar size={16} /> {periodLabel}
                            </div>
                            <button
                                onClick={() => handleMonthChange(1)}
                                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                            <button
                                onClick={handleOpenCustomRange}
                                className="px-3 py-2 text-sm font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                Período personalizado
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                            {(['all', 'PJ', 'PF'] as TaxFilter[]).map(option => (
                                <button
                                    key={option}
                                    onClick={() => setTaxFilter(option)}
                                    className={`flex-1 px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                                        taxFilter === option
                                            ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400'
                                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    {option === 'all' ? (
                                        'Tudo'
                                    ) : option === 'PJ' ? (
                                        <>
                                            <Briefcase size={14} /> PJ (MEI)
                                        </>
                                    ) : (
                                        <>
                                            <User size={14} /> PF (Pessoal)
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                            {(['caixa', 'competencia'] as ViewMode[]).map(option => (
                                <button
                                    key={option}
                                    onClick={() => setViewMode(option)}
                                    className={`flex-1 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                        viewMode === option
                                            ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-600 dark:text-emerald-400'
                                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    {option === 'caixa' ? 'Visão Caixa' : 'Visão Competência'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8 print:p-0">
                <div className="hidden print:flex flex-col items-center mb-8 border-b pb-4 text-center">
                    <h1 className="text-2xl font-bold uppercase tracking-widest mb-1">{companyName}</h1>
                    <p className="text-sm text-gray-500">Relatório Analítico - {periodLabel}</p>
                    <div className="flex gap-4 mt-2 text-xs font-mono bg-gray-100 px-4 py-2 rounded">
                        {printFilters}
                    </div>
                </div>

                {/* Summary */}
                <section className="space-y-4">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                        Resumo do período
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2 mb-2 text-emerald-600 dark:text-emerald-400">
                                <ArrowUpCircle size={20} />
                                <span className="text-sm font-bold uppercase tracking-wide">
                                    Receitas
                                </span>
                            </div>
                            <div className="text-3xl font-bold">
                                {formatCurrency(totalReceitas)}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">
                                Ticket médio: {formatCurrency(summary.ticketMedioReceita)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2 mb-2 text-rose-600 dark:text-rose-400">
                                <ArrowDownCircle size={20} />
                                <span className="text-sm font-bold uppercase tracking-wide">
                                    Despesas
                                </span>
                            </div>
                            <div className="text-3xl font-bold">
                                {formatCurrency(totalDespesas)}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">
                                Ticket médio: {formatCurrency(summary.ticketMedioDespesa)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                                <Scale size={20} />
                                <span className="text-sm font-bold uppercase tracking-wide">
                                    Resultado
                                </span>
                            </div>
                            <div
                                className={`text-3xl font-bold ${
                                    resultado >= 0 ? 'text-indigo-600' : 'text-red-500'
                                }`}
                            >
                                {formatCurrency(resultado)}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">Margem: {margem.toFixed(1)}%</p>
                        </div>
                        <div className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <p className="text-xs font-bold text-zinc-500 uppercase">Narrativa</p>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                                {narrative[0]}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Category Breakdown */}
                <section className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                            Comparativo por categoria
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            {categoryBreakdown.slice(0, 8).map(item => (
                                <div key={`${item.categoria}-${item.tipo}`}>
                                    <div className="flex justify-between text-sm font-medium mb-1">
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={`w-2 h-2 rounded-full ${
                                                    item.tipo === 'income'
                                                        ? 'bg-emerald-500'
                                                        : 'bg-rose-500'
                                                }`}
                                            ></span>
                                            {item.categoria}
                                        </span>
                                        <span className="text-zinc-500">
                                            {item.percentual.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${
                                                item.tipo === 'income'
                                                    ? 'bg-emerald-500'
                                                    : 'bg-rose-500'
                                            }`}
                                            style={{ width: `${item.percentual}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                                    <tr>
                                        <th className="text-left py-2">Categoria</th>
                                        <th className="text-left py-2">Tipo</th>
                                        <th className="text-right py-2">Total</th>
                                        <th className="text-right py-2">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {categoryBreakdown.map(item => (
                                        <tr key={`${item.categoria}-${item.tipo}`}>
                                            <td className="py-2">{item.categoria}</td>
                                            <td className="py-2">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        item.tipo === 'income'
                                                            ? 'text-emerald-600 bg-emerald-500/10'
                                                            : 'text-rose-600 bg-rose-500/10'
                                                    }`}
                                                >
                                                    {item.tipo === 'income' ? 'Receita' : 'Despesa'}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right">
                                                {formatCurrency(item.total)}
                                            </td>
                                            <td className="py-2 text-right">
                                                {item.percentual.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* Credit Cards */}
                <section className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                            Relatório por cartões
                        </h3>
                    </div>
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="text-left py-2">Cartão</th>
                                    <th className="text-right py-2">Fatura</th>
                                    <th className="text-right py-2">% Despesas</th>
                                    <th className="text-right py-2">Vencimento</th>
                                    <th className="text-left py-2">Uso do limite</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {cardsReport.map(card => (
                                    <tr key={card.id}>
                                        <td className="py-3">
                                            <CardTag label={card.nome} color={card.cor} size="md" />
                                        </td>
                                        <td className="py-3 text-right">
                                            {formatCurrency(card.totalFatura)}
                                        </td>
                                        <td className="py-3 text-right">
                                            {card.percentualDespesas.toFixed(1)}%
                                        </td>
                                        <td className="py-3 text-right">
                                            {card.vencimento.toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3">
                                            {card.limite ? (
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-xs text-zinc-500">
                                                        <span>Limite</span>
                                                        <span>{formatCurrency(card.limite)}</span>
                                                    </div>
                                                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-500"
                                                            style={{
                                                                width: `${Math.min(
                                                                    (card.limiteUso || 0) * 100,
                                                                    100
                                                                )}%`
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-zinc-400">
                                                    Limite não informado
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Annual Trend */}
                <section className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6">
                        Tendência anual
                    </h3>
                    <div className="overflow-auto">
                        <table className="w-full text-sm mb-6">
                            <thead className="text-xs uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="text-left py-2">Mês</th>
                                    <th className="text-right py-2">Receitas</th>
                                    <th className="text-right py-2">Despesas</th>
                                    <th className="text-right py-2">Resultado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {annualTrend.map(item => (
                                    <tr key={item.mes}>
                                        <td className="py-2">
                                            {new Date(selectedStart.getFullYear(), item.mes)
                                                .toLocaleDateString('pt-BR', { month: 'short' })
                                                .toUpperCase()}
                                        </td>
                                        <td className="py-2 text-right">
                                            {formatCurrency(item.totalReceitas)}
                                        </td>
                                        <td className="py-2 text-right">
                                            {formatCurrency(item.totalDespesas)}
                                        </td>
                                        <td
                                            className={`py-2 text-right ${
                                                item.resultado >= 0 ? 'text-emerald-600' : 'text-rose-500'
                                            }`}
                                        >
                                            {formatCurrency(item.resultado)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* MEI */}
                <section className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">
                        Relatório MEI
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <p className="text-sm text-zinc-500">Total anual faturado</p>
                            <p className="text-3xl font-bold text-emerald-600">
                                {formatCurrency(meiReport.totalAnual)}
                            </p>
                            <p className="text-sm text-zinc-500">
                                Limite MEI: {formatCurrency(meiReport.limiteAnual)}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-zinc-500 mb-2">
                                Percentual do limite ({meiReport.percentualDoLimite.toFixed(1)}%)
                            </p>
                            <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500"
                                    style={{
                                        width: `${Math.min(meiReport.percentualDoLimite, 100)}%`
                                    }}
                                ></div>
                            </div>
                            <p className="text-sm text-zinc-500 mt-2">
                                Com a média mensal atual de {formatCurrency(meiReport.mediaMensal)}, a
                                projeção anual é de {formatCurrency(meiReport.projecaoAnual)} (
                                {((meiReport.projecaoAnual / meiReport.limiteAnual) * 100).toFixed(1)}%
                                do limite).
                            </p>
                        </div>
                    </div>
                </section>

                {/* Narrative */}
                <section className="bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 print:bg-transparent print:border-none">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">
                        Análise do período
                    </h3>
                    <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {narrative.map((paragraph, idx) => (
                            <p key={idx}>{paragraph}</p>
                        ))}
                    </div>
                </section>

                <div className="hidden print:block text-center text-xs text-gray-400 mt-8 pt-8 border-t">
                    <p>
                        Relatório gerado pelo sistema <strong>meumei</strong> em{' '}
                        {new Date().toLocaleString('pt-BR')}
                    </p>
                    <p>www.meumei.com.br</p>
                </div>
            </main>

            {isRangeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 w-full max-w-md border border-zinc-200 dark:border-zinc-800 space-y-4">
                        <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                            Selecionar período personalizado
                        </h4>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 uppercase">
                                    Data inicial
                                </label>
                                <input
                                    type="date"
                                    value={customRange.start}
                                    onChange={e =>
                                        setCustomRange(prev => ({ ...prev, start: e.target.value }))
                                    }
                                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-500 uppercase">
                                    Data final
                                </label>
                                <input
                                    type="date"
                                    value={customRange.end}
                                    onChange={e =>
                                        setCustomRange(prev => ({ ...prev, end: e.target.value }))
                                    }
                                    className="w-full bg-gray-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={handleResetCustomRange}
                                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCustomRange}
                                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
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
