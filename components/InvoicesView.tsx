// ... existing imports ...
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, CreditCard as CardIcon, Calendar, CheckSquare, Square, DollarSign, Wallet, AlertTriangle, Pencil, X, Plus, Trash2, Lock, Home, History } from 'lucide-react';
import { Expense, CreditCard, Account } from '../types';
import PayInvoiceModal from './PayInvoiceModal';
import NewCreditCardModal from './NewCreditCardModal';
import { filterCardExpensesForInvoices, groupCardExpensesByInvoiceMonth } from '../services/invoiceUtils';
import CardTag from './CardTag';
import { getCardColor, withAlpha } from '../services/cardColorUtils';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import { categoryService } from '../services/categoryService';
import useIsMobile from '../hooks/useIsMobile';
import { getPrimaryActionLabel } from '../utils/formLabels';
import MobileTransactionCard from './mobile/MobileTransactionCard';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import SelectDropdown from './common/SelectDropdown';

interface InvoicesViewProps {
  onBack: () => void;
  onOpenAudit?: () => void;
  expenses: Expense[];
  creditCards: CreditCard[];
  accounts: Account[];
  viewDate?: Date;
  onPayInvoice: (expenseIds: string[], sourceAccountId: string, totalAmount: number) => void;
  onUpdateExpenses: (expenses: Expense[]) => void;
  onUpdateCreditCards?: (cards: CreditCard[]) => void;
  categories: string[];
  onUpdateCategories: (categories: string[]) => void;
  onAddCategory?: (name: string) => Promise<void> | void;
}

