
import React, { useState, useEffect, useRef } from 'react';
import {
  Landmark,
  Trash2,
  X,
  AlertTriangle,
  History,
  Info,
  Home,
  ChevronDown
} from 'lucide-react';
import NewAccountModal from './NewAccountModal';
import { Account, Expense, Income } from '../types';
import { AuditLogInput } from '../services/auditService';
import { getAccountColor } from '../services/cardColorUtils';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import MobileTransactionCard from './mobile/MobileTransactionCard';
import MobileEmptyState from './mobile/MobileEmptyState';
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
  incomes?: Income[];
  expenses?: Expense[];
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
  incomes,
  expenses,
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
  const [drawerAccount, setDrawerAccount] = useState<Account | null>(null);
  const [inlineEditAccountId, setInlineEditAccountId] = useState<string | null>(null);
  const [inlineEditDraft, setInlineEditDraft] = useState({
      name: '',
      type: '',
      initialBalance: '',
      currentBalance: '',
      nature: 'PJ' as 'PJ' | 'PF',
      notes: '',
      yieldRate: '',
      color: ''
  });
  const [inlineNewOpen, setInlineNewOpen] = useState(false);
  const [inlineNewDraft, setInlineNewDraft] = useState({
      name: '',
      type: '',
      initialBalance: '',
      currentBalance: '',
      nature: 'PJ' as 'PJ' | 'PF',
      notes: '',
      yieldRate: '',
      color: PREMIUM_COLOR_PRESETS[0] || '#0ea5e9'
  });
  const [isAccountListExpanded, setIsAccountListExpanded] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const loggedLockedRef = useRef<Set<string>>(new Set());
  const renderLogRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });

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

  const totalBalance = unlockedAccounts.reduce((acc, curr) => acc + resolveRealBalance(curr), 0);
  const displayCount = isSelectionMode ? selectedIds.length : accounts.length;
  const displayLabel = isSelectionMode ? 'Saldo Parcial (Selecionado)' : 'Saldo Total';
  const listSubtitle = `${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'}`;
  const ACCOUNT_COLLAPSE_LIMIT = 2;
  const shouldCollapseAccounts = accounts.length > ACCOUNT_COLLAPSE_LIMIT;
  const extraAccountCount = Math.max(accounts.length - ACCOUNT_COLLAPSE_LIMIT, 0);
  const visibleAccounts =
      shouldCollapseAccounts && !isAccountListExpanded
          ? accounts.slice(0, ACCOUNT_COLLAPSE_LIMIT)
          : accounts;
  const expandVerb = isMobile ? 'Toque' : 'Clique';
  const auditAccount = auditAccountId ? accounts.find(acc => acc.id === auditAccountId) || null : null;
  const auditTrails = auditAccountId ? balanceSnapshot?.debug?.trailsByAccountId?.[auditAccountId] ?? [] : [];
  const sortedAuditTrails = React.useMemo(() => {
    if (!auditTrails.length) return [] as BalanceTrailEntry[];
    return [...auditTrails].sort((a, b) => a.date.localeCompare(b.date));
  }, [auditTrails]);
  const relatedIncomes = accountToDelete
      ? (incomes || []).filter(inc => inc.accountId === accountToDelete.id)
      : [];
  const relatedExpenses = accountToDelete
      ? (expenses || []).filter(exp => exp.accountId === accountToDelete.id)
      : [];

  const buildAccountDetails = (account: Account) =>
      [
          {
              label: 'Saldo atual',
              value: formatCurrency(resolveRealBalance(account))
          },
          {
              label: 'Tipo',
              value: account.type || 'Conta'
          },
          {
              label: 'Natureza',
              value: account.nature === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'
          },
          account.yieldRate !== undefined
              ? {
                    label: 'Rendimento',
                    value: `${account.yieldRate}% do ${account.yieldIndex || 'CDI'}`
                }
              : null,
          account.notes ? { label: 'Observações', value: account.notes } : null
      ].filter(Boolean) as { label: string; value: React.ReactNode }[];

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

  const isInvestmentType = (value: string) => {
      const normalized = normalizeLabel(value);
      return ['rendimento', 'investimento', 'aplica', 'aplicacao', 'aplicação', 'cdi', 'selic', 'yield']
          .some(term => normalized.includes(term));
  };

  const buildColorOptions = (selected?: string) => {
      if (selected && !PREMIUM_COLOR_PRESETS.includes(selected)) {
          return [selected, ...PREMIUM_COLOR_PRESETS];
      }
      return PREMIUM_COLOR_PRESETS;
  };

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
      setInlineEditAccountId(null);
      setDrawerAccount(null);
      setInlineNewDraft({
          name: '',
          type: '',
          initialBalance: '',
          currentBalance: '',
          nature: 'PJ',
          notes: '',
          yieldRate: '',
          color: PREMIUM_COLOR_PRESETS[0] || '#0ea5e9'
      });
      setInlineNewOpen(prev => !prev);
      setEditingAccount(null);
  };

  const handleEditAccountDirect = (account: Account) => {
      if (account.locked) return;
      console.info('[ui][accounts][edit]', { accountId: account.id, source: 'drawer' });
      if (isMobile) {
          setInlineNewOpen(false);
          startInlineEdit(account);
          return;
      }
      setEditingAccount(account);
      setIsModalOpen(true);
  };

  const handleDeleteAccountDirect = (account: Account) => {
      console.info('[ui][accounts][delete]', { accountId: account.id, source: 'drawer' });
      setAccountToDelete(account);
  };

  const parseInlineNumber = (value: string) => {
      const normalized = value.replace(',', '.').trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
  };

  const startInlineEdit = (account: Account) => {
      setInlineEditAccountId(account.id);
      setInlineEditDraft({
          name: account.name || '',
          type: account.type || '',
          initialBalance: Number.isFinite(account.initialBalance) ? String(account.initialBalance) : '',
          currentBalance: Number.isFinite(account.currentBalance) ? String(account.currentBalance) : '',
          nature: account.nature || 'PJ',
          notes: account.notes || '',
          yieldRate: Number.isFinite(account.yieldRate) ? String(account.yieldRate) : '',
          color: account.color || getAccountColor(account)
      });
  };

  const handleInlineSave = (account: Account) => {
      const nextName = inlineEditDraft.name.trim() || account.name;
      const nextType = inlineEditDraft.type || account.type;
      const parsedInitial = parseInlineNumber(inlineEditDraft.initialBalance);
      const parsedCurrent = parseInlineNumber(inlineEditDraft.currentBalance);
      const parsedYield = parseInlineNumber(inlineEditDraft.yieldRate);
      const nextInitialBalance = parsedInitial ?? account.initialBalance;
      const nextColor = inlineEditDraft.color || account.color || getAccountColor(account);
      const nextYieldRate = parsedYield ?? account.yieldRate;

      handleSaveAccount({
          id: account.id,
          name: nextName,
          type: nextType,
          balance: nextInitialBalance,
          currentBalance: parsedCurrent ?? undefined,
          notes: inlineEditDraft.notes ?? '',
          nature: inlineEditDraft.nature || account.nature,
          color: nextColor,
          yieldRate: nextYieldRate,
          yieldIndex: nextYieldRate !== undefined ? (account.yieldIndex || 'CDI') : undefined
      });
      setInlineEditAccountId(null);
  };

  const handleInlineCreate = () => {
      const nextName = inlineNewDraft.name.trim();
      if (!nextName || !inlineNewDraft.type) return;
      const parsedInitial = parseInlineNumber(inlineNewDraft.initialBalance);
      const parsedCurrent = parseInlineNumber(inlineNewDraft.currentBalance);
      const parsedYield = parseInlineNumber(inlineNewDraft.yieldRate);
      const nextInitialBalance = parsedInitial ?? 0;
      const nextColor = inlineNewDraft.color || PREMIUM_COLOR_PRESETS[0] || '#0ea5e9';
      const nextYieldRate = parsedYield ?? undefined;

      handleSaveAccount({
          name: nextName,
          type: inlineNewDraft.type,
          balance: nextInitialBalance,
          currentBalance: parsedCurrent ?? undefined,
          notes: inlineNewDraft.notes ?? '',
          nature: inlineNewDraft.nature,
          color: nextColor,
          yieldRate: nextYieldRate,
          yieldIndex: nextYieldRate !== undefined ? 'CDI' : undefined
      });
      setInlineNewOpen(false);
      setInlineNewDraft({
          name: '',
          type: '',
          initialBalance: '',
          currentBalance: '',
          nature: 'PJ',
          notes: '',
          yieldRate: '',
          color: nextColor
      });
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

  useEffect(() => {
      if (!drawerAccount) {
          if (!isMobile) {
              setInlineEditAccountId(null);
          }
          return;
      }
      if (inlineEditAccountId && inlineEditAccountId !== drawerAccount.id) {
          setInlineEditAccountId(null);
      }
  }, [drawerAccount, inlineEditAccountId, isMobile]);

  useEffect(() => {
      if (inlineNewOpen) {
          setInlineEditAccountId(null);
      }
  }, [inlineNewOpen]);

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
          if (isModalOpen || accountToDelete) return;
          event.preventDefault();
          handleOpenNew();
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accountToDelete, handleOpenNew, isMobile, isModalOpen]);

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

  const summaryWrapperClass = isMobile
    ? 'relative z-20 space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 relative z-20 pt-6';

  const listWrapperClass = isMobile
    ? 'space-y-4'
    : 'max-w-7xl mx-auto px-4 sm:px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500';

  const accountsHeader = (
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
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Contas Bancárias</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Contas</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{accounts.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Saldo total</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                      {formatCurrency(totalBalance)}
                  </p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Saldo atual</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                      {formatCurrency(displayBalance)}
                  </p>
              </div>
          </div>

          <div className={`grid ${onOpenAudit ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
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
              <button
                  onClick={handleOpenNew}
                  className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"
              >
                  Nova Conta
              </button>
          </div>
      </div>
  );

  const summarySection = (
      <div className={summaryWrapperClass}>
          <div className="rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {accountsHeader}
          </div>
      </div>
  );

  const inlineNewCard = inlineNewOpen ? (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
          <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Nova conta</span>
              <button
                  type="button"
                  onClick={() => setInlineNewOpen(false)}
                  className="h-7 w-7 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
                  aria-label="Fechar nova conta"
              >
                  <X size={14} className="mx-auto" />
              </button>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Nome da conta
                  </label>
                  <input
                      type="text"
                      value={inlineNewDraft.name}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({ ...prev, name: event.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
              </div>

              <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Tipo
                  </label>
                  <select
                      value={inlineNewDraft.type}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({ ...prev, type: event.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                      <option value="">Selecione</option>
                      {accountTypes.map(type => (
                          <option key={type} value={type}>
                              {type}
                          </option>
                      ))}
                  </select>
              </div>

              <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Natureza
                  </label>
                  <select
                      value={inlineNewDraft.nature}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              nature: event.target.value as 'PJ' | 'PF'
                          }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                      <option value="PJ">Pessoa Jurídica</option>
                      <option value="PF">Pessoa Física</option>
                  </select>
              </div>

              <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Saldo inicial
                  </label>
                  <input
                      type="text"
                      value={inlineNewDraft.initialBalance}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              initialBalance: event.target.value
                          }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
              </div>

              <div>
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Saldo atual
                  </label>
                  <input
                      type="text"
                      value={inlineNewDraft.currentBalance}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              currentBalance: event.target.value
                          }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
              </div>

              <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Cor da tag
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                      {buildColorOptions(inlineNewDraft.color).map(color => (
                          <button
                              key={color}
                              type="button"
                              onClick={() => setInlineNewDraft(prev => ({ ...prev, color }))}
                              className={`h-7 w-7 rounded-full border ${
                                  inlineNewDraft.color === color
                                      ? 'ring-2 ring-indigo-500 border-white'
                                      : 'border-white/40'
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`Selecionar cor ${color}`}
                          />
                      ))}
                  </div>
              </div>

              <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Observações
                  </label>
                  <textarea
                      value={inlineNewDraft.notes}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              notes: event.target.value
                          }))
                      }
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                  />
              </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
              <button
                  type="button"
                  onClick={() => setInlineNewOpen(false)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
              >
                  Cancelar
              </button>
              <button
                  type="button"
                  disabled={!inlineNewDraft.name.trim() || !inlineNewDraft.type}
                  onClick={handleInlineCreate}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${
                      !inlineNewDraft.name.trim() || !inlineNewDraft.type
                          ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
              >
                  Salvar
              </button>
          </div>
      </div>
  ) : null;

  const renderInlineEditForm = (account: Account) => {
      const typeOptions =
          inlineEditDraft.type && !accountTypes.includes(inlineEditDraft.type)
              ? [inlineEditDraft.type, ...accountTypes]
              : accountTypes;
      const showYieldField =
          isInvestmentType(inlineEditDraft.type || account.type || '') ||
          Number.isFinite(account.yieldRate);
      const saveDisabled = !inlineEditDraft.name.trim() || !inlineEditDraft.type;

      return (
          <div className="mt-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0f0f13] p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Nome da conta
                      </label>
                      <input
                          type="text"
                          value={inlineEditDraft.name}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  name: event.target.value
                              }))
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Tipo
                      </label>
                      <select
                          value={inlineEditDraft.type}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  type: event.target.value
                              }))
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      >
                          <option value="">Selecione</option>
                          {typeOptions.map(type => (
                              <option key={type} value={type}>
                                  {type}
                              </option>
                          ))}
                      </select>
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Natureza
                      </label>
                      <select
                          value={inlineEditDraft.nature}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  nature: event.target.value as 'PJ' | 'PF'
                              }))
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      >
                          <option value="PJ">Pessoa Jurídica</option>
                          <option value="PF">Pessoa Física</option>
                      </select>
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Saldo inicial
                      </label>
                      <input
                          type="text"
                          value={inlineEditDraft.initialBalance}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  initialBalance: event.target.value
                              }))
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Saldo atual
                      </label>
                      <input
                          type="text"
                          value={inlineEditDraft.currentBalance}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  currentBalance: event.target.value
                              }))
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                  </div>

                  {showYieldField && (
                      <div className="sm:col-span-2">
                          <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                              Rendimento (% CDI)
                          </label>
                          <input
                              type="text"
                              value={inlineEditDraft.yieldRate}
                              onChange={(event) =>
                                  setInlineEditDraft(prev => ({
                                      ...prev,
                                      yieldRate: event.target.value
                                  }))
                              }
                              className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                          />
                      </div>
                  )}

                  <div className="sm:col-span-2">
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Cor da tag
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                          {buildColorOptions(inlineEditDraft.color).map(color => (
                              <button
                                  key={color}
                                  type="button"
                                  onClick={() =>
                                      setInlineEditDraft(prev => ({
                                          ...prev,
                                          color
                                      }))
                                  }
                                  className={`h-7 w-7 rounded-full border ${
                                      inlineEditDraft.color === color
                                          ? 'ring-2 ring-indigo-500 border-white'
                                          : 'border-white/40'
                                  }`}
                                  style={{ backgroundColor: color }}
                                  aria-label={`Selecionar cor ${color}`}
                              />
                          ))}
                      </div>
                  </div>

                  <div className="sm:col-span-2">
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Observações
                      </label>
                      <textarea
                          value={inlineEditDraft.notes}
                          onChange={(event) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  notes: event.target.value
                              }))
                          }
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                      />
                  </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                  <button
                      type="button"
                      onClick={() => setInlineEditAccountId(null)}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
                  >
                      Cancelar
                  </button>
                  <button
                      type="button"
                      disabled={saveDisabled}
                      onClick={() => handleInlineSave(account)}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${
                          saveDisabled
                              ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-500'
                      }`}
                  >
                      Salvar
                  </button>
              </div>
          </div>
      );
  };

  const listSection = (
      <main className={listWrapperClass}>
          <div className="space-y-3">
              {inlineNewCard}

              {accounts.length > 0 ? (
                  <>
                      {visibleAccounts.map(account => {
                          const isHighlighted = highlightedId === account.id;
                          const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                          const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                          const isLocked = Boolean(account.locked || account.decryptError);
                          const computedBalance = resolveRealBalance(account);
                          const isExpanded = drawerAccount?.id === account.id;
                          const isInlineEditing = inlineEditAccountId === account.id;
                          const details = isExpanded ? buildAccountDetails(account) : [];

                          return (
                              <div key={account.id} id={`account-${account.id}`}>
                                  <MobileTransactionCard
                                      title={account.name}
                                      amount={formatCurrency(computedBalance)}
                                      amountClassName={isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}
                                      dateLabel={account.type || 'Conta'}
                                      category={`Inicial ${formatCurrency(account.initialBalance)}`}
                                      isHighlighted={isHighlighted}
                                      isLocked={isLocked}
                                      lockedLabel={lockedLabel}
                                      onClick={
                                          isLocked
                                              ? undefined
                                              : () => {
                                                    setDrawerAccount(prev => (prev?.id === account.id ? null : account));
                                                }
                                      }
                                  />
                                  {!isMobile && isExpanded && (
                                      <div className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] p-4">
                                          <div className="flex items-center justify-between">
                                              <span className="text-[10px] uppercase tracking-wide text-zinc-400">Detalhes</span>
                                              <button
                                                  type="button"
                                                  onClick={() => setDrawerAccount(null)}
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
                                              <div className="mt-4 grid grid-cols-2 gap-2">
                                                  <button
                                                      type="button"
                                                      onClick={() => {
                                                          if (inlineEditAccountId === account.id) {
                                                              setInlineEditAccountId(null);
                                                              return;
                                                          }
                                                          startInlineEdit(account);
                                                      }}
                                                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                                                  >
                                                      {isInlineEditing ? 'Fechar edição' : 'Editar'}
                                                  </button>
                                                  <button
                                                      type="button"
                                                      onClick={() => handleDeleteAccountDirect(account)}
                                                      className="rounded-xl border border-red-200 dark:border-red-900/40 py-2 text-xs font-semibold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                                  >
                                                      Excluir
                                                  </button>
                                              </div>
                                          )}
                                          {!isLocked && isInlineEditing && renderInlineEditForm(account)}
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                      {shouldCollapseAccounts && (
                          <button
                              type="button"
                              onClick={() => setIsAccountListExpanded(prev => !prev)}
                              className="w-full rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                          >
                              {isAccountListExpanded
                                  ? `${expandVerb} para recolher`
                                  : `${expandVerb} para expandir (+${extraAccountCount})`}
                              <ChevronDown
                                  size={14}
                                  className={`transition-transform ${isAccountListExpanded ? 'rotate-180' : ''}`}
                              />
                          </button>
                      )}
                  </>
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      message="Nenhuma conta cadastrada."
                  />
              )}
          </div>
      </main>
  );

  const drawerLocked = Boolean(drawerAccount?.locked || drawerAccount?.decryptError);
  const drawerDetails = drawerAccount ? buildAccountDetails(drawerAccount) : [];
  const desktopScrollPadding =
      isAccountListExpanded || inlineNewOpen || inlineEditAccountId ? 'pb-28' : 'pb-6';

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
                                Ao excluir esta conta, todas as entradas e saídas vinculadas a ela também serão removidas.
                            </p>
                        </div>

                        {(relatedIncomes.length > 0 || relatedExpenses.length > 0) && (
                            <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#151517] p-3 text-xs text-zinc-600 dark:text-zinc-300">
                                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">Itens afetados</p>
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span>Entradas vinculadas</span>
                                            <span className="font-semibold text-zinc-900 dark:text-white">{relatedIncomes.length}</span>
                                        </div>
                                        {relatedIncomes.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {relatedIncomes.slice(0, 3).map(inc => (
                                                    <div key={inc.id} className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                        <span className="flex-1 min-w-0 truncate">{inc.description || 'Entrada'}</span>
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            + {formatCurrency(inc.amount)}
                                                        </span>
                                                    </div>
                                                ))}
                                                {relatedIncomes.length > 3 && (
                                                    <p className="text-[10px] text-zinc-400">
                                                        +{relatedIncomes.length - 3} outras entradas
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span>Saídas vinculadas</span>
                                            <span className="font-semibold text-zinc-900 dark:text-white">{relatedExpenses.length}</span>
                                        </div>
                                        {relatedExpenses.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {relatedExpenses.slice(0, 3).map(exp => (
                                                    <div key={exp.id} className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                        <span className="flex-1 min-w-0 truncate">{exp.description || 'Saída'}</span>
                                                        <span className="font-semibold text-rose-500">
                                                            - {formatCurrency(exp.amount)}
                                                        </span>
                                                    </div>
                                                ))}
                                                {relatedExpenses.length > 3 && (
                                                    <p className="text-[10px] text-zinc-400">
                                                        +{relatedExpenses.length - 3} outras saídas
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

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

          <MobileTransactionDrawer
              open={isMobile && Boolean(drawerAccount)}
              title={drawerAccount?.name || ''}
              amount={drawerAccount ? formatCurrency(resolveRealBalance(drawerAccount)) : undefined}
              details={drawerDetails}
              actionsDisabled={drawerLocked}
              onClose={() => setDrawerAccount(null)}
              onEdit={
                  drawerAccount && !drawerLocked
                      ? () => {
                            handleEditAccountDirect(drawerAccount);
                            setDrawerAccount(null);
                        }
                      : undefined
              }
              onDelete={
                  drawerAccount && !drawerLocked
                      ? () => {
                            handleDeleteAccountDirect(drawerAccount);
                            setDrawerAccount(null);
                        }
                      : undefined
              }
          />
      </>
  );

  if (isMobile) {
      const mobileList = (
          <div className="space-y-3">
              {inlineNewCard}
              {accounts.length > 0 ? (
                  visibleAccounts.map(account => {
                      const isHighlighted = highlightedId === account.id;
                      const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                      const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                      const isLocked = Boolean(account.locked || account.decryptError);
                      const isInlineEditing = inlineEditAccountId === account.id;
                      const computedBalance = resolveRealBalance(account);

                      return (
                          <div key={account.id} id={`account-${account.id}`}>
                              <MobileTransactionCard
                                  title={account.name}
                                  amount={formatCurrency(computedBalance)}
                                  amountClassName={isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}
                                  dateLabel={account.type || 'Conta'}
                                  category={`Inicial ${formatCurrency(account.initialBalance)}`}
                                  isHighlighted={isHighlighted}
                                  isLocked={isLocked}
                                  lockedLabel={lockedLabel}
                                  onClick={
                                      isLocked
                                          ? undefined
                                          : () => {
                                                setDrawerAccount(account);
                                            }
                                  }
                              />
                              {!isLocked && isInlineEditing && renderInlineEditForm(account)}
                          </div>
                      );
                  })
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      message="Nenhuma conta cadastrada."
                  />
              )}
              {shouldCollapseAccounts && accounts.length > 0 && (
                  <button
                      type="button"
                      onClick={() => setIsAccountListExpanded(prev => !prev)}
                      className="w-full rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                      {isAccountListExpanded
                          ? 'Toque para recolher'
                          : `Toque para expandir (+${extraAccountCount})`}
                      <ChevronDown
                          size={14}
                          className={`transition-transform ${isAccountListExpanded ? 'rotate-180' : ''}`}
                      />
                  </button>
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
                                  {accountsHeader}
                              </div>
                          </div>
                      </div>
                      <div
                          className="h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+128px)]"
                          style={{ paddingTop: subHeaderHeight ? subHeaderHeight + 28 : undefined }}
                      >
                          {mobileList}
                      </div>
                  </div>
              </div>
              {modals}
          </>
      );
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter ${desktopScrollPadding} transition-colors duration-300`}>
      {summarySection}
      {listSection}
      {modals}
    </div>
  );
};

export default AccountsView;
