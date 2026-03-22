
import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpCircle, Trash2, AlertTriangle, X, CheckSquare, Square, CheckCircle2, Circle, Lock, Home, ChevronDown, Pencil, SlidersHorizontal } from 'lucide-react';
import { Income, Account } from '../types';
import NewIncomeModal from './NewIncomeModal';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import MobileEmptyState from './mobile/MobileEmptyState';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import { buildInstallmentDescription, getIncomeInstallmentSeries, normalizeInstallmentDescription } from '../utils/installmentSeries';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';
import { incomeStatusLabel, normalizeIncomeStatus } from '../utils/statusUtils';
import {
  TOUR_SIMULATED_ACCOUNT_PREFIX,
  clearTourSimulatedAccounts,
  readTourSimulatedAccounts,
  upsertTourSimulatedAccount
} from '../services/tourSimulationService';
import {
  getIncomeFiscalNatureLabel,
  resolveIncomeFiscalNature,
  type IncomeFiscalNature
} from '../utils/incomeFiscalNature';

const TOUR_SIMULATED_INCOME_PREFIX = '__tour_sim_income__';
const isTourSimulatedIncomeId = (id: string) => id.startsWith(TOUR_SIMULATED_INCOME_PREFIX);
const isTourSimulatedAccountId = (id: string) => id.startsWith(TOUR_SIMULATED_ACCOUNT_PREFIX);

interface IncomesViewProps {
  onBack: () => void;
  incomes: Income[];
  autoOpenNew?: boolean;
  onAutoOpenHandled?: () => void;
  autoOpenEditId?: string | null;
  onAutoOpenEditHandled?: () => void;
  onUpdateIncomes: (incomes: Income[]) => void;
  onDeleteIncome: (id: string) => void;
  onOpenAudit?: () => void;
  accounts: Account[];
  onUpdateAccounts: (accounts: Account[]) => void;
  viewDate: Date;
  categories: string[];
  userId?: string | null;
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
  onResetCategories: () => Promise<void> | void;
  minDate: string;
}

type IncomeSortKey = 'description' | 'status' | 'date' | 'category' | 'account' | 'paymentMethod' | 'naturezaFiscal' | 'taxStatus' | 'amount';
type SortDirection = 'asc' | 'desc';