const InvoicesView: React.FC<InvoicesViewProps> = ({ 
  onBack, 
  onOpenAudit,
  expenses, 
  creditCards,
  accounts,
  viewDate,
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
  const [drawerCard, setDrawerCard] = useState<CreditCard | null>(null);
  const [isCardsExpanded, setIsCardsExpanded] = useState(false);
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [isCardPickerOpen, setIsCardPickerOpen] = useState(false);
  const cardPickerRef = useRef<HTMLDivElement | null>(null);

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

  const calendarYear = viewDate ? viewDate.getFullYear() : new Date().getFullYear();
  const allCardExpensesByMonth = useMemo(() => {
      const map = new Map<string, { total: number; cardIds: Set<string> }>();
      expenses.forEach(exp => {
          if (!exp.cardId) return;
          const date = new Date(exp.dueDate + 'T12:00:00');
          if (date.getFullYear() !== calendarYear) return;
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const entry = map.get(key) || { total: 0, cardIds: new Set<string>() };
          entry.total += exp.amount;
          entry.cardIds.add(exp.cardId);
          map.set(key, entry);
      });
      return map;
  }, [expenses, calendarYear]);

  const needsScroll = Boolean(expandedMonthKey);

  useEffect(() => {
      const shouldLock = !needsScroll;
      document.documentElement.classList.toggle('lock-scroll', shouldLock);
      document.body.classList.toggle('lock-scroll', shouldLock);
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [needsScroll]);

  useEffect(() => {
      if (Object.keys(groupedExpenses).length === 0) {
          setExpandedMonthKey(null);
      }
  }, [groupedExpenses]);

  // ... rest of logic ...
  // Calculation for Selected Items
  const selectedTotal = cardExpenses
      .filter(exp => selectedExpenseIds.includes(exp.id))
      .reduce((sum, exp) => sum + exp.amount, 0);

  const selectedCard = safeCreditCards.find(c => c.id === selectedCardId);
  const selectedCardColor = selectedCard ? getCardColor(selectedCard) : '#6366f1';
  const editExpenseLabel = getPrimaryActionLabel('Despesa', true);
  const pendingTotal = cardExpenses.reduce((sum, exp) => sum + exp.amount, 0);

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

  useEffect(() => {
      if (!isMobile || !isCardPickerOpen) return;
      const handleOutside = (event: MouseEvent | TouchEvent) => {
          const target = event.target as Node | null;
          if (!target) return;
          if (cardPickerRef.current && cardPickerRef.current.contains(target)) return;
          setIsCardPickerOpen(false);
      };
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
      return () => {
          document.removeEventListener('mousedown', handleOutside);
          document.removeEventListener('touchstart', handleOutside);
      };
  }, [isMobile, isCardPickerOpen]);

  useEffect(() => {
      if (!isMobile) return;
      const node = subHeaderRef.current;
      if (!node) return;

      const updateMetrics = () => {
          const rect = node.getBoundingClientRect();
          const height = Math.round(rect.height);
          setSubHeaderHeight(prev => (prev === height ? prev : height));
          const fillHeight = Math.max(0, Math.round(rect.top));
          setHeaderFill(prev => (prev.top === 0 && prev.height === fillHeight ? prev : { top: 0, height: fillHeight }));
      };

      updateMetrics();

      const observer =
          typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMetrics) : null;
      observer?.observe(node);
      window.addEventListener('resize', updateMetrics);

      return () => {
          observer?.disconnect();
          window.removeEventListener('resize', updateMetrics);
      };
  }, [isMobile]);

  useEffect(() => {
      if (!isMobile) return;
      if (safeCreditCards.length <= 2 && isCardsExpanded) {
          setIsCardsExpanded(false);
      }
  }, [isMobile, isCardsExpanded, safeCreditCards.length]);

  // Handlers
  const toggleSelection = (id: string) => {
      const target = cardExpenses.find(exp => exp.id === id);
      if (target?.locked) return;
      setSelectedExpenseIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleSelectMonth = (monthKey: string) => {
      const monthExpenses = groupedExpenses[monthKey] || [];
      if (monthExpenses.length === 0) return;
      const idsInMonth = monthExpenses.filter(e => !e.locked).map(e => e.id);
      const allSelected = idsInMonth.length > 0 && idsInMonth.every(id => selectedExpenseIds.includes(id));

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
  const formatCurrency = (value: number) =>
      value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const headerWrapperClass = 'space-y-2';

  const mainWrapperClass = isMobile
    ? 'space-y-6'
    : 'max-w-7xl mx-auto px-4 sm:px-6 space-y-6 mt-[var(--mm-content-gap)]';
  const cardSelectId = 'invoice-card-select';
  const editFieldId = (suffix: string) =>
    `invoice-edit-${editingExpense?.id || 'current'}-${suffix}`;

  const cardSelectorSection = isMobile ? (
      <div
          id="card-highlight-bar"
          className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm ${
              highlightedCardId === selectedCardId ? 'ring-2 ring-indigo-400/70 shadow-indigo-500/20' : ''
          }`}
      >
          <label htmlFor={cardSelectId} className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2 block">
            Cartão selecionado
          </label>
          <div className="relative" ref={cardPickerRef}>
              <button
                  type="button"
                  onClick={() => setIsCardPickerOpen((prev) => !prev)}
                  disabled={safeCreditCards.length === 0}
                  className="w-full bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-2xl px-4 py-3 pr-10 text-left font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-70 disabled:cursor-not-allowed"
                  aria-expanded={isCardPickerOpen}
                  aria-controls="invoice-card-picker"
              >
                  {selectedCard?.name || 'Nenhum cartão cadastrado'}
              </button>
              <ChevronDown
                  className={`absolute right-4 top-3.5 text-zinc-400 transition-transform ${isCardPickerOpen ? 'rotate-180' : ''}`}
                  size={18}
              />
              {isCardPickerOpen && safeCreditCards.length > 0 && (
                  <div
                      id="invoice-card-picker"
                      className="absolute left-0 right-0 mt-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] shadow-xl z-20 overflow-hidden"
                  >
                      <div className="max-h-64 overflow-y-auto py-1">
                          {safeCreditCards.map((card) => {
                              const isSelected = card.id === selectedCardId;
                              return (
                                  <button
                                      key={card.id}
                                      type="button"
                                      onClick={() => {
                                          setSelectedCardId(card.id);
                                          setSelectedExpenseIds([]);
                                          setIsCardPickerOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm text-left ${
                                          isSelected
                                              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-zinc-900 dark:text-white'
                                              : 'hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200'
                                      }`}
                                  >
                                      <span className="flex items-center gap-2 min-w-0">
                                          <span
                                              className="h-2.5 w-2.5 rounded-full border border-white/40"
                                              style={{ backgroundColor: getCardColor(card) }}
                                          />
                                          <span className="truncate">{card.name}</span>
                                      </span>
                                      {isSelected && (
                                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-500">
                                              Ativo
                                          </span>
                                      )}
                                  </button>
                              );
                          })}
                      </div>
                  </div>
              )}
          </div>
          {selectedCard && (
              <CardTag card={selectedCard} className="mt-2 inline-flex" />
          )}
      </div>
  ) : null;

  const headerSection = (
      <div className={headerWrapperClass}>
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <button
                  type="button"
                  onClick={onBack}
                  className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                  aria-label="Voltar para o início"
              >
                  <Home size={16} />
              </button>

              <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Faturas de Cartão</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Conciliação e pagamento de faturas em aberto.
                  </p>
              </div>

              <div className="min-w-[32px]" />
          </div>

          <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Selecionado</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                          R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Itens</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                          {selectedExpenseIds.length}
                      </p>
                  </div>
              </div>

              <div className={`grid ${onOpenAudit ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                  {onOpenAudit && (
                      <button
                          onClick={onOpenAudit}
                          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-[var(--mm-view-accent)] hover:border-[var(--mm-view-accent)] transition"
                          title="Auditoria do dia"
                      >
                          <History size={14} />
                          Auditoria
                      </button>
                  )}
                  <button
                      onClick={() => setIsPayModalOpen(true)}
                      disabled={selectedExpenseIds.length === 0}
                      className={`flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition ${
                        selectedExpenseIds.length > 0
                          ? 'bg-[var(--mm-view-accent)] hover:bg-[var(--mm-view-accent-strong)] text-white shadow-lg shadow-blue-900/20'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                      }`}
                  >
                      Pagar Fatura
                  </button>
                  {!isMobile && (
                      <button
                          onClick={handleOpenNewCard}
                          className="w-full rounded-2xl bg-[var(--mm-view-accent)] hover:bg-[var(--mm-view-accent-strong)] text-white font-semibold py-2.5 text-sm shadow-lg shadow-[var(--mm-view-accent)]/20 flex items-center justify-center gap-2"
                      >
                          Novo Cartão
                      </button>
                  )}
              </div>
          </div>
      </div>
  );

  const summarySection = isMobile ? headerSection : (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 pt-6">
        <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {headerSection}
          </div>
      </div>
  );

  const CARD_COLLAPSE_LIMIT = 2;
  const shouldCollapseCards = isMobile && safeCreditCards.length > CARD_COLLAPSE_LIMIT;
  const extraCardCount = Math.max(0, safeCreditCards.length - CARD_COLLAPSE_LIMIT);
  const visibleCards = shouldCollapseCards && !isCardsExpanded
      ? safeCreditCards.slice(0, CARD_COLLAPSE_LIMIT)
      : safeCreditCards;

  const cardManagementSection = (
      <section className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-[var(--mm-view-accent)]">
                      <CardIcon size={16} />
                  </div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Cartões de Crédito</h2>
              </div>
              {isMobile && (
                  <button
                      onClick={handleOpenNewCard}
                      className="inline-flex items-center gap-2 bg-[var(--mm-view-accent)] hover:bg-[var(--mm-view-accent-strong)] text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-lg shadow-blue-900/20"
                  >
                      Novo Cartão
                  </button>
              )}
          </div>

          {safeCreditCards.length === 0 ? (
              <div className="bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-100 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center py-4 gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Nenhum cartão ativo</span>
                  {!isMobile && (
                      <button
                          onClick={handleOpenNewCard}
                          className="flex items-center gap-2 bg-[var(--mm-view-accent)] hover:bg-[var(--mm-view-accent-strong)] text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-lg shadow-blue-900/20"
                      >
                          Novo Cartão
                      </button>
                  )}
              </div>
          ) : (
              <div className="space-y-1">
                  {visibleCards.map((card, index) => {
                      const limitLabel =
                          typeof card.limit === 'number' && card.limit > 0
                              ? `R$ ${formatCurrency(card.limit)}`
                              : 'Sem limite';
                      const rowBg = index % 2 === 0 ? 'bg-white/5 dark:bg-white/5' : 'bg-transparent';
                      const isActive = card.id === selectedCardId;
                      return (
                          <div key={card.id}>
                              {isMobile ? (
                                  <MobileTransactionCard
                                      title={card.name}
                                      amount={limitLabel}
                                      amountClassName={card.limit ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}
                                      dateLabel={`Fecha dia ${card.closingDay}`}
                                      category={`Vence dia ${card.dueDay}`}
                                      subtitle={card.brand || 'Cartão'}
                                      onClick={() => setDrawerCard(card)}
                                  />
                              ) : (
                                  <div
                                      className={`rounded-md ${rowBg} ${isActive ? 'ring-2 ring-[var(--mm-view-accent)]/60 bg-white/10' : ''}`}
                                  >
                                      <div
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => setSelectedCardId(card.id)}
                                          onKeyDown={(event) => {
                                              if (event.key === 'Enter' || event.key === ' ') {
                                                  event.preventDefault();
                                                  setSelectedCardId(card.id);
                                              }
                                          }}
                                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                                          aria-label={`Selecionar cartão ${card.name}`}
                                      >
                                          <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                  className="h-6 w-6 rounded-md border border-white/10 flex items-center justify-center"
                                                  style={{ color: getCardColor(card) }}
                                              >
                                                  <CardIcon size={14} />
                                              </span>
                                              <span className="text-sm font-medium truncate text-zinc-900 dark:text-zinc-100">
                                                  {card.name}
                                              </span>
                                              <span className="text-[10px] text-zinc-500 truncate">
                                                  {card.brand || 'Cartão'}
                                              </span>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-300">
                                                  {limitLabel}
                                              </span>
                                              <button
                                                  type="button"
                                                  onClick={(event) => {
                                                      event.stopPropagation();
                                                      handleEditCard(card);
                                                  }}
                                                  className="h-7 w-7 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/30 transition"
                                                  aria-label={`Editar cartão ${card.name}`}
                                              >
                                                  <Pencil size={14} />
                                              </button>
                                              <button
                                                  type="button"
                                                  onClick={(event) => {
                                                      event.stopPropagation();
                                                      handleDeleteCard(card.id);
                                                  }}
                                                  className="h-7 w-7 rounded-full border border-white/10 flex items-center justify-center text-rose-400 hover:text-rose-300 hover:border-rose-400/60 transition"
                                                  aria-label={`Excluir cartão ${card.name}`}
                                              >
                                                  <Trash2 size={14} />
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </div>
                      );
                  })}
                  {shouldCollapseCards && (
                      <button
                          type="button"
                          onClick={() => setIsCardsExpanded(prev => !prev)}
                          className="w-full rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                      >
                          {isCardsExpanded ? 'Toque para recolher' : `Toque para expandir (+${extraCardCount})`}
                          <ChevronDown
                              size={12}
                              className={`transition-transform ${isCardsExpanded ? 'rotate-180' : ''}`}
                          />
                      </button>
                  )}
              </div>
          )}
      </section>
  );

  const reconciliationBar = null;

  const invoiceListSection = (
      <>
          {Object.keys(groupedExpenses).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 12 }).map((_, index) => {
                      const monthKey = `${calendarYear}-${String(index + 1).padStart(2, '0')}`;
                      const monthExpenses = groupedExpenses[monthKey] || [];
                      const totalMonth = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
                      const selectableExpenses = monthExpenses.filter(exp => !exp.locked);
                      const allSelected = selectableExpenses.length > 0 && selectableExpenses.every(e => selectedExpenseIds.includes(e.id));
                      const partialSelected = selectableExpenses.some(e => selectedExpenseIds.includes(e.id)) && !allSelected;
                      const isDisabled = monthExpenses.length === 0;
                      const monthName = new Date(calendarYear, index, 1).toLocaleDateString('pt-BR', { month: 'long' });
                      const monthSummary = allCardExpensesByMonth.get(monthKey);
                      const cardTheme = selectedCardColor || '#6366f1';
                      const cardName = selectedCard?.name || 'Cartão';
                      const cardBrand = selectedCard?.brand || 'Cartão';

                      return (
                          <div
                              key={monthKey}
                              className={`rounded-2xl border p-3 shadow-sm transition ${isDisabled ? 'opacity-70' : ''}`}
                              style={{
                                  background: withAlpha(cardTheme, isDisabled ? 0.08 : 0.18),
                                  borderColor: withAlpha(cardTheme, 0.35)
                              }}
                          >
                              <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-900 dark:text-white/80">{cardName}</p>
                                  <input
                                      type="checkbox"
                                      checked={allSelected}
                                      onChange={() => toggleSelectMonth(monthKey)}
                                      disabled={selectableExpenses.length === 0}
                                      className="h-4 w-4"
                                      style={{ accentColor: 'var(--mm-view-accent)' as any }}
                                      aria-label={`Selecionar faturas de ${monthName}`}
                                  />
                              </div>
                              <button
                                  type="button"
                                  onClick={() => setExpandedMonthKey(monthKey)}
                                  disabled={isDisabled}
                                  className="mt-3 w-full text-left"
                              >
                                  <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                                      R$ {totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </p>
                                  <p className="text-[11px] text-zinc-700 dark:text-white/70">
                                      {partialSelected ? 'Parcial selecionado' : isDisabled ? 'Sem despesas' : 'Ver fatura'}
                                  </p>
                                  <div className="mt-4 flex items-end justify-between">
                                      <span className="text-[10px] uppercase tracking-wide text-zinc-700 dark:text-white/70">
                                          {monthName}
                                      </span>
                                      <span className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-900 dark:text-white/80">
                                          {cardBrand}
                                      </span>
                                  </div>
                              </button>
                          </div>
                      );
                  })}
              </div>
          ) : (
              isMobile ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-4 py-4 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                      <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                          <CardIcon size={20} />
                      </div>
                      <div className="min-w-0">
                          {selectedCardId ? (
                              <>
                                  <p className="text-zinc-900 dark:text-white font-semibold">Tudo em dia!</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                      Sem despesas pendentes para o cartão selecionado.
                                  </p>
                              </>
                          ) : (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  Selecione um cartão para visualizar as faturas.
                              </p>
                          )}
                      </div>
                  </div>
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
              )
          )}
      </>
  );

  const expandedMonthExpenses = expandedMonthKey ? groupedExpenses[expandedMonthKey] || [] : [];
  const expandedMonthTotal = expandedMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const expandedMonthLabel = expandedMonthKey ? formatMonthKey(expandedMonthKey) : '';

  const closeExpandedMonth = () => {
      setExpandedMonthKey(null);
      setExpandedExpenseId(null);
  };

  const monthDetailModal = expandedMonthKey ? (
      <div className="fixed inset-0 z-[1200] flex items-end justify-center">
          <button
              type="button"
              onClick={closeExpandedMonth}
              className="absolute inset-0 bg-black/60 z-0"
              aria-label="Fechar fatura"
          />
          <div className="relative w-full max-w-7xl px-4 sm:px-6 pb-6 z-10">
              <div className="relative bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div>
                      <p className="text-sm font-semibold">Fatura de {expandedMonthLabel}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Total: R$ {expandedMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  </div>
                  <button
                      type="button"
                      onClick={closeExpandedMonth}
                      className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar fatura"
                  >
                      <X size={16} />
                  </button>
              </div>
              <div className="pt-3 flex-1 overflow-auto">
                  <div className="space-y-3">
                      {expandedMonthExpenses.map((exp, index) => {
                          const isSelected = selectedExpenseIds.includes(exp.id);
                          const isLocked = Boolean(exp.locked);
                          const isRowExpanded = expandedExpenseId === exp.id;
                          const rowBg = index % 2 === 0 ? 'bg-rose-500/10' : 'bg-transparent';

                          return (
                              <div key={exp.id} className="space-y-3">
                                  <div className={`py-2 rounded-md ${rowBg}`}>
                                      <button
                                          type="button"
                                          onClick={() => {
                                              if (!isLocked) {
                                                  toggleSelection(exp.id);
                                                  setExpandedExpenseId(isRowExpanded ? null : exp.id);
                                              }
                                          }}
                                          className="w-full flex items-center justify-between gap-3 text-left"
                                          disabled={isLocked}
                                      >
                                          <div className="flex items-center gap-2 min-w-0">
                                              <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleSelection(exp.id)}
                                                  onClick={(event) => event.stopPropagation()}
                                                  disabled={isLocked}
                                                  className="h-4 w-4"
                                                  style={{ accentColor: selectedCardColor }}
                                                  aria-label={`Selecionar fatura ${exp.description}`}
                                              />
                                              <span className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                  {exp.description}
                                              </span>
                                          </div>
                                          <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-rose-600 dark:text-rose-400'}`}>
                                              R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                      </button>
                                  </div>

                                  {isRowExpanded && (
                                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
                                          <div className="flex items-center justify-between mb-3">
                                              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Detalhes</span>
                                              <button
                                                  type="button"
                                                  onClick={() => setExpandedExpenseId(null)}
                                                  className="h-7 w-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
                                                  aria-label="Fechar detalhes"
                                              >
                                                  <X size={14} />
                                              </button>
                                          </div>
                                          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                                              <div>
                                                  <p className="text-[10px] uppercase tracking-wide">Lançamento</p>
                                                  <p className="text-sm text-zinc-900 dark:text-white">
                                                      {new Date(exp.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                  </p>
                                              </div>
                                              <div>
                                                  <p className="text-[10px] uppercase tracking-wide">Vencimento</p>
                                                  <p className="text-sm text-zinc-900 dark:text-white">
                                                      {new Date(exp.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                  </p>
                                              </div>
                                              <div>
                                                  <p className="text-[10px] uppercase tracking-wide">Categoria</p>
                                                  <p className="text-sm text-zinc-900 dark:text-white">{exp.category}</p>
                                              </div>
                                              {exp.installments && (
                                                  <div>
                                                      <p className="text-[10px] uppercase tracking-wide">Parcelas</p>
                                                      <p className="text-sm text-zinc-900 dark:text-white">
                                                          {exp.installmentNumber}/{exp.totalInstallments}
                                                      </p>
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                  </div>
              </div>
              </div>
          </div>
      </div>
  ) : null;

  const mainSection = (
      <main className={mainWrapperClass}>
          {cardManagementSection}
          {!isMobile && reconciliationBar}
          {invoiceListSection}
      </main>
  );

  const modals = (
      <>
          {monthDetailModal}
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
            source="view"
            variant="dock"
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
                        <button
                          onClick={closeEditModal}
                          aria-label="Fechar modal"
                          className="p-2 text-zinc-400 hover:text-zinc-200 rounded-full hover:bg-white/10"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <label htmlFor={editFieldId('description')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                          Descrição
                        </label>
                        <input
                            id={editFieldId('description')}
                            name="description"
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <label htmlFor={editFieldId('amount')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                              Valor (R$)
                            </label>
                            <input
                                id={editFieldId('amount')}
                                name="amount"
                                type="number"
                                value={editForm.amount}
                                onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                                className="w-full bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                            />
                        </div>
                        <div className="space-y-3">
                            <label htmlFor={editFieldId('category')} className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                              Categoria
                            </label>
                            <input
                                id={editFieldId('category')}
                                name="category"
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
          <MobileTransactionDrawer
              open={Boolean(drawerCard)}
              title={drawerCard?.name || ''}
              amount={
                  drawerCard && typeof drawerCard.limit === 'number' && drawerCard.limit > 0
                      ? `R$ ${formatCurrency(drawerCard.limit)}`
                      : undefined
              }
              details={
                  drawerCard
                      ? [
                            { label: 'Bandeira', value: drawerCard.brand || 'Cartão' },
                            { label: 'Fechamento', value: `Dia ${drawerCard.closingDay}` },
                            { label: 'Vencimento', value: `Dia ${drawerCard.dueDay}` },
                            {
                                label: 'Limite',
                                value:
                                    typeof drawerCard.limit === 'number' && drawerCard.limit > 0
                                        ? `R$ ${formatCurrency(drawerCard.limit)}`
                                        : 'Sem limite'
                            },
                            { label: 'Tag', value: <CardTag card={drawerCard} size="sm" /> }
                        ]
                      : []
              }
              onClose={() => setDrawerCard(null)}
              onEdit={
                  drawerCard
                      ? () => {
                            setDrawerCard(null);
                            handleEditCard(drawerCard);
                        }
                      : undefined
              }
              onDelete={
                  drawerCard
                      ? () => {
                            const target = drawerCard;
                            setDrawerCard(null);
                            handleDeleteCard(target.id);
                        }
                      : undefined
              }
          />
      </>
  );

  if (isMobile) {
      const payLabel =
          selectedExpenseIds.length > 0
              ? `Pagar R$ ${selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'Pagar fatura';
      const mobileHeader = (
          <div className="space-y-2">
              <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                  <button
                      type="button"
                      onClick={onBack}
                      className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                      aria-label="Voltar para o início"
                  >
                      <Home size={16} />
                  </button>
                  <div className="min-w-0 text-center">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Faturas</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {selectedCard?.name || 'Selecione um cartão'}
                      </p>
                  </div>
                  <div className="min-w-[32px]" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Selecionado</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                          R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Itens</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{selectedExpenseIds.length}</p>
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                  <button
                      onClick={handleOpenNewCard}
                      className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
                  >
                      Novo cartão
                  </button>
                  <button
                      onClick={() => setIsPayModalOpen(true)}
                      disabled={selectedExpenseIds.length === 0}
                      className={`w-full rounded-2xl text-white font-semibold py-2.5 text-sm shadow-lg transition ${
                          selectedExpenseIds.length > 0
                              ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-900/20'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed shadow-none'
                      }`}
                  >
                      {payLabel}
                  </button>
              </div>
          </div>
      );

      return (
          <>
              <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
                  <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
                      {headerFill.height > 0 && (
                          <div
                              className="fixed left-0 right-0 z-20 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl"
                              style={{ top: headerFill.top, height: headerFill.height }}
                          />
                      )}
                      <div
                          className="fixed left-0 right-0 z-30"
                          style={{ top: 'var(--mm-mobile-top, 0px)' }}
                      >
                          <div
                              ref={subHeaderRef}
                              className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#151517]/95 backdrop-blur-xl shadow-sm"
                          >
                              <div className="px-4 pb-3 pt-2">
                                  {mobileHeader}
                              </div>
                          </div>
                      </div>
                      <div
                          className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]"
                          style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 28 : undefined }}
                      >
                          <div className="space-y-4">
                              {cardSelectorSection}
                              {invoiceListSection}
                              {cardManagementSection}
                          </div>
                      </div>
                  </div>
              </div>
              {modals}
          </>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      {summarySection}
      {mainSection}
      {modals}
    </div>
  );
};

export default InvoicesView;
