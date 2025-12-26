
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Wallet, ArrowUpCircle, Trash2, AlertTriangle, X, CheckSquare, Square, CheckCircle2, Circle, UserCircle, Pencil, Lock } from 'lucide-react';
import { Income, Account } from '../types';
import NewIncomeModal from './NewIncomeModal';
import CardTag from './CardTag';
import { getAccountColor } from '../services/cardColorUtils';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import MobileTransactionCard from './mobile/MobileTransactionCard';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import MobilePageShell from './mobile/MobilePageShell';
import { buildInstallmentDescription, getIncomeInstallmentSeries, normalizeInstallmentDescription } from '../utils/installmentSeries';

interface IncomesViewProps {
  onBack: () => void;
  incomes: Income[];
  onUpdateIncomes: (incomes: Income[]) => void;
  onDeleteIncome: (id: string) => void;
  accounts: Account[];
  onUpdateAccounts: (accounts: Account[]) => void;
  viewDate: Date;
  categories: string[];
  licenseId?: string | null;
  onAddCategory: (name: string) => Promise<void> | void;
  onRemoveCategory: (name: string) => Promise<void> | void;
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
  licenseId,
  onAddCategory,
  onRemoveCategory,
  minDate
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  // Filter incomes by Date
  const filteredIncomes = incomes.filter(inc => {
      // Use T12:00:00 for safe parsing
      const targetDate = new Date(inc.date + 'T12:00:00'); 
      return targetDate.getMonth() === viewDate.getMonth() && targetDate.getFullYear() === viewDate.getFullYear();
  });
  const selectableIncomes = filteredIncomes.filter(inc => !inc.locked);

