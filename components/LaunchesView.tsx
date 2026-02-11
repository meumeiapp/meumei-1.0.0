import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowUpCircle, Repeat, ShoppingCart, User } from 'lucide-react';
import { Account, CreditCard, Expense, ExpenseType, ExpenseTypeOption, Income } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import { getReportSummary } from '../services/reportService';

type LaunchKind = 'all' | 'income' | 'expense';

interface LaunchItem {
  id: string;
  entityId: string;
  kind: 'income' | 'expense';
  title: string;
  amount: number;
  date: string;
  subtype?: ExpenseType;
  locked?: boolean;
}

interface LaunchesViewProps {
  onBack: () => void;
  incomes: Income[];
  expenses: Expense[];
  accounts: Account[];
  creditCards: CreditCard[];
  expenseTypeOptions?: ExpenseTypeOption[];
  viewDate: Date;
  onCreateIncome: () => void;
  onCreateExpense: () => void;
  onDeleteIncome: (id: string) => void;
  onDeleteExpense: (id: string) => void;
  onEditIncome: (id: string) => void;
  onEditExpense: (id: string, subtype?: ExpenseType) => void;
}

const formatCurrencyCompact = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const LaunchesView: React.FC<LaunchesViewProps> = ({
  onBack,
  incomes,
  expenses,
  accounts,
  creditCards,
  expenseTypeOptions,
  viewDate,
  onCreateIncome,
  onCreateExpense,
  onDeleteIncome,
  onDeleteExpense,
  onEditIncome,
  onEditExpense
}) => {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<LaunchKind>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerItem, setDrawerItem] = useState<LaunchItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LaunchItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const expenseTypeColorById = useMemo(() => {
    const map = new Map<ExpenseType, string>();
    (expenseTypeOptions || []).forEach(option => {
      if (option?.id && option?.color) {
        map.set(option.id, option.color);
      }
    });
    return map;
  }, [expenseTypeOptions]);
  const resolveExpenseColor = (type?: ExpenseType) => {
    if (!type) return '#ef4444';
    return expenseTypeColorById.get(type) || (type === 'fixed' ? '#f59e0b' : type === 'personal' ? '#22d3ee' : '#ef4444');
  };
  const renderExpenseIcon = (subtype?: ExpenseType) => {
    if (subtype === 'fixed') {
      return <Repeat size={14} style={{ color: resolveExpenseColor('fixed') }} />;
    }
    if (subtype === 'personal') {
      return <User size={14} style={{ color: resolveExpenseColor('personal') }} />;
    }
    return <ShoppingCart size={14} style={{ color: resolveExpenseColor('variable') }} />;
  };
  const getAmountClassName = (item: LaunchItem) =>
    item.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : '';
  const getAmountStyle = (item: LaunchItem) =>
    item.kind === 'income' ? undefined : { color: resolveExpenseColor(item.subtype) };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const launchItems = useMemo(() => {
    const targetMonth = viewDate.getMonth();
    const targetYear = viewDate.getFullYear();
    const inSameMonth = (value?: string) => {
      const parsed = parseDate(value);
      return Boolean(parsed && parsed.getMonth() === targetMonth && parsed.getFullYear() === targetYear);
    };

    const mapped: LaunchItem[] = [
      ...incomes
        .filter(income => inSameMonth(income.date))
        .map(income => ({
          id: `income-${income.id}`,
          entityId: income.id,
          kind: 'income' as const,
          title: income.description || 'Entrada',
          amount: income.amount,
          date: income.date,
          locked: income.locked
        })),
      ...expenses
        .filter(expense => inSameMonth(expense.date || expense.dueDate))
        .map(expense => ({
          id: `expense-${expense.id}`,
          entityId: expense.id,
          kind: 'expense' as const,
          title: expense.description || 'Despesa',
          amount: expense.amount,
          date: expense.date || expense.dueDate,
          subtype: expense.type,
          locked: expense.locked
        }))
    ];

    return mapped
      .map(item => {
        const timestamp = parseDate(item.date)?.getTime();
        return timestamp ? { ...item, timestamp } : null;
      })
      .filter((item): item is LaunchItem & { timestamp: number } => Boolean(item))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [expenses, incomes, creditCards, viewDate]);

  const visibleItems = launchItems.filter(item => (filter === 'all' ? true : item.kind === filter));
  const selectableIds = visibleItems.filter(item => !item.locked).map(item => item.id);
  const selectedCount = selectedIds.length;
  const displayCount = selectedCount > 0 ? selectedCount : visibleItems.length;
  const selectedTotals = useMemo(() => {
    return launchItems.reduce(
      (acc, item) => {
        if (!selectedIds.includes(item.id)) return acc;
        if (item.kind === 'income') {
          acc.income += item.amount;
        } else {
          acc.expense += item.amount;
        }
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [launchItems, selectedIds]);
  const useSelectedTotals = selectedCount > 0;

  useEffect(() => {
    const allowed = new Set(selectableIds);
    setSelectedIds(prev => prev.filter(id => allowed.has(id)));
  }, [selectableIds.join('|')]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return;
    const handleDockClick = () => {
      setDrawerItem(null);
      setDeleteTarget(null);
      setBulkDeleteOpen(false);
      setSelectedIds([]);
      setFilter('all');
    };
    window.addEventListener('mm:mobile-dock-click', handleDockClick);
    return () => window.removeEventListener('mm:mobile-dock-click', handleDockClick);
  }, [isMobile]);

  const toggleSelectAll = () => {
    if (selectableIds.length === 0) return;
    setSelectedIds(prev => (prev.length === selectableIds.length ? [] : selectableIds));
  };

  const { caixaSummary, competenciaSummary } = useMemo(() => {
    const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const context = { incomes, expenses, creditCards };
    return {
      caixaSummary: getReportSummary('local', start, end, context, { taxFilter: 'all', viewMode: 'caixa' }),
      competenciaSummary: getReportSummary('local', start, end, context, { taxFilter: 'all', viewMode: 'competencia' })
    };
  }, [expenses, incomes, viewDate]);

  const incomeById = useMemo(() => new Map(incomes.map(inc => [inc.id, inc])), [incomes]);
  const expenseById = useMemo(() => new Map(expenses.map(exp => [exp.id, exp])), [expenses]);
  const resolveAccountName = (accountId?: string) =>
    accounts.find(acc => acc.id === accountId)?.name || '-';
  const resolveCardName = (cardId?: string) =>
    creditCards.find(card => card.id === cardId)?.name || '-';
  const resolveExpenseTypeLabel = (type?: ExpenseType) =>
    expenseTypeOptions?.find(option => option.id === type)?.label ||
    (type === 'fixed' ? 'Fixa' : type === 'personal' ? 'Pessoal' : 'Variável');

  const drawerIncome = drawerItem?.kind === 'income' ? incomeById.get(drawerItem.entityId) || null : null;
  const drawerExpense = drawerItem?.kind === 'expense' ? expenseById.get(drawerItem.entityId) || null : null;
  const drawerLocked = Boolean(drawerIncome?.locked || drawerExpense?.locked);
  const drawerStatusLabel = drawerIncome
    ? (drawerIncome.status === 'received' ? 'Recebido' : 'Pendente')
    : drawerExpense
    ? (drawerExpense.status === 'paid' ? 'Pago' : 'Pendente')
    : undefined;
  const drawerStatusClass = drawerIncome
    ? drawerIncome.status === 'received'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
    : drawerExpense
    ? drawerExpense.status === 'paid'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
    : undefined;
  const drawerDetails = useMemo(() => {
    if (drawerIncome) {
      return [
        { label: 'Data', value: new Date(`${drawerIncome.date}T12:00:00`).toLocaleDateString('pt-BR') },
        { label: 'Categoria', value: drawerIncome.category || '-' },
        { label: 'Conta', value: resolveAccountName(drawerIncome.accountId) },
        drawerIncome.paymentMethod ? { label: 'Forma', value: drawerIncome.paymentMethod } : null,
        drawerIncome.notes ? { label: 'Observações', value: drawerIncome.notes } : null
      ].filter(Boolean) as { label: string; value: React.ReactNode }[];
    }
    if (drawerExpense) {
      const expenseCardId = (drawerExpense as Expense & { creditCardId?: string }).creditCardId || drawerExpense.cardId;
      const sourceLabel = expenseCardId ? resolveCardName(expenseCardId) : resolveAccountName(drawerExpense.accountId);
      return [
        { label: 'Tipo', value: resolveExpenseTypeLabel(drawerExpense.type) },
        { label: 'Categoria', value: drawerExpense.category || '-' },
        { label: 'Lançamento', value: new Date(`${drawerExpense.date}T12:00:00`).toLocaleDateString('pt-BR') },
        { label: 'Vencimento', value: new Date(`${drawerExpense.dueDate}T12:00:00`).toLocaleDateString('pt-BR') },
        { label: 'Conta/Cartão', value: sourceLabel },
        drawerExpense.paymentMethod ? { label: 'Forma', value: drawerExpense.paymentMethod } : null,
        drawerExpense.notes ? { label: 'Observações', value: drawerExpense.notes } : null
      ].filter(Boolean) as { label: string; value: React.ReactNode }[];
    }
    return [];
  }, [drawerIncome, drawerExpense, accounts, creditCards, expenseTypeOptions]);

  const closeDrawer = () => setDrawerItem(null);
  const handleRequestDelete = (item: LaunchItem) => {
    setDeleteTarget(item);
    setDrawerItem(null);
  };
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'income') {
      onDeleteIncome(deleteTarget.entityId);
    } else {
      onDeleteExpense(deleteTarget.entityId);
    }
    setDeleteTarget(null);
  };
  const handleConfirmBulkDelete = () => {
    const selectedItems = launchItems.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    selectedItems.forEach(item => {
      if (item.kind === 'income') {
        onDeleteIncome(item.entityId);
      } else {
        onDeleteExpense(item.entityId);
      }
    });
    setSelectedIds([]);
    setBulkDeleteOpen(false);
  };
  const drawerTitle = drawerIncome?.description || drawerExpense?.description || '';
  const drawerAmount = drawerIncome
    ? `R$ ${drawerIncome.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : drawerExpense
    ? `R$ ${drawerExpense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : undefined;

  if (!isMobile) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-white">Lançamentos</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Este painel está disponível no mobile.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
        <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
          <div
            className="absolute left-0 right-0 bottom-0 overflow-hidden"
            style={{
              top: 'max(0px, calc(var(--mm-mobile-top, 0px) - 70px))'
            }}
          >
            <div className="h-full overflow-y-auto flex flex-col">
              <MobileFullWidthSection contentClassName="px-4 py-3" backgroundClassName="bg-white/90 dark:bg-[#151517]/90">
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">Lançamentos</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-[#101014]/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Visão Caixa</p>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Entrou</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrencyCompact(useSelectedTotals ? selectedTotals.income : caixaSummary.totalReceitas)}
                      </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Saiu</span>
                      <span className="font-semibold text-rose-500 dark:text-rose-400">
                        {formatCurrencyCompact(useSelectedTotals ? selectedTotals.expense : caixaSummary.totalDespesas)}
                      </span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-[#101014]/70 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Visão Competência</p>
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Entrou</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrencyCompact(useSelectedTotals ? selectedTotals.income : competenciaSummary.totalReceitas)}
                      </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 dark:text-zinc-400">Saiu</span>
                      <span className="font-semibold text-rose-500 dark:text-rose-400">
                        {formatCurrencyCompact(useSelectedTotals ? selectedTotals.expense : competenciaSummary.totalDespesas)}
                      </span>
                      </div>
                    </div>
                  </div>
                </div>
              </MobileFullWidthSection>

              <div className="px-4 py-3">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'all', label: 'Todos' },
                    { key: 'income', label: 'Entradas' },
                    { key: 'expense', label: 'Saídas' }
                  ] as const).map(option => {
                    const isActive = filter === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFilter(option.key)}
                        className={`rounded-xl border px-2 py-2 text-[11px] font-semibold transition ${
                          isActive
                            ? 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-[#151517] text-zinc-900 dark:text-white'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <MobileFullWidthSection
                className="flex-1"
                contentClassName="px-4 py-3 flex flex-col h-full pb-[calc(env(safe-area-inset-bottom)+88px)]"
                backgroundClassName="bg-white/90 dark:bg-[#151517]/90"
              >
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-400">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2"
                  >
                    {selectedCount === selectableIds.length && selectableIds.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <span>{selectedCount} selecionados</span>
                </div>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkDeleteOpen(true)}
                    className="mb-3 w-full rounded-xl border border-red-200/70 dark:border-red-900/40 bg-red-50/70 dark:bg-red-900/10 py-2 text-xs font-semibold text-red-600 dark:text-red-300"
                  >
                    Excluir selecionados ({selectedCount})
                  </button>
                )}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                    <ArrowDownUp size={12} />
                    Lançamentos
                  </div>
                  <span className="text-[10px] text-zinc-400">{displayCount}</span>
                </div>
                {visibleItems.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhum lançamento neste mês.</p>
                ) : (
                  <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                    {visibleItems.map(item => {
                      const dateLabel = item.date
                        ? new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                        : '';
                      const isIncome = item.kind === 'income';
                      const isSelected = selectedIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDrawerItem(item)}
                          className="w-full flex items-center justify-between py-2 text-left cursor-pointer"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(item.id)}
                              onClick={(event) => event.stopPropagation()}
                              disabled={item.locked}
                              className="h-4 w-4 accent-indigo-500"
                            />
                            <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate flex items-center gap-2">
                              {isIncome ? (
                                <ArrowUpCircle size={14} className="text-emerald-500" />
                              ) : (
                                renderExpenseIcon(item.subtype)
                              )}
                              <span className="truncate">{item.title}</span>
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {isIncome ? 'Entrada' : 'Despesa'}{dateLabel ? ` • ${dateLabel}` : ''}
                            </p>
                            </div>
                          </div>
                          <span
                            className={`text-sm font-semibold ${getAmountClassName(item)}`}
                            style={getAmountStyle(item)}
                          >
                            {isIncome ? '+' : '-'} {formatCurrencyCompact(item.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex-1" aria-hidden="true" />
              </MobileFullWidthSection>
            </div>
          </div>
        </div>
      </div>

      <MobileTransactionDrawer
        open={Boolean(drawerItem)}
        title={drawerTitle}
        amount={drawerAmount}
        statusLabel={drawerStatusLabel}
        statusClassName={drawerStatusClass}
        details={drawerDetails}
        actionsDisabled={drawerLocked}
        onClose={closeDrawer}
        onEdit={
          drawerItem && !drawerLocked
            ? () => {
                if (drawerItem.kind === 'income') {
                  onEditIncome(drawerItem.entityId);
                } else {
                  onEditExpense(drawerItem.entityId, drawerItem.subtype);
                }
                closeDrawer();
              }
            : undefined
        }
        onDelete={
          drawerItem && !drawerLocked
            ? () => handleRequestDelete(drawerItem)
            : undefined
        }
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Excluir lançamento?</div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Você está prestes a excluir <strong>{deleteTarget.title}</strong> no valor de{' '}
              <strong>{formatCurrencyCompact(deleteTarget.amount)}</strong>.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2 rounded-xl font-semibold text-white bg-red-600"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Excluir selecionados?</div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Você está prestes a excluir <strong>{selectedCount}</strong> lançamentos selecionados.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(false)}
                className="flex-1 py-2 rounded-xl font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="flex-1 py-2 rounded-xl font-semibold text-white bg-red-600"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LaunchesView;
