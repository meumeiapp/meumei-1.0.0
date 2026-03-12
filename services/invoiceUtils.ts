import { CreditCard, Expense } from '../types';

type LegacyExpense = Expense & { creditCardId?: string };
const DAY_MS = 24 * 60 * 60 * 1000;

const buildMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const toNoonDate = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);

const getMonthSafeDate = (year: number, month: number, day: number) => {
    const base = new Date(year, month, 1, 12, 0, 0, 0);
    const safeDay = Math.min(
        Math.max(Math.trunc(day) || 1, 1),
        new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    );
    return new Date(base.getFullYear(), base.getMonth(), safeDay, 12, 0, 0, 0);
};

export type CardPurchaseWindowStatus = 'good' | 'attention' | 'avoid';

export interface CardPurchaseGuidance {
    nextClosingDate: Date;
    bestPurchaseDate: Date;
    invoiceDueDateIfBuyToday: Date;
    daysUntilClosing: number;
    status: CardPurchaseWindowStatus;
    statusLabel: string;
    statusColor: string;
    statusHint: string;
}

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

export const resolveCardDueDateForView = (
    card: CreditCard,
    expenses: Expense[],
    viewDate: Date
) => {
    const monthExpenses = expenses.filter((exp) => {
        const legacyExpense = exp as LegacyExpense;
        const expenseCardId = resolveExpenseCardId(legacyExpense);
        if (!expenseCardId || expenseCardId !== card.id) return false;
        if (!exp.dueDate) return false;
        const dueDate = new Date(exp.dueDate + 'T12:00:00');
        return (
            dueDate.getMonth() === viewDate.getMonth() &&
            dueDate.getFullYear() === viewDate.getFullYear()
        );
    });
    const dueDateFromExpenses = monthExpenses.length
        ? monthExpenses.reduce((latest, exp) => {
              const next = new Date(exp.dueDate + 'T12:00:00');
              return next > latest ? next : latest;
          }, new Date(monthExpenses[0].dueDate + 'T12:00:00'))
        : null;
    if (dueDateFromExpenses) return dueDateFromExpenses;

    const baseMonth = card.dueDay < card.closingDay ? viewDate.getMonth() + 1 : viewDate.getMonth();
    return getMonthSafeDate(viewDate.getFullYear(), baseMonth, card.dueDay);
};

export const resolveInvoiceDueDateForPurchase = (
    card: CreditCard,
    purchaseDate: Date
) => {
    const purchaseDateNoon = toNoonDate(purchaseDate);
    const purchaseDay = purchaseDateNoon.getDate();
    let targetMonthOffset = 0;

    // Bought on/after closing day enters the next statement cycle.
    if (purchaseDay >= card.closingDay) {
        targetMonthOffset += 1;
    }

    // When due day is before closing day, due date lands on the following month.
    if (card.dueDay < card.closingDay) {
        targetMonthOffset += 1;
    }

    return getMonthSafeDate(
        purchaseDateNoon.getFullYear(),
        purchaseDateNoon.getMonth() + targetMonthOffset,
        card.dueDay
    );
};

export const getCardPurchaseGuidance = (
    card: CreditCard,
    referenceDate = new Date()
): CardPurchaseGuidance => {
    const today = toNoonDate(referenceDate);
    const thisMonthClosing = getMonthSafeDate(today.getFullYear(), today.getMonth(), card.closingDay);
    const nextClosingDate =
        today <= thisMonthClosing
            ? thisMonthClosing
            : getMonthSafeDate(today.getFullYear(), today.getMonth() + 1, card.closingDay);
    const bestPurchaseDate = new Date(nextClosingDate);
    bestPurchaseDate.setDate(bestPurchaseDate.getDate() + 1);
    bestPurchaseDate.setHours(12, 0, 0, 0);

    const invoiceDueDateIfBuyToday = resolveInvoiceDueDateForPurchase(card, today);
    const daysUntilClosing = Math.ceil((nextClosingDate.getTime() - today.getTime()) / DAY_MS);

    let status: CardPurchaseWindowStatus = 'good';
    let statusLabel = 'Boa janela';
    let statusColor = '#22c55e';
    let statusHint = 'Hoje tende a cair na próxima fatura.';

    if (daysUntilClosing <= 2) {
        status = 'avoid';
        statusLabel = 'Fechando agora';
        statusColor = '#ef4444';
        statusHint = 'Evite: compra próxima do fechamento.';
    } else if (daysUntilClosing <= 6) {
        status = 'attention';
        statusLabel = 'Fechamento próximo';
        statusColor = '#facc15';
        statusHint = 'Atenção: restam poucos dias para fechar.';
    }

    return {
        nextClosingDate,
        bestPurchaseDate,
        invoiceDueDateIfBuyToday,
        daysUntilClosing,
        status,
        statusLabel,
        statusColor,
        statusHint
    };
};

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
