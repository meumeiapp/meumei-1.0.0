
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, CreditCard as CardIcon, Wallet } from 'lucide-react';
import { Expense, Account, CreditCard } from '../types';
import NewExpenseModal from './NewExpenseModal';
import CardTag from './CardTag';
import { getAccountColor } from '../services/cardColorUtils';
import useIsMobile from '../hooks/useIsMobile';
import MobilePageShell from './mobile/MobilePageShell';
import MobileEmptyState from './mobile/MobileEmptyState';
import { expenseStatusLabel, normalizeExpenseStatus } from '../utils/statusUtils';

interface VariableExpensesViewProps {
  onBack: () => void;
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => void;
  accounts: Account[];
  onUpdateAccounts?: (accounts: Account[]) => void;
  creditCards: CreditCard[];
  viewDate: Date;
  categories: string[];
  onUpdateCategories: (categories: string[]) => void;
}

const VariableExpensesView: React.FC<VariableExpensesViewProps> = ({ 
  onBack, 
  expenses, 
  onUpdateExpenses,
  accounts,
  onUpdateAccounts,
  creditCards,
  viewDate,
  categories,
  onUpdateCategories
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const canAdjustAccount = (account?: Account | null) => Boolean(account && !account.locked);

  // Filter expenses based on the viewDate's month and year
  const filteredExpenses = expenses.filter(exp => {
      const targetDate = new Date(exp.dueDate + 'T12:00:00'); 
      return targetDate.getMonth() === viewDate.getMonth() && targetDate.getFullYear() === viewDate.getFullYear();
  });

  const totalAmount = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const totalPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

  const handleSaveExpense = (expenseData: any) => {
      let updatedList;
      let newItems: Expense[] = [];

      if (Array.isArray(expenseData)) {
          newItems = expenseData.map((e: any) => ({
              ...e,
              id: e.id || Math.random().toString(36).substr(2, 9)
          }));
          updatedList = [...expenses, ...newItems];
      } else {
          const newItem = { ...expenseData, id: Math.random().toString(36).substr(2, 9) };
          newItems = [newItem];
          updatedList = [...expenses, newItem];
      }
      
      // Calculate local balance update if applicable
      if (onUpdateAccounts) {
          const newAccounts = [...accounts];
          let accountsChanged = false;

          const processTransaction = (exp: any) => {
              if (exp.accountId && exp.status === 'paid') {
                  const accIdx = newAccounts.findIndex(a => a.id === exp.accountId);
                  if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
                      newAccounts[accIdx].currentBalance -= exp.amount;
                      accountsChanged = true;
                  }
              }
          };

          newItems.forEach(item => {
              processTransaction(item);
          });

          if (accountsChanged) {
              onUpdateAccounts(newAccounts);
          }
      }

      onUpdateExpenses(updatedList);
      setIsModalOpen(false);
  };

  const handleNew = () => {
      setIsModalOpen(true);
  };

  useEffect(() => {
      if (isMobile) return;
      const handleKeyDown = (event: KeyboardEvent) => {
          if (event.defaultPrevented || event.repeat) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key !== 'Enter') return;
          if (document.querySelector('[data-modal-root="true"]')) return;
          const target = event.target as HTMLElement | null;
          if (target) {
              const tagName = target.tagName;
              if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
                  return;
              }
          }
          if (isModalOpen) return;
          event.preventDefault();
          handleNew();
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNew, isMobile, isModalOpen]);

  const getSourceInfo = (expense: Expense) => {
      if (expense.paymentMethod === 'Crédito' && expense.cardId) {
          const card = creditCards.find(c => c.id === expense.cardId);
          return { type: 'card' as const, card, name: card?.name || 'Cartão Deletado' };
      }
      if (expense.accountId) {
          const acc = accounts.find(a => a.id === expense.accountId);
          return { type: 'account' as const, name: acc?.name || 'Conta Deletada', color: getAccountColor(acc) };
      }
      return { type: 'other' as const, name: expense.paymentMethod };
  };

  const headerWrapperClass = isMobile
    ? 'space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 relative z-10 -mt-6';

  const tableWrapperClass = isMobile
    ? ''
    : 'max-w-7xl mx-auto px-4 sm:px-6';

  const headerSection = (
        <div className={headerWrapperClass}>
            {!isMobile && (
                <button 
                    onClick={onBack}
                    className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                    <ArrowLeft size={16} /> Voltar ao Dashboard
                </button>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold mb-1">Despesas Variáveis</h1>
                    <p className="text-sm text-zinc-500">
                        {filteredExpenses.length} despesas • Total: <strong className="text-zinc-900 dark:text-white">R$ {totalAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong> • Pago: <span className="text-emerald-600">R$ {totalPaid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </p>
                </div>
                <button 
                    onClick={handleNew}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/20"
                >
                    <Plus size={20} /> Nova Despesa Variável
                </button>
            </div>
        </div>
  );

  const tableSection = (
        <main className={tableWrapperClass}>
            <div className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold">Data de Lançamento</th>
                                <th className="px-6 py-4 font-semibold">Fornecedor</th>
                                <th className="px-6 py-4 font-semibold">Conta / Cartão</th>
                                <th className="px-6 py-4 font-semibold">Categoria</th>
                                <th className="px-6 py-4 font-semibold">Vencimento</th>
                                <th className="px-6 py-4 font-semibold text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredExpenses.length > 0 ? (
                                filteredExpenses.map(expense => {
                                    const source = getSourceInfo(expense);
                                    const normalizedStatus = normalizeExpenseStatus(expense.status);
                                    const statusLabel = expenseStatusLabel(expense.status);
                                    return (
                                    <tr key={expense.id} className="hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                normalizedStatus === 'paid' 
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                            }`}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {new Date(expense.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">
                                            {expense.description}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {source.type === 'card' ? (
                                                <CardTag card={source.card || undefined} />
                                            ) : source.type === 'account' ? (
                                                <CardTag label={source.name} color={source.color} />
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <CardIcon size={14} className="text-zinc-400" />
                                                    <span className="text-xs">{source.name}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {expense.category}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {new Date(expense.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600 dark:text-red-400">
                                            R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                )})
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                                        Nenhuma despesa encontrada para este mês.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
  );

  const modals = (
        <NewExpenseModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSaveExpense}
            initialData={null}
            accounts={accounts}
            creditCards={creditCards}
            categories={categories}
            onUpdateCategories={onUpdateCategories}
            expenseType="variable"
            themeColor="pink"
        />
  );

  if (isMobile) {
      return (
          <>
              <MobilePageShell
                  title="Despesas Variáveis"
                  subtitle={`${filteredExpenses.length} despesas`}
                  onBack={onBack}
                  contentClassName="space-y-4"
              >
                  {headerSection}
                  {filteredExpenses.length === 0 ? (
                      <MobileEmptyState
                          icon={<Wallet size={18} />}
                          message="Nenhuma despesa encontrada para este mês."
                      />
                  ) : (
                      tableSection
                  )}
              </MobilePageShell>
              {modals}
          </>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
        {headerSection}
        {tableSection}
        {modals}
    </div>
  );
};

export default VariableExpensesView;
