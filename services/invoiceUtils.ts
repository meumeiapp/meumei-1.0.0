import { CreditCard, Expense } from '../types';

type LegacyExpense = Expense & { creditCardId?: string };

const buildMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeForCompare = (value: string | undefined | null) =>
    (value || '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

export const isCreditPaymentMethod = (value: string | undefined | null) =>
    normalizeForCompare(value) === 'credito';

export const resolveExpenseCardId = (expense: LegacyExpense) =>
    expense.cardId || expense.creditCardId || undefined;

export const filterCardExpensesForInvoices = (
    expenses: Expense[],
    cardId: string | undefined,
    options?: { includePaid?: boolean }
) => {
    if (!cardId) return [];
    const includePaid = Boolean(options?.includePaid);
    return expenses
        .filter((exp) => {
            const legacyExpense = exp as LegacyExpense;
            const expenseCardId = resolveExpenseCardId(legacyExpense);
            return (
                expenseCardId === cardId &&
                isCreditPaymentMethod(legacyExpense.paymentMethod) &&
                (includePaid
                    ? legacyExpense.status === 'pending' || legacyExpense.status === 'paid'
                    : legacyExpense.status === 'pending')
            );
        })
        .sort((a, b) =>
            new Date(a.dueDate || a.date).getTime() - new Date(b.dueDate || b.date).getTime()
        );
};

export const groupCardExpensesByInvoiceMonth = (cardExpenses: Expense[]) => {
    return cardExpenses.reduce<Record<string, Expense[]>>((groups, exp) => {
        const date = new Date(exp.dueDate + 'T12:00:00');
        const key = buildMonthKey(date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(exp);
        return groups;
    }, {});
};

export const getCreditCardInvoiceTotalForMonth = (
    expenses: Expense[],
    cardId: string,
    referenceMonth: Date,
    cardConfig: CreditCard
) => {
    const cardExpenses = filterCardExpensesForInvoices(expenses, cardId);
    const grouped = groupCardExpensesByInvoiceMonth(cardExpenses);
    const key = buildMonthKey(referenceMonth);
    const list = grouped[key] || [];
    return list.reduce((sum, exp) => sum + exp.amount, 0);
};
