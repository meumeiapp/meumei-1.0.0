import { CreditCard, Expense, Income } from '../types';
import { getCreditCardInvoiceTotalForMonth } from './invoiceUtils';
import { getCardColor } from './cardColorUtils';

export type TaxFilter = 'all' | 'PJ' | 'PF';
export type ViewMode = 'caixa' | 'competencia';

export interface ReportFilters {
    taxFilter: TaxFilter;
    viewMode: ViewMode;
}

export interface ReportContext {
    incomes: Income[];
    expenses: Expense[];
    creditCards: CreditCard[];
}

const normalizeDate = (input: string | Date) => {
    if (input instanceof Date) return input;
    return new Date(input + 'T12:00:00');
};

const isWithinRange = (value: Date, start: Date, end: Date) => {
    return value.getTime() >= start.getTime() && value.getTime() <= end.getTime();
};

const getIncomeDate = (income: Income, viewMode: ViewMode) => {
    if (viewMode === 'competencia') {
        return normalizeDate(income.competenceDate || income.date);
    }
    return normalizeDate(income.date);
};

const getExpenseDate = (expense: Expense, viewMode: ViewMode) => {
    if (viewMode === 'competencia') {
        return normalizeDate(expense.date);
    }
    return normalizeDate(expense.dueDate || expense.date);
};

const filterIncomes = (context: ReportContext, filters: ReportFilters, start: Date, end: Date) => {
    return context.incomes.filter(inc => {
        if (filters.taxFilter !== 'all') {
            if ((inc.taxStatus || 'PJ') !== filters.taxFilter) return false;
        }
        const d = getIncomeDate(inc, filters.viewMode);
        return isWithinRange(d, start, end);
    });
};

const filterExpenses = (context: ReportContext, filters: ReportFilters, start: Date, end: Date) => {
    return context.expenses.filter(exp => {
        if (filters.taxFilter !== 'all') {
            if ((exp.taxStatus || 'PJ') !== filters.taxFilter) return false;
        }
        const d = getExpenseDate(exp, filters.viewMode);
        return isWithinRange(d, start, end);
    });
};

export const getReportSummary = (
    licenseId: string,
    startDate: Date,
    endDate: Date,
    context: ReportContext,
    filters: ReportFilters
) => {
    const incomes = filterIncomes(context, filters, startDate, endDate);
    const expenses = filterExpenses(context, filters, startDate, endDate);

    const totalReceitas = incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalDespesas = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const resultado = totalReceitas - totalDespesas;
    const margem = totalReceitas > 0 ? (resultado / totalReceitas) * 100 : 0;
    const ticketMedioReceita = incomes.length ? totalReceitas / incomes.length : 0;
    const ticketMedioDespesa = expenses.length ? totalDespesas / expenses.length : 0;

    return {
        totalReceitas,
        totalDespesas,
        resultado,
        margem,
        quantidadeReceitas: incomes.length,
        quantidadeDespesas: expenses.length,
        ticketMedioReceita,
        ticketMedioDespesa,
        filteredIncomes: incomes,
        filteredExpenses: expenses
    };
};

export const getCategoryBreakdown = (
    licenseId: string,
    startDate: Date,
    endDate: Date,
    context: ReportContext,
    filters: ReportFilters
) => {
    const summary = getReportSummary(licenseId, startDate, endDate, context, filters);
    const { filteredIncomes, filteredExpenses, totalReceitas, totalDespesas } = summary;

    const incomeMap = filteredIncomes.reduce<Record<string, number>>((acc, inc) => {
        const key = inc.category || 'Outros';
        acc[key] = (acc[key] || 0) + inc.amount;
        return acc;
    }, {});

    const expenseMap = filteredExpenses.reduce<Record<string, number>>((acc, exp) => {
        const key = exp.category || 'Outros';
        acc[key] = (acc[key] || 0) + exp.amount;
        return acc;
    }, {});

    const entries = [
        ...Object.entries(incomeMap).map(([categoria, total]) => ({
            categoria,
            tipo: 'income' as const,
            total,
            percentual: totalReceitas > 0 ? (total / totalReceitas) * 100 : 0
        })),
        ...Object.entries(expenseMap).map(([categoria, total]) => ({
            categoria,
            tipo: 'expense' as const,
            total,
            percentual: totalDespesas > 0 ? (total / totalDespesas) * 100 : 0
        }))
    ];

    return entries.sort((a, b) => b.total - a.total);
};

export const getCreditCardsReport = (
    licenseId: string,
    referenceMonth: Date,
    context: ReportContext,
    filters: ReportFilters
) => {
    const start = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), 1);
    const end = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + 1, 0);
    const summary = getReportSummary(licenseId, start, end, context, filters);
    const totalDespesas = summary.totalDespesas || 1;

    return context.creditCards.map(card => {
        const totalFatura = getCreditCardInvoiceTotalForMonth(
            context.expenses,
            card.id,
            referenceMonth,
            card
        );

        const percentDespesa = (totalFatura / totalDespesas) * 100;
        const limiteUso = card.limit ? totalFatura / card.limit : null;

        const dueDate = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), card.dueDay);
        if (card.dueDay < card.closingDay) {
            dueDate.setMonth(dueDate.getMonth() + 1);
        }

        return {
            id: card.id,
            nome: card.name,
            cor: card.cardColor || getCardColor(card),
            totalFatura,
            percentualDespesas: percentDespesa,
            vencimento: dueDate,
            limiteUso,
            limite: card.limit
        };
    }).sort((a, b) => b.totalFatura - a.totalFatura);
};

export const getAnnualTrend = (
    licenseId: string,
    year: number,
    context: ReportContext,
    filters: ReportFilters
) => {
    const months = Array.from({ length: 12 }).map((_, index) => {
        const start = new Date(year, index, 1);
        const end = new Date(year, index + 1, 0);
        const summary = getReportSummary(licenseId, start, end, context, filters);
        return {
            mes: index,
            totalReceitas: summary.totalReceitas,
            totalDespesas: summary.totalDespesas,
            resultado: summary.resultado
        };
    });

    return months;
};

const DEFAULT_MEI_LIMIT = 81000;

export const getMeiAnnualReport = (
    licenseId: string,
    year: number,
    context: ReportContext,
    filters: ReportFilters,
    meiLimit: number = DEFAULT_MEI_LIMIT
) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const incomes = filterIncomes(context, { ...filters, taxFilter: 'PJ' }, start, end);
    const totalAnual = incomes.reduce((acc, inc) => acc + inc.amount, 0);
    const mediaMensal = totalAnual / 12;
    const projecaoAnual = mediaMensal * 12;
    const percentualDoLimite = meiLimit > 0 ? (totalAnual / meiLimit) * 100 : 0;

    return {
        totalAnual,
        limiteAnual: meiLimit,
        percentualDoLimite,
        mediaMensal,
        projecaoAnual
    };
};

export const getTransactionsForPeriod = (
    licenseId: string,
    startDate: Date,
    endDate: Date,
    context: ReportContext,
    filters: ReportFilters
) => {
    return {
        incomes: filterIncomes(context, filters, startDate, endDate),
        expenses: filterExpenses(context, filters, startDate, endDate)
    };
};
