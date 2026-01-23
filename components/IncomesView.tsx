
import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpCircle, Trash2, AlertTriangle, X, CheckSquare, Square, CheckCircle2, Circle, Lock, Home, History, ChevronDown } from 'lucide-react';
import { Income, Account } from '../types';
import NewIncomeModal from './NewIncomeModal';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import MobileTransactionCard from './mobile/MobileTransactionCard';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import MobileEmptyState from './mobile/MobileEmptyState';
import { buildInstallmentDescription, getIncomeInstallmentSeries, normalizeInstallmentDescription } from '../utils/installmentSeries';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';
import { incomeStatusLabel, normalizeIncomeStatus } from '../utils/statusUtils';

interface IncomesViewProps {
  onBack: () => void;
  incomes: Income[];
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

const IncomesView: React.FC<IncomesViewProps> = ({ 
  onBack, 
  incomes, 
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
  const [inlineNewOpen, setInlineNewOpen] = useState(false);
  const [inlineEditIncomeId, setInlineEditIncomeId] = useState<string | null>(null);
  const [isIncomeListExpanded, setIsIncomeListExpanded] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [incomeToDelete, setIncomeToDelete] = useState<Income | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileScreen, setMobileScreen] = useState<'list' | 'form'>('list');
  const [drawerIncome, setDrawerIncome] = useState<Income | null>(null);
  const headerLayoutLoggedRef = useRef(false);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const canAdjustAccount = (account?: Account | null) => Boolean(account && !account.locked);

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

  // Filter incomes by Date
  const filteredIncomes = incomes.filter(inc => {
      // Use T12:00:00 for safe parsing
      const targetDate = new Date(inc.date + 'T12:00:00'); 
      return targetDate.getMonth() === viewDate.getMonth() && targetDate.getFullYear() === viewDate.getFullYear();
  });
  const selectableIncomes = filteredIncomes.filter(inc => !inc.locked);

  const totalAmount = filteredIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalReceived = filteredIncomes.filter(i => i.status === 'received').reduce((acc, curr) => acc + curr.amount, 0);
  const shouldCollapseIncomes = filteredIncomes.length > 2;
  const visibleIncomes = shouldCollapseIncomes && !isIncomeListExpanded ? filteredIncomes.slice(0, 2) : filteredIncomes;
  const extraIncomeCount = Math.max(filteredIncomes.length - visibleIncomes.length, 0);

  // ... rest of logic/handlers ...
  // --- SELECTION CALCULATIONS ---
  const selectedIncomes = filteredIncomes.filter(i => selectedIds.includes(i.id));
  const selectedTotalAmount = selectedIncomes.reduce((acc, curr) => acc + curr.amount, 0);

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
              onUpdateAccounts(newAccounts);
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
                          onUpdateAccounts(nextAccounts);
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
                      onUpdateAccounts(updatedAccounts);
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
                  onUpdateAccounts(updatedAccounts);
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
          onUpdateAccounts(newAccounts);
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
          onUpdateAccounts(newAccounts);
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
      setInlineEditIncomeId(null);
      setEditingIncome(null);
      setDrawerIncome(null);
      setInlineNewOpen(prev => !prev);
  };

  const handleEditIncome = (income: Income) => {
      if (isMobile) {
          setEditingIncome(income);
          setMobileScreen('form');
          console.info('[mobile-ui] incomes', { screen: 'form', action: 'edit', id: income.id });
          return;
      }
      setEditingIncome(income);
      setInlineNewOpen(false);
      setInlineEditIncomeId(income.id);
      setDrawerIncome(income);
  };

