// ... existing imports ...
import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, CreditCard as CardIcon, Calendar, CheckSquare, Square, DollarSign, Wallet, AlertTriangle, Pencil, X, Plus, Trash2, Lock } from 'lucide-react';
import { Expense, CreditCard, Account } from '../types';
import PayInvoiceModal from './PayInvoiceModal';
import NewCreditCardModal from './NewCreditCardModal';
import { filterCardExpensesForInvoices, groupCardExpensesByInvoiceMonth } from '../services/invoiceUtils';
import CardTag from './CardTag';
import { getCardColor, withAlpha } from '../services/cardColorUtils';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import { categoryService } from '../services/categoryService';
import useIsMobile from '../hooks/useIsMobile';
import MobilePageShell from './mobile/MobilePageShell';
import { getPrimaryActionLabel } from '../utils/formLabels';

interface InvoicesViewProps {
  onBack: () => void;
  expenses: Expense[];
  creditCards: CreditCard[];
  accounts: Account[];
  onPayInvoice: (expenseIds: string[], sourceAccountId: string, totalAmount: number) => void;
  onUpdateExpenses: (expenses: Expense[]) => void;
  onUpdateCreditCards?: (cards: CreditCard[]) => void;
  categories: string[];
  onUpdateCategories: (categories: string[]) => void;
  onAddCategory?: (name: string) => Promise<void> | void;
}

