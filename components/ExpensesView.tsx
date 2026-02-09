
import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Trash2, X, AlertTriangle, CheckSquare, Square, CheckCircle2, Circle, Lock, Home, History, ChevronDown } from 'lucide-react';
import { withAlpha } from '../services/cardColorUtils';
import { Expense, Account, CreditCard, ExpenseType, ExpenseTypeOption } from '../types';
import NewExpenseModal from './NewExpenseModal';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import MobileEmptyState from './mobile/MobileEmptyState';
import MobilePageShell from './mobile/MobilePageShell';
import { buildInstallmentDescription, getExpenseInstallmentSeries, normalizeInstallmentDescription } from '../utils/installmentSeries';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';
import { expenseStatusLabel, normalizeExpenseStatus } from '../utils/statusUtils';
import { DEFAULT_EXPENSE_TYPES } from '../constants';
import SelectDropdown from './common/SelectDropdown';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';

interface ExpensesViewProps {
  onBack: () => void;
  expenses: Expense[];
  onUpdateExpenses: (expenses: Expense[]) => void;
  onDeleteExpense: (id: string) => void;
  onOpenAudit?: () => void;
  accounts: Account[];
  onUpdateAccounts?: (accounts: Account[]) => void;
  creditCards: CreditCard[];
  viewDate: Date;
  title: string;
  subtitle: string;
  expenseType: ExpenseType;
  mobileScope?: ExpenseType | 'all';
  themeColor: 'indigo' | 'amber' | 'cyan' | 'pink'; 
  expenseTypeOptions?: ExpenseTypeOption[];
  onUpdateExpenseTypes?: (next: ExpenseTypeOption[]) => void;
  categories: string[];
  userId?: string | null;
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  onResetCategories: () => Promise<void> | void;
  minDate: string;
}

