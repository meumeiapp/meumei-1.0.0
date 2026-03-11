// ... existing imports ...
import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { CreditCard as CardIcon, Calendar, CheckSquare, Square, DollarSign, Wallet, AlertTriangle, Pencil, X, Plus, Trash2, Lock, History } from 'lucide-react';
import { Expense, CreditCard, Account } from '../types';
import PayInvoiceModal from './PayInvoiceModal';
import NewCreditCardModal from './NewCreditCardModal';
import {
  filterCardExpensesForInvoices,
  groupCardExpensesByInvoiceMonth,
  isCreditPaymentMethod,
  resolveExpenseCardId
} from '../services/invoiceUtils';
import CardTag from './CardTag';
import { getCardColor, withAlpha } from '../services/cardColorUtils';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import { categoryService } from '../services/categoryService';
import useIsMobile from '../hooks/useIsMobile';
import { getPrimaryActionLabel } from '../utils/formLabels';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import SelectDropdown from './common/SelectDropdown';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';

interface InvoicesViewProps {
  onBack: () => void;
  onOpenAudit?: () => void;
  expenses: Expense[];
  creditCards: CreditCard[];
  accounts: Account[];
  viewDate?: Date;
  onPayInvoice: (expenseIds: string[], sourceAccountId: string, totalAmount: number) => void;
  onReopenInvoice: (expenseIds: string[]) => void;
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
  onReopenInvoice,
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
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [isCardsModalOpen, setIsCardsModalOpen] = useState(false);
  const [isInvoiceMonthsSheetOpen, setIsInvoiceMonthsSheetOpen] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstSectionRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [topAdjust, setTopAdjust] = useState(0);

  useEffect(() => {
      console.info('[cards] view', { route: 'faturas' });
  }, []);

  useLayoutEffect(() => {
      const headerNode = subHeaderRef.current;
      const sectionNode = firstSectionRef.current;
      if (!headerNode || !sectionNode) return;

      const measureGap = () => {
          const headerBottom = headerNode.getBoundingClientRect().bottom;
          const sectionTop = sectionNode.getBoundingClientRect().top;
          const gap = Math.round(sectionTop - headerBottom);
          const desired = 0;
          setTopAdjust((prev) => {
              const nextAdjust = Math.max(0, gap - desired + prev);
              return prev === nextAdjust ? prev : nextAdjust;
          });
      };

      measureGap();
      window.addEventListener('resize', measureGap);
      return () => window.removeEventListener('resize', measureGap);
  }, [subHeaderHeight, topAdjust]);

  // Filter expenses: Must be Credit Card type, match selected card
  // Invoices need history (paid + pending), while payment selection only uses pending items.
  const cardExpensesAll = useMemo(
      () => filterCardExpensesForInvoices(expenses, selectedCardId, { includePaid: true }),
      [expenses, selectedCardId]
  );
  const pendingCardExpenses = useMemo(
      () => cardExpensesAll.filter(exp => exp.status === 'pending'),
      [cardExpensesAll]
  );

  // Group expenses by Due Month (Invoice Cycle)
  const groupedExpenses = useMemo(() => {
      const groups = groupCardExpensesByInvoiceMonth(cardExpensesAll);
      return Object.keys(groups).sort().reduce((obj, key) => {
          obj[key] = groups[key];
          return obj;
      }, {} as Record<string, Expense[]>);
  }, [cardExpensesAll]);

  const calendarYear = viewDate ? viewDate.getFullYear() : new Date().getFullYear();
  const allCardExpensesByMonth = useMemo(() => {
      const map = new Map<string, { total: number; cardIds: Set<string> }>();
      expenses.forEach(exp => {
          const expenseCardId = resolveExpenseCardId(exp as Expense & { creditCardId?: string });
          if (!expenseCardId || !isCreditPaymentMethod(exp.paymentMethod)) return;
          const date = new Date(exp.dueDate + 'T12:00:00');
          if (date.getFullYear() !== calendarYear) return;
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const entry = map.get(key) || { total: 0, cardIds: new Set<string>() };
          entry.total += exp.amount;
          entry.cardIds.add(expenseCardId);
          map.set(key, entry);
      });
      return map;
  }, [expenses, calendarYear]);

  const needsScroll = Boolean(expandedMonthKey);

