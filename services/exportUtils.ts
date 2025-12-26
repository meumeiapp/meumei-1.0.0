import { Expense, Income } from '../types';
import { ReportContext, ReportFilters, getTransactionsForPeriod } from './reportService';

interface ExportCsvParams {
    licenseId: string;
    startDate: Date;
    endDate: Date;
    context: ReportContext;
    filters: ReportFilters;
    fileName?: string;
}

const buildCsvRow = (values: Array<string | number>) => {
    return values
        .map(value => {
            if (typeof value === 'number') {
                return value.toString().replace('.', ',');
            }
            const text = value ?? '';
            if (text.includes(',') || text.includes('"')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        })
        .join(',');
};

export const exportReportToCsv = ({
    licenseId,
    startDate,
    endDate,
    context,
    filters,
    fileName = 'meumei-relatorio.csv'
}: ExportCsvParams) => {
    const { incomes, expenses } = getTransactionsForPeriod(licenseId, startDate, endDate, context, filters);
    const header = ['Tipo', 'Data', 'Descrição', 'Categoria', 'Valor', 'Origem'];

    const formatDate = (value: string) => {
        const date = new Date(value + 'T12:00:00');
        return date.toLocaleDateString('pt-BR');
    };

    const rows: string[] = [];
    rows.push(buildCsvRow(header));

    incomes.forEach((income: Income) => {
        rows.push(
            buildCsvRow([
                'Receita',
                formatDate(income.date),
                income.description,
                income.category || 'Sem categoria',
                income.amount.toFixed(2),
                income.accountId || ''
            ])
        );
    });

    expenses.forEach((expense: Expense) => {
        rows.push(
            buildCsvRow([
                'Despesa',
                formatDate(expense.dueDate || expense.date),
                expense.description,
                expense.category || 'Sem categoria',
                expense.amount.toFixed(2),
                expense.cardId || expense.accountId || ''
            ])
        );
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};