const ExpensesView: React.FC<ExpensesViewProps> = ({ 
  onBack, 
  expenses, 
  onUpdateExpenses, 
  onDeleteExpense,
  onOpenAudit,
  accounts,
  onUpdateAccounts,
  creditCards,
  viewDate,
  title,
  expenseType,
  mobileScope,
  themeColor,
  expenseTypeOptions,
  onUpdateExpenseTypes,
  categories,
  userId,
  onAddCategory,
  onRemoveCategory,
  onResetCategories,
  minDate
}) => {
  const chunkItems = <T,>(items: T[], size: number): T[][] => {
      if (size <= 0) return [items];
      const result: T[][] = [];
      for (let i = 0; i < items.length; i += size) {
          result.push(items.slice(i, i + size));
      }
      return result;
  };
  const [inlineNewOpen, setInlineNewOpen] = useState(false);
  const [inlineEditExpenseId, setInlineEditExpenseId] = useState<string | null>(null);
  
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const [mobileScreen, setMobileScreen] = useState<'list' | 'form'>('list');
  const [drawerExpense, setDrawerExpense] = useState<Expense | null>(null);
  const [mobilePageIndex, setMobilePageIndex] = useState(0);
  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
  const submitRef = useRef<(() => void) | null>(null);
  const headerLayoutLoggedRef = useRef(false);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [mobileExpenseType, setMobileExpenseType] = useState<ExpenseType | null>(expenseType);
  const canAdjustAccount = (account?: Account | null) => Boolean(account && !account.locked);
  const resolvedTypeOptions = (expenseTypeOptions && expenseTypeOptions.length > 0)
    ? expenseTypeOptions
    : DEFAULT_EXPENSE_TYPES;
  const typeMetaById = new Map(resolvedTypeOptions.map(option => [option.id, option]));
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [typeDrafts, setTypeDrafts] = useState<ExpenseTypeOption[]>([]);
  const [typeError, setTypeError] = useState('');
  const isSingleTypeManager = !isMobile && expenseType && expenseType !== 'all';

  useEffect(() => {
      if (highlightTarget && highlightTarget.entity === 'expense' && highlightTarget.subtype === expenseType) {
          const targetId = highlightTarget.id;
          setHighlightedId(targetId);
          requestAnimationFrame(() => {
              const element = document.getElementById(`expense-${targetId}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          const timer = setTimeout(() => {
              setHighlightedId(null);
              setHighlightTarget(null);
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [highlightTarget, expenseType, setHighlightTarget]);

  useEffect(() => {
      if (!isMobile) return;
      console.info('[mobile-ui] expenses', { screen: mobileScreen, type: expenseType });
  }, [isMobile, mobileScreen, expenseType]);

  useEffect(() => {
      if (!isMobile || headerLayoutLoggedRef.current) return;
      console.info('[layout][mobile-subheader] expenses in-flow', { type: expenseType });
      headerLayoutLoggedRef.current = true;
  }, [isMobile, expenseType]);

  useEffect(() => {
      if (!expenseTypeOptions || expenseTypeOptions.length === 0) return;
      if (mobileScope !== 'all') return;
      const current = mobileExpenseType;
      const enabled = current && expenseTypeOptions.some(option => option.id === current && option.enabled);
      if (!enabled) {
          const fallback = expenseTypeOptions.find(option => option.enabled)?.id || expenseTypeOptions[0]?.id;
          setMobileExpenseType(fallback || null);
      }
  }, [expenseTypeOptions, mobileScope, mobileExpenseType]);

  useEffect(() => {
      if (!isTypeManagerOpen) return;
      const nextDrafts = isSingleTypeManager
        ? resolvedTypeOptions
              .filter(option => option.id === expenseType)
              .map(option => ({ ...option, nature: '' }))
        : resolvedTypeOptions.map(option => ({ ...option, nature: '' }));
      setTypeDrafts(nextDrafts);
      setTypeError('');
  }, [isTypeManagerOpen, resolvedTypeOptions, isSingleTypeManager, expenseType]);

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

  const effectiveMobileScope = isMobile ? (mobileScope || expenseType) : expenseType;

  // Filter expenses by Type AND Date
  const filteredExpenses = expenses.filter(exp => {
      const targetDate = new Date(exp.dueDate + 'T12:00:00'); // Safe date parsing
      const matchesType = effectiveMobileScope === 'all' ? true : exp.type === effectiveMobileScope;
      return matchesType && 
             targetDate.getMonth() === viewDate.getMonth() && 
             targetDate.getFullYear() === viewDate.getFullYear();
  });
  const selectableExpenses = filteredExpenses.filter(exp => !exp.locked);

  const totalAmount = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const totalPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
  const EXPENSE_COLLAPSE_LIMIT = 10;
  const visibleExpenses = filteredExpenses;
  const expenseDesktopNeedsScroll = isCompactHeight || filteredExpenses.length > EXPENSE_COLLAPSE_LIMIT;
  const isListViewSafe = isMobile ? mobileScreen === 'list' : true;
  const allowPageScroll = isMobile ? false : expenseDesktopNeedsScroll;
  const MOBILE_PAGE_SIZE = 8;
  const mobilePages = chunkItems(visibleExpenses, MOBILE_PAGE_SIZE);
  const hasMobilePages = mobilePages.length > 1;
  useEffect(() => {
      const shouldLock = !allowPageScroll;
      document.documentElement.classList.toggle('lock-scroll', shouldLock);
      document.body.classList.toggle('lock-scroll', shouldLock);
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [allowPageScroll]);

  // --- SELECTION CALCULATIONS ---
  const selectedExpenses = filteredExpenses.filter(e => selectedIds.includes(e.id));
  const selectedTotalAmount = selectedExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const selectedPaidTotal = selectedExpenses.filter(e => e.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
  const hasSelection = selectedIds.length > 0;
  const headerCount = hasSelection ? selectedExpenses.length : filteredExpenses.length;
  const headerTotal = hasSelection ? selectedTotalAmount : totalAmount;
  const headerPaid = hasSelection ? selectedPaidTotal : totalPaid;

  // Helper for colors based on theme
  const getThemeClasses = () => {
      switch(themeColor) {
          case 'amber': return { btn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-900/20', text: 'text-amber-600', light: 'bg-amber-50 text-amber-700' };
          case 'cyan': return { btn: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-900/20', text: 'text-cyan-600', light: 'bg-cyan-50 text-cyan-700' };
          case 'pink': return { btn: 'bg-pink-600 hover:bg-pink-700 shadow-pink-900/20', text: 'text-pink-600', light: 'bg-pink-50 text-pink-700' };
          default: return { btn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-900/20', text: 'text-indigo-600', light: 'bg-indigo-50 text-indigo-700' };
      }
  };
  const theme = getThemeClasses();
  const expenseAccentColor = (expenseType && typeMetaById.get(expenseType)?.color) || '#ef4444';
  const themeGradient =
      themeColor === 'amber'
          ? 'from-amber-500/80 via-amber-500/35 to-black'
          : themeColor === 'cyan'
            ? 'from-cyan-500/80 via-cyan-500/35 to-black'
            : themeColor === 'pink'
              ? 'from-pink-500/80 via-pink-500/35 to-black'
              : 'from-indigo-500/80 via-indigo-500/35 to-black';

  const getSingularTitle = () => {
      switch(expenseType) {
          case 'fixed': return 'Despesa Fixa';
          case 'personal': return 'Despesa Pessoal';
          case 'variable': return 'Despesa Variável';
          default: return 'Despesa';
      }
  }

  const toggleSelection = (id: string) => {
      const target = expenses.find(exp => exp.id === id);
      if (target?.locked) return;
      setSelectedIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleSelectAll = () => {
      const selectableIds = selectableExpenses.map(exp => exp.id);
      if (selectedIds.length === selectableIds.length && selectableIds.length > 0) {
          setSelectedIds([]);
      } else {
          setSelectedIds(selectableIds);
      }
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const applyExpenseAccountAdjustments = (
      previous: Expense | null,
      next: Expense | null,
      baseAccounts: Account[] = accounts
  ) => {
      const newAccounts = [...baseAccounts];
      let accountsChanged = false;

      if (previous && previous.status === 'paid' && previous.accountId) {
          const accIdx = newAccounts.findIndex(a => a.id === previous.accountId);
          if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
              const mutationId = `expense:revert:${previous.id}:${previous.accountId}:${previous.amount}:${previous.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'expenses_view',
                  action: 'revert_paid',
                  accountId: previous.accountId,
                  entityId: previous.id,
                  amount: previous.amount,
                  status: previous.status
              });
              if (shouldApply) {
                  newAccounts[accIdx].currentBalance += previous.amount;
                  accountsChanged = true;
              }
          }
      }

      if (next && next.status === 'paid' && next.accountId) {
          const accIdx = newAccounts.findIndex(a => a.id === next.accountId);
          if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
              const mutationId = `expense:apply:${next.id}:${next.accountId}:${next.amount}:${next.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'expenses_view',
                  action: 'apply_paid',
                  accountId: next.accountId,
                  entityId: next.id,
                  amount: next.amount,
                  status: next.status
              });
              if (shouldApply) {
                  newAccounts[accIdx].currentBalance -= next.amount;
                  accountsChanged = true;
              }
          }
      }

      return { accounts: newAccounts, accountsChanged };
  };

  const closeExpenseModal = () => {
      setInlineNewOpen(false);
      setInlineEditExpenseId(null);
      setEditingExpense(null);
  };

  const handleSaveExpense = (expenseData: any) => {
      let updatedList;
      let newItems: Expense[] = [];
      let applyNewTransactionImpact = true;

      if (Array.isArray(expenseData)) {
          newItems = expenseData.map((e: any) => ({
              ...e,
              type: e.type || expenseType, 
              id: e.id || Math.random().toString(36).substr(2, 9)
          }));
          updatedList = [...expenses, ...newItems];
      } else {
          const { applyScope, ...payload } = expenseData || {};
          const isEditing = payload.id && expenses.some(e => e.id === payload.id);
          
          if (isEditing) {
              const previousExpense = expenses.find(e => e.id === payload.id) || null;
              const updatedExpense: Expense = { ...(previousExpense as Expense), ...payload, type: (payload.type || previousExpense?.type || expenseType) };
              let seriesUpdated = false;

              if (applyScope === 'series' && previousExpense?.installments) {
                  const seriesResult = getExpenseInstallmentSeries(expenses, previousExpense);
                  const currentNumber = previousExpense.installmentNumber ?? 0;
                  const targetItems = seriesResult.items.filter(item => (item.installmentNumber ?? 0) >= currentNumber);
                  if (targetItems.length > 0) {
                      const baseDescription = normalizeInstallmentDescription(updatedExpense.description);
                      const groupId =
                          previousExpense.installmentGroupId ||
                          `group-${Math.random().toString(36).substr(2, 9)}`;

                      const updatedSeries = targetItems.map(item => ({
                          ...item,
                          ...payload,
                          id: item.id,
                          description: buildInstallmentDescription(baseDescription, item.installmentNumber, item.totalInstallments),
                          installmentGroupId: groupId,
                          installmentNumber: item.installmentNumber,
                          totalInstallments: item.totalInstallments,
                          installments: true
                      }));

                      updatedList = expenses.map(e => {
                          const seriesMatch = updatedSeries.find(s => s.id === e.id);
                          return seriesMatch || e;
                      });
                      seriesUpdated = true;
                  }
              }

              if (!seriesUpdated) {
                  updatedList = expenses.map(e => (e.id === payload.id ? updatedExpense : e));
              }

              if (onUpdateAccounts) {
                  const { accounts: newAccounts, accountsChanged } = applyExpenseAccountAdjustments(
                      previousExpense,
                      updatedExpense
                  );
                  if (accountsChanged) onUpdateAccounts(newAccounts);
              }
          } else {
              const newExpense: Expense = {
                  ...payload,
                  id: payload.id || generateId(),
                  type: payload.type || expenseType,
                  date: payload.date || new Date().toISOString().split('T')[0],
                  status: payload.status || 'pending'
              };
              newItems = [newExpense];
              updatedList = [...expenses, newExpense];

              if (onUpdateAccounts && newExpense.status === 'paid' && newExpense.accountId) {
                  const { accounts: newAccounts, accountsChanged } = applyExpenseAccountAdjustments(null, newExpense);
                  if (accountsChanged) onUpdateAccounts(newAccounts);
              }
          }
      }

      onUpdateExpenses(updatedList);
      closeExpenseModal();
  };

  const handleEditExpense = (expense: Expense) => {
      if (expense.locked) return;
      setEditingExpense(expense);
      setInlineEditExpenseId(expense.id);
      setInlineNewOpen(false);
  };

  const requestDelete = (expense: Expense) => {
      if (expense.locked) return;
      setExpenseToDelete(expense);
  };

  const confirmDelete = () => {
      if (!expenseToDelete) return;

      if (onUpdateAccounts && expenseToDelete.status === 'paid' && expenseToDelete.accountId) {
          const { accounts: newAccounts, accountsChanged } = applyExpenseAccountAdjustments(expenseToDelete, null);
          if (accountsChanged) onUpdateAccounts(newAccounts);
      }

      onDeleteExpense(expenseToDelete.id);
      setExpenseToDelete(null);
      setDrawerExpense(null);
  };

  const handleBulkDeleteConfirm = () => {
      const toDelete = filteredExpenses.filter(e => selectedIds.includes(e.id));
      let currentAccounts = [...accounts];
      let anyAccountChanged = false;

      toDelete.forEach(exp => {
          if (exp.status === 'paid' && exp.accountId) {
              const { accounts: nextAccounts, accountsChanged } = applyExpenseAccountAdjustments(
                  exp,
                  null,
                  currentAccounts
              );
              if (accountsChanged) {
                  currentAccounts = nextAccounts;
                  anyAccountChanged = true;
              }
          }
          onDeleteExpense(exp.id);
      });

      if (anyAccountChanged && onUpdateAccounts) {
          onUpdateAccounts(currentAccounts);
      }

      setSelectedIds([]);
      setIsBulkDeleteModalOpen(false);
  };

  const handleBulkStatusChange = (newStatus: 'paid' | 'pending') => {
      const toUpdate = filteredExpenses.filter(e => selectedIds.includes(e.id) && e.status !== newStatus);
      if (toUpdate.length === 0) {
          setSelectedIds([]);
          return;
      }

      let currentExpenses = [...expenses];
      let currentAccounts = [...accounts];
      let anyAccountChanged = false;

      toUpdate.forEach(exp => {
          const updatedExp = { ...exp, status: newStatus };
          currentExpenses = currentExpenses.map(e => (e.id === exp.id ? updatedExp : e));

          if (onUpdateAccounts) {
              const { accounts: nextAccounts, accountsChanged } = applyExpenseAccountAdjustments(
                  exp,
                  updatedExp,
                  currentAccounts
              );
              if (accountsChanged) {
                  currentAccounts = nextAccounts;
                  anyAccountChanged = true;
              }
          }
      });

      onUpdateExpenses(currentExpenses);
      if (anyAccountChanged && onUpdateAccounts) {
          onUpdateAccounts(currentAccounts);
      }
      setSelectedIds([]);
  };

  const handleNew = () => {
      if (isMobile) {
          setEditingExpense(null);
          if (effectiveMobileScope === 'all') {
              setMobileExpenseType(null);
          }
          setMobileScreen('form');
          console.info('[mobile-ui] expenses', { screen: 'form', action: 'new', type: expenseType });
          return;
      }
      setInlineNewOpen(true);
      setInlineEditExpenseId(null);
      setEditingExpense(null);
  };

  const getSourceInfo = (expense: Expense) => {
      if (expense.creditCardId) {
          const card = creditCards.find(c => c.id === expense.creditCardId);
          return { name: card?.name || 'Cartão', icon: <ShoppingCart size={14} style={{ color: expenseAccentColor }} /> };
      }
      const account = accounts.find(a => a.id === expense.accountId);
      return { name: account?.name || 'Conta', icon: <ShoppingCart size={14} style={{ color: expenseAccentColor }} /> };
  };

  const getExpenseStatusMeta = (expense: Expense) => {
      const normalized = normalizeExpenseStatus(expense.status);
      const label = expenseStatusLabel(expense.status);
      const className =
          normalized === 'paid'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      return { statusLabel: label, statusClassName: className };
  };

  const buildExpenseDetails = (expense: Expense) => {
      const { statusLabel, statusClassName } = getExpenseStatusMeta(expense);
      const inferredNature = expense.taxStatus || typeMetaById.get(expense.type)?.nature || '-';
      return [
          {
              label: 'Status',
              value: (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassName}`}>
                      {statusLabel}
                  </span>
              )
          },
          {
              label: 'Lançamento',
              value: new Date(expense.date + 'T12:00:00').toLocaleDateString('pt-BR')
          },
          {
              label: 'Vencimento',
              value: new Date(expense.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
          },
          {
              label: 'Natureza',
              value: inferredNature
          },
          {
              label: 'Categoria',
              value: expense.category || '-'
          },
          {
              label: 'Conta/Cartão',
              value: getSourceInfo(expense).name
          },
          expense.paymentMethod ? { label: 'Forma', value: expense.paymentMethod } : null,
          expense.installments
              ? {
                    label: 'Parcela',
                    value: `${expense.installmentNumber}/${expense.totalInstallments}`
                }
              : null,
          expense.createdBy ? { label: 'Lançado por', value: expense.createdBy } : null,
          expense.notes ? { label: 'Observações', value: expense.notes } : null
      ].filter(Boolean) as { label: string; value: React.ReactNode }[];
  };

  const handleMobileBack = () => {
      if (mobileScreen === 'form') {
          setMobileScreen('list');
          setEditingExpense(null);
          console.info('[mobile-ui] expenses', { screen: 'list', action: 'back', type: expenseType });
          return;
      }
      onBack();
  };

  const openDrawer = (expense: Expense) => {
      if (isMobile) {
          setDrawerExpense(expense);
          console.info('[mobile-ui] expenses', { screen: 'drawer', action: 'open', id: expense.id, type: expenseType });
          return;
      }
      setDrawerExpense(prev => (prev?.id === expense.id ? null : expense));
  };

  const closeDrawer = () => {
      setDrawerExpense(null);
      console.info('[mobile-ui] expenses', { screen: 'drawer', action: 'close', type: expenseType });
  };

  useEffect(() => {
      if (!drawerExpense) {
          setInlineEditExpenseId(null);
          return;
      }
      if (inlineEditExpenseId && inlineEditExpenseId !== drawerExpense.id) {
          setInlineEditExpenseId(null);
      }
  }, [drawerExpense, inlineEditExpenseId]);

  useEffect(() => {
      if (inlineNewOpen) {
          setInlineEditExpenseId(null);
      }
  }, [inlineNewOpen]);

  if (isMobile) {
      const listSubtitle = `${filteredExpenses.length} despesas`;
      const handleMobileFormClose = () => {
          setMobileScreen('list');
          setEditingExpense(null);
          console.info('[mobile-ui] expenses', { screen: 'list', action: 'close', type: expenseType });
      };
      const drawerStatus = drawerExpense ? normalizeExpenseStatus(drawerExpense.status) : 'pending';
      const drawerStatusLabel = drawerExpense ? expenseStatusLabel(drawerExpense.status) : '';
      const drawerStatusClass =
          drawerStatus === 'paid'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';

      const drawerDetails = drawerExpense
          ? [
                {
                    label: 'Status',
                    value: drawerStatusLabel
                },
                {
                    label: 'Lançamento',
                    value: new Date(drawerExpense.date + 'T12:00:00').toLocaleDateString('pt-BR')
                },
                {
                    label: 'Vencimento',
                    value: new Date(drawerExpense.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
                },
                {
                    label: 'Categoria',
                    value: drawerExpense.category || '-'
                },
                {
                    label: 'Conta/Cartão',
                    value: getSourceInfo(drawerExpense).name
                },
                drawerExpense.paymentMethod ? { label: 'Forma', value: drawerExpense.paymentMethod } : null,
                drawerExpense.taxStatus ? { label: 'Natureza', value: drawerExpense.taxStatus } : null,
                drawerExpense.installments
                    ? {
                          label: 'Parcela',
                          value: `${drawerExpense.installmentNumber}/${drawerExpense.totalInstallments}`
                      }
                    : null,
                drawerExpense.createdBy ? { label: 'Lançado por', value: drawerExpense.createdBy } : null,
                drawerExpense.notes ? { label: 'Observações', value: drawerExpense.notes } : null
            ].filter(Boolean) as { label: string; value: React.ReactNode }[]
          : [];

      const isListView = mobileScreen === 'list';
      const headerTitle = isListView
          ? (effectiveMobileScope === 'all' ? 'Despesas' : title)
          : (editingExpense ? 'Editar Despesa' : 'Nova Despesa');

      const mobileHeader = (
          <div className="space-y-2">
              <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                  <button
                      type="button"
                      onClick={handleMobileBack}
                      className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                      aria-label="Voltar para o início"
                  >
                      <Home size={16} />
                  </button>
                  <div className="min-w-0 text-center">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{headerTitle}</p>
                      {isListView && (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
                      )}
                  </div>
                  <div className="min-w-[32px]" />
              </div>

              {isListView && (
                  <>
                      <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Registros</p>
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{headerCount}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</p>
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                                  R$ {headerTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Pago</p>
                              <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  R$ {headerPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                      </div>

                      <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                          {onOpenAudit && (
                              <button
                                  onClick={onOpenAudit}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-700 transition"
                                  title="Auditoria do dia"
                              >
                                  <History size={14} />
                                  Auditoria
                              </button>
                          )}
                          <button
                              onClick={handleNew}
                              className="w-full rounded-2xl text-white font-semibold py-2.5 text-sm shadow-lg hover:brightness-110 transition"
                              style={{ backgroundColor: expenseAccentColor, boxShadow: `0 12px 24px ${withAlpha(expenseAccentColor, 0.25)}` }}
                          >
                              Nova Despesa
                          </button>
                      </div>
                  </>
              )}
          </div>
      );

      return (
          <>
              <div className="fixed inset-0 bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
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
                          className="h-full px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] overflow-hidden"
                          style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 64 : 64 }}
                      >
                          {isListView ? (
                              <div className="space-y-3">
                                  <div className="py-2">
                                      <button
                                          type="button"
                                          onClick={toggleSelectAll}
                                          disabled={selectableExpenses.length === 0}
                                          className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 disabled:opacity-50"
                                      >
                                          <span>{selectedIds.length === selectableExpenses.length && selectableExpenses.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                                          <span>{selectedIds.length} selecionados</span>
                                      </button>
                                  </div>
                                  {filteredExpenses.length > 0 ? (
                                      <div className="relative">
                                          <div
                                              ref={mobilePagerRef}
                                              className="flex gap-4 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide no-vertical-scroll"
                                              style={{ touchAction: 'pan-x', overscrollBehaviorY: 'contain' }}
                                              onScroll={(event) => {
                                                  const el = event.currentTarget;
                                                  const index = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                                                  setMobilePageIndex(index);
                                              }}
                                          >
                                              {mobilePages.map((page, pageIndex) => (
                                                  <div key={`page-${pageIndex}`} className="min-w-full snap-start space-y-2">
                                                      {page.map((expense, index) => {
                                          const isLocked = Boolean(expense.locked || expense.lockedReason === 'epoch_mismatch');
                                          const isSelected = selectedIds.includes(expense.id);
                                          const typeColor = typeMetaById.get(expense.type)?.color || '#ef4444';
                                          const rowBg = withAlpha(typeColor, 0.14);
                                          return (
                                              <div
                                                  key={expense.id}
                                                  id={`expense-${expense.id}`}
                                                  className="py-2 rounded-md"
                                                  style={{ backgroundColor: rowBg }}
                                              >
                                                  <button
                                                      type="button"
                                                      onClick={() => openDrawer(expense)}
                                                      className="w-full flex items-center justify-between gap-3 text-left"
                                                      disabled={isLocked}
                                                  >
                                                      <div className="flex items-center gap-2 min-w-0">
                                                          <input
                                                              type="checkbox"
                                                              checked={isSelected}
                                                              onChange={() => toggleSelection(expense.id)}
                                                              onClick={(event) => event.stopPropagation()}
                                                              disabled={isLocked}
                                                              className="h-4 w-4 accent-rose-500"
                                                              aria-label={`Selecionar despesa ${expense.description}`}
                                                          />
                                                          <span
                                                              className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
                                                              title={expense.description}
                                                          >
                                                              {expense.description}
                                                          </span>
                                                      </div>
                                                      <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-rose-600 dark:text-rose-400'}`}>
                                                          R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                      </span>
                                                  </button>
                                              </div>
                                          );
                                                      })}
                                                  </div>
                                              ))}
                                          </div>
                                          {hasMobilePages && (
                                              <div className="mt-2 flex items-center justify-end gap-2">
                                                  <span className="text-[10px] text-zinc-400">
                                                      {mobilePageIndex + 1}/{mobilePages.length}
                                                  </span>
                                                  <button
                                                      type="button"
                                                      onClick={() => {
                                                          const next = (mobilePageIndex + 1) % mobilePages.length;
                                                          const container = mobilePagerRef.current;
                                                          if (container) {
                                                              container.scrollTo({ left: container.clientWidth * next, behavior: 'smooth' });
                                                          }
                                                      }}
                                                      className="h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center"
                                                      aria-label="Próxima página"
                                                  >
                                                      <ChevronDown size={16} className="-rotate-90" />
                                                  </button>
                                              </div>
                                          )}
                                      </div>
                                  ) : (
                                      <MobileEmptyState
                                          icon={<ShoppingCart size={18} style={{ color: expenseAccentColor }} />}
                                          message="Nenhuma despesa encontrada para este mês."
                                      />
                                  )}
                              </div>
                          ) : (
                              <div className="fixed inset-0 z-[1200]">
                                  <button
                                      type="button"
                                      onClick={handleMobileFormClose}
                                      className="absolute inset-0 bg-black/70"
                                      aria-label="Fechar nova despesa"
                                  />
                                  <div
                                      className="absolute left-0 right-0 bottom-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
                                      style={{ top: 0 }}
                                  >
                                      <div className={`px-3 pt-2 pb-2 bg-gradient-to-r ${themeGradient}`}>
                                          <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                  <div className="flex items-center gap-2">
                                                      <ShoppingCart size={16} style={{ color: expenseAccentColor }} />
                                                      <p className="text-sm font-semibold text-white truncate">{headerTitle}</p>
                                                  </div>
                                                  <p className="text-[10px] text-white/70">Preencha os dados da despesa.</p>
                                              </div>
                                              <button
                                                  type="button"
                                                  onClick={handleMobileFormClose}
                                                  className="h-8 w-8 rounded-full bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                                                  aria-label="Fechar nova despesa"
                                              >
                                                  <X size={16} />
                                              </button>
                                          </div>
                                      </div>
                                      <div className="flex-1 overflow-hidden px-2 pt-1 pb-16">
                                          <NewExpenseModal
                                              isOpen
                                              variant="inline"
                                              hideFooter
                                              onPrimaryActionRef={(handler) => {
                                                  submitRef.current = handler;
                                              }}
                                              onClose={handleMobileFormClose}
                                              onSave={handleSaveExpense}
                                              initialData={editingExpense}
                                              accounts={accounts}
                                              creditCards={creditCards}
                                              categories={categories}
                                              userId={userId}
                                              categoryType="expenses"
                                              onAddCategory={onAddCategory}
                                              onRemoveCategory={onRemoveCategory}
                                              onResetCategories={onResetCategories}
                                              expenseType={effectiveMobileScope === 'all' ? mobileExpenseType : expenseType}
                                              allowTypeSelection={effectiveMobileScope === 'all'}
                                              requireTypeSelection={effectiveMobileScope === 'all'}
                                              onExpenseTypeChange={setMobileExpenseType}
                                              expenseTypeOptions={expenseTypeOptions}
                                              onUpdateExpenseTypes={onUpdateExpenseTypes}
                                              themeColor={
                                                  effectiveMobileScope === 'all'
                                                      ? mobileExpenseType === 'fixed'
                                                          ? 'amber'
                                                          : mobileExpenseType === 'personal'
                                                            ? 'cyan'
                                                            : 'pink'
                                                      : themeColor
                                              }
                                              defaultDate={viewDate}
                                              minDate={minDate}
                                          />
                                      </div>
                                      <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] grid grid-cols-2 gap-2">
                                          <button
                                              type="button"
                                              onClick={handleMobileFormClose}
                                              className="rounded-lg border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                                          >
                                              Cancelar
                                          </button>
                                          <button
                                              type="button"
                                              onClick={() => submitRef.current?.()}
                                              className={`rounded-lg py-2 text-xs font-semibold text-white transition ${theme.btn}`}
                                          >
                                              Salvar
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>

              <MobileTransactionDrawer
                  open={Boolean(drawerExpense)}
                  title={drawerExpense?.description || ''}
                  amount={
                      drawerExpense
                          ? `R$ ${drawerExpense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : undefined
                  }
                  statusLabel={drawerStatusLabel}
                  statusClassName={drawerStatusClass}
                  details={drawerDetails}
                  actionsDisabled={Boolean(drawerExpense?.locked)}
                  onClose={closeDrawer}
                  onEdit={
                      drawerExpense && !drawerExpense.locked
                          ? () => {
                                setEditingExpense(drawerExpense);
                                if (effectiveMobileScope === 'all') {
                                    setMobileExpenseType(drawerExpense.type);
                                }
                                setMobileScreen('form');
                                setDrawerExpense(null);
                                console.info('[mobile-ui] expenses', { screen: 'form', action: 'edit', id: drawerExpense.id, type: expenseType });
                            }
                          : undefined
                  }
                  onDelete={
                      drawerExpense && !drawerExpense.locked
                          ? () => {
                                requestDelete(drawerExpense);
                                setDrawerExpense(null);
                                console.info('[mobile-ui] expenses', { screen: 'drawer', action: 'delete', id: drawerExpense.id, type: expenseType });
                            }
                          : undefined
                  }
              />

              {expenseToDelete && (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                          <button 
                              onClick={() => setExpenseToDelete(null)}
                              aria-label="Fechar confirmação de exclusão"
                              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                          >
                              <X size={20} />
                          </button>

                          <div className="flex flex-col items-center text-center mb-6">
                              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                                  <Trash2 size={24} />
                              </div>
                              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir Despesa?</h3>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                  Você está prestes a excluir <strong>{expenseToDelete.description}</strong> no valor de <strong>R$ {expenseToDelete.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>.
                              </p>
                          </div>

                          {expenseToDelete.status === 'paid' && expenseToDelete.accountId && (
                              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                      Como esta despesa já foi marcada como <strong>Pago</strong>, o valor será debitado do saldo da conta vinculada.
                                  </p>
                              </div>
                          )}

                          <div className="flex gap-3">
                              <button 
                                  onClick={() => setExpenseToDelete(null)}
                                  className="flex-1 py-3 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm"
                              >
                                  Cancelar
                              </button>
                              <button 
                                  onClick={confirmDelete}
                                  className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20 transition-colors text-sm"
                              >
                                  Excluir
                              </button>
                          </div>
                      </div>
                  </div>
              )}
          </>
      );
  }

  const listSubtitle = `${filteredExpenses.length} despesas`;
  const allSelectableSelected =
      selectableExpenses.length > 0 && selectedIds.length === selectableExpenses.length;
  const handleTypeToggle = (id: ExpenseType, enabled: boolean) => {
      setTypeDrafts(prev => prev.map(option => option.id === id ? { ...option, enabled } : option));
  };
  const handleTypeLabelChange = (id: ExpenseType, label: string) => {
      setTypeDrafts(prev => prev.map(option => option.id === id ? { ...option, label } : option));
  };
  const handleTypeNatureChange = (id: ExpenseType, nature: 'PJ' | 'PF') => {
      setTypeDrafts(prev => prev.map(option => option.id === id ? { ...option, nature } : option));
  };
  const handleTypeColorChange = (id: ExpenseType, color: string) => {
      setTypeDrafts(prev => prev.map(option => option.id === id ? { ...option, color } : option));
  };
  const handleSaveTypes = () => {
      if (!onUpdateExpenseTypes) {
          setIsTypeManagerOpen(false);
          return;
      }
      const sanitized = typeDrafts.map(option => ({
          ...option,
          label: option.label.trim() || option.label,
          color: option.color?.trim() || PREMIUM_COLOR_PRESETS[0] || '#ef4444'
      }));
      if (!sanitized.some(option => option.enabled)) {
          setTypeError('Selecione pelo menos um tipo.');
          return;
      }
      if (sanitized.some(option => option.enabled && !option.nature)) {
          setTypeError('Selecione a natureza de todos os tipos.');
          return;
      }
      if (sanitized.some(option => !option.color)) {
          setTypeError('Selecione uma cor para todos os tipos.');
          return;
      }
      const nextTypes = isSingleTypeManager
        ? resolvedTypeOptions.map(option => {
            const updated = sanitized.find(item => item.id === option.id);
            return updated ? { ...option, ...updated } : option;
          })
        : sanitized;
      onUpdateExpenseTypes(nextTypes);
      setIsTypeManagerOpen(false);
  };
  const desktopHeader = (
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
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{title}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

                      <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Registros</p>
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{headerCount}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</p>
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                                  R$ {headerTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Pago</p>
                              <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  R$ {headerPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                      </div>

                      <div className={`grid ${onUpdateExpenseTypes ? 'grid-cols-3' : onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {onOpenAudit && (
                  <button
                      onClick={onOpenAudit}
                      className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition"
                      title="Auditoria do dia"
                  >
                      <History size={14} />
                      Auditoria
                  </button>
              )}
              {onUpdateExpenseTypes && (
                  <button
                      onClick={() => setIsTypeManagerOpen(true)}
                      className="flex items-center justify-center gap-2 rounded-xl border bg-white dark:bg-[#101014] py-2 text-xs font-semibold transition hover:opacity-90"
                      style={{ borderColor: expenseAccentColor, color: expenseAccentColor }}
                      title="Editar tipo de despesa"
                  >
                      <ChevronDown size={14} />
                      Editar
                  </button>
              )}
                  <button
                      onClick={handleNew}
                      className="w-full rounded-2xl text-white font-semibold py-2.5 text-sm shadow-lg hover:brightness-110 transition"
                      style={{ backgroundColor: expenseAccentColor, boxShadow: `0 12px 24px ${withAlpha(expenseAccentColor, 0.25)}` }}
                  >
                      Nova {getSingularTitle()}
                  </button>
          </div>
      </div>
  );

  const summarySection = (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 pt-6">
          <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {desktopHeader}
          </div>
      </div>
  );

  const typeManagerModal = isTypeManagerOpen ? (
      <div className="fixed inset-0 z-[1300]">
          <button
              type="button"
              onClick={() => setIsTypeManagerOpen(false)}
              className="absolute inset-0 bg-black/60"
              aria-label="Fechar tipos"
          />
          <div
              className={
                  isMobile
                      ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] flex flex-col'
                      : 'absolute left-1/2 bottom-6 w-full max-w-7xl -translate-x-1/2 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-5 max-h-[80vh] flex flex-col'
              }
          >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{isSingleTypeManager ? 'Editar tipo de despesa' : 'Tipos de despesa'}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Ative, desative e renomeie.</p>
                      <p className="text-[11px] text-amber-500 mt-1">
                        Ao renomear um tipo, todas as despesas já lançadas passarão a usar o novo nome.
                      </p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setIsTypeManagerOpen(false)}
                      className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar tipos"
                  >
                      <X size={16} />
                  </button>
              </div>
              <div className="pt-3 flex-1 overflow-hidden px-0.5 space-y-2">
                  {typeDrafts.map(option => (
                      <div key={option.id} className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-2 space-y-2">
                          <div className="flex items-center gap-2">
                              <input
                                  type="checkbox"
                                  checked={option.enabled}
                                  onChange={(event) => handleTypeToggle(option.id, event.target.checked)}
                                  className="h-3.5 w-3.5"
                                  style={{ accentColor: expenseAccentColor }}
                                  aria-label={`Ativar ${option.label}`}
                              />
                              <input
                                  type="text"
                                  value={option.label}
                                  onChange={(event) => handleTypeLabelChange(option.id, event.target.value)}
                                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 placeholder:uppercase placeholder:font-light placeholder:text-[10px]"
                                  style={{ ['--tw-ring-color' as any]: withAlpha(expenseAccentColor, 0.4) }}
                                  aria-label={`Nome do tipo ${option.label}`}
                              />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500">Natureza</label>
                                  <SelectDropdown
                                      value={option.nature}
                                      onChange={(value) => handleTypeNatureChange(option.id, value as 'PJ' | 'PF')}
                                      options={[
                                          { value: 'PJ', label: 'PJ' },
                                          { value: 'PF', label: 'PF' }
                                      ]}
                                      placeholder="Selecione"
                                      buttonClassName="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[11px] text-zinc-900 dark:text-white outline-none focus:ring-2"
                                      listClassName="max-h-40"
                                      placeholderClassName="text-[10px] font-light"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500">Cor da tag</label>
                                  <div className="grid grid-cols-6 gap-1">
                                      {PREMIUM_COLOR_PRESETS.slice(0, 18).map(color => (
                                          <button
                                              key={color}
                                              type="button"
                                              onClick={() => handleTypeColorChange(option.id, color)}
                                              className={`h-5 w-5 rounded-full border ${option.color === color ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.2)]' : 'border-white/20'}`}
                                              style={{ backgroundColor: color }}
                                              aria-label={`Selecionar cor ${color}`}
                                          />
                                      ))}
                                  </div>
                              </div>
                          </div>
                      </div>
                  ))}
                  {typeError && (
                      <p className="text-[11px] text-rose-500">{typeError}</p>
                  )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                      type="button"
                      onClick={() => setIsTypeManagerOpen(false)}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                  >
                      Cancelar
                  </button>
              <button
                  type="button"
                  onClick={handleSaveTypes}
                  className="rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white transition"
                  style={{ backgroundColor: expenseAccentColor }}
              >
                  Salvar
              </button>
              </div>
          </div>
      </div>
  ) : null;

  return (
      <div className={`min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 ${expenseDesktopNeedsScroll ? 'pb-20' : 'pb-6'} ${expenseDesktopNeedsScroll ? '' : 'overflow-hidden'}`}>
          {summarySection}
          {typeManagerModal}

          {selectedIds.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4 animate-in fade-in slide-in-from-top-2">
                  <div
                      className="text-white p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4"
                      style={{ backgroundColor: expenseAccentColor }}
                  >
                      <div className="flex items-center gap-4">
                          <span className="bg-white/20 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-2">
                              <CheckSquare size={16} /> {selectedIds.length} selecionados
                          </span>
                          <div className="h-6 w-px bg-white/20 hidden sm:block"></div>
                          <span className="text-sm font-medium">
                              Soma: <strong className="text-lg ml-1">R$ {selectedTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                          </span>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                              onClick={() => handleBulkStatusChange('paid')}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-bold transition-colors"
                          >
                              <CheckCircle2 size={14} /> Marcar Pagos
                          </button>
                          <button
                              onClick={() => handleBulkStatusChange('pending')}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                              <Circle size={14} /> Marcar Pendentes
                          </button>
                          <button
                              onClick={() => setIsBulkDeleteModalOpen(true)}
                              aria-label="Excluir selecionados"
                              className="flex-none p-1.5 bg-white/10 hover:bg-red-500 text-white rounded-lg transition-colors"
                              title="Excluir Selecionados"
                          >
                              <Trash2 size={16} />
                          </button>
                      </div>
                  </div>
              </div>
          )}

          <main className={`max-w-7xl mx-auto px-4 sm:px-6 pt-[var(--mm-content-gap)] animate-in fade-in slide-in-from-bottom-4 duration-500 ${expenseDesktopNeedsScroll ? 'pb-10' : 'pb-6'}`}>
              <div className="space-y-3">
                  {inlineNewOpen && (
                      <NewExpenseModal
                          isOpen
                          variant={isMobile ? 'inline' : 'dock'}
                          onClose={closeExpenseModal}
                          onSave={handleSaveExpense}
                          initialData={null}
                          accounts={accounts}
                          creditCards={creditCards}
                          categories={categories}
                          userId={userId}
                          categoryType="expenses"
                          onAddCategory={onAddCategory}
                          onRemoveCategory={onRemoveCategory}
                          onResetCategories={onResetCategories}
                          expenseType={expenseType}
                          expenseTypeOptions={expenseTypeOptions}
                          onUpdateExpenseTypes={onUpdateExpenseTypes}
                          themeColor={themeColor}
                          defaultDate={viewDate}
                          minDate={minDate}
                      />
                  )}

                  {filteredExpenses.length > 0 ? (
                      <>
                          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                              <button
                                  type="button"
                                  onClick={toggleSelectAll}
                                  disabled={selectableExpenses.length === 0}
                                  className="flex items-center gap-2 font-semibold disabled:opacity-50"
                              >
                                  {allSelectableSelected ? (
                                      <CheckSquare size={14} className="text-rose-600" />
                                  ) : (
                                      <Square size={14} />
                                  )}
                                  <span>{allSelectableSelected ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                              </button>
                              <span className="text-[11px]">{selectedIds.length} selecionados</span>
                          </div>

                          {visibleExpenses.map((expense, index) => {
                              const isSelected = selectedIds.includes(expense.id);
                              const isHighlighted = highlightedId === expense.id;
                              const lockedReason = expense.lockedReason;
                              const isLocked = Boolean(expense.locked || lockedReason === 'epoch_mismatch');
                              const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                              const { statusLabel, statusClassName } = getExpenseStatusMeta(expense);
                              const dueLabel = `Vence ${new Date(expense.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}`;
                              const source = getSourceInfo(expense);
                              const isExpanded = drawerExpense?.id === expense.id;
                              const isInlineEditing = inlineEditExpenseId === expense.id;
                              const details = isExpanded ? buildExpenseDetails(expense) : [];
                              const typeColor = typeMetaById.get(expense.type)?.color || '#ef4444';
                              const rowBg = withAlpha(typeColor, 0.14);

                              return (
                                  <div key={expense.id} id={`expense-${expense.id}`} className="space-y-3">
                                      <div className="py-2 rounded-md" style={{ backgroundColor: rowBg }}>
                                          <button
                                              type="button"
                                              onClick={() => openDrawer(expense)}
                                              className="w-full flex items-center justify-between gap-3 text-left"
                                              disabled={isLocked}
                                          >
                                              <div className="flex items-center gap-2 min-w-0">
                                                  <input
                                                      type="checkbox"
                                                      checked={isSelected}
                                                      onChange={() => toggleSelection(expense.id)}
                                                      onClick={(event) => event.stopPropagation()}
                                                      disabled={isLocked}
                                                      className="h-4 w-4 accent-rose-500"
                                                      aria-label={`Selecionar despesa ${expense.description}`}
                                                  />
                                                  <span
                                                      className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
                                                      title={expense.description}
                                                  >
                                                      {expense.description}
                                                  </span>
                                              </div>
                                              <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-rose-600 dark:text-rose-400'}`}>
                                                  R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                              </span>
                                          </button>
                                      </div>

                                      {isExpanded && (
                                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
                                              <div className="flex items-center justify-between">
                                                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">Detalhes</span>
                                                  <button
                                                      type="button"
                                                      onClick={() => setDrawerExpense(null)}
                                                      className="h-7 w-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
                                                      aria-label="Fechar detalhes"
                                                  >
                                                      <X size={14} className="mx-auto" />
                                                  </button>
                                              </div>
                                              <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                                                  {details.map(item => (
                                                      <div key={item.label} className="flex items-start justify-between gap-3">
                                                          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                                                              {item.label}
                                                          </span>
                                                          <span className="text-right">{item.value}</span>
                                                      </div>
                                                  ))}
                                              </div>
                                              {!isLocked && (
                                                  <div className="mt-4 flex flex-wrap gap-2">
                                                      <button
                                                          type="button"
                                                          onClick={() => handleEditExpense(expense)}
                                                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
                                                      >
                                                          Editar
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={() => requestDelete(expense)}
                                                          className="rounded-xl border border-rose-200 dark:border-rose-900/40 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition"
                                                      >
                                                          Excluir
                                                      </button>
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      {!isLocked && isInlineEditing && (
                                          <NewExpenseModal
                                              isOpen
                                              variant="inline"
                                              onClose={closeExpenseModal}
                                              onSave={handleSaveExpense}
                                              initialData={editingExpense ?? expense}
                                              accounts={accounts}
                                              creditCards={creditCards}
                                              categories={categories}
                                              userId={userId}
                                              categoryType="expenses"
                                              onAddCategory={onAddCategory}
                                              onRemoveCategory={onRemoveCategory}
                                              onResetCategories={onResetCategories}
                                              expenseType={expenseType}
                                              expenseTypeOptions={expenseTypeOptions}
                                              onUpdateExpenseTypes={onUpdateExpenseTypes}
                                              themeColor={themeColor}
                                              defaultDate={viewDate}
                                              minDate={minDate}
                                          />
                                      )}
                                  </div>
                              );
                          })}

                          
                      </>
                  ) : (
                      <MobileEmptyState
                          icon={<ShoppingCart size={18} style={{ color: expenseAccentColor }} />}
                          message="Nenhuma despesa encontrada para este mês."
                      />
                  )}
              </div>
          </main>

          {expenseToDelete && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                      <button 
                          onClick={() => setExpenseToDelete(null)}
                          aria-label="Fechar confirmação de exclusão"
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>

                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                              <Trash2 size={24} />
                          </div>
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir Despesa?</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Você está prestes a excluir <strong>{expenseToDelete.description}</strong> no valor de <strong>R$ {expenseToDelete.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>.
                          </p>
                      </div>

                      {expenseToDelete.status === 'paid' && expenseToDelete.accountId && (
                          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                  Como esta despesa já foi paga, o valor será <strong>estornado (devolvido)</strong> ao saldo da conta de origem.
                              </p>
                          </div>
                      )}

                      <div className="flex gap-3">
                          <button 
                              onClick={() => setExpenseToDelete(null)}
                              className="flex-1 py-3 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm"
                          >
                              Cancelar
                          </button>
                          <button 
                              onClick={confirmDelete}
                              className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20 transition-colors text-sm"
                          >
                              Sim, Excluir
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {isBulkDeleteModalOpen && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                      <button 
                          onClick={() => setIsBulkDeleteModalOpen(false)}
                          aria-label="Fechar exclusão em lote"
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>

                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                              <Trash2 size={24} />
                          </div>
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir {selectedIds.length} Itens?</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Total selecionado: <strong>R$ {selectedTotalAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>.
                          </p>
                      </div>

                      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                              Itens marcados como <strong>Pagos</strong> terão seus valores estornados (devolvidos) para as contas de origem.
                          </p>
                      </div>

                      <div className="flex gap-3">
                          <button 
                              onClick={() => setIsBulkDeleteModalOpen(false)}
                              className="flex-1 py-3 rounded-xl font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm"
                          >
                              Cancelar
                          </button>
                          <button 
                              onClick={handleBulkDeleteConfirm}
                              className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20 transition-colors text-sm"
                          >
                              Confirmar Exclusão
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>
  );
};

export default ExpensesView;
