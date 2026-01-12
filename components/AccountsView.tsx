
import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Landmark, 
  Smartphone, 
  Globe, 
  TrendingUp, 
  Banknote,
  Pencil,
  CheckSquare,
  Trash2,
  X,
  AlertTriangle,
  History,
  Lock,
  Info
} from 'lucide-react';
import NewAccountModal from './NewAccountModal';
import { Account } from '../types';
import { AuditLogInput } from '../services/auditService';
import CardTag from './CardTag';
import { getAccountColor, withAlpha } from '../services/cardColorUtils';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import MobilePageShell from './mobile/MobilePageShell';
import type { BalanceTrailEntry, RealBalanceDebug } from '../services/realBalanceEngine';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

interface AccountsViewProps {
  onBack: () => void;
  accounts: Account[];
  onUpdateAccounts: (accounts: Account[]) => void;
  onDeleteAccount: (id: string) => void;
  accountTypes: string[];
  onUpdateAccountTypes: (types: string[]) => void;
  onAuditLog?: (entry: AuditLogInput) => void;
  onOpenAudit?: () => void;
  balanceSnapshot?: {
    byAccountId: Record<string, number>;
    diffs: Record<string, number>;
    total: number;
    legacyTotal: number;
    cutoff: string;
    debug?: RealBalanceDebug;
  };
}