  const totalAmount = filteredIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  const totalReceived = filteredIncomes.filter(i => i.status === 'received').reduce((acc, curr) => acc + curr.amount, 0);

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
              newAccounts[accIdx].currentBalance -= previous.amount;
              accountsChanged = true;
          }
      }

      if (next && next.status === 'received' && next.accountId) {
          const accIdx = newAccounts.findIndex(a => a.id === next.accountId);
          if (accIdx > -1 && canAdjustAccount(newAccounts[accIdx])) {
              newAccounts[accIdx].currentBalance += next.amount;
              accountsChanged = true;
          }
      }

      return { accounts: newAccounts, accountsChanged };
  };

  const closeIncomeModal = () => {
      setIsModalOpen(false);
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
                      newAccounts[accIdx].currentBalance += inc.amount;
                      accountsChanged = true;
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
                  if (newStatus === 'received') {
                      newAccounts[accIdx].currentBalance += inc.amount;
                  } else {
                      newAccounts[accIdx].currentBalance -= inc.amount;
                  }
                  accountsChanged = true;
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
                  newAccounts[accIdx].currentBalance -= inc.amount;
                  accountsChanged = true;
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
      setEditingIncome(null);
      setIsModalOpen(true);
  };

  const handleEditIncome = (income: Income) => {
      if (isMobile) {
          setEditingIncome(income);
          setMobileScreen('form');
          console.info('[mobile-ui] incomes', { screen: 'form', action: 'edit', id: income.id });
          return;
      }
      setEditingIncome(income);
      setIsModalOpen(true);
  };

  const getAccountById = (accId: string) => accounts.find(a => a.id === accId);
  const handleMobileBack = () => {
      if (mobileScreen === 'form') {
          setMobileScreen('list');
          setEditingIncome(null);
          console.info('[mobile-ui] incomes', { screen: 'list', action: 'back' });
          return;
      }
      onBack();
  };
  const openDrawer = (income: Income) => {
      setDrawerIncome(income);
      console.info('[mobile-ui] incomes', { screen: 'drawer', action: 'open', id: income.id });
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
      const drawerDetails = drawerIncome
          ? [
                {
                    label: 'Status',
                    value: drawerIncome.status === 'received' ? 'Recebido' : 'Pendente'
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

      return (
          <MobilePageShell
              title={mobileScreen === 'form' ? (editingIncome ? 'Editar Entrada' : 'Nova Entrada') : 'Entradas'}
              subtitle={mobileScreen === 'list' ? listSubtitle : undefined}
              onBack={handleMobileBack}
              contentClassName="space-y-4"
          >
              {mobileScreen === 'list' ? (
                  <>
                      <button
                          onClick={handleNew}
                          className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 text-sm shadow-lg shadow-emerald-900/20"
                      >
                          Nova Entrada
                      </button>

                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4 shadow-sm">
                              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Resumo do mês</p>
                              <div className="mt-2 space-y-1 text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                      <span className="text-zinc-500 dark:text-zinc-400">Previsto</span>
                                      <span className="font-semibold text-zinc-900 dark:text-white">
                                          R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                      <span className="text-zinc-500 dark:text-zinc-400">Recebido</span>
                                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                          R$ {totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                  </div>
                              </div>
                          </div>

                          <div className="space-y-3">
                              {filteredIncomes.length > 0 ? (
                                  filteredIncomes.map((income) => {
                                      const isLocked = Boolean(income.locked);
                                      const statusLabel = income.status === 'received' ? 'Recebido' : 'Pendente';
                                      const statusClass =
                                          income.status === 'received'
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
                                  <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-6 text-center text-zinc-500 text-sm">
                                      Nenhuma entrada registrada para este mês.
                                  </div>
                              )}
                          </div>
                  </>
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
                          licenseId={licenseId}
                          categoryType="incomes"
                          onAddCategory={onAddCategory}
                          onRemoveCategory={onRemoveCategory}
                          defaultDate={viewDate}
                          minDate={minDate}
                      />
                  </div>
              )}

              <MobileTransactionDrawer
                  open={Boolean(drawerIncome)}
                  title={drawerIncome?.description || ''}
                  amount={
                      drawerIncome
                          ? `R$ ${drawerIncome.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : undefined
                  }
                  statusLabel={drawerIncome?.status === 'received' ? 'Recebido' : 'Pendente'}
                  statusClassName={
                      drawerIncome?.status === 'received'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                  }
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
          </MobilePageShell>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
        
        {/* ... Header Summary ... */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 relative z-10 -mt-6">
            <button 
                onClick={onBack}
                className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={16} /> Voltar ao Dashboard
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-[#151517] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                        <ArrowUpCircle className="text-emerald-500" />
                        Entradas
                    </h1>
                    <p className="text-sm text-zinc-500">
                        {filteredIncomes.length} registros • Previsto: <strong className="text-zinc-900 dark:text-white">R$ {totalAmount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong> • Recebido: <span className="text-emerald-600 font-bold">R$ {totalReceived.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </p>
                </div>
                <button 
                    onClick={handleNew}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                >
                    <Plus size={20} /> Nova Entrada
                </button>
            </div>
        </div>

        {/* ... Bulk Actions ... */}
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
                            className="flex-none p-1.5 bg-white/10 hover:bg-red-500 text-white rounded-lg transition-colors"
                            title="Excluir Selecionados"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
             </div>
        )}

        {/* Table List */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="bg-white dark:bg-[#151517] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-4 py-4 w-12 text-center">
                                    <button 
                                        onClick={toggleSelectAll}
                                        className="text-zinc-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {selectedIds.length > 0 && selectedIds.length === selectableIncomes.length 
                                            ? <CheckSquare size={18} className="text-emerald-600" /> 
                                            : <Square size={18} />
                                        }
                                    </button>
                                </th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold">Data</th>
                                <th className="px-6 py-4 font-semibold">Descrição / Origem</th>
                                <th className="px-6 py-4 font-semibold">Destino</th>
                                <th className="px-6 py-4 font-semibold">Categoria</th>
                                <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                <th className="px-6 py-4 font-semibold text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredIncomes.length > 0 ? (
                                filteredIncomes.map(income => {
                                    const isSelected = selectedIds.includes(income.id);
                                    const isHighlighted = highlightedId === income.id;
                                    const isLocked = Boolean(income.locked);
                                    
                                    return (
                                    <tr 
                                        key={income.id}
                                        id={`income-${income.id}`}
                                        className={`transition-colors group ${isHighlighted ? 'ring-2 ring-emerald-400/70 bg-emerald-50/80 dark:bg-emerald-900/30 shadow-lg shadow-emerald-500/20' : isSelected ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'hover:bg-zinc-50 dark:hover:bg-[#1a1a1a]'} ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                        <td className="px-4 py-4 text-center">
                                            <button 
                                                onClick={() => toggleSelection(income.id)}
                                                className="text-zinc-400 hover:text-emerald-600 transition-colors disabled:opacity-60"
                                                disabled={isLocked}
                                            >
                                                {isLocked ? (
                                                    <Lock size={16} className="text-amber-500" />
                                                ) : isSelected 
                                                    ? <CheckSquare size={18} className="text-emerald-600" /> 
                                                    : <Square size={18} />
                                                }
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    income.status === 'received' 
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                                }`}>
                                                    {income.status === 'received' ? 'Recebido' : 'Pendente'}
                                                </span>
                                                {income.lockedReason === 'epoch_mismatch' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                        Arquivado
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {new Date(income.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            {income.installments && (
                                                <span className="ml-2 text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-md">
                                                    {income.installmentNumber}/{income.totalInstallments}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">
                                            {income.description}
                                            {income.createdBy && (
                                                <span className="block text-[10px] text-zinc-400 font-normal mt-0.5 flex items-center gap-1">
                                                    <UserCircle size={10} /> Lançado por: {income.createdBy}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {(() => {
                                                const account = getAccountById(income.accountId);
                                                return account ? (
                                                    <CardTag label={account.name} color={getAccountColor(account)} />
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <Wallet size={14} className="text-emerald-500" />
                                                        <span className="text-xs">Conta Deletada</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300">
                                            {income.category}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold ${isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                            + R$ {income.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {!isLocked && (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEditIncome(income)}
                                                        className="p-2 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                        title="Editar Entrada"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => requestDelete(income)}
                                                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                        title="Excluir Entrada"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )})
                            ) : (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">
                                        Nenhuma entrada registrada para este mês.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>

        <NewIncomeModal 
            isOpen={isModalOpen}
            onClose={closeIncomeModal}
            onSave={handleSaveIncome}
            initialData={editingIncome}
            accounts={accounts}
            categories={categories}
            licenseId={licenseId}
            categoryType="incomes"
            onAddCategory={onAddCategory}
            onRemoveCategory={onRemoveCategory}
            defaultDate={viewDate} // PASS VIEW DATE
            minDate={minDate}
        />

        {/* ... Modal Components ... */}
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