const IncomesView: React.FC<IncomesViewProps> = ({ 
  onBack, 
  incomes,
  autoOpenNew,
  onAutoOpenHandled,
  autoOpenEditId,
  onAutoOpenEditHandled,
  onUpdateIncomes, 
  onDeleteIncome,
  accounts,
  onUpdateAccounts,
  viewDate,
  categories,
  userId,
  onAddCategory,
  onRemoveCategory,
  onResetCategories,
  minDate,
  onOpenAudit
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
  const [inlineEditIncomeId, setInlineEditIncomeId] = useState<string | null>(null);
  
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [incomeToDelete, setIncomeToDelete] = useState<Income | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const submitRef = useRef<null | (() => void)>(null);
  const [mobileScreen, setMobileScreen] = useState<'list' | 'form'>('list');
  const [drawerIncome, setDrawerIncome] = useState<Income | null>(null);
  const [mobilePageIndex, setMobilePageIndex] = useState(0);
  const [tourSimulatedIncomes, setTourSimulatedIncomes] = useState<Income[]>([]);
  const [tourSimulatedAccounts, setTourSimulatedAccounts] = useState<Account[]>([]);
  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
  const headerLayoutLoggedRef = useRef(false);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false);
  const [desktopSearchTerm, setDesktopSearchTerm] = useState('');
  const [desktopStatusFilter, setDesktopStatusFilter] = useState<'all' | 'received' | 'pending'>('all');
  const [desktopAccountFilter, setDesktopAccountFilter] = useState<'all' | string>('all');
  const [desktopCategoryFilter, setDesktopCategoryFilter] = useState<'all' | string>('all');
  const [desktopSort, setDesktopSort] = useState<{ key: IncomeSortKey; direction: SortDirection } | null>(null);
  const canAdjustAccount = (account?: Account | null) => Boolean(account && !account.locked);
  const selectChangedAccounts = (baseAccounts: Account[], nextAccounts: Account[]) => {
      const baseById = new Map(baseAccounts.map(account => [account.id, account]));
      return nextAccounts.filter(account => {
          const previous = baseById.get(account.id);
          if (!previous) return true;
          const previousBalance = Number(previous.currentBalance || 0);
          const nextBalance = Number(account.currentBalance || 0);
          return Math.abs(previousBalance - nextBalance) > 0.009;
      });
  };

  useEffect(() => {
      if (typeof window === 'undefined') return;
      setTourSimulatedAccounts(readTourSimulatedAccounts());

      const handleTourIncomeSimulated = (event: Event) => {
          const detail = (event as CustomEvent<{ income?: Partial<Income> & { id?: string } }>).detail;
          const incomeData = detail?.income;
          if (!incomeData) return;

          const incomingId = incomeData.id ? String(incomeData.id) : '';
          const isEditingSimulated = Boolean(incomingId) && isTourSimulatedIncomeId(incomingId);
          const parsedAmount = Number(incomeData.amount);
          const normalizedAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
          const normalizedDate = (incomeData.date || new Date().toISOString().split('T')[0]).toString();
          const normalizedCompetenceDate = (incomeData.competenceDate || normalizedDate).toString();
          const normalizedStatus = incomeData.status === 'pending' ? 'pending' : 'received';
          const normalizedDescription = (incomeData.description || 'Entrada de teste').toString();
          const normalizedCategory = (incomeData.category || 'SEM CATEGORIA').toString();
          const normalizedAccountId = (incomeData.accountId || '').toString();
          if (!normalizedAccountId) return;

          const baseIncome: Income = {
              id: isEditingSimulated ? incomingId : `${TOUR_SIMULATED_INCOME_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
              description: normalizedDescription,
              amount: normalizedAmount,
              category: normalizedCategory,
              date: normalizedDate,
              competenceDate: normalizedCompetenceDate,
              accountId: normalizedAccountId,
              status: normalizedStatus,
              paymentMethod: incomeData.paymentMethod || '',
              notes: incomeData.notes || '',
              taxStatus: incomeData.taxStatus || '',
              naturezaFiscal: resolveIncomeFiscalNature({
                  naturezaFiscal: (incomeData as any).naturezaFiscal,
                  description: normalizedDescription,
                  category: normalizedCategory
              }),
              createdBy: incomeData.createdBy || ''
          };

          if (isEditingSimulated) {
              setTourSimulatedIncomes(prev => prev.map(item => (item.id === incomingId ? { ...item, ...baseIncome } : item)));
              return;
          }

          setTourSimulatedIncomes(prev => [baseIncome, ...prev]);
      };

      const handleTourAccountSimulated = (event: Event) => {
          const detail = (event as CustomEvent<{ account?: any }>).detail;
          const accountData = detail?.account;
          if (!accountData) return;

          const incomingId = accountData.id ? String(accountData.id) : '';
          const resolvedId =
              incomingId && isTourSimulatedAccountId(incomingId)
                  ? incomingId
                  : `${TOUR_SIMULATED_ACCOUNT_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
          const parsedInitial = Number(accountData.balance);
          const parsedCurrent = Number(accountData.currentBalance);
          const initialBalance = Number.isFinite(parsedInitial) ? parsedInitial : 0;
          const currentBalance = Number.isFinite(parsedCurrent) ? parsedCurrent : initialBalance;

          const simulatedAccount: Account = {
              id: resolvedId,
              name: (accountData.name || 'Conta de teste').toString(),
              type: (accountData.type || 'Conta').toString(),
              initialBalance,
              currentBalance,
              notes: accountData.notes ? String(accountData.notes) : '',
              color: accountData.color || '#0ea5e9',
              nature: accountData.nature === 'PF' ? 'PF' : 'PJ',
              yieldRate: Number.isFinite(Number(accountData.yieldRate)) ? Number(accountData.yieldRate) : undefined,
              yieldIndex: accountData.yieldIndex === 'Selic' ? 'Selic' : 'CDI'
          };

          const nextStored = upsertTourSimulatedAccount(simulatedAccount);
          setTourSimulatedAccounts(nextStored);
      };

      const clearTourData = () => {
          clearTourSimulatedAccounts();
          setTourSimulatedIncomes([]);
          setTourSimulatedAccounts([]);
      };

      window.addEventListener('mm:tour-income-simulated', handleTourIncomeSimulated as EventListener);
      window.addEventListener('mm:tour-new-account-simulated', handleTourAccountSimulated as EventListener);
      window.addEventListener('mm:first-access-tour-ended', clearTourData);
      window.addEventListener('mm:first-access-tour-restart', clearTourData);
      window.addEventListener('mm:first-access-tour-clear-data', clearTourData);

      return () => {
          window.removeEventListener('mm:tour-income-simulated', handleTourIncomeSimulated as EventListener);
          window.removeEventListener('mm:tour-new-account-simulated', handleTourAccountSimulated as EventListener);
          window.removeEventListener('mm:first-access-tour-ended', clearTourData);
          window.removeEventListener('mm:first-access-tour-restart', clearTourData);
          window.removeEventListener('mm:first-access-tour-clear-data', clearTourData);
      };
  }, []);

  useEffect(() => {
      if (highlightTarget && highlightTarget.entity === 'income') {
          const targetId = highlightTarget.id;
          setHighlightedId(targetId);
          requestAnimationFrame(() => {
              const element = document.getElementById(`income-${targetId}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          const timer = setTimeout(() => {
              setHighlightedId(null);
              setHighlightTarget(null);
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [highlightTarget, setHighlightTarget]);

  useEffect(() => {
      if (!isMobile) return;
      console.info('[mobile-ui] incomes', { screen: mobileScreen });
  }, [isMobile, mobileScreen]);

  useEffect(() => {
      if (!isMobile || headerLayoutLoggedRef.current) return;
      console.info('[layout][mobile-subheader] incomes in-flow');
      headerLayoutLoggedRef.current = true;
  }, [isMobile]);

  useEffect(() => {
      if (!isMobile) return;
      setDesktopFilterOpen(false);
  }, [isMobile]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleDockClick = () => {
          setDrawerIncome(null);
          setIncomeToDelete(null);
          setIsBulkDeleteModalOpen(false);
          setInlineNewOpen(false);
          setInlineEditIncomeId(null);
          setEditingIncome(null);
          setMobileScreen('list');
      };
      window.addEventListener('mm:dock-click', handleDockClick);
      window.addEventListener('mm:mobile-dock-click', handleDockClick);
      return () => {
          window.removeEventListener('mm:dock-click', handleDockClick);
          window.removeEventListener('mm:mobile-dock-click', handleDockClick);
      };
  }, []);

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

  const displayIncomes = React.useMemo(
      () => (tourSimulatedIncomes.length > 0 ? [...tourSimulatedIncomes, ...incomes] : incomes),
      [tourSimulatedIncomes, incomes]
  );
  const displayAccounts = React.useMemo(() => {
      if (tourSimulatedAccounts.length === 0) return accounts;
      const persistedIds = new Set(accounts.map(account => account.id));
      const unresolvedSimulated = tourSimulatedAccounts.filter(account => !persistedIds.has(account.id));
      return [...unresolvedSimulated, ...accounts];
  }, [accounts, tourSimulatedAccounts]);
  const primaryTourIncomeId = tourSimulatedIncomes[0]?.id || null;

  const accountNameById = React.useMemo(() => {
      const map = new Map<string, string>();
      displayAccounts.forEach(account => map.set(account.id, account.name));
      return map;
  }, [displayAccounts]);

  // Filter incomes by Date
  const filteredIncomes = displayIncomes.filter(inc => {
      // Use T12:00:00 for safe parsing
      const targetDate = new Date(inc.date + 'T12:00:00');
      return targetDate.getMonth() === viewDate.getMonth() && targetDate.getFullYear() === viewDate.getFullYear();
  });

  const desktopCategoryOptions = React.useMemo(
      () =>
          Array.from(
              new Set(
                  filteredIncomes
                      .map(item => (item.category || '').trim())
                      .filter(Boolean)
              )
          ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      [filteredIncomes]
  );
  const desktopAccountOptions = React.useMemo(
      () =>
          displayAccounts
              .map(account => ({ id: account.id, name: account.name }))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      [displayAccounts]
  );
  const normalizedDesktopSearch = desktopSearchTerm.trim().toLowerCase();
  const baseVisibleIncomes = isMobile
      ? filteredIncomes
      : filteredIncomes.filter(income => {
            if (desktopStatusFilter !== 'all' && income.status !== desktopStatusFilter) return false;
            if (desktopAccountFilter !== 'all' && income.accountId !== desktopAccountFilter) return false;
            if (desktopCategoryFilter !== 'all' && income.category !== desktopCategoryFilter) return false;
            if (!normalizedDesktopSearch) return true;
            const accountName = accountNameById.get(income.accountId) || '';
            const haystack = [
                income.description,
                income.category,
                income.paymentMethod,
                getIncomeFiscalNatureLabel(income.naturezaFiscal),
                income.taxStatus,
                income.notes || '',
                accountName
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalizedDesktopSearch);
        });
  const visibleIncomes = React.useMemo(() => {
      if (isMobile || !desktopSort) return baseVisibleIncomes;

      const compareText = (a: string, b: string) =>
          a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
      const toIsoMs = (value?: string) => {
          if (!value) return 0;
          const ms = new Date(`${value}T12:00:00`).getTime();
          return Number.isFinite(ms) ? ms : 0;
      };
      const statusRank: Record<Income['status'], number> = { pending: 0, received: 1 };

      const sorted = [...baseVisibleIncomes].sort((a, b) => {
          let result = 0;
          switch (desktopSort.key) {
              case 'description':
                  result = compareText(a.description || '', b.description || '');
                  break;
              case 'status':
                  result = statusRank[a.status] - statusRank[b.status];
                  break;
              case 'date': {
                  result = toIsoMs(a.date) - toIsoMs(b.date);
                  if (result === 0) {
                      result = toIsoMs(a.competenceDate || a.date) - toIsoMs(b.competenceDate || b.date);
                  }
                  break;
              }
              case 'category':
                  result = compareText(a.category || '', b.category || '');
                  break;
              case 'account':
                  result = compareText(
                      accountNameById.get(a.accountId) || '',
                      accountNameById.get(b.accountId) || ''
                  );
                  break;
              case 'paymentMethod':
                  result = compareText(a.paymentMethod || '', b.paymentMethod || '');
                  break;
              case 'naturezaFiscal':
                  result = compareText(
                      getIncomeFiscalNatureLabel(a.naturezaFiscal),
                      getIncomeFiscalNatureLabel(b.naturezaFiscal)
                  );
                  break;
              case 'taxStatus':
                  result = compareText(
                      a.taxStatus || '',
                      b.taxStatus || ''
                  );
                  break;
              case 'amount':
                  result = (a.amount || 0) - (b.amount || 0);
                  break;
          }

          if (result === 0) {
              result = compareText(a.id, b.id);
          }
          return desktopSort.direction === 'asc' ? result : -result;
      });

      return sorted;
  }, [accountNameById, baseVisibleIncomes, desktopSort, isMobile]);
  const selectableIncomes = visibleIncomes.filter(inc => !inc.locked && !isTourSimulatedIncomeId(inc.id));

  const totalAmount = visibleIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalReceived = visibleIncomes.filter(i => i.status === 'received').reduce((acc, curr) => acc + curr.amount, 0);
  const isListViewSafe = isMobile ? mobileScreen === 'list' : true;
  const allowPageScroll = false;
  const MOBILE_PAGE_SIZE = 8;
  const mobilePages = chunkItems(visibleIncomes, MOBILE_PAGE_SIZE);
  const hasMobilePages = mobilePages.length > 1;
  const desktopActiveFilterCount =
      (normalizedDesktopSearch ? 1 : 0) +
      (desktopStatusFilter !== 'all' ? 1 : 0) +
      (desktopAccountFilter !== 'all' ? 1 : 0) +
      (desktopCategoryFilter !== 'all' ? 1 : 0);
  const desktopListColumns =
      '18px minmax(180px,2fr) 8px minmax(132px,0.95fr) 8px minmax(170px,1.4fr) 8px minmax(130px,1fr) 8px minmax(150px,1.2fr) 8px minmax(78px,0.52fr) 8px minmax(86px,0.6fr) 8px minmax(230px,1.65fr) 8px 72px 8px minmax(120px,0.9fr)';
  const toggleDesktopSort = (key: IncomeSortKey) => {
      setDesktopSort(prev => {
          if (!prev || prev.key !== key) return { key, direction: 'desc' };
          if (prev.direction === 'desc') return { key, direction: 'asc' };
          return null;
      });
  };
  const renderSortButton = (key: IncomeSortKey, label: string, align: 'left' | 'right' = 'left') => {
      const isActive = desktopSort?.key === key;
      const indicator = isActive ? (desktopSort?.direction === 'asc' ? '↑' : '↓') : '↕';
      return (
          <button
              type="button"
              onClick={() => toggleDesktopSort(key)}
              className={`inline-flex w-full min-w-0 items-center gap-1 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
              title={`Ordenar por ${label}`}
          >
              <span className="whitespace-nowrap">{label}</span>
              <span className={`text-[9px] ${isActive ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-500/70'}`}>
                  {indicator}
              </span>
          </button>
      );
  };
  useEffect(() => {
      const shouldLock = !allowPageScroll;
      document.documentElement.classList.toggle('lock-scroll', shouldLock);
      document.body.classList.toggle('lock-scroll', shouldLock);
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [allowPageScroll]);

  useEffect(() => {
      const visibleIds = new Set(visibleIncomes.map(income => income.id));
      setSelectedIds(prev => {
          const next = prev.filter(id => visibleIds.has(id));
          return next.length === prev.length ? prev : next;
      });
  }, [visibleIncomes]);

  // ... rest of logic/handlers ...
  // --- SELECTION CALCULATIONS ---
  const selectedIncomes = visibleIncomes.filter(i => selectedIds.includes(i.id));
  const selectedTotalAmount = selectedIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const selectedReceivedTotal = selectedIncomes.filter(i => i.status === 'received').reduce((acc, curr) => acc + curr.amount, 0);
  const hasSelection = selectedIds.length > 0;
  const headerCount = hasSelection ? selectedIncomes.length : visibleIncomes.length;
  const headerTotal = hasSelection ? selectedTotalAmount : totalAmount;
  const headerReceived = hasSelection ? selectedReceivedTotal : totalReceived;

  // --- HANDLERS ---

  const toggleSelection = (id: string) => {
      const target = incomes.find(inc => inc.id === id);
      if (target?.locked) return;
      setSelectedIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const toggleSelectAll = () => {
      if (selectedIds.length === selectableIncomes.length && selectableIncomes.length > 0) {
          setSelectedIds([]);
      } else {
          setSelectedIds(selectableIncomes.map(i => i.id));
      }
  };

  // ... handleSaveIncome, handleBulkStatusChange, handleBulkDeleteConfirm, requestDelete, confirmDelete, handleNew ...
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const applyIncomeAccountAdjustments = (
      previous: Income | null,
      next: Income | null,
      baseAccounts: Account[] = accounts
  ) => {
      const newAccounts = [...baseAccounts];
      let accountsChanged = false;

      if (previous && previous.status === 'received' && previous.accountId) {
          const accIdx = newAccounts.findIndex(a => a.id === previous.accountId);
          if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
              const mutationId = `income:revert:${previous.id}:${previous.accountId}:${previous.amount}:${previous.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'incomes_view',
                  action: 'revert_received',
                  accountId: previous.accountId,
                  entityId: previous.id,
                  amount: previous.amount,
                  status: previous.status
              });
              if (shouldApply) {
                  newAccounts[accIdx].currentBalance -= previous.amount;
                  accountsChanged = true;
              }
          }
      }

      if (next && next.status === 'received' && next.accountId) {
          const accIdx = newAccounts.findIndex(a => a.id === next.accountId);
          if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
              const mutationId = `income:apply:${next.id}:${next.accountId}:${next.amount}:${next.status}`;
              const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                  source: 'incomes_view',
                  action: 'apply_received',
                  accountId: next.accountId,
                  entityId: next.id,
                  amount: next.amount,
                  status: next.status
              });
              if (shouldApply) {
                  newAccounts[accIdx].currentBalance += next.amount;
                  accountsChanged = true;
              }
          }
      }

      return { accounts: newAccounts, accountsChanged };
  };

  const closeIncomeModal = () => {
      setInlineNewOpen(false);
      setInlineEditIncomeId(null);
      setEditingIncome(null);
  };

  const handleSaveIncome = (incomeData: any) => {
      let updatedList;

      if (Array.isArray(incomeData)) {
          updatedList = [...incomes, ...incomeData];

          const newAccounts = [...accounts];
          let accountsChanged = false;

          incomeData.forEach((inc: any) => {
             if (inc.accountId && inc.status === 'received') {
                  const accIdx = newAccounts.findIndex(a => a.id === inc.accountId);
                  if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
                      const mutationId = `income:bulk_add:${inc.id}:${inc.accountId}:${inc.amount}:${inc.status}`;
                      const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                          source: 'incomes_view',
                          action: 'bulk_add',
                          accountId: inc.accountId,
                          entityId: inc.id,
                          amount: inc.amount,
                          status: inc.status
                      });
                      if (shouldApply) {
                          newAccounts[accIdx].currentBalance += inc.amount;
                          accountsChanged = true;
                      }
                  }
             }
          });

          if (accountsChanged) {
              const changedAccounts = selectChangedAccounts(accounts, newAccounts);
              if (changedAccounts.length) {
                  onUpdateAccounts(changedAccounts);
              }
          }
      } else {
          const { applyScope, ...payload } = incomeData || {};
          const isEditing = payload.id && incomes.some(i => i.id === payload.id);

          if (isEditing) {
              const previousIncome = incomes.find(i => i.id === payload.id) || null;
              const updatedIncome: Income = { ...(previousIncome as Income), ...payload };
              let seriesUpdated = false;

              if (applyScope === 'series' && previousIncome?.installments) {
                  const seriesResult = getIncomeInstallmentSeries(incomes, previousIncome);
                  const currentNumber = previousIncome.installmentNumber ?? 0;
                  const targetItems = seriesResult.items.filter(item => (item.installmentNumber ?? 0) >= currentNumber);
                  if (targetItems.length > 0) {
                      const baseDescription = normalizeInstallmentDescription(updatedIncome.description);
                      const groupId =
                          previousIncome.installmentGroupId ||
                          (seriesResult.source === 'heuristic' ? generateId() : undefined);

                      const updatedSeries = targetItems.map(item => {
                          const baseUpdate: Income = {
                              ...item,
                              description: buildInstallmentDescription(
                                  baseDescription,
                                  item.installmentNumber,
                                  item.totalInstallments
                              ),
                              category: updatedIncome.category,
                              amount: updatedIncome.amount,
                              accountId: updatedIncome.accountId,
                              paymentMethod: updatedIncome.paymentMethod,
                              notes: updatedIncome.notes,
                              taxStatus: updatedIncome.taxStatus,
                              naturezaFiscal: updatedIncome.naturezaFiscal as IncomeFiscalNature | undefined,
                              installmentGroupId: groupId || item.installmentGroupId
                          };
                          return item.id === updatedIncome.id ? { ...baseUpdate, ...updatedIncome } : baseUpdate;
                      });

                      const updatedMap = new Map(updatedSeries.map(item => [item.id, item]));
                      updatedList = incomes.map(inc => updatedMap.get(inc.id) ?? inc);
                      seriesUpdated = true;

                      let nextAccounts = accounts;
                      let accountsChanged = false;
                      updatedSeries.forEach(item => {
                          const previousItem = incomes.find(inc => inc.id === item.id) || null;
                          const result = applyIncomeAccountAdjustments(previousItem, item, nextAccounts);
                          nextAccounts = result.accounts;
                          if (result.accountsChanged) accountsChanged = true;
                      });
                      if (accountsChanged) {
                          const changedAccounts = selectChangedAccounts(accounts, nextAccounts);
                          if (changedAccounts.length) {
                              onUpdateAccounts(changedAccounts);
                          }
                      }

                      console.info('[series-edit]', {
                          entityName: 'Entrada',
                          applyScope,
                          updatedCount: updatedSeries.length
                      });
                  }
              }

              if (!seriesUpdated) {
                  const { accounts: updatedAccounts, accountsChanged } = applyIncomeAccountAdjustments(previousIncome, updatedIncome);

                  updatedList = incomes.map(inc => inc.id === updatedIncome.id ? updatedIncome : inc);

                  if (accountsChanged) {
                      const changedAccounts = selectChangedAccounts(accounts, updatedAccounts);
                      if (changedAccounts.length) {
                          onUpdateAccounts(changedAccounts);
                      }
                  }

                  if (applyScope) {
                      console.info('[series-edit]', {
                          entityName: 'Entrada',
                          applyScope,
                          updatedCount: 1
                      });
                  }
              }
          } else {
              const newItem: Income = { ...payload, id: generateId() };
              updatedList = [...incomes, newItem];

              const { accounts: updatedAccounts, accountsChanged } = applyIncomeAccountAdjustments(null, newItem);
              if (accountsChanged) {
                  const changedAccounts = selectChangedAccounts(accounts, updatedAccounts);
                  if (changedAccounts.length) {
                      onUpdateAccounts(changedAccounts);
                  }
              }
          }
      }

      onUpdateIncomes(updatedList);
      closeIncomeModal();
      if (isMobile) {
          setMobileScreen('list');
          console.info('[mobile-ui] incomes', { screen: 'list', action: 'saved' });
      }
  };

  const handleBulkStatusChange = (newStatus: 'received' | 'pending') => {
      if (selectedIds.length === 0) return;

      const newAccounts = [...accounts];
      let accountsChanged = false;

      const updatedIncomes = incomes.map(inc => {
          if (!selectedIds.includes(inc.id)) return inc;
          if (inc.status === newStatus) return inc;

          if (inc.accountId) {
              const accIdx = newAccounts.findIndex(a => a.id === inc.accountId);
              if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
                  const mutationId = `income:bulk_status:${inc.id}:${inc.accountId}:${inc.amount}:${newStatus}`;
                  const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                      source: 'incomes_view',
                      action: 'bulk_status',
                      accountId: inc.accountId,
                      entityId: inc.id,
                      amount: inc.amount,
                      status: newStatus
                  });
                  if (shouldApply) {
                      if (newStatus === 'received') {
                          newAccounts[accIdx].currentBalance += inc.amount;
                      } else {
                          newAccounts[accIdx].currentBalance -= inc.amount;
                      }
                      accountsChanged = true;
                  }
              }
          }

          return { ...inc, status: newStatus };
      });

      onUpdateIncomes(updatedIncomes);
      if (accountsChanged) {
          const changedAccounts = selectChangedAccounts(accounts, newAccounts);
          if (changedAccounts.length) {
              onUpdateAccounts(changedAccounts);
          }
      }
  };

  const handleBulkDeleteConfirm = () => {
      const newAccounts = [...accounts];
      let accountsChanged = false;

      selectedIncomes.forEach(inc => {
          if (inc.status === 'received' && inc.accountId) {
              const accIdx = newAccounts.findIndex(a => a.id === inc.accountId);
              if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
                  const mutationId = `income:bulk_delete:${inc.id}:${inc.accountId}:${inc.amount}:${inc.status}`;
                  const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                      source: 'incomes_view',
                      action: 'bulk_delete',
                      accountId: inc.accountId,
                      entityId: inc.id,
                      amount: inc.amount,
                      status: inc.status
                  });
                  if (shouldApply) {
                      newAccounts[accIdx].currentBalance -= inc.amount;
                      accountsChanged = true;
                  }
              }
          }
      });

      const remainingIncomes = incomes.filter(inc => !selectedIds.includes(inc.id));

      onUpdateIncomes(remainingIncomes);
      if (accountsChanged) {
          const changedAccounts = selectChangedAccounts(accounts, newAccounts);
          if (changedAccounts.length) {
              onUpdateAccounts(changedAccounts);
          }
      }
      
      setSelectedIds([]);
      setIsBulkDeleteModalOpen(false);
  };

  const requestDelete = (income: Income) => {
      setIncomeToDelete(income);
  };

  const confirmDelete = () => {
      if (incomeToDelete) {
          onDeleteIncome(incomeToDelete.id);
          setIncomeToDelete(null);
      }
  };

  const handleNew = () => {
      if (isMobile) {
          setEditingIncome(null);
          setMobileScreen('form');
          console.info('[mobile-ui] incomes', { screen: 'form', action: 'new' });
          return;
      }
      setDesktopFilterOpen(false);
      setInlineEditIncomeId(null);
      setEditingIncome(null);
      setDrawerIncome(null);
      setInlineNewOpen(prev => !prev);
  };

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleTourOpenIncomeModal = () => {
          if (isMobile) {
              setEditingIncome(null);
              setMobileScreen('form');
              return;
          }
          setDesktopFilterOpen(false);
          setInlineEditIncomeId(null);
          setEditingIncome(null);
          setDrawerIncome(null);
          setInlineNewOpen(true);
      };
      window.addEventListener('mm:tour-open-income-modal', handleTourOpenIncomeModal);
      return () => window.removeEventListener('mm:tour-open-income-modal', handleTourOpenIncomeModal);
  }, [isMobile]);

  const handleEditIncome = (income: Income) => {
      if (isMobile) {
          setEditingIncome(income);
          setMobileScreen('form');
          console.info('[mobile-ui] incomes', { screen: 'form', action: 'edit', id: income.id });
          return;
      }
      setDesktopFilterOpen(false);
      setEditingIncome(income);
      setInlineNewOpen(false);
      setInlineEditIncomeId(income.id);
      setDrawerIncome(null);
  };

  useEffect(() => {
      if (!isMobile || !autoOpenNew) return;
      setEditingIncome(null);
      setMobileScreen('form');
      onAutoOpenHandled?.();
  }, [autoOpenNew, isMobile, onAutoOpenHandled]);

  useEffect(() => {
      if (!isMobile || !autoOpenEditId) return;
      const target = incomes.find(income => income.id === autoOpenEditId) || null;
      if (target) {
          setEditingIncome(target);
          setMobileScreen('form');
          console.info('[mobile-ui] incomes', { screen: 'form', action: 'edit', id: target.id });
      }
      onAutoOpenEditHandled?.();
  }, [autoOpenEditId, incomes, isMobile, onAutoOpenEditHandled]);

  const getAccountById = (accId: string) => displayAccounts.find(a => a.id === accId);
  const getIncomeStatusMeta = (income: Income) => {
      const normalizedStatus = normalizeIncomeStatus(income.status);
      const statusLabel = incomeStatusLabel(income.status);
      const statusClassName =
          normalizedStatus === 'received'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      return { normalizedStatus, statusLabel, statusClassName };
  };
  const getIncomeNatureLabel = (income: Income) =>
      income.taxStatus === 'PF' || income.taxStatus === 'PJ' ? income.taxStatus : '-';
  const getIncomeRegimeLabel = (income: Income) => getIncomeFiscalNatureLabel(income.naturezaFiscal);

  const buildIncomeDetails = (income: Income | null) => {
      if (!income) return [] as { label: string; value: React.ReactNode }[];
      const { statusLabel, statusClassName } = getIncomeStatusMeta(income);
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
              label: 'Data',
              value: new Date(income.date + 'T12:00:00').toLocaleDateString('pt-BR')
          },
          income.competenceDate
              ? {
                    label: 'Competência',
                    value: new Date(income.competenceDate + 'T12:00:00').toLocaleDateString('pt-BR')
                }
              : null,
          {
              label: 'Categoria',
              value: income.category || '-'
          },
          {
              label: 'Conta',
              value: getAccountById(income.accountId)?.name || 'Conta Deletada'
          },
          income.paymentMethod ? { label: 'Forma', value: income.paymentMethod } : null,
          {
              label: 'Natureza',
              value: getIncomeNatureLabel(income)
          },
          {
              label: 'Regime',
              value: getIncomeRegimeLabel(income)
          },
          income.installments
              ? {
                    label: 'Parcela',
                    value: `${income.installmentNumber}/${income.totalInstallments}`
                }
              : null,
          income.createdBy ? { label: 'Lançado por', value: income.createdBy } : null,
          income.notes ? { label: 'Observações', value: income.notes } : null
      ].filter(Boolean) as { label: string; value: React.ReactNode }[];
  };
  const handleMobileBack = () => {
      if (mobileScreen === 'form') {
          setMobileScreen('list');
          setEditingIncome(null);
          console.info('[mobile-ui] incomes', { screen: 'list', action: 'back' });
          return;
      }
      onBack();
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
      if (inlineNewOpen || inlineEditIncomeId || isBulkDeleteModalOpen || incomeToDelete) return;
      event.preventDefault();
      handleNew();
  };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNew, incomeToDelete, inlineEditIncomeId, inlineNewOpen, isBulkDeleteModalOpen, isMobile]);

  useEffect(() => {
      if (isMobile) return;
      const handleListArrowNavigation = (event: KeyboardEvent) => {
          if (event.defaultPrevented || event.repeat) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          if (document.querySelector('[data-modal-root="true"]')) return;

          const target = event.target as HTMLElement | null;
          if (target) {
              const tagName = target.tagName;
              if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable) {
                  return;
              }
          }

          if (inlineNewOpen || inlineEditIncomeId || isBulkDeleteModalOpen || incomeToDelete) return;

          const navigableIncomes = visibleIncomes.filter(
              income => !(income.locked || income.lockedReason === 'epoch_mismatch')
          );
          if (navigableIncomes.length === 0) return;

          event.preventDefault();
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const anchorId = highlightedId;
          const currentIndex = anchorId
              ? navigableIncomes.findIndex(income => income.id === anchorId)
              : -1;
          const nextIndex =
              currentIndex === -1
                  ? (direction > 0 ? 0 : navigableIncomes.length - 1)
                  : (currentIndex + direction + navigableIncomes.length) % navigableIncomes.length;
          const nextIncome = navigableIncomes[nextIndex];
          if (!nextIncome) return;

          setHighlightedId(nextIncome.id);
          requestAnimationFrame(() => {
              document.getElementById(`income-${nextIncome.id}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest'
              });
          });
      };

      window.addEventListener('keydown', handleListArrowNavigation);
      return () => window.removeEventListener('keydown', handleListArrowNavigation);
  }, [
      drawerIncome,
      highlightedId,
      incomeToDelete,
      inlineEditIncomeId,
      inlineNewOpen,
      isBulkDeleteModalOpen,
      isMobile,
      visibleIncomes
  ]);

  useEffect(() => {
      if (!drawerIncome) return;
      if (inlineEditIncomeId && inlineEditIncomeId !== drawerIncome.id) {
          setInlineEditIncomeId(null);
      }
  }, [drawerIncome, inlineEditIncomeId]);

  useEffect(() => {
      if (inlineNewOpen) {
          setInlineEditIncomeId(null);
      }
  }, [inlineNewOpen]);

  const openDrawer = (income: Income) => {
      if (isMobile) {
          setDrawerIncome(income);
          console.info('[mobile-ui] incomes', { screen: 'drawer', action: 'open', id: income.id });
          return;
      }
      setDrawerIncome(prev => (prev?.id === income.id ? null : income));
  };
  const closeDrawer = () => {
      setDrawerIncome(null);
      console.info('[mobile-ui] incomes', { screen: 'drawer', action: 'close' });
  };

  if (isMobile) {
      const listSubtitle = `${filteredIncomes.length} registros`;
      const handleMobileFormClose = () => {
          setMobileScreen('list');
          setEditingIncome(null);
          console.info('[mobile-ui] incomes', { screen: 'list', action: 'close' });
          onBack();
      };
      const drawerStatus = drawerIncome ? normalizeIncomeStatus(drawerIncome.status) : 'pending';
      const drawerStatusLabel = drawerIncome ? incomeStatusLabel(drawerIncome.status) : '';
      const drawerStatusClass =
          drawerStatus === 'received'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';

      const drawerDetails = drawerIncome
          ? [
                {
                    label: 'Status',
                    value: drawerStatusLabel
                },
                {
                    label: 'Data',
                    value: new Date(drawerIncome.date + 'T12:00:00').toLocaleDateString('pt-BR')
                },
                drawerIncome.competenceDate
                    ? {
                          label: 'Competência',
                          value: new Date(drawerIncome.competenceDate + 'T12:00:00').toLocaleDateString('pt-BR')
                      }
                    : null,
                {
                    label: 'Categoria',
                    value: drawerIncome.category || '-'
                },
                {
                    label: 'Conta',
                    value: getAccountById(drawerIncome.accountId)?.name || 'Conta Deletada'
                },
                drawerIncome.paymentMethod
                    ? { label: 'Forma', value: drawerIncome.paymentMethod }
                    : null,
                {
                    label: 'Natureza',
                    value: getIncomeNatureLabel(drawerIncome)
                },
                {
                    label: 'Regime',
                    value: getIncomeRegimeLabel(drawerIncome)
                },
                drawerIncome.installments
                    ? {
                          label: 'Parcela',
                          value: `${drawerIncome.installmentNumber}/${drawerIncome.totalInstallments}`
                      }
                    : null,
                drawerIncome.createdBy ? { label: 'Lançado por', value: drawerIncome.createdBy } : null,
                drawerIncome.notes ? { label: 'Observações', value: drawerIncome.notes } : null
            ].filter(Boolean) as { label: string; value: React.ReactNode }[]
          : [];

      const isListView = mobileScreen === 'list';
      const headerTitle = isListView
          ? 'Entradas'
          : (editingIncome ? 'Editar Entrada' : 'Nova Entrada');

  const mobileHeader = (
          <div className={`space-y-2 mm-mobile-header-stack ${isListView ? 'mm-mobile-header-stable' : ''}`}>
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
                          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
                              <p className="mm-subheader-metric-label">Registros</p>
                              <p className="mm-subheader-metric-value">{headerCount}</p>
                          </div>
                          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
                              <p className="mm-subheader-metric-label">Previsto</p>
                              <p className="mm-subheader-metric-value">
                                  R$ {headerTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
                              <p className="mm-subheader-metric-label">Recebido</p>
                              <p className="mm-subheader-metric-value text-emerald-600 dark:text-emerald-400">
                                  R$ {headerReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                      </div>
                      <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                              {onOpenAudit && (
                                  <button
                                      onClick={onOpenAudit}
                                      className="mm-btn-base mm-btn-secondary mm-btn-secondary-emerald mm-mobile-primary-cta"
                                      title="Auditoria do dia"
                                  >
                                  Auditoria
                              </button>
                          )}
                          <button
                              onClick={handleNew}
                              data-tour-anchor="incomes-new"
                              className="mm-btn-base mm-btn-primary mm-btn-primary-emerald w-full mm-mobile-primary-cta"
                          >
                              Nova Entrada
                          </button>
                      </div>
                  </>
              )}
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
                              <div className="mm-mobile-subheader-pad">
                                  {mobileHeader}
                              </div>
                          </div>
                      </div>
                      <div
                          className={`h-full mm-mobile-content-pad overflow-hidden ${isListView ? 'pb-[calc(env(safe-area-inset-bottom)+88px)]' : 'pb-[calc(env(safe-area-inset-bottom)+16px)]'}`}
                          style={{
                              paddingTop: subHeaderHeight
                                  ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px + 2px)`
                                  : 'calc(var(--mm-mobile-top, 0px) + 2px)'
                          }}
                      >
                          {isListView ? (
                              <MobileFullWidthSection contentClassName="mm-mobile-section-pad">
                              <div className="space-y-3">
                                  <div className="py-2">
                                      <button
                                          type="button"
                                          onClick={toggleSelectAll}
                                          disabled={selectableIncomes.length === 0}
                                          className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 disabled:opacity-50"
                                      >
                                          <span>{selectedIds.length === selectableIncomes.length && selectableIncomes.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                                          <span>{selectedIds.length} selecionados</span>
                                      </button>
                                  </div>
                                  {filteredIncomes.length > 0 ? (
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
                                                      {page.map((income, index) => {
                                          const isLocked = Boolean(income.locked || income.lockedReason === 'epoch_mismatch');
                                          const isSelected = selectedIds.includes(income.id);
                                          const rowBg = index % 2 === 0 ? 'bg-emerald-500/10' : 'bg-transparent';
                                          return (
                                              <div key={income.id} id={`income-${income.id}`} className={`py-2 ${rowBg} rounded-md`}>
                                                  <button
                                                      type="button"
                                                      onClick={() => openDrawer(income)}
                                                      className="w-full flex items-center justify-between gap-3 text-left"
                                                      disabled={isLocked}
                                                  >
                                                      <div className="flex items-center gap-2 min-w-0">
                                                          <input
                                                              type="checkbox"
                                                              checked={isSelected}
                                                              onChange={() => toggleSelection(income.id)}
                                                              onClick={(event) => event.stopPropagation()}
                                                              disabled={isLocked}
                                                              className="h-4 w-4 accent-emerald-500"
                                                              aria-label={`Selecionar entrada ${income.description}`}
                                                          />
                                                          <span
                                                              className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
                                                              title={income.description}
                                                          >
                                                              {income.description}
                                                          </span>
                                                      </div>
                                                      <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                          R$ {income.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                          icon={<ArrowUpCircle size={18} />}
                                          title="Nenhuma entrada neste mês"
                                          message="Registre a primeira entrada para alimentar relatórios e manter o fluxo de caixa atualizado."
                                          actionLabel="Nova entrada"
                                          onAction={handleNew}
                                      />
                                  )}
                              </div>
                              </MobileFullWidthSection>
                          ) : null}
                      </div>
                  </div>
              </div>

              {!isListView && (() => {
                  const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
                  return (
                  <div className="fixed inset-0 z-[1200]" data-modal-root="true">
                      <button
                          type="button"
                          onClick={handleMobileFormClose}
                          className="absolute left-0 right-0 top-0 bg-black/70"
                          style={{ bottom: dockOffset }}
                          aria-label="Fechar nova entrada"
                      />
                      <div
                          className="absolute left-0 right-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-t-2xl border-0 shadow-none flex flex-col"
                          style={{ top: 0, bottom: dockOffset }}
                      >
                          <div className="px-3 pt-2.5 pb-2.5 bg-[#0b0b10] border-b border-white/10">
                              <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                          <ArrowUpCircle size={16} className="text-white" />
                                      <p className="text-[15px] font-semibold text-white truncate">{headerTitle}</p>
                                  </div>
                                      <p className="text-[11px] text-white/70">Preencha os dados da entrada.</p>
                                  </div>
                                  <button
                                      type="button"
                                      onClick={handleMobileFormClose}
                                      className="h-8 w-8 rounded-xl bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                                      aria-label="Fechar nova entrada"
                                  >
                                      <X size={16} />
                                  </button>
                              </div>
                          </div>
                          <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+132px)]">
                              <NewIncomeModal
                                  isOpen
                                  variant="inline"
                                  hideFooter
                                  onPrimaryActionRef={(handler) => {
                                      submitRef.current = handler;
                                  }}
                                  onClose={handleMobileFormClose}
                                  onSave={handleSaveIncome}
                                  initialData={editingIncome}
                                  accounts={displayAccounts}
                                  categories={categories}
                                  userId={userId}
                                  categoryType="incomes"
                                  onAddCategory={onAddCategory}
                                  onRemoveCategory={onRemoveCategory}
                                  onResetCategories={onResetCategories}
                                  defaultDate={viewDate}
                                  minDate={minDate}
                              />
                          </div>
                          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0 grid grid-cols-2 gap-2">
                              <button
                                  type="button"
                                  onClick={handleMobileFormClose}
                                  className="rounded-xl border border-emerald-400/50 bg-emerald-950/30 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/40 transition"
                              >
                                  Cancelar
                              </button>
                              <button
                                  type="button"
                                  onClick={() => submitRef.current?.()}
                                  className="rounded-xl border border-emerald-500/40 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
                              >
                                  Salvar
                              </button>
                          </div>
                      </div>
                  </div>
                  );
              })()}

              <MobileTransactionDrawer
                  open={Boolean(drawerIncome)}
                  title={drawerIncome?.description || ''}
                  amount={
                      drawerIncome
                          ? `R$ ${drawerIncome.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : undefined
                  }
                  statusLabel={drawerStatusLabel}
                  statusClassName={drawerStatusClass}
                  details={drawerDetails}
                  actionsDisabled={Boolean(drawerIncome?.locked)}
                  onClose={closeDrawer}
                  onEdit={
                      drawerIncome && !drawerIncome.locked
                          ? () => {
                                setEditingIncome(drawerIncome);
                                setMobileScreen('form');
                                setDrawerIncome(null);
                                console.info('[mobile-ui] incomes', { screen: 'form', action: 'edit', id: drawerIncome.id });
                            }
                          : undefined
                  }
                  onDelete={
                      drawerIncome && !drawerIncome.locked
                          ? () => {
                                requestDelete(drawerIncome);
                                setDrawerIncome(null);
                                console.info('[mobile-ui] incomes', { screen: 'drawer', action: 'delete', id: drawerIncome.id });
                            }
                          : undefined
                  }
              />

              {incomeToDelete && (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                          <button 
                              onClick={() => setIncomeToDelete(null)}
                              aria-label="Fechar confirmação de exclusão"
                              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                          >
                              <X size={20} />
                          </button>

                          <div className="flex flex-col items-center text-center mb-6">
                              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                                  <Trash2 size={24} />
                              </div>
                              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir Entrada?</h3>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                  Você está prestes a excluir o registro de <strong>{incomeToDelete.description}</strong> no valor de <strong>R$ {incomeToDelete.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>.
                              </p>
                          </div>

                          {incomeToDelete.status === 'received' && (
                              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                      Como esta entrada já foi marcada como <strong>Recebida</strong>, o valor será debitado do saldo da conta vinculada.
                                  </p>
                              </div>
                          )}

                          <div className="flex gap-3">
                              <button 
                                  onClick={() => setIncomeToDelete(null)}
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

  const listSubtitle = `${filteredIncomes.length} registros`;
  const allSelectableSelected =
      selectableIncomes.length > 0 && selectedIds.length === selectableIncomes.length;
  const desktopHeader = (
      <div className="space-y-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />
              <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Entradas</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
              <div className="mm-subheader-metric-card">
                  <p className="mm-subheader-metric-label">Registros</p>
                  <p className="mm-subheader-metric-value">{headerCount}</p>
              </div>
              <div className="mm-subheader-metric-card">
                  <p className="mm-subheader-metric-label">Previsto</p>
                  <p className="mm-subheader-metric-value">
                      R$ {headerTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
              </div>
              <div className="mm-subheader-metric-card">
                  <p className="mm-subheader-metric-label">Recebido</p>
                  <p className="mm-subheader-metric-value text-emerald-600 dark:text-emerald-400">
                      R$ {headerReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
              </div>
          </div>

          <div className="mm-header-actions">
              {onOpenAudit && (
                  <button
                      onClick={onOpenAudit}
                      className="mm-btn-base mm-btn-secondary mm-btn-secondary-emerald"
                      title="Auditoria do dia"
                  >
                      Auditoria
                  </button>
              )}
                  <button
                      onClick={handleNew}
                      data-tour-anchor="incomes-new"
                      className="mm-btn-base mm-btn-primary mm-btn-primary-emerald"
                  >
                      Nova Entrada
                  </button>
          </div>
      </div>
  );

  const summarySection = (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 pt-6">
          <div className="mm-subheader mm-subheader-panel">
              {desktopHeader}
          </div>
      </div>
  );
  const dockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const dockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const dockMaxHeight =
      'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';

  return (
      <div className="bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300">
          {summarySection}

          <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-[var(--mm-content-gap)] pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-3">
                  {inlineNewOpen && (
                      <NewIncomeModal
                          isOpen
                          variant={isMobile ? 'inline' : 'dock'}
                          onClose={closeIncomeModal}
                          onSave={handleSaveIncome}
                          initialData={null}
                          accounts={displayAccounts}
                          categories={categories}
                          userId={userId}
                          categoryType="incomes"
                          onAddCategory={onAddCategory}
                          onRemoveCategory={onRemoveCategory}
                          onResetCategories={onResetCategories}
                          defaultDate={viewDate}
                          minDate={minDate}
                      />
                  )}
                  {!isMobile && editingIncome && !inlineNewOpen && (
                      <NewIncomeModal
                          isOpen
                          variant="dock"
                          onClose={closeIncomeModal}
                          onSave={handleSaveIncome}
                          initialData={editingIncome}
                          accounts={displayAccounts}
                          categories={categories}
                          userId={userId}
                          categoryType="incomes"
                          onAddCategory={onAddCategory}
                          onRemoveCategory={onRemoveCategory}
                          onResetCategories={onResetCategories}
                          defaultDate={viewDate}
                          minDate={minDate}
                      />
                  )}

                  {filteredIncomes.length > 0 ? (
                      <>
                          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 space-y-3">
                              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                      <button
                                          type="button"
                                          onClick={toggleSelectAll}
                                          disabled={selectableIncomes.length === 0}
                                          className="mm-btn-chip"
                                      >
                                          {allSelectableSelected ? (
                                              <CheckSquare size={14} className="text-emerald-600" />
                                          ) : (
                                              <Square size={14} />
                                          )}
                                          <span>{allSelectableSelected ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                                      </button>
                                      <span className="text-[11px] font-semibold">{selectedIds.length} selecionados</span>
                                      <span className="text-zinc-400 dark:text-zinc-600">|</span>
                                      <span className="text-[11px]">
                                          Soma:{' '}
                                          <strong className="text-zinc-800 dark:text-zinc-100">
                                              R$ {selectedTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </strong>
                                      </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                      {!isMobile && (
                                          <button
                                              type="button"
                                              onClick={() => setDesktopFilterOpen(prev => !prev)}
                                              className={`mm-btn-chip ${desktopFilterOpen ? 'mm-btn-chip-active-emerald' : ''}`}
                                          >
                                              <SlidersHorizontal size={13} />
                                              Filtrar{desktopActiveFilterCount > 0 ? ` (${desktopActiveFilterCount})` : ''}
                                          </button>
                                      )}
                                      <button
                                          type="button"
                                          onClick={() => handleBulkStatusChange('received')}
                                          disabled={!hasSelection}
                                          className="mm-btn-chip mm-btn-chip-success"
                                      >
                                          <CheckCircle2 size={13} /> Marcar Recebidos
                                      </button>
                                      <button
                                          type="button"
                                          onClick={() => handleBulkStatusChange('pending')}
                                          disabled={!hasSelection}
                                          className="mm-btn-chip mm-btn-chip-warning"
                                      >
                                          <Circle size={13} /> Marcar Pendentes
                                      </button>
                                      <button
                                          type="button"
                                          onClick={() => setIsBulkDeleteModalOpen(true)}
                                          disabled={!hasSelection}
                                          aria-label="Excluir selecionados"
                                          className="mm-btn-icon"
                                          title="Excluir selecionados"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  </div>
                              </div>

                              {!isMobile && (
                                  <div
                                      className="grid items-center gap-2 px-2 text-[10px] tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
                                      style={{ gridTemplateColumns: desktopListColumns }}
                                  >
                                      <span className="text-center">#</span>
                                      {renderSortButton('description', 'Título')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('status', 'Status')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('date', 'Data • Competência')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('category', 'Categoria')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('account', 'Conta')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('paymentMethod', 'Forma')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('taxStatus', 'Natureza')}
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('naturezaFiscal', 'Regime')}
                                      <span className="text-zinc-500/70">|</span>
                                      <span>Ações</span>
                                      <span className="text-zinc-500/70">|</span>
                                      {renderSortButton('amount', 'Valor', 'right')}
                                  </div>
                              )}
                          </div>

                          {visibleIncomes.map((income, index) => {
                              const isSelected = selectedIds.includes(income.id);
                              const isHighlighted = highlightedId === income.id;
                              const lockedReason = income.lockedReason;
                              const isLocked = Boolean(income.locked || lockedReason === 'epoch_mismatch');
                              const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                              const isTourSimulated = isTourSimulatedIncomeId(income.id);
                              const isBulkSelectBlocked = isLocked || isTourSimulated;
                              const isPrimaryTourIncome = Boolean(primaryTourIncomeId) && income.id === primaryTourIncomeId;
                              const { statusLabel, statusClassName } = getIncomeStatusMeta(income);
                              const accountName = getAccountById(income.accountId)?.name || 'Conta Deletada';
                              const rowBg = index % 2 === 0 ? 'bg-emerald-500/10' : 'bg-transparent';
                              const dateLabel = new Date(income.date + 'T12:00:00').toLocaleDateString('pt-BR');
                              const competenceLabel = income.competenceDate
                                  ? new Date(income.competenceDate + 'T12:00:00').toLocaleDateString('pt-BR')
                                  : '-';
                              const methodLabel = income.paymentMethod || '-';
                              const natureLabel = getIncomeNatureLabel(income);
                              const regimeLabel = getIncomeRegimeLabel(income);
                              const effectiveStatusLabel = isLocked ? lockedLabel : statusLabel;
                              const effectiveStatusClass = isLocked
                                  ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300'
                                  : statusClassName;

                              return (
                                  <div key={income.id} id={`income-${income.id}`} className="space-y-3">
                                      <div
                                          data-tour-anchor={isPrimaryTourIncome ? 'incomes-created-income-row' : undefined}
                                          className={`py-2 rounded-md ${rowBg} ${isHighlighted ? 'ring-1 ring-emerald-300/70' : ''}`}
                                      >
                                          <div
                                              className="grid items-center gap-2 px-2 text-[11px] md:text-xs"
                                              style={{ gridTemplateColumns: desktopListColumns }}
                                          >
                                              <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleSelection(income.id)}
                                                  disabled={isBulkSelectBlocked}
                                                  className="h-4 w-4 accent-emerald-500"
                                                  aria-label={`Selecionar entrada ${income.description}`}
                                              />
                                              <span
                                                  className={`font-bold truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
                                                  title={income.description}
                                              >
                                                  {income.description}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`inline-flex w-full items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${effectiveStatusClass}`}>
                                                  {effectiveStatusLabel}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`} title={`${dateLabel} • ${competenceLabel}`}>
                                                  {dateLabel} • {competenceLabel}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`} title={income.category || '-'}>
                                                  {income.category || '-'}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`} title={accountName}>
                                                  {accountName}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`} title={methodLabel}>
                                                  {methodLabel}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span
                                                  className={`truncate text-center ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
                                                  title={natureLabel}
                                              >
                                                  {natureLabel}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <span
                                                  className={`truncate text-[11px] font-semibold text-left ${isLocked ? 'text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
                                                  title={`Regime ${regimeLabel}`}
                                              >
                                                  {regimeLabel}
                                              </span>
                                              <span className="text-zinc-500/70">|</span>
                                              <div className="flex items-center gap-1">
                                                  <button
                                                      type="button"
                                                      onClick={() => {
                                                          if (isPrimaryTourIncome && typeof window !== 'undefined') {
                                                              window.dispatchEvent(
                                                                  new CustomEvent('mm:tour-incomes-edit-clicked', {
                                                                      detail: { incomeId: income.id }
                                                                  })
                                                              );
                                                          }
                                                          handleEditIncome(income);
                                                      }}
                                                      data-tour-anchor={isPrimaryTourIncome ? 'incomes-created-income-edit' : undefined}
                                                      disabled={isLocked}
                                                      className="h-6 w-6 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-40"
                                                      aria-label={`Editar entrada ${income.description}`}
                                                  >
                                                      <Pencil size={12} className="mx-auto" />
                                                  </button>
                                                  <button
                                                      type="button"
                                                      onClick={() => requestDelete(income)}
                                                      data-tour-anchor={isPrimaryTourIncome ? 'incomes-created-income-delete' : undefined}
                                                      disabled={isLocked}
                                                      className="h-6 w-6 rounded-md border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition disabled:opacity-40"
                                                      aria-label={`Excluir entrada ${income.description}`}
                                                  >
                                                      <Trash2 size={12} className="mx-auto" />
                                                  </button>
                                              </div>
                                              <span className="text-zinc-500/70">|</span>
                                              <span className={`font-bold text-right ${isLocked ? 'text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                  R$ {income.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                              </span>
                                          </div>
                                      </div>

                                  </div>
                              );
                          })}

                          {!isMobile && visibleIncomes.length === 0 && (
                              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                  Nenhuma entrada encontrada com os filtros atuais.
                              </div>
                          )}

                          
                      </>
                  ) : (
                      <MobileEmptyState
                          icon={<ArrowUpCircle size={18} />}
                          title="Nenhuma entrada neste mês"
                          message="Registre a primeira entrada para alimentar relatórios e manter o fluxo de caixa atualizado."
                          actionLabel="Nova entrada"
                          onAction={handleNew}
                      />
                  )}
              </div>
          </main>

          {!isMobile && desktopFilterOpen && (
              <div className="fixed inset-0 z-[1200]" data-modal-root="true">
                  <button
                      type="button"
                      className="absolute left-0 right-0 bg-black/70 backdrop-blur-sm"
                      style={{ top: dockTopOffset, bottom: dockBottomOffset }}
                      onClick={() => setDesktopFilterOpen(false)}
                      aria-label="Fechar filtros de entradas"
                  />
                  <div
                      className="absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-200"
                      style={{
                          bottom: dockBottomOffset,
                          maxHeight: `max(320px, ${dockMaxHeight})`
                      }}
                  >
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                          <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">Filtrar Entradas</p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  Pesquise por texto e combine filtros da lista.
                              </p>
                          </div>
                          <button
                              type="button"
                              onClick={() => setDesktopFilterOpen(false)}
                              className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                              aria-label="Fechar filtros"
                          >
                              <ChevronDown size={16} />
                          </button>
                      </div>

                      <div className="pt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <div className="md:col-span-2 space-y-1">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Pesquisar na lista
                                  </label>
                                  <input
                                      type="text"
                                      value={desktopSearchTerm}
                                      onChange={(event) => setDesktopSearchTerm(event.target.value)}
                                      placeholder="Descrição, categoria, conta, forma..."
                                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/35"
                                  />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Status
                                  </label>
                                  <select
                                      value={desktopStatusFilter}
                                      onChange={(event) =>
                                          setDesktopStatusFilter(event.target.value as 'all' | 'received' | 'pending')
                                      }
                                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/35"
                                  >
                                      <option value="all">Todos</option>
                                      <option value="received">Recebidos</option>
                                      <option value="pending">Pendentes</option>
                                  </select>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Conta
                                  </label>
                                  <select
                                      value={desktopAccountFilter}
                                      onChange={(event) => setDesktopAccountFilter(event.target.value)}
                                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/35"
                                  >
                                      <option value="all">Todas</option>
                                      {desktopAccountOptions.map(option => (
                                          <option key={option.id} value={option.id}>
                                              {option.name}
                                          </option>
                                      ))}
                                  </select>
                              </div>
                              <div className="md:col-span-2 space-y-1">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Categoria
                                  </label>
                                  <select
                                      value={desktopCategoryFilter}
                                      onChange={(event) => setDesktopCategoryFilter(event.target.value)}
                                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-[13px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/35"
                                  >
                                      <option value="all">Todas</option>
                                      {desktopCategoryOptions.map(category => (
                                          <option key={category} value={category}>
                                              {category}
                                          </option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between gap-3">
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {visibleIncomes.length} resultado(s) nesta lista.
                          </p>
                          <button
                              type="button"
                              onClick={() => {
                                  setDesktopSearchTerm('');
                                  setDesktopStatusFilter('all');
                                  setDesktopAccountFilter('all');
                                  setDesktopCategoryFilter('all');
                              }}
                              className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                              Limpar filtros
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {incomeToDelete && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                      <button
                          onClick={() => setIncomeToDelete(null)}
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>

                      <div className="flex flex-col items-center text-center mb-6">
                          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                              <Trash2 size={24} />
                          </div>
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir Entrada?</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Você está prestes a excluir o registro de <strong>{incomeToDelete.description}</strong> no valor de <strong>R$ {incomeToDelete.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
                          </p>
                      </div>

                      {incomeToDelete.status === 'received' && (
                          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                  Como esta entrada já foi marcada como <strong>Recebida</strong>, o valor será debitado do saldo da conta vinculada.
                              </p>
                          </div>
                      )}

                      <div className="flex gap-3">
                          <button
                              onClick={() => setIncomeToDelete(null)}
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
                              Total selecionado: <strong>R$ {selectedTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
                          </p>
                      </div>

                      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                              Itens marcados como <strong>Recebidos</strong> terão seus valores debitados (revertidos) das contas de destino.
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

export default IncomesView;