const AccountsView: React.FC<AccountsViewProps> = ({ 
  onBack, 
  accounts, 
  onUpdateAccounts, 
  onDeleteAccount,
  accountTypes, 
  onUpdateAccountTypes,
  onAuditLog,
  onOpenAudit,
  balanceSnapshot
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [auditAccountId, setAuditAccountId] = useState<string | null>(null);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const loggedLockedRef = useRef<Set<string>>(new Set());
  const renderLogRef = useRef<number | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
      console.info('[ui][accounts] mount', { count: accounts.length });
  }, []);

  useEffect(() => {
      if (renderLogRef.current === accounts.length) return;
      renderLogRef.current = accounts.length;
      console.info('[ui][accounts] render_list', { count: accounts.length });
  }, [accounts.length]);

  useEffect(() => {
      accounts.forEach(account => {
          if (account.locked && !loggedLockedRef.current.has(account.id)) {
              console.info('[ui][account] rendered as locked', {
                  accountId: account.id,
                  reason: account.lockedReason || (account.decryptError ? 'decrypt_failed' : 'unknown')
              });
              loggedLockedRef.current.add(account.id);
          }
      });
  }, [accounts]);

  useEffect(() => {
      if (highlightTarget && highlightTarget.entity === 'account') {
          const targetId = highlightTarget.id;
          setHighlightedId(targetId);
          requestAnimationFrame(() => {
              const element = document.getElementById(`account-${targetId}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          const timer = setTimeout(() => {
              setHighlightedId(null);
              setHighlightTarget(null);
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [highlightTarget, setHighlightTarget]);

  const unlockedAccounts = accounts.filter(acc => !acc.locked);
  const isSelectionMode = selectedIds.length > 0;

  const resolveRealBalance = (account: Account) => {
    const computed = balanceSnapshot?.byAccountId?.[account.id];
    return Number.isFinite(computed) ? computed : account.currentBalance;
  };

  const displayBalance = isSelectionMode
    ? unlockedAccounts.filter(acc => selectedIds.includes(acc.id)).reduce((acc, curr) => acc + resolveRealBalance(curr), 0)
    : unlockedAccounts.reduce((acc, curr) => acc + resolveRealBalance(curr), 0);

  const displayCount = isSelectionMode ? selectedIds.length : accounts.length;
  const displayLabel = isSelectionMode ? 'Saldo Parcial (Selecionado)' : 'Saldo Total';
  const auditAccount = auditAccountId ? accounts.find(acc => acc.id === auditAccountId) || null : null;
  const auditTrails = auditAccountId ? balanceSnapshot?.debug?.trailsByAccountId?.[auditAccountId] ?? [] : [];
  const sortedAuditTrails = React.useMemo(() => {
    if (!auditTrails.length) return [] as BalanceTrailEntry[];
    return [...auditTrails].sort((a, b) => a.date.localeCompare(b.date));
  }, [auditTrails]);

  const getIconForType = (type: string) => {
    if (type.includes('Carteira') || type.includes('Nubank')) return <Smartphone size={24} className="text-purple-600" />;
    if (type.includes('Rendimentos') || type.includes('Investimento')) return <TrendingUp size={24} className="text-purple-600" />;
    if (type.includes('Dinheiro')) return <Banknote size={24} className="text-purple-600" />;
    if (type.includes('Internacional')) return <Globe size={24} className="text-purple-600" />;
    return <Landmark size={24} className="text-purple-600" />;
  };

  const normalizeLabel = (value?: string | null) => {
      return (value ?? '')
          .toString()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
  };

  const includesAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));

  const isInvestmentAccount = (account: Account) => {
      const normalizedType = normalizeLabel(account.type);
      const normalizedName = normalizeLabel(account.name);
      const investmentTerms = ['rendimento', 'invest', 'aplica', 'cdi', 'selic', 'yield'];
      const typeMatches = includesAny(normalizedType, investmentTerms);
      const nameMatches = includesAny(normalizedName, investmentTerms) || normalizedName.startsWith('mp ');
      const numericYieldRate = Number(account.yieldRate);
      const hasYieldRate = Number.isFinite(numericYieldRate) && numericYieldRate > 0;
      const hasYieldIndex = Boolean(account.yieldIndex);
      const hasYieldHistory = Array.isArray(account.yieldHistory) && account.yieldHistory.length > 0;
      const hasLastYield = Boolean(account.lastYield || account.lastYieldDate || account.lastYieldNote);
      return typeMatches || nameMatches || hasYieldRate || hasYieldIndex || hasYieldHistory || hasLastYield;
  };

  const isEditableAccount = (account: Account) => !isInvestmentAccount(account) && !account.locked;

  // Modified to handle creation via prop update
  const handleSaveAccount = (accountData: any) => {
    let updatedAccounts;
    if (accountData.id) {
        const previousAccount = accounts.find(acc => acc.id === accountData.id);
        if (!previousAccount) {
            setIsModalOpen(false);
            setEditingAccount(null);
            return;
        }
        const nextNotes = (accountData.notes ?? '').toString();
        const previousNotes = (previousAccount.notes ?? '').toString();
        const nextBalance = Number.isFinite(accountData.currentBalance)
            ? Number(accountData.currentBalance)
            : previousAccount.currentBalance;
        let balanceChanged = Number.isFinite(accountData.currentBalance) && nextBalance !== previousAccount.currentBalance;
        let nextBalanceHistory = previousAccount.balanceHistory ? [...previousAccount.balanceHistory] : [];
        let balanceAdjustmentEntry = null as null | {
            date: string;
            value: number;
            previousValue: number;
            newValue: number;
            delta: number;
            source: string;
        };

        if (balanceChanged) {
            const mutationId = `account:manual:${previousAccount.id}:${previousAccount.currentBalance}->${nextBalance}`;
            const shouldApply = shouldApplyLegacyBalanceMutation(mutationId, {
                source: 'accounts_view',
                action: 'manual_balance',
                accountId: previousAccount.id,
                entityId: previousAccount.id,
                amount: nextBalance
            });
            if (!shouldApply) {
                balanceChanged = false;
            }
        }

        if (balanceChanged) {
            const adjustmentDate = new Date().toISOString().split('T')[0];
            const delta = nextBalance - previousAccount.currentBalance;
            balanceAdjustmentEntry = {
                date: adjustmentDate,
                value: nextBalance,
                previousValue: previousAccount.currentBalance,
                newValue: nextBalance,
                delta,
                source: 'manual_edit'
            };
            const existingIndex = nextBalanceHistory.findIndex(entry => entry.date === adjustmentDate);
            if (existingIndex >= 0) {
                nextBalanceHistory[existingIndex] = {
                    ...nextBalanceHistory[existingIndex],
                    ...balanceAdjustmentEntry
                };
            } else {
                nextBalanceHistory = [...nextBalanceHistory, balanceAdjustmentEntry];
            }
        }

        const updatedAccount: Account = {
            ...previousAccount,
            name: accountData.name,
            type: accountData.type,
            color: accountData.color,
            nature: accountData.nature ?? previousAccount.nature,
            initialBalance: accountData.balance,
            yieldRate: accountData.yieldRate,
            yieldIndex: accountData.yieldIndex,
            notes: nextNotes,
            currentBalance: balanceChanged ? nextBalance : previousAccount.currentBalance,
            balanceHistory: balanceChanged ? nextBalanceHistory : previousAccount.balanceHistory
        };
        updatedAccounts = accounts.map(acc => (
            acc.id === accountData.id ? updatedAccount : acc
        ));
        const changes: string[] = [];
        if (previousAccount.name !== updatedAccount.name) changes.push('nome');
        if (previousAccount.type !== updatedAccount.type) changes.push('tipo');
        if (previousAccount.color !== updatedAccount.color) changes.push('cor');
        if (previousAccount.initialBalance !== updatedAccount.initialBalance) changes.push('saldo inicial');
        if (previousNotes !== nextNotes) changes.push('observações');
        if (previousAccount.yieldRate !== updatedAccount.yieldRate) changes.push('taxa');

        if (onAuditLog) {
            if (balanceChanged && balanceAdjustmentEntry) {
                onAuditLog({
                    actionType: 'balance_adjustment',
                    description: `Saldo da conta ${updatedAccount.name} ajustado de ${formatCurrency(previousAccount.currentBalance)} para ${formatCurrency(nextBalance)}.`,
                    entityType: 'account',
                    entityId: updatedAccount.id,
                    metadata: {
                        previousBalance: previousAccount.currentBalance,
                        newBalance: nextBalance,
                        delta: nextBalance - previousAccount.currentBalance,
                        date: balanceAdjustmentEntry.date,
                        source: 'manual_edit'
                    }
                });
            }

            if (changes.length > 0) {
                onAuditLog({
                    actionType: 'account_edited',
                    description: `Conta ${updatedAccount.name} atualizada (${changes.join(', ')}).`,
                    entityType: 'account',
                    entityId: updatedAccount.id,
                    metadata: {
                        previous: {
                            name: previousAccount.name,
                            type: previousAccount.type,
                            color: previousAccount.color,
                            initialBalance: previousAccount.initialBalance,
                            notes: previousNotes
                        },
                        next: {
                            name: updatedAccount.name,
                            type: updatedAccount.type,
                            color: updatedAccount.color,
                            initialBalance: updatedAccount.initialBalance,
                            notes: nextNotes
                        }
                    }
                });
            }
        }
    } else {
        const newAccount: Account = {
            id: Math.random().toString(36).substr(2, 9),
            name: accountData.name,
            type: accountData.type,
            initialBalance: accountData.balance,
            currentBalance: accountData.balance,
            yieldRate: accountData.yieldRate,
            yieldIndex: accountData.yieldIndex,
            color: accountData.color,
            notes: (accountData.notes ?? '').toString(),
            nature: accountData.nature ?? 'PJ'
        };
        updatedAccounts = [...accounts, newAccount];
        if (onAuditLog) {
            onAuditLog({
                actionType: 'account_created',
                description: `Conta ${newAccount.name} criada (${newAccount.type}).`,
                entityType: 'account',
                entityId: newAccount.id,
                metadata: {
                    name: newAccount.name,
                    type: newAccount.type,
                    initialBalance: newAccount.initialBalance,
                    currentBalance: newAccount.currentBalance,
                    notes: newAccount.notes || ''
                }
            });
        }
    }
    onUpdateAccounts(updatedAccounts);
    setIsModalOpen(false);
    setEditingAccount(null);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingAccount(null);
  };

  const requestDelete = (e: React.MouseEvent, account: Account) => {
      e.stopPropagation();
      console.info('[ui][accounts][delete]', { accountId: account.id, mode: 'request' });
      setAccountToDelete(account);
  };

  const confirmDelete = () => {
      if (accountToDelete) {
          console.info('[ui][accounts][delete]', { accountId: accountToDelete.id, mode: 'confirm' });
          onDeleteAccount(accountToDelete.id);
          setAccountToDelete(null);
      }
  };

  const handleOpenNew = () => {
      setEditingAccount(null);
      setIsModalOpen(true);
  };

  const handleEditAccount = (e: React.MouseEvent, account: Account) => {
      e.stopPropagation();
      if (account.locked) return;
      console.info('[ui][accounts][edit]', { accountId: account.id });
      setEditingAccount(account);
      setIsModalOpen(true);
  };

  const toggleSelection = (id: string) => {
      if (selectedIds.includes(id)) {
          setSelectedIds(selectedIds.filter(i => i !== id));
      } else {
          setSelectedIds([...selectedIds, id]);
      }
  };

  useEffect(() => {
      if (selectedIds.length === 0) return;
      const lockedIds = new Set(accounts.filter(acc => acc.locked).map(acc => acc.id));
      const nextSelected = selectedIds.filter(id => !lockedIds.has(id));
      if (nextSelected.length !== selectedIds.length) {
          setSelectedIds(nextSelected);
      }
  }, [accounts, selectedIds]);

  const summaryWrapperClass = isMobile
    ? 'relative z-20 space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 relative z-20 -mt-6 pt-10';

  const listWrapperClass = isMobile
    ? 'space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500';

  const summarySection = (
      <div className={summaryWrapperClass}>
          {!isMobile && (
              <button
                 onClick={onBack}
                 className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
              >
                  <ArrowLeft size={16} /> Voltar ao Dashboard
              </button>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300">

              {/* Dynamic Balance Display */}
              <div className={`rounded-full px-6 py-3 shadow-lg border flex items-center gap-3 transition-all duration-300 ${isSelectionMode ? 'bg-indigo-600 border-indigo-500 text-white scale-105' : 'bg-white dark:bg-[#1a1a1a] border-zinc-200 dark:border-zinc-800'}`}>
                  <div className="flex flex-col">
                      <span className={`text-sm font-semibold ${isSelectionMode ? 'text-indigo-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                          {displayCount} {displayCount === 1 ? 'conta' : 'contas'} • {displayLabel}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide ${isSelectionMode ? 'text-indigo-200' : 'text-zinc-400 dark:text-zinc-500'}`}>
                          Saldo atual
                      </span>
                  </div>
                  <div className="flex flex-col items-end">
                      <span className={`text-lg font-bold ${isSelectionMode ? 'text-white' : 'text-zinc-900 dark:text-white'}`}>
                          R$ {displayBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                  </div>
              </div>

              {/* Action Button: Only New Account now */}
              <div className="flex items-center gap-3">
                  {onOpenAudit && (
                      <button
                          onClick={onOpenAudit}
                          className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-500 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-500/10 transition"
                          title="Auditoria do dia"
                      >
                          <History size={18} />
                      </button>
                  )}
                  <button
                    onClick={handleOpenNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                      <Plus size={20} />
                      Nova Conta
                  </button>
              </div>
          </div>
      </div>
  );

  const listSection = (
      <main className={listWrapperClass}>
          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] overflow-hidden">
              {accounts.map(account => {
                  const isSelected = selectedIds.includes(account.id);
                  const isHighlighted = highlightedId === account.id;
                  const accountColor = getAccountColor(account);
                  const iconBg = withAlpha(accountColor, 0.15);
                  const canEditAccount = isEditableAccount(account);
                  const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                  const isLocked = Boolean(account.locked || account.decryptError);
                  const computedBalance = resolveRealBalance(account);
                  const auditTrails = balanceSnapshot?.debug?.trailsByAccountId?.[account.id] ?? [];
                  const canShowDetails = auditTrails.length > 0;

                  return (
                    <div 
                        key={account.id}
                        id={`account-${account.id}`}
                        onClick={() => {
                            if (isLocked) return;
                            toggleSelection(account.id);
                        }}
                        className={`
                            w-full px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-200 select-none group
                            ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}
                            ${isHighlighted
                                ? 'bg-indigo-50/80 dark:bg-indigo-900/30 ring-2 ring-indigo-400/70'
                                : isSelected 
                                    ? 'bg-indigo-50/60 dark:bg-indigo-900/10 ring-1 ring-indigo-500/60' 
                                    : 'bg-white dark:bg-[#111113] hover:bg-zinc-50 dark:hover:bg-white/5'}
                        `}
                    >
                        <div className="grid grid-cols-[auto,1fr,auto] gap-4 items-start">
                            <div className="flex items-center gap-3 pt-1">
                                <div className={`
                                    w-6 h-6 rounded-md border flex items-center justify-center transition-colors
                                    ${isSelected 
                                        ? 'bg-indigo-600 border-indigo-600 text-white' 
                                        : 'bg-transparent border-zinc-300 dark:border-zinc-600 text-transparent group-hover:border-zinc-400'}
                                `}>
                                    {!isLocked && (
                                        <CheckSquare size={16} fill="currentColor" className={isSelected ? 'block' : 'hidden'} />
                                    )}
                                    {isLocked && <Lock size={14} className="text-amber-500" />}
                                </div>

                                <div 
                                    className="p-3 rounded-xl"
                                    style={{ backgroundColor: iconBg, color: accountColor }}
                                >
                                    {getIconForType(account.type)}
                                </div>
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-base text-zinc-900 dark:text-white truncate" title={account.name}>
                                        {account.name}
                                    </h3>
                                    <CardTag label={account.type} color={accountColor} size="sm" />
                                </div>

                                {isLocked ? (
                                    <div className="mt-2 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                        <Lock size={14} />
                                        {lockedReason === 'epoch_mismatch'
                                            ? 'Dados anteriores arquivados (atualização de segurança)'
                                            : 'Conta protegida (dados criptografados)'}
                                    </div>
                                ) : (
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                                        <span>Saldo Inicial: R$ {account.initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        {(account.yieldRate !== undefined) && (
                                            <span className="text-blue-500 font-semibold">
                                                {account.yieldRate}% do {account.yieldIndex || 'CDI'}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col items-end gap-3 min-w-[104px]">
                                <div className="flex items-center gap-2">
                                    {canEditAccount && !isLocked && (
                                        <button
                                            type="button"
                                            onClick={(e) => handleEditAccount(e, account)}
                                            aria-label={`Editar conta ${account.name}`}
                                            className="h-11 w-11 flex items-center justify-center rounded-full text-zinc-500 hover:text-indigo-600 hover:bg-indigo-500/10 transition-colors"
                                            title="Editar conta"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                    )}
                                    {!isLocked && (
                                        <button 
                                            onClick={(e) => requestDelete(e, account)}
                                            aria-label={`Excluir conta ${account.name}`}
                                            className="h-11 w-11 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                            title="Excluir Conta"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>

                                {!isLocked && (
                                    <div className="text-right space-y-1">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Saldo atual</span>
                                        </div>
                                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                            R$ {computedBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        {canShowDetails && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAuditAccountId(account.id);
                                                }}
                                                className="text-[11px] text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                                                title="Ver detalhamento do saldo"
                                                aria-label={`Ver detalhamento do saldo da conta ${account.name}`}
                                            >
                                                Ver detalhamento do saldo
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
              )})}
          </div>
      </main>
  );

  const modals = (
      <>
          <NewAccountModal 
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveAccount}
            initialData={editingAccount}
            mode={editingAccount ? 'edit' : 'create'}
            accountTypes={accountTypes}
            onUpdateAccountTypes={onUpdateAccountTypes}
            source="accounts"
          />

          {auditAccount && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-lg w-full p-6 relative animate-in zoom-in-95 duration-200">
                      <button
                          onClick={() => setAuditAccountId(null)}
                          aria-label="Fechar detalhamento do saldo"
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>

                      <div className="flex items-start gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                              <Info size={18} />
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Detalhamento do saldo • {auditAccount.name}</h3>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Saldo atual: R$ {resolveRealBalance(auditAccount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              {balanceSnapshot?.cutoff && (
                                  <p className="text-[11px] text-zinc-400 mt-1">Corte: {balanceSnapshot.cutoff}</p>
                              )}
                          </div>
                      </div>

                      {sortedAuditTrails.length === 0 ? (
                          <div className="text-sm text-zinc-500 dark:text-zinc-400">
                              Sem eventos para auditoria neste período.
                          </div>
                      ) : (
                          <div className="max-h-72 overflow-auto space-y-2 text-xs">
                              {sortedAuditTrails.map((entry) => {
                                  const label =
                                      entry.type === 'income'
                                          ? 'Entrada'
                                          : entry.type === 'expense'
                                            ? 'Despesa'
                                            : entry.type === 'yield'
                                              ? 'Rendimento'
                                              : 'Base';
                                  const sign = entry.sign === -1 ? '-' : entry.sign === 1 ? '+' : '';
                                  const amountLabel = `${sign} R$ ${entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                  return (
                                      <div
                                          key={`${entry.type}-${entry.id}-${entry.date}-${entry.amount}`}
                                          className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-zinc-600 dark:text-zinc-300"
                                      >
                                          <div className="flex flex-col">
                                              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{label}</span>
                                              <span className="text-[10px] text-zinc-400">
                                                  {entry.type === 'base' ? 'Saldo inicial' : entry.date}
                                              </span>
                                          </div>
                                          <div className={`font-semibold ${entry.sign < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                              {amountLabel}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>
          )}

           {accountToDelete && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setAccountToDelete(null)}
                            aria-label="Fechar confirmação de exclusão"
                            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-500">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir Conta?</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Você está prestes a excluir permanentemente a conta <strong>{accountToDelete.name}</strong>.
                            </p>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex gap-3 items-start mb-6 text-left">
                            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                As transações antigas vinculadas a esta conta permanecerão no histórico, mas perderão a referência de origem.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setAccountToDelete(null)}
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
      </>
  );

  if (isMobile) {
      return (
          <>
              <MobilePageShell
                  title="Contas Bancárias"
                  subtitle={`${displayCount} ${displayCount === 1 ? 'conta' : 'contas'}`}
                  onBack={onBack}
                  contentClassName="space-y-4"
              >
                  {summarySection}
                  {listSection}
              </MobilePageShell>
              {modals}
          </>
      );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter pb-20 transition-colors duration-300">
      {summarySection}
      {listSection}
      {modals}
    </div>
  );
};

export default AccountsView;