  const getAccountById = (accId: string) => accounts.find(a => a.id === accId);
  const getIncomeStatusMeta = (income: Income) => {
      const normalizedStatus = normalizeIncomeStatus(income.status);
      const statusLabel = incomeStatusLabel(income.status);
      const statusClassName =
          normalizedStatus === 'received'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      return { normalizedStatus, statusLabel, statusClassName };
  };

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
          income.taxStatus ? { label: 'Natureza', value: income.taxStatus } : null,
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
      if (!drawerIncome) {
          setInlineEditIncomeId(null);
          return;
      }
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
                drawerIncome.taxStatus ? { label: 'Natureza', value: drawerIncome.taxStatus } : null,
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
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{filteredIncomes.length}</p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Previsto</p>
                              <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                                  R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recebido</p>
                              <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  R$ {totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                          </div>
                      </div>
                      <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                          {onOpenAudit && (
                              <button
                                  onClick={onOpenAudit}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-300 hover:border-emerald-200 dark:hover:border-emerald-700 transition"
                                  title="Auditoria do dia"
                              >
                                  <History size={14} />
                                  Auditoria
                              </button>
                          )}
                          <button
                              onClick={handleNew}
                              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-emerald-900/20"
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
                          className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+128px)]"
                          style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 28 : undefined }}
                      >
                          {isListView ? (
                              <div className="space-y-3">
                                  {filteredIncomes.length > 0 ? (
                                      filteredIncomes.map((income) => {
                                          const isLocked = Boolean(income.locked);
                                          const normalizedStatus = normalizeIncomeStatus(income.status);
                                          const statusLabel = incomeStatusLabel(income.status);
                                          const statusClass =
                                              normalizedStatus === 'received'
                                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
                                          const accountName = getAccountById(income.accountId)?.name || 'Conta Deletada';
                                          return (
                                              <div key={income.id} id={`income-${income.id}`}>
                                                  <MobileTransactionCard
                                                      title={income.description}
                                                      amount={`+ R$ ${income.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                      amountClassName={isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}
                                                      dateLabel={new Date(income.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                      statusLabel={statusLabel}
                                                      statusClassName={statusClass}
                                                      category={income.category}
                                                      subtitle={accountName}
                                                      isHighlighted={highlightedId === income.id}
                                                      isLocked={isLocked || income.lockedReason === 'epoch_mismatch'}
                                                      onClick={() => openDrawer(income)}
                                                  />
                                              </div>
                                          );
                                      })
                                  ) : (
                                      <MobileEmptyState
                                          icon={<ArrowUpCircle size={18} />}
                                          message="Nenhuma entrada registrada para este mês."
                                      />
                                  )}
                              </div>
                          ) : (
                              <div className="space-y-4">
                                  <NewIncomeModal
                                      isOpen
                                      variant="inline"
                                      onClose={handleMobileFormClose}
                                      onSave={handleSaveIncome}
                                      initialData={editingIncome}
                                      accounts={accounts}
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
                          )}
                      </div>
                  </div>
              </div>

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
              <button
                  type="button"
                  onClick={onBack}
                  className="h-8 w-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                  aria-label="Voltar para o início"
              >
                  <Home size={16} />
              </button>
              <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Entradas</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Registros</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{filteredIncomes.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Previsto</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                      R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recebido</p>
                  <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                      R$ {totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
              </div>
          </div>

          <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {onOpenAudit && (
                  <button
                      onClick={onOpenAudit}
                      className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-300 hover:border-emerald-200 dark:hover:border-emerald-700 transition"
                      title="Auditoria do dia"
                  >
                      <History size={14} />
                      Auditoria
                  </button>
              )}
              <button
                  onClick={handleNew}
                  className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-emerald-900/20"
              >
                  Nova Entrada
              </button>
          </div>
      </div>
  );

  const summarySection = (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 pt-6">
          <div className="rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {desktopHeader}
          </div>
      </div>
  );

  return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
          {summarySection}

          {selectedIds.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4 animate-in fade-in slide-in-from-top-2">
                  <div className="bg-emerald-600 dark:bg-emerald-900 text-white p-3 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
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
                              onClick={() => handleBulkStatusChange('received')}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-bold transition-colors"
                          >
                              <CheckCircle2 size={14} /> Marcar Recebidos
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

          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-3">
                  {inlineNewOpen && (
                      <NewIncomeModal
                          isOpen
                          variant="inline"
                          onClose={closeIncomeModal}
                          onSave={handleSaveIncome}
                          initialData={null}
                          accounts={accounts}
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
                          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                              <button
                                  type="button"
                                  onClick={toggleSelectAll}
                                  disabled={selectableIncomes.length === 0}
                                  className="flex items-center gap-2 font-semibold disabled:opacity-50"
                              >
                                  {allSelectableSelected ? (
                                      <CheckSquare size={14} className="text-emerald-600" />
                                  ) : (
                                      <Square size={14} />
                                  )}
                                  <span>{allSelectableSelected ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                              </button>
                              <span className="text-[11px]">{selectedIds.length} selecionados</span>
                          </div>

                          {visibleIncomes.map(income => {
                              const isSelected = selectedIds.includes(income.id);
                              const isHighlighted = highlightedId === income.id;
                              const lockedReason = income.lockedReason;
                              const isLocked = Boolean(income.locked || lockedReason === 'epoch_mismatch');
                              const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                              const { statusLabel, statusClassName } = getIncomeStatusMeta(income);
                              const accountName = getAccountById(income.accountId)?.name || 'Conta Deletada';
                              const isExpanded = drawerIncome?.id === income.id;
                              const isInlineEditing = inlineEditIncomeId === income.id;
                              const details = isExpanded ? buildIncomeDetails(income) : [];

                              return (
                                  <div key={income.id} id={`income-${income.id}`} className="space-y-3">
                                      <div className="relative">
                                          <MobileTransactionCard
                                              title={income.description}
                                              amount={`+ R$ ${income.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                              amountClassName={
                                                  isLocked
                                                      ? 'text-zinc-400 dark:text-zinc-500'
                                                      : 'text-emerald-600 dark:text-emerald-400'
                                              }
                                              dateLabel={new Date(income.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                              statusLabel={statusLabel}
                                              statusClassName={statusClassName}
                                              category={income.category}
                                              subtitle={accountName}
                                              isHighlighted={isHighlighted || isSelected}
                                              isLocked={isLocked}
                                              lockedLabel={lockedLabel}
                                              onClick={isLocked ? undefined : () => openDrawer(income)}
                                          />
                                          <button
                                              type="button"
                                              onClick={(event) => {
                                                  event.stopPropagation();
                                                  toggleSelection(income.id);
                                              }}
                                              disabled={isLocked}
                                              className="absolute right-3 top-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-[#151517]/90 p-1.5 text-zinc-500 hover:text-emerald-600 disabled:opacity-60"
                                              aria-label={`Selecionar entrada ${income.description}`}
                                          >
                                              {isLocked ? (
                                                  <Lock size={14} className="text-amber-500" />
                                              ) : isSelected ? (
                                                  <CheckSquare size={14} className="text-emerald-600" />
                                              ) : (
                                                  <Square size={14} />
                                              )}
                                          </button>
                                      </div>

                                      {isExpanded && (
                                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
                                              <div className="flex items-center justify-between">
                                                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">Detalhes</span>
                                                  <button
                                                      type="button"
                                                      onClick={() => setDrawerIncome(null)}
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
                                                          onClick={() => handleEditIncome(income)}
                                                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
                                                      >
                                                          Editar
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={() => requestDelete(income)}
                                                          className="rounded-xl border border-rose-200 dark:border-rose-900/40 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition"
                                                      >
                                                          Excluir
                                                      </button>
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      {!isLocked && isInlineEditing && (
                                          <NewIncomeModal
                                              isOpen
                                              variant="inline"
                                              onClose={closeIncomeModal}
                                              onSave={handleSaveIncome}
                                              initialData={editingIncome ?? income}
                                              accounts={accounts}
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
                                  </div>
                              );
                          })}

                          {shouldCollapseIncomes && (
                              <button
                                  type="button"
                                  onClick={() => setIsIncomeListExpanded(prev => !prev)}
                                  className="w-full rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                              >
                                  {isIncomeListExpanded
                                      ? 'Clique para recolher'
                                      : `Clique para expandir (+${extraIncomeCount})`}
                                  <ChevronDown
                                      size={14}
                                      className={`transition-transform ${isIncomeListExpanded ? 'rotate-180' : ''}`}
                                  />
                              </button>
                          )}
                      </>
                  ) : (
                      <MobileEmptyState
                          icon={<ArrowUpCircle size={18} />}
                          message="Nenhuma entrada registrada para este mês."
                      />
                  )}
              </div>
          </main>

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
