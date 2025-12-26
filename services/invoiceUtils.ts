import { CreditCard, Expense } from '../types';

const buildMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const filterCardExpensesForInvoices = (expenses: Expense[], cardId: string | undefined) => {
    if (!cardId) return [];
    return expenses
        .filter(exp => 
            exp.cardId === cardId &&
            exp.paymentMethod === 'Crédito' &&
            exp.status === 'pending'
        )
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
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