  useEffect(() => {
      if (!isMobile) {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
          return;
      }
      const shouldLock = !needsScroll;
      document.documentElement.classList.toggle('lock-scroll', shouldLock);
      document.body.classList.toggle('lock-scroll', shouldLock);
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [isMobile, needsScroll]);

  useEffect(() => {
      if (Object.keys(groupedExpenses).length === 0) {
          setExpandedMonthKey(null);
      }
  }, [groupedExpenses]);

  // ... rest of logic ...
  // Calculation for Selected Items
  const selectedTotal = pendingCardExpenses
      .filter(exp => selectedExpenseIds.includes(exp.id))
      .reduce((sum, exp) => sum + exp.amount, 0);

  const selectedCard = safeCreditCards.find(c => c.id === selectedCardId);
  const selectedCardColor = selectedCard ? getCardColor(selectedCard) : '#6366f1';
  const editExpenseLabel = getPrimaryActionLabel('Despesa', true);
  const pendingByCardStats = useMemo(() => {
      const stats = new Map<string, { pendingTotal: number; pendingCount: number; openMonths: number }>();
      const monthsByCard = new Map<string, Set<string>>();

      safeCreditCards.forEach((card) => {
          stats.set(card.id, { pendingTotal: 0, pendingCount: 0, openMonths: 0 });
      });

      expenses.forEach((exp) => {
          const cardId = resolveExpenseCardId(exp as Expense & { creditCardId?: string });
          if (!cardId || !isCreditPaymentMethod(exp.paymentMethod) || exp.status !== 'pending') return;

          const base = stats.get(cardId) || { pendingTotal: 0, pendingCount: 0, openMonths: 0 };
          base.pendingTotal += exp.amount;
          base.pendingCount += 1;
          stats.set(cardId, base);

          const monthKey = typeof exp.dueDate === 'string' && exp.dueDate.length >= 7
              ? exp.dueDate.slice(0, 7)
              : new Date(exp.date + 'T12:00:00').toISOString().slice(0, 7);
          const monthSet = monthsByCard.get(cardId) || new Set<string>();
          monthSet.add(monthKey);
          monthsByCard.set(cardId, monthSet);
      });

      monthsByCard.forEach((months, cardId) => {
          const base = stats.get(cardId) || { pendingTotal: 0, pendingCount: 0, openMonths: 0 };
          base.openMonths = months.size;
          stats.set(cardId, base);
      });

      return stats;
  }, [expenses, safeCreditCards]);
  const pendingSelectableIdsByCard = useMemo(() => {
      const map = new Map<string, string[]>();
      safeCreditCards.forEach((card) => map.set(card.id, []));

      expenses.forEach((exp) => {
          const cardId = resolveExpenseCardId(exp as Expense & { creditCardId?: string });
          if (!cardId || !isCreditPaymentMethod(exp.paymentMethod)) return;
          if (exp.status !== 'pending' || exp.locked) return;
          const current = map.get(cardId) || [];
          current.push(exp.id);
          map.set(cardId, current);
      });

      return map;
  }, [expenses, safeCreditCards]);
  const groupedPendingExpenses = useMemo(() => {
      const groups = groupCardExpensesByInvoiceMonth(pendingCardExpenses);
      return Object.keys(groups).sort().reduce((obj, key) => {
          obj[key] = groups[key];
          return obj;
      }, {} as Record<string, Expense[]>);
  }, [pendingCardExpenses]);

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
          setIsInvoiceMonthsSheetOpen(false);
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
      if (!isMobile || typeof window === 'undefined') return;
      const handleDockClick = () => {
          setDrawerCard(null);
          setIsPayModalOpen(false);
          setIsEditModalOpen(false);
          setIsCardModalOpen(false);
          setIsInvoiceMonthsSheetOpen(false);
          setExpandedMonthKey(null);
      };
      window.addEventListener('mm:mobile-dock-click', handleDockClick);
      return () => window.removeEventListener('mm:mobile-dock-click', handleDockClick);
  }, [isMobile]);

  // Handlers
  const toggleSelection = (id: string) => {
      const target = pendingCardExpenses.find(exp => exp.id === id);
      if (target?.locked) return;
      setSelectedExpenseIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleSelectMonth = (monthKey: string) => {
      const monthExpenses = groupedExpenses[monthKey] || [];
      if (monthExpenses.length === 0) return;
      const idsInMonth = monthExpenses
          .filter(e => e.status === 'pending' && !e.locked)
          .map(e => e.id);
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
      onPayInvoice(selectedExpenseIds, accountId, selectedTotal, paymentDate);
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
  const mobileCardRadius = isMobile ? 'rounded-xl' : 'rounded-2xl';
  const mobileCardRadiusSm = isMobile ? 'rounded-xl' : 'rounded-xl';
  const mobileRowRadius = isMobile ? 'rounded-xl' : 'rounded-md';

  const mainWrapperClass = isMobile
    ? 'space-y-6'
    : 'w-full px-4 sm:px-6 space-y-6 mt-[var(--mm-content-gap)] flex-1 min-h-0';
  const editFieldId = (suffix: string) =>
    `invoice-edit-${editingExpense?.id || 'current'}-${suffix}`;
  const openInvoicesForCard = (cardId: string) => {
      const isCardSwitch = cardId !== selectedCardId;
      setSelectedCardId(cardId);
      if (isCardSwitch) setSelectedExpenseIds([]);
      setExpandedMonthKey(null);
      setExpandedExpenseId(null);
      setIsInvoiceMonthsSheetOpen(true);
  };

  const cardSelectorSection = isMobile ? (
      <div className="space-y-3">
          <div className="px-4 pt-2">
              <div
                  id="card-highlight-bar"
                  className={`rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 ${
                      highlightedCardId === selectedCardId ? 'ring-2 ring-indigo-400/70 shadow-indigo-500/20' : ''
                  }`}
              >
                  <div className="flex items-center justify-between gap-2">
                      <span>Toque em um cartão para abrir as faturas em aberto por mês.</span>
                      <span className="font-semibold">{safeCreditCards.length} cartões</span>
                  </div>
              </div>
          </div>
          {safeCreditCards.length === 0 ? (
              <div className="px-4">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                      Nenhum cartão cadastrado.
                  </div>
              </div>
          ) : (
              <div className="px-4 grid grid-cols-2 gap-2">
                  {safeCreditCards.map((card) => {
                      const cardColor = getCardColor(card);
                      const stats = pendingByCardStats.get(card.id) || { pendingTotal: 0, pendingCount: 0, openMonths: 0 };
                      const selectableIds = pendingSelectableIdsByCard.get(card.id) || [];
                      const hasSelectable = selectableIds.length > 0;
                      const isCardActive = card.id === selectedCardId;
                      const isCardFullySelected =
                          isCardActive && hasSelectable && selectableIds.every((id) => selectedExpenseIds.includes(id));
                      const isCardPartiallySelected =
                          isCardActive &&
                          selectableIds.some((id) => selectedExpenseIds.includes(id)) &&
                          !isCardFullySelected;
                      const isExpanded = isInvoiceMonthsSheetOpen && selectedCardId === card.id;
                      const limitLabel =
                          typeof card.limit === 'number' && card.limit > 0
                              ? `R$ ${formatCurrency(card.limit)}`
                              : 'Sem limite';
                      return (
                          <div key={card.id} className="min-w-0">
                              <div
                                  className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
                                      isExpanded
                                          ? 'border-indigo-400/70 shadow-[0_10px_24px_rgba(99,102,241,0.2)]'
                                          : 'border-zinc-200/80 dark:border-zinc-800/70'
                                  }`}
                                  style={{
                                      background: `linear-gradient(160deg, ${withAlpha(cardColor, 0.24)} 0%, ${withAlpha(cardColor, 0.1)} 54%, ${withAlpha('#09090b', 0.78)} 100%)`,
                                      boxShadow: isExpanded ? undefined : `0 8px 20px ${withAlpha(cardColor, 0.15)}`
                                  }}
                              >
                                  <div className="pointer-events-none absolute right-2 bottom-1 z-0 text-white/15">
                                      <CardIcon size={44} strokeWidth={1.5} />
                                  </div>
                                  <div className="absolute right-2 top-2 z-20">
                                      <input
                                          type="checkbox"
                                          checked={isCardFullySelected}
                                          ref={(node) => {
                                              if (node) node.indeterminate = isCardPartiallySelected;
                                          }}
                                          onChange={() => {
                                              setSelectedCardId(card.id);
                                              setExpandedMonthKey(null);
                                              setExpandedExpenseId(null);
                                              setSelectedExpenseIds(isCardFullySelected ? [] : selectableIds);
                                          }}
                                          onClick={(event) => event.stopPropagation()}
                                          disabled={!hasSelectable}
                                          className="h-4 w-4 accent-indigo-500"
                                          aria-label={`Selecionar faturas pendentes do cartão ${card.name}`}
                                      />
                                  </div>
                                  <button
                                      type="button"
                                      onClick={() => openInvoicesForCard(card.id)}
                                      className="relative z-10 w-full px-3 py-3 text-left"
                                      aria-label={`Abrir faturas do cartão ${card.name}`}
                                  >
                                      <p className="pr-7 text-sm font-semibold truncate text-zinc-100">
                                          {card.name}
                                      </p>
                                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">Em aberto</p>
                                      <p className={`mt-1 text-lg font-bold ${stats.pendingTotal > 0 ? 'text-rose-300' : 'text-zinc-300'}`}>
                                          R$ {stats.pendingTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </p>
                                      <div className="mt-2 flex items-center gap-1.5">
                                          <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 truncate max-w-[88px]">
                                              {card.brand || 'Cartão'}
                                          </span>
                                          <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                                              {stats.openMonths} meses
                                          </span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-zinc-300/80 truncate">Limite: {limitLabel}</p>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>
  ) : null;

  const cardListContent = (
      <>
          {safeCreditCards.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-400 px-2 py-2">
                  Nenhum cartão cadastrado.
              </div>
          ) : (
              <div className="space-y-1">
                  {safeCreditCards.map((card) => {
                      const limitLabel =
                          typeof card.limit === 'number' && card.limit > 0
                              ? `R$ ${formatCurrency(card.limit)}`
                              : 'Sem limite';
                      const cardColor = getCardColor(card);
                      return (
                          <button
                              key={card.id}
                              type="button"
                              onClick={() => {
                                  setIsCardsModalOpen(false);
                                  handleEditCard(card);
                              }}
                              className={`w-full px-3 py-1.5 flex items-center justify-between gap-3 text-left ${mobileRowRadius} border transition`}
                              style={{
                                  backgroundColor: withAlpha(cardColor, 0.12),
                                  borderColor: withAlpha(cardColor, 0.25)
                              }}
                          >
                              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {card.name}
                              </span>
                              <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                                  {limitLabel}
                              </span>
                          </button>
                      );
                  })}
              </div>
          )}
      </>
  );

  const headerSection = (
      <div className={headerWrapperClass}>
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />

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
                  <div className={`${mobileCardRadiusSm} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2`}>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Selecionado</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                          R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  </div>
                  <div className={`${mobileCardRadiusSm} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2`}>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Itens</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                          {selectedExpenseIds.length}
                      </p>
                  </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                  {onOpenAudit && (
                      <button
                          onClick={onOpenAudit}
                          className={`mm-btn-base mm-btn-secondary ${mobileCardRadiusSm} min-w-[168px] px-6`}
                          title="Auditoria do dia"
                      >
                          <History size={14} />
                          Auditoria
                      </button>
                  )}
                  <button
                      onClick={() => setIsPayModalOpen(true)}
                      disabled={selectedExpenseIds.length === 0}
                      className={`mm-btn-base ${mobileCardRadius} min-w-[152px] px-5 ${
                        selectedExpenseIds.length > 0 ? 'mm-btn-primary mm-btn-primary-rose' : 'mm-btn-secondary'
                      }`}
                  >
                      Pagar Fatura
                  </button>
                  {!isMobile && (
                      <button
                          onClick={handleOpenNewCard}
                          data-tour-anchor="cards-new"
                          className="mm-btn-base mm-btn-primary mm-btn-primary-rose min-w-[220px] px-8"
                      >
                          Novo Cartão
                      </button>
                  )}
              </div>
          </div>
      </div>
  );

  const summarySection = isMobile ? headerSection : (
      <div className="w-full px-4 sm:px-6 relative z-10 pt-6">
        <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {headerSection}
          </div>
      </div>
  );

  const cardManagementSection = (
      <section className={`bg-white dark:bg-[#151517] ${mobileCardRadius} border border-zinc-200 dark:border-zinc-800 p-3 shadow-sm`}>
          <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className={`${isMobile ? 'text-sm' : 'text-sm'} font-semibold text-zinc-900 dark:text-white`}>Cartões de Crédito</h2>
          </div>

          {safeCreditCards.length === 0 ? (
              <div className={`bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-100 dark:border-zinc-800 ${mobileCardRadiusSm} flex flex-col items-center justify-center py-4 gap-2`}>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Nenhum cartão ativo</span>
                  {!isMobile && (
                      <button
                          onClick={handleOpenNewCard}
                          data-tour-anchor="cards-new"
                          className="mm-btn-base mm-btn-primary mm-btn-primary-rose px-4 text-xs"
                      >
                          Novo Cartão
                      </button>
                  )}
              </div>
          ) : (
              <div className="space-y-1">
                  {safeCreditCards.map((card, index) => {
                      const limitLabel =
                          typeof card.limit === 'number' && card.limit > 0
                              ? `R$ ${formatCurrency(card.limit)}`
                              : 'Sem limite';
                      const rowBg = index % 2 === 0 ? 'bg-white/5 dark:bg-white/5' : 'bg-transparent';
                      const isActive = card.id === selectedCardId;
                      return (
                          <div key={card.id}>
                              {isMobile ? (
                                  <div
                                      className={`px-3 py-1.5 ${mobileRowRadius}`}
                                      style={{ backgroundColor: withAlpha(getCardColor(card), 0.12) }}
                                  >
                                      <button
                                          type="button"
                                          onClick={() => setDrawerCard(card)}
                                          className="w-full flex items-center justify-between gap-3 text-left"
                                      >
                                  <p className={`${isMobile ? 'text-sm' : 'text-sm'} font-semibold text-zinc-900 dark:text-zinc-100 truncate`}>
                                      {card.name}
                                  </p>
                                  <span className={`${isMobile ? 'text-sm' : 'text-sm'} font-semibold shrink-0 ${card.limit ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>
                                      {limitLabel}
                                  </span>
                                      </button>
                                  </div>
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
              </div>
          )}
      </section>
  );

  const reconciliationBar = null;

  const monthCards = Array.from({ length: 12 }).map((_, index) => {
      const monthKey = `${calendarYear}-${String(index + 1).padStart(2, '0')}`;
      const monthExpenses = groupedExpenses[monthKey] || [];
      const totalMonth = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
      const selectableExpenses = monthExpenses.filter(exp => exp.status === 'pending' && !exp.locked);
      const isPaid = monthExpenses.length > 0 && monthExpenses.every(exp => exp.status === 'paid');
      const allSelected = selectableExpenses.length > 0 && selectableExpenses.every(e => selectedExpenseIds.includes(e.id));
      const partialSelected = selectableExpenses.some(e => selectedExpenseIds.includes(e.id)) && !allSelected;
      const isDisabled = monthExpenses.length === 0;
      const monthName = new Date(calendarYear, index, 1).toLocaleDateString('pt-BR', { month: 'long' });
      const cardTheme = selectedCardColor || '#6366f1';
      const cardName = selectedCard?.name || 'Cartão';
      const cardBrand = selectedCard?.brand || 'Cartão';

      if (isMobile && Math.abs(totalMonth) < 0.01) {
          return null;
      }

      return (
          <div
              key={monthKey}
              className={`${mobileCardRadius} border shadow-sm transition ${isDisabled ? 'opacity-70' : ''}`}
              style={{
                  background: withAlpha(cardTheme, isDisabled ? 0.08 : 0.18),
                  borderColor: withAlpha(cardTheme, 0.35)
              }}
          >
              {isMobile ? (
                  <button
                      type="button"
                      onClick={() => setExpandedMonthKey(monthKey)}
                      disabled={isDisabled}
                      className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left"
                  >
                      <div className="min-w-0 flex items-center gap-3">
                          <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold text-zinc-900 dark:text-white ${isPaid ? 'line-through text-emerald-200/80' : ''}`}>
                                  R$ {totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              {isPaid && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Pago</span>
                              )}
                          </div>
                          <span className="text-sm uppercase tracking-wide text-zinc-700 dark:text-white/70">
                              {monthName}
                          </span>
                      </div>
                      <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleSelectMonth(monthKey)}
                          disabled={selectableExpenses.length === 0}
                          className="h-4 w-4 shrink-0"
                          style={{ accentColor: 'var(--mm-view-accent)' as any }}
                          aria-label={`Selecionar faturas de ${monthName}`}
                      />
                  </button>
              ) : (
                  <>
                      <div className="flex items-center justify-between px-3 pt-3">
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
                          className="mt-3 w-full text-left px-3 pb-3"
                      >
                          <div className="flex items-center gap-2">
                              <p className={`text-lg font-semibold text-zinc-900 dark:text-white ${isPaid ? 'line-through text-emerald-200/80' : ''}`}>
                                  R$ {totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              {isPaid && (
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Pago</span>
                              )}
                          </div>
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
                  </>
              )}
          </div>
      );
  });
  const hasMonthCards = monthCards.some(Boolean);

  const invoiceListSection = (
      <>
          {hasMonthCards ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {monthCards}
              </div>
          ) : (
              isMobile ? (
                  <div className={`${mobileCardRadius} border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2.5 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400`}>
                      <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                          <CardIcon size={16} />
                      </div>
                      <div className="min-w-0">
                          {selectedCardId ? (
                              <>
                                  <p className="text-zinc-900 dark:text-white font-semibold text-sm">Tudo em dia!</p>
                                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                      Sem despesas pendentes para o cartão selecionado.
                                  </p>
                              </>
                          ) : (
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
  const mobileOpenMonthCards = Object.keys(groupedPendingExpenses).map((monthKey) => {
      const monthExpenses = groupedPendingExpenses[monthKey] || [];
      if (monthExpenses.length === 0) return null;
      const totalMonth = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
      const idsInMonth = monthExpenses.filter(exp => !exp.locked).map(exp => exp.id);
      const allSelected = idsInMonth.length > 0 && idsInMonth.every(id => selectedExpenseIds.includes(id));
      const partialSelected = idsInMonth.some(id => selectedExpenseIds.includes(id)) && !allSelected;
      const monthName = formatMonthKey(monthKey);

      return (
          <button
              key={monthKey}
              type="button"
              onClick={() => setExpandedMonthKey(monthKey)}
              className="w-full rounded-xl border px-3 py-2 text-left transition"
              style={{
                  backgroundColor: withAlpha(selectedCardColor, 0.2),
                  borderColor: withAlpha(selectedCardColor, 0.35)
              }}
          >
              <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                          {monthName}
                      </p>
                      <p className="text-[11px] text-white/70">
                          {partialSelected ? 'Parcial selecionado' : `${monthExpenses.length} lançamentos pendentes`}
                      </p>
                  </div>
                  <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => {
                          event.stopPropagation();
                          toggleSelectMonth(monthKey);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 shrink-0"
                      style={{ accentColor: selectedCardColor }}
                      aria-label={`Selecionar faturas de ${monthName}`}
                  />
              </div>
              <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/60">Total em aberto</span>
                  <span className="text-sm font-bold text-rose-300">
                      R$ {totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
              </div>
          </button>
      );
  });
  const hasMobileOpenMonthCards = mobileOpenMonthCards.some(Boolean);
  const invoiceMonthsSheet = isMobile && isInvoiceMonthsSheetOpen ? (
      <div className="fixed inset-0 z-[1150]">
          <button
              type="button"
              onClick={() => setIsInvoiceMonthsSheetOpen(false)}
              className="absolute inset-0 bg-black/70"
              aria-label="Fechar meses em aberto"
          />
          <div
              className="absolute left-0 right-0 rounded-t-3xl border border-white/10 bg-[#0b0b10] text-white shadow-2xl flex flex-col"
              style={{
                  bottom: 'var(--mm-mobile-dock-height, 68px)',
                  maxHeight: 'min(72vh, 560px)'
              }}
          >
              <div className="px-3 pt-2 pb-2 border-b border-white/10">
                  <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{selectedCard?.name || 'Faturas em aberto'}</p>
                          <p className="text-xs text-white/70">
                              {selectedCard?.brand || 'Cartão'} • {hasMobileOpenMonthCards ? 'Meses em aberto' : 'Sem pendências'}
                          </p>
                      </div>
                      <button
                          type="button"
                          onClick={() => setIsInvoiceMonthsSheetOpen(false)}
                          className="h-8 w-8 rounded-full bg-white/10 text-white/80 hover:text-white flex items-center justify-center"
                          aria-label="Fechar meses em aberto"
                      >
                          <X size={16} />
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-auto px-3 pt-2 pb-4">
                  {hasMobileOpenMonthCards ? (
                      <div className="space-y-2">
                          {mobileOpenMonthCards}
                      </div>
                  ) : (
                      <div className="rounded-xl border border-dashed border-white/20 px-3 py-3 text-sm text-white/70">
                          Sem faturas em aberto para este cartão.
                      </div>
                  )}
              </div>
              <div className="border-t border-white/10 px-3 py-2">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-white/70">
                      <span>{selectedExpenseIds.length} selecionados</span>
                      <span>
                          Total: R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                  </div>
                  <button
                      type="button"
                      onClick={() => {
                          if (selectedExpenseIds.length === 0) return;
                          setIsInvoiceMonthsSheetOpen(false);
                          setIsPayModalOpen(true);
                      }}
                      disabled={selectedExpenseIds.length === 0}
                      className={`w-full rounded-xl border py-3 text-sm font-semibold transition ${
                          selectedExpenseIds.length > 0
                              ? 'border-rose-500/40 bg-rose-600 text-white hover:bg-rose-500'
                              : 'border-white/15 bg-white/5 text-white/40 cursor-not-allowed'
                      }`}
                  >
                      {selectedExpenseIds.length > 0
                          ? `Pagar R$ ${selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : 'Selecione faturas para pagar'}
                  </button>
              </div>
          </div>
      </div>
  ) : null;

  const expandedMonthExpenses = expandedMonthKey ? groupedExpenses[expandedMonthKey] || [] : [];
  const expandedMonthTotal = expandedMonthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const expandedMonthLabel = expandedMonthKey ? formatMonthKey(expandedMonthKey) : '';
  const expandedMonthIsPaid = expandedMonthExpenses.length > 0 && expandedMonthExpenses.every(exp => exp.status === 'paid');
  const expandedMonthPaidIds = expandedMonthExpenses.filter(exp => exp.status === 'paid').map(exp => exp.id);

  const closeExpandedMonth = () => {
      setExpandedMonthKey(null);
      setExpandedExpenseId(null);
  };

  const handleReopenInvoice = () => {
      if (!expandedMonthKey || expandedMonthPaidIds.length === 0) return;
      onReopenInvoice(expandedMonthPaidIds);
      setSelectedExpenseIds(prev => prev.filter(id => !expandedMonthPaidIds.includes(id)));
  };

  const monthDetailModal = expandedMonthKey ? (
      isMobile ? (
          <div className="fixed inset-0 z-[1200]">
              {(() => {
                  const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
                  return (
                      <>
                          <button
                              type="button"
                              onClick={closeExpandedMonth}
                              className="absolute left-0 right-0 top-0 bg-black/70"
                              style={{ bottom: dockOffset }}
                              aria-label="Fechar fatura"
                          />
                          <div
                              className="absolute left-0 right-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
                              style={{ top: 0, bottom: dockOffset }}
                          >
                              <div className="px-3 pt-2 pb-2 bg-[#0b0b10] border-b border-white/10">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                          <p className="text-sm font-semibold text-white truncate">Fatura de {expandedMonthLabel}</p>
                                          <p className="text-xs text-white/70">
                                              Total: R$ {expandedMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </p>
                                          {expandedMonthIsPaid && (
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300 mt-1">Pagamento confirmado</p>
                                          )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                          {expandedMonthIsPaid && (
                                              <button
                                                  type="button"
                                                  onClick={handleReopenInvoice}
                                                  className="h-8 px-3 rounded-none bg-amber-500/20 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 transition"
                                              >
                                                  Reabrir fatura
                                              </button>
                                          )}
                                          <button
                                              type="button"
                                              onClick={closeExpandedMonth}
                                              className="h-8 w-8 rounded-none bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                                              aria-label="Fechar fatura"
                                          >
                                              <X size={16} />
                                          </button>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex-1 overflow-auto px-3 pt-2 pb-6">
                                  <div className="space-y-3">
                                      {expandedMonthExpenses.map((exp, index) => {
                                          const isSelected = selectedExpenseIds.includes(exp.id);
                                          const isLocked = Boolean(exp.locked);
                                          const isPaid = exp.status === 'paid';
                                          const isSelectable = !isLocked && !isPaid;
                                          const isRowExpanded = expandedExpenseId === exp.id;
                                          const rowBg = index % 2 === 0 ? 'bg-rose-500/10' : 'bg-transparent';

                                          return (
                                              <div key={exp.id} className="space-y-3">
                                                  <div className={`py-2 ${rowBg}`}>
                                                      <button
                                                          type="button"
                                                          onClick={() => {
                                                              if (isSelectable) {
                                                                  toggleSelection(exp.id);
                                                                  setExpandedExpenseId(isRowExpanded ? null : exp.id);
                                                              }
                                                          }}
                                                          className="w-full flex items-center justify-between gap-3 text-left"
                                                          disabled={!isSelectable}
                                                      >
                                                          <div className="flex items-center gap-2 min-w-0">
                                                              <input
                                                                  type="checkbox"
                                                                  checked={isSelected}
                                                                  onChange={() => toggleSelection(exp.id)}
                                                                  onClick={(event) => event.stopPropagation()}
                                                                  disabled={!isSelectable}
                                                                  className="h-4 w-4"
                                                                  style={{ accentColor: selectedCardColor }}
                                                                  aria-label={`Selecionar fatura ${exp.description}`}
                                                              />
                                                              <span className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-100'}`}>
                                                                  {exp.description}
                                                              </span>
                                                              <span className={`text-[10px] uppercase tracking-wide ${isPaid ? 'text-emerald-300' : 'text-amber-300'}`}>
                                                                  {isPaid ? 'Pago' : 'Pendente'}
                                                              </span>
                                                          </div>
                                                          <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-rose-400'}`}>
                                                              R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                          </span>
                                                      </button>
                                                  </div>

                                                  {isRowExpanded && (
                                                      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
                                                          <div className="flex items-center justify-between mb-3">
                                                              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Detalhes</span>
                                                              <button
                                                                  type="button"
                                                                  onClick={() => setExpandedExpenseId(null)}
                                                                  className="h-7 w-7 rounded-none border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
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
                      </>
                  );
              })()}
          </div>
      ) : (
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
                          {expandedMonthIsPaid && (
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500 mt-1">Pagamento confirmado</p>
                          )}
                      </div>
                      <div className="flex items-center gap-2">
                          {expandedMonthIsPaid && (
                              <button
                                  type="button"
                                  onClick={handleReopenInvoice}
                                  className="h-8 px-3 rounded-full bg-amber-500/20 text-amber-500 text-[11px] font-semibold hover:bg-amber-500/30 transition"
                              >
                                  Reabrir fatura
                              </button>
                          )}
                          <button
                              type="button"
                              onClick={closeExpandedMonth}
                              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                              aria-label="Fechar fatura"
                          >
                              <X size={16} />
                          </button>
                      </div>
                  </div>
                  <div className="pt-3 flex-1 overflow-auto">
                      <div className="space-y-3">
                          {expandedMonthExpenses.map((exp, index) => {
                              const isSelected = selectedExpenseIds.includes(exp.id);
                              const isLocked = Boolean(exp.locked);
                              const isPaid = exp.status === 'paid';
                              const isSelectable = !isLocked && !isPaid;
                              const isRowExpanded = expandedExpenseId === exp.id;
                              const rowBg = index % 2 === 0 ? 'bg-rose-500/10' : 'bg-transparent';

                              return (
                                  <div key={exp.id} className="space-y-3">
                                      <div className={`py-2 rounded-md ${rowBg}`}>
                                          <button
                                              type="button"
                                              onClick={() => {
                                                  if (isSelectable) {
                                                      toggleSelection(exp.id);
                                                      setExpandedExpenseId(isRowExpanded ? null : exp.id);
                                                  }
                                              }}
                                              className="w-full flex items-center justify-between gap-3 text-left"
                                              disabled={!isSelectable}
                                          >
                                              <div className="flex items-center gap-2 min-w-0">
                                                  <input
                                                      type="checkbox"
                                                      checked={isSelected}
                                                      onChange={() => toggleSelection(exp.id)}
                                                      onClick={(event) => event.stopPropagation()}
                                                      disabled={!isSelectable}
                                                      className="h-4 w-4"
                                                      style={{ accentColor: selectedCardColor }}
                                                      aria-label={`Selecionar fatura ${exp.description}`}
                                                  />
                                                  <span className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                      {exp.description}
                                                  </span>
                                                  <span className={`text-[10px] uppercase tracking-wide ${isPaid ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                      {isPaid ? 'Pago' : 'Pendente'}
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
      )
  ) : null;

  const mainSection = (
      <main className={mainWrapperClass}>
          {cardManagementSection}
          {!isMobile && reconciliationBar}
          {invoiceListSection}
      </main>
  );

  const cardsModal = isMobile && isCardsModalOpen ? (
      <div className="fixed inset-0 z-[1200]">
          {(() => {
              const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
              return (
                  <>
                      <button
                          type="button"
                          onClick={() => setIsCardsModalOpen(false)}
                          className="absolute left-0 right-0 top-0 bg-black/70"
                          style={{ bottom: dockOffset }}
                          aria-label="Fechar cartões cadastrados"
                      />
                      <div
                          className="absolute left-0 right-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
                          style={{ top: 0, bottom: dockOffset }}
                      >
                          <div className="px-3 pt-2 pb-2 bg-[#0b0b10] border-b border-white/10">
                              <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                      <p className="text-sm font-semibold text-white truncate">Cartões cadastrados</p>
                                      <p className="text-xs text-white/70">Selecione o cartão que deseja usar.</p>
                                  </div>
                                  <button
                                      type="button"
                                      onClick={() => setIsCardsModalOpen(false)}
                                      className="h-8 w-8 rounded-none bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                                      aria-label="Fechar cartões cadastrados"
                                  >
                                      <X size={16} />
                                  </button>
                              </div>
                          </div>
                          <div className="flex-1 overflow-auto px-3 pt-2 pb-6">
                              {cardListContent}
                          </div>
                      </div>
                  </>
              );
          })()}
      </div>
  ) : null;

  const modals = (
      <>
          {monthDetailModal}
          {cardsModal}
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
          <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable mm-mobile-header-stable-tight">
              <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                  <div className="h-8 w-8" aria-hidden="true" />
                  <div className="min-w-0 text-center">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Faturas</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {selectedCard?.name || 'Selecione um cartão'}
                      </p>
                  </div>
                  <div className="min-w-[32px]" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                  <div className={`${mobileCardRadiusSm} mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2 text-center flex flex-col items-center justify-center`}>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Selecionado</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                          R$ {selectedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                  </div>
                  <div className={`${mobileCardRadiusSm} mm-mobile-header-card border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2 text-center flex flex-col items-center justify-center`}>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Itens</p>
                      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{selectedExpenseIds.length}</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                  <button
                      type="button"
                      onClick={handleOpenNewCard}
                      className="w-full rounded-xl mm-mobile-primary-cta text-white font-semibold py-2.5 text-sm shadow-lg transition active:scale-[0.98]"
                      style={{
                          borderColor: 'var(--mm-view-accent)',
                          backgroundColor: 'var(--mm-view-accent)',
                          boxShadow: '0 10px 20px color-mix(in oklab, var(--mm-view-accent) 25%, transparent)'
                      }}
                  >
                      Novo cartão
                  </button>
              </div>
          </div>
      );

      return (
          <>
              <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
                  <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
                      {headerFill.height > 0 && (
                          <div
                              className="fixed left-0 right-0 z-20 bg-white dark:bg-[#151517] backdrop-blur-xl"
                              style={{ top: headerFill.top, height: headerFill.height }}
                          />
                      )}
                      <div
                          className="fixed left-0 right-0 z-30"
                          style={{ top: 'var(--mm-mobile-top, 0px)' }}
                      >
                          <div
                              ref={subHeaderRef}
                              className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
                          >
                              <div className="mm-mobile-subheader-pad mm-mobile-subheader-pad-tight">
                                  {mobileHeader}
                              </div>
                          </div>
                      </div>
                      <div
                      className="h-full overflow-y-auto px-0 pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px)+72px)]"
                      style={{
                          paddingTop: subHeaderHeight
                                  ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px - ${topAdjust}px)`
                                  : 'calc(var(--mm-mobile-top, 0px))'
                      }}
                  >
                          <div className="space-y-0">
                              <div ref={firstSectionRef}>
                                {cardSelectorSection && (
                                    <MobileFullWidthSection contentClassName="px-0 pt-0 pb-0">
                                        {cardSelectorSection}
                                    </MobileFullWidthSection>
                                )}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
              {invoiceMonthsSheet}
              <div
                  className="fixed left-0 right-0 z-40"
                  style={{ bottom: 'var(--mm-mobile-dock-height, 68px)' }}
              >
                  <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0">
                      <div className="grid grid-cols-2 gap-2">
                          <button
                              onClick={() => setIsCardsModalOpen(true)}
                              className="rounded-xl border border-rose-400/50 bg-rose-950/30 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-900/40 transition"
                          >
                              Editar Cartões
                          </button>
                          <button
                              onClick={() => setIsPayModalOpen(true)}
                              disabled={selectedExpenseIds.length === 0}
                              className={`rounded-xl border border-rose-500/40 py-3 text-sm font-semibold transition ${
                                  selectedExpenseIds.length > 0
                                      ? 'bg-rose-600 text-white hover:bg-rose-500'
                                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                              }`}
                          >
                              {payLabel}
                          </button>
                      </div>
                  </div>
              </div>
              {modals}
          </>
      );
  }

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 flex flex-col">
      {summarySection}
      {mainSection}
      {modals}
    </div>
  );
};

export default InvoicesView;