const InvoicesView: React.FC<InvoicesViewProps> = ({ 
  onBack, 
  expenses, 
  creditCards,
  accounts,
  onPayInvoice,
  onUpdateExpenses,
  onUpdateCreditCards,
  categories,
  onUpdateCategories,
  onAddCategory
}) => {
  const safeCreditCards = Array.isArray(creditCards) ? creditCards : [];
  const updateCreditCards = onUpdateCreditCards || (() => {});
  const isMobile = useIsMobile();
  // ... existing state ...
  const [selectedCardId, setSelectedCardId] = useState<string>(safeCreditCards.length > 0 ? safeCreditCards[0].id : '');
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ description: '', amount: '', category: '' });
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
      console.info('[cards] view', { route: 'faturas' });
  }, []);

  // Filter expenses: Must be Credit Card type, match selected card
  // Show PENDING and PAID? Usually invoices show history too, but for payment, only pending.
  // The user wants a "Hub de Conciliação". Let's show Pending by default.
  const cardExpenses = useMemo(() => filterCardExpensesForInvoices(expenses, selectedCardId), [expenses, selectedCardId]);

  // Group expenses by Due Month (Invoice Cycle)
  const groupedExpenses = useMemo(() => {
      const groups = groupCardExpensesByInvoiceMonth(cardExpenses);
      return Object.keys(groups).sort().reduce((obj, key) => {
          obj[key] = groups[key];
          return obj;
      }, {} as Record<string, Expense[]>);
  }, [cardExpenses]);

  // ... rest of logic ...
  // Calculation for Selected Items
  const selectedTotal = cardExpenses
      .filter(exp => selectedExpenseIds.includes(exp.id))
      .reduce((sum, exp) => sum + exp.amount, 0);

  const selectedCard = safeCreditCards.find(c => c.id === selectedCardId);
  const selectedCardColor = selectedCard ? getCardColor(selectedCard) : '#6366f1';
  const editExpenseLabel = getPrimaryActionLabel('Despesa', true);

  useEffect(() => {
      if (editingExpense) {
          setEditForm({
              description: editingExpense.description,
              amount: editingExpense.amount.toString(),
              category: editingExpense.category || ''
          });
      }
  }, [editingExpense]);

  useEffect(() => {
      if (safeCreditCards.length === 0) {
          if (selectedCardId) setSelectedCardId('');
          return;
      }
      if (!selectedCardId || !safeCreditCards.some(card => card.id === selectedCardId)) {
          setSelectedCardId(safeCreditCards[0].id);
      }
  }, [safeCreditCards, selectedCardId]);

  useEffect(() => {
      if (highlightTarget && highlightTarget.entity === 'card') {
          const targetId = highlightTarget.id;
          setSelectedCardId(targetId);
          setHighlightedCardId(targetId);
          requestAnimationFrame(() => {
              const element = document.getElementById('card-highlight-bar');
              element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          const timer = setTimeout(() => {
              setHighlightedCardId(null);
              setHighlightTarget(null);
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [highlightTarget, setHighlightTarget]);

  // Handlers
  const toggleSelection = (id: string) => {
      const target = cardExpenses.find(exp => exp.id === id);
      if (target?.locked) return;
      setSelectedExpenseIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleSelectMonth = (monthKey: string) => {
      const idsInMonth = groupedExpenses[monthKey].filter(e => !e.locked).map(e => e.id);
      const allSelected = idsInMonth.every(id => selectedExpenseIds.includes(id));

      if (allSelected) {
          // Deselect all in this month
          setSelectedExpenseIds(prev => prev.filter(id => !idsInMonth.includes(id)));
      } else {
          // Select all in this month (merging unique)
          const newIds = [...new Set([...selectedExpenseIds, ...idsInMonth])];
          setSelectedExpenseIds(newIds);
      }
  };

  const handleConfirmPayment = (accountId: string, paymentDate: string) => {
      onPayInvoice(selectedExpenseIds, accountId, selectedTotal);
      setSelectedExpenseIds([]); // Clear selection
      setIsPayModalOpen(false);
  };

  const handleOpenNewCard = () => {
      setEditingCard(null);
      setIsCardModalOpen(true);
  };

  const handleEditCard = (card: CreditCard) => {
      setEditingCard(card);
      setIsCardModalOpen(true);
  };

  const handleDeleteCard = (cardId: string) => {
      if (confirm('Tem certeza que deseja remover este cartão?')) {
      const updatedCards = safeCreditCards.filter(card => card.id !== cardId);
      updateCreditCards(updatedCards);
  }
  };

  const handleSaveCard = (cardData: CreditCard) => {
      let updatedCards: CreditCard[];
      if (editingCard) {
          updatedCards = safeCreditCards.map(card => card.id === cardData.id ? cardData : card);
      } else {
          const nextId = cardData.id || Math.random().toString(36).substr(2, 9);
          updatedCards = [...safeCreditCards, { ...cardData, id: nextId }];
      }
      updateCreditCards(updatedCards);
      setIsCardModalOpen(false);
      setEditingCard(null);
  };

  const openEditExpense = (expense: Expense) => {
      setEditingExpense(expense);
      setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
      setIsEditModalOpen(false);
      setEditingExpense(null);
  };

  const handleSaveEditedExpense = () => {
      if (!editingExpense) return;
      if (!editForm.description.trim()) return;
      const parsedAmount = parseFloat(editForm.amount.replace(',', '.'));
      if (Number.isNaN(parsedAmount)) return;
      const normalizedCategory = editForm.category
          ? categoryService.normalizeCategoryName(editForm.category)
          : '';

      console.info('[form-save]', { entityName: 'Despesa', isEditing: true, primaryLabel: editExpenseLabel });

      const updatedExpense: Expense = {
          ...editingExpense,
          description: editForm.description,
          category: normalizedCategory,
          amount: parsedAmount
      };

      const updatedList = expenses.map(exp => exp.id === updatedExpense.id ? updatedExpense : exp);
      onUpdateExpenses(updatedList);

      if (normalizedCategory) {
          const exists = categories.some(
              (cat) =>
                  categoryService.normalizeCategoryName(cat).toLowerCase() === normalizedCategory.toLowerCase()
          );
          if (!exists) {
              if (onAddCategory) {
                  Promise.resolve(onAddCategory(normalizedCategory)).catch((error: any) => {
                      alert(error?.message || 'Falha ao salvar categoria.');
                  });
              } else {
                  onUpdateCategories([...categories, normalizedCategory]);
              }
          }
      }

      closeEditModal();
  };

  // Helper to format Month Key (YYYY-MM) to readable string
  const formatMonthKey = (key: string) => {
      const [year, month] = key.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const headerWrapperClass = isMobile
    ? 'space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 relative z-10 -mt-2';

  const mainWrapperClass = isMobile
    ? 'space-y-6'
    : 'max-w-7xl mx-auto px-4 sm:px-6 space-y-6';

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

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                  <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
                      <CardIcon style={{ color: selectedCardColor }} />
                      Faturas de Cartão
                  </h1>
                  <p className="text-zinc-500 dark:text-zinc-400">
                      Conciliação e pagamento de faturas em aberto.
                  </p>
                  {selectedCard && <CardTag card={selectedCard} className="mt-2 inline-flex" />}
              </div>

              {/* Card Selector */}
              <div className="w-full md:w-auto min-w-[250px]">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1 block">Selecione o Cartão</label>
                  <div className="relative">
                      <select 
                          value={selectedCardId}
                          onChange={(e) => { setSelectedCardId(e.target.value); setSelectedExpenseIds([]); }}
                          className="w-full appearance-none bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium shadow-sm"
                      >
                          {safeCreditCards.map(card => (
                              <option key={card.id} value={card.id}>{card.name}</option>
                          ))}
                          {safeCreditCards.length === 0 && <option value="">Nenhum cartão cadastrado</option>}
                      </select>
                      <CardIcon className="absolute right-4 top-3.5 text-zinc-400 pointer-events-none" size={18} />
                  </div>
                  {selectedCard && (
                      <CardTag card={selectedCard} className="mt-2 inline-flex" />
                  )}
              </div>
          </div>
      </div>
  );

  const mainSection = (
      <main className={mainWrapperClass}>

        <section className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                        <CardIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Cartões de Crédito</h2>
                        <p className="text-xs text-zinc-500">Gerencie cartões usados nas faturas.</p>
                    </div>
                </div>
                <button
                    onClick={handleOpenNewCard}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-900/20"
                >
                    <Plus size={14} /> Novo Cartão
                </button>
            </div>

            {safeCreditCards.length === 0 ? (
                <div className="bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-100 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center py-6 gap-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Nenhum cartão ativo</span>
                    <button
                        onClick={handleOpenNewCard}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <Plus size={14} /> Novo Cartão
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {safeCreditCards.map(card => (
                        <div key={card.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1a1a1a] px-4 py-3">
                            <div>
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                                    <span
                                        className="w-3 h-3 rounded-full border border-white/40"
                                        style={{ backgroundColor: getCardColor(card) }}
                                    />
                                    {card.name}
                                </p>
                                <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                    {card.brand || 'Cartão'} • Fecha dia {card.closingDay}
                                </p>
                                <CardTag card={card} size="sm" className="mt-1" />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleEditCard(card)}
                                    className="p-2 rounded-lg text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={() => handleDeleteCard(card.id)}
                                    className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
        
        {/* RECONCILIATION BAR (Sticky/Fixed possibility, but kept inline for simplicity) */}
        <div
            id="card-highlight-bar"
            className={`bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm sticky top-4 z-40 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 ${highlightedCardId === selectedCardId ? 'ring-2 ring-indigo-400/70 shadow-indigo-500/20' : ''}`}
        >
            <div className="flex items-center gap-4">
                <div 
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: withAlpha(selectedCardColor, 0.2), color: selectedCardColor }}
                >
                    <CheckSquare size={24} />
                </div>
                <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Total Selecionado</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                        R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-400">{selectedExpenseIds.length} itens marcados</p>
                </div>
            </div>

            <button 
                onClick={() => setIsPayModalOpen(true)}
                disabled={selectedExpenseIds.length === 0}
                className={`
                    w-full sm:w-auto px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                    ${selectedExpenseIds.length > 0 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20 active:scale-95' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'}
                `}
            >
                <DollarSign size={20} />
                Pagar Fatura
            </button>
        </div>

        {/* Invoice Lists Grouped by Month */}
        {Object.keys(groupedExpenses).length > 0 ? (
            Object.entries(groupedExpenses).map(([monthKey, expensesList]: [string, Expense[]]) => {
                const totalMonth = expensesList.reduce((acc, curr) => acc + curr.amount, 0);
                const selectableExpenses = expensesList.filter(exp => !exp.locked);
                const allSelected = selectableExpenses.length > 0 && selectableExpenses.every(e => selectedExpenseIds.includes(e.id));
                const partialSelected = selectableExpenses.some(e => selectedExpenseIds.includes(e.id)) && !allSelected;

                return (
                    <div key={monthKey} className="bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                        
                        {/* Month Header */}
                        <div className="bg-zinc-50 dark:bg-[#1a1a1a] p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => toggleSelectMonth(monthKey)}
                                    className="text-zinc-400 hover:text-rose-600 transition-colors"
                                >
                                    {allSelected ? <CheckSquare size={20} className="text-rose-600" /> : 
                                     partialSelected ? <div className="w-5 h-5 border-2 border-rose-600 rounded flex items-center justify-center"><div className="w-2.5 h-2.5 bg-rose-600 rounded-sm"></div></div> :
                                     <Square size={20} />}
                                </button>
                                <div>
                                    <h3 className="font-bold text-zinc-800 dark:text-zinc-200 capitalize flex items-center gap-2">
                                        <Calendar size={16} className="text-rose-500" />
                                        Fatura: {formatMonthKey(monthKey)}
                                    </h3>
                                </div>
                            </div>
                            <span className="text-sm font-bold text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 px-3 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                                Total: R$ {totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {/* Transactions List */}
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {expensesList.map(exp => {
                                const isSelected = selectedExpenseIds.includes(exp.id);
                                const isLocked = Boolean(exp.locked);
                                return (
                                    <div 
                                        key={exp.id} 
                                        onClick={() => {
                                            if (!isLocked) toggleSelection(exp.id);
                                        }}
                                        className={`flex items-center justify-between p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${isSelected ? '' : ''}`}
                                        style={isSelected ? { backgroundColor: withAlpha(selectedCardColor, 0.08) } : undefined}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="text-zinc-300" style={isSelected ? { color: selectedCardColor } : undefined}>
                                                {isLocked ? <Lock size={16} className="text-amber-500" /> : isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-medium text-zinc-900 dark:text-white text-sm">{exp.description}</p>
                                                    {selectedCard && <CardTag card={selectedCard} size="sm" />}
                                                    {exp.lockedReason === 'epoch_mismatch' && (
                                                        <span className="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                                            Arquivado
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                    <span>{new Date(exp.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                    <span>•</span>
                                                    <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 rounded text-[10px] uppercase tracking-wide">{exp.category}</span>
                                                    {exp.installments && (
                                                        <span className="text-rose-500 font-bold ml-1">
                                                            {exp.installmentNumber}/{exp.totalInstallments}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-2">
                                            <div>
                                                <p className={`font-bold ${isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                                                    R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[10px] text-zinc-400">
                                                    Vence: {new Date(exp.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            {!isLocked && (
                                                <button
                                                    onClick={(event) => { 
                                                        event.stopPropagation(); 
                                                        openEditExpense(exp); 
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-rose-500 hover:border-rose-400 transition-colors flex items-center gap-1"
                                                >
                                                    <Pencil size={14} />
                                                    Editar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })
        ) : (
            <div className="text-center py-20 bg-white dark:bg-[#151517] rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                    <CardIcon size={32} />
                </div>
                {selectedCardId ? (
                    <>
                        <h3 className="text-zinc-900 dark:text-white font-bold mb-1">Tudo em dia!</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Não há despesas pendentes para o cartão selecionado.</p>
                    </>
                ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Selecione um cartão para visualizar as faturas.</p>
                )}
            </div>
        )}

      </main>
  );

  const modals = (
      <>
          <PayInvoiceModal 
            isOpen={isPayModalOpen}
            onClose={() => setIsPayModalOpen(false)}
            totalAmount={selectedTotal}
            selectedCount={selectedExpenseIds.length}
            accounts={accounts}
            selectedCard={selectedCard || null}
            onConfirmPayment={handleConfirmPayment}
          />

          <NewCreditCardModal
            isOpen={isCardModalOpen}
            onClose={() => {
              setIsCardModalOpen(false);
              setEditingCard(null);
            }}
            onSave={handleSaveCard}
            initialData={editingCard}
          />

          {isEditModalOpen && editingExpense && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeEditModal}></div>
                <div className="relative w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Pencil size={20} className="text-rose-500" />
                            Editar Lançamento
                        </h3>
                        <button onClick={closeEditModal} className="p-2 text-zinc-400 hover:text-zinc-200 rounded-full hover:bg-white/10">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Descrição</label>
                        <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Valor (R$)</label>
                            <input
                                type="number"
                                value={editForm.amount}
                                onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                                className="w-full bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Categoria</label>
                            <input
                                list="invoice-category-options"
                                value={editForm.category}
                                onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                            />
                            <datalist id="invoice-category-options">
                                {categories.map(cat => <option value={cat} key={cat} />)}
                            </datalist>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-[#151515] rounded-2xl p-4">
                        <div>
                            <p className="font-semibold text-zinc-600 dark:text-zinc-300">Competência</p>
                            <p className="text-zinc-900 dark:text-white">{new Date(editingExpense.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div>
                            <p className="font-semibold text-zinc-600 dark:text-zinc-300">Vencimento</p>
                            <p className="text-zinc-900 dark:text-white">{new Date(editingExpense.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                        {editingExpense.installments && (
                            <div className="md:col-span-2">
                                <p className="font-semibold text-zinc-600 dark:text-zinc-300">Parcelas</p>
                                <p className="text-zinc-900 dark:text-white">{editingExpense.installmentNumber}/{editingExpense.totalInstallments}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={closeEditModal}
                            className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveEditedExpense}
                            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-lg shadow-rose-900/20"
                        >
                            {editExpenseLabel}
                        </button>
                    </div>
                </div>
            </div>
          )}
      </>
  );

  if (isMobile) {
      return (
          <>
              <MobilePageShell
                  title="Faturas"
                  subtitle={selectedCard?.name}
                  onBack={onBack}
                  contentClassName="space-y-4"
              >
                  {headerSection}
                  {mainSection}
              </MobilePageShell>
              {modals}
          </>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      {headerSection}
      {mainSection}
      {modals}
    </div>
  );
};

export default InvoicesView;
