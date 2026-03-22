
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Landmark,
  Wallet,
  TrendingUp,
  DollarSign,
  Trash2,
  X,
  Edit2,
  Plus,
  CheckSquare,
  Square,
  Lock,
  AlertTriangle,
  History,
  Info
} from 'lucide-react';
import NewAccountModal from './NewAccountModal';
import { Account, Expense, Income, Transfer } from '../types';
import { AuditLogInput } from '../services/auditService';
import { getAccountColor, withAlpha } from '../services/cardColorUtils';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import SelectDropdown from './common/SelectDropdown';
import MobileEmptyState from './mobile/MobileEmptyState';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import type { BalanceTrailEntry, RealBalanceDebug } from '../services/realBalanceEngine';
import { shouldApplyLegacyBalanceMutation } from '../utils/legacyBalanceMutation';
import {
  TOUR_SIMULATED_ACCOUNT_PREFIX,
  clearTourSimulatedAccounts,
  readTourSimulatedAccounts,
  upsertTourSimulatedAccount
} from '../services/tourSimulationService';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);
const isTourSimulatedAccountId = (id: string) => id.startsWith(TOUR_SIMULATED_ACCOUNT_PREFIX);

type AccountWatermarkKind = 'bank' | 'yield' | 'cash';

const inferAccountWatermark = (account: Account): AccountWatermarkKind => {
    const source = `${account.type || ''} ${account.name || ''}`.toLowerCase();
    if (/rend|invest|cdi|selic|tesouro|aplica|yield/.test(source)) return 'yield';
    if (/banc|conta|caixa|carteira|corrente|poupan|digital/.test(source)) return 'bank';
    return 'cash';
};

type TourAccountAuditEntry = {
  id: string;
  accountName: string;
  amount: number;
  createdAt: string;
};

interface AccountsViewProps {
  onBack: () => void;
  accounts: Account[];
  onUpdateAccounts: (accounts: Account[]) => void;
  onDeleteAccount: (id: string) => void;
  incomes?: Income[];
  expenses?: Expense[];
  transfers?: Transfer[];
  onCreateTransfer?: (payload: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      date: string;
      notes?: string;
      status?: Transfer['status'];
  }) => void;
  onDeleteTransfer?: (id: string) => void;
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
  transfers = [],
  onCreateTransfer,
  onDeleteTransfer,
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
      nature: '' as '' | 'PJ' | 'PF',
      notes: '',
      yieldRate: '',
      color: PREMIUM_COLOR_PRESETS[0] || '#0ea5e9'
  });
  const [inlineNewEditId, setInlineNewEditId] = useState<string | null>(null);
  const [inlineNewNotesOpen, setInlineNewNotesOpen] = useState(false);
  const [inlineNewTypesOpen, setInlineNewTypesOpen] = useState(false);
  const [inlineNewTypeName, setInlineNewTypeName] = useState('');
  const [inlineNewTypeError, setInlineNewTypeError] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [transferSheetOpen, setTransferSheetOpen] = useState(false);
  const [transferDeleteTarget, setTransferDeleteTarget] = useState<Transfer | null>(null);
  const [transferDraft, setTransferDraft] = useState<{
      fromAccountId: string;
      toAccountId: string;
      amount: string;
      date: string;
      notes: string;
      status: Transfer['status'];
  }>({
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      status: 'completed'
  });
  const [tourSimulatedAccounts, setTourSimulatedAccounts] = useState<Account[]>([]);
  const [tourAccountAuditEntries, setTourAccountAuditEntries] = useState<TourAccountAuditEntry[]>([]);
  const [isTourAccountAuditOpen, setIsTourAccountAuditOpen] = useState(false);
  const { highlightTarget, setHighlightTarget } = useGlobalActions();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const loggedLockedRef = useRef<Set<string>>(new Set());
  const renderLogRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const isInlineAllowed = isMobile;
  const useDockModal = !isInlineAllowed;
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstSectionRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [topAdjust, setTopAdjust] = useState(0);

  useEffect(() => {
      if (typeof document === 'undefined') return;
      if (useDockModal && inlineNewOpen) {
          setInlineNewOpen(false);
      }
      document.body.classList.remove('hide-quick-access');
      return () => {
          document.body.classList.remove('hide-quick-access');
      };
  }, [inlineNewOpen, isMobile, useDockModal]);

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

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleDockClick = () => {
          setDrawerAccount(null);
          setInlineNewOpen(false);
          setInlineEditAccountId(null);
          setInlineNewEditId(null);
          setInlineNewNotesOpen(false);
          setInlineNewTypesOpen(false);
          setTransferSheetOpen(false);
          setTransferDeleteTarget(null);
          setEditingAccount(null);
          setAccountToDelete(null);
          setAuditAccountId(null);
          setIsModalOpen(false);
      };
      window.addEventListener('mm:dock-click', handleDockClick);
      window.addEventListener('mm:mobile-dock-click', handleDockClick);
      return () => {
          window.removeEventListener('mm:dock-click', handleDockClick);
          window.removeEventListener('mm:mobile-dock-click', handleDockClick);
      };
  }, []);

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
      if (typeof window === 'undefined') return;
      setTourSimulatedAccounts(readTourSimulatedAccounts());

      const handleTourAccountSimulated = (event: Event) => {
          const detail = (event as CustomEvent<{ account?: any }>).detail;
          const accountData = detail?.account;
          if (!accountData) return;

          const initialBalance = Number(accountData.balance);
          const currentBalance = Number(accountData.currentBalance);
          const incomingId = accountData.id ? String(accountData.id) : '';
          const isEditingSimulated = Boolean(incomingId) && isTourSimulatedAccountId(incomingId);
          const fallbackCurrentBalance = Number.isFinite(currentBalance)
              ? currentBalance
              : (Number.isFinite(initialBalance) ? initialBalance : 0);
          const fallbackInitialBalance = Number.isFinite(initialBalance) ? initialBalance : 0;
          const accountName = (accountData.name || 'Conta de teste').toString();
          const accountType = (accountData.type || 'Conta').toString();
          const accountColor = accountData.color || PREMIUM_COLOR_PRESETS[0] || '#0ea5e9';
          const accountNotes = accountData.notes ? String(accountData.notes) : '';
          const accountNature = accountData.nature === 'PF' ? 'PF' : 'PJ';
          const accountYieldRate = Number.isFinite(Number(accountData.yieldRate))
              ? Number(accountData.yieldRate)
              : undefined;
          const accountYieldIndex = accountData.yieldIndex === 'Selic'
              ? 'Selic'
              : (accountData.yieldIndex === 'CDI' ? 'CDI' : undefined);

          const resolvedSimulatedId =
              incomingId && isTourSimulatedAccountId(incomingId)
                  ? incomingId
                  : `${TOUR_SIMULATED_ACCOUNT_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

          if (isEditingSimulated) {
              const updatedAccount: Account = {
                  id: incomingId,
                  name: accountName,
                  type: accountType,
                  initialBalance: fallbackInitialBalance,
                  currentBalance: fallbackCurrentBalance,
                  yieldRate: accountYieldRate,
                  yieldIndex: accountYieldIndex,
                  notes: accountNotes,
                  color: accountColor,
                  nature: accountNature
              };
              const nextStored = upsertTourSimulatedAccount(updatedAccount);
              setTourSimulatedAccounts(nextStored);
              setTourAccountAuditEntries(prev => [
                  {
                      id: `tour-audit:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
                      accountName,
                      amount: fallbackInitialBalance,
                      createdAt: new Date().toISOString()
                  },
                  ...prev
              ]);
              return;
          }

          const simulatedAccount: Account = {
              id: resolvedSimulatedId,
              name: accountName,
              type: accountType,
              initialBalance: fallbackInitialBalance,
              currentBalance: fallbackCurrentBalance,
              yieldRate: accountYieldRate,
              yieldIndex: accountYieldIndex,
              notes: accountNotes,
              color: accountColor,
              nature: accountNature
          };

          const nextStored = upsertTourSimulatedAccount(simulatedAccount);
          setTourSimulatedAccounts(nextStored);
          setTourAccountAuditEntries(prev => [
              {
                  id: `tour-audit:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
                  accountName: simulatedAccount.name,
                  amount: simulatedAccount.initialBalance || 0,
                  createdAt: new Date().toISOString()
              },
              ...prev
          ]);
      };

      const clearSimulatedAccounts = () => {
          clearTourSimulatedAccounts();
          setTourSimulatedAccounts([]);
          setTourAccountAuditEntries([]);
          setIsTourAccountAuditOpen(false);
          setDrawerAccount(null);
          setEditingAccount(null);
          setInlineEditAccountId(null);
          setInlineNewEditId(null);
          setInlineNewOpen(false);
          setIsModalOpen(false);
      };

      window.addEventListener('mm:tour-new-account-simulated', handleTourAccountSimulated as EventListener);
      window.addEventListener('mm:first-access-tour-ended', clearSimulatedAccounts);
      window.addEventListener('mm:first-access-tour-restart', clearSimulatedAccounts);
      window.addEventListener('mm:first-access-tour-clear-data', clearSimulatedAccounts);

      return () => {
          window.removeEventListener('mm:tour-new-account-simulated', handleTourAccountSimulated as EventListener);
          window.removeEventListener('mm:first-access-tour-ended', clearSimulatedAccounts);
          window.removeEventListener('mm:first-access-tour-restart', clearSimulatedAccounts);
          window.removeEventListener('mm:first-access-tour-clear-data', clearSimulatedAccounts);
      };
  }, []);

  const openTourLocalAudit = React.useCallback(() => {
      if (tourAccountAuditEntries.length === 0) {
          const fallbackAccount = tourSimulatedAccounts[0] || accounts[0];
          if (fallbackAccount) {
              setTourAccountAuditEntries([
                  {
                      id: `tour-audit:fallback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
                      accountName: fallbackAccount.name || 'Conta criada',
                      amount:
                          Number.isFinite(Number(fallbackAccount.initialBalance))
                              ? Number(fallbackAccount.initialBalance)
                              : Number.isFinite(Number(fallbackAccount.currentBalance))
                                  ? Number(fallbackAccount.currentBalance)
                                  : 0,
                      createdAt: new Date().toISOString()
                  }
              ]);
          }
      }
      setIsTourAccountAuditOpen(true);
  }, [accounts, tourAccountAuditEntries.length, tourSimulatedAccounts]);

  const handleAccountsAuditClick = () => {
      const isAccountsTourStep =
          typeof document !== 'undefined' &&
          (
              Boolean(document.querySelector('[data-tour-overlay="true"][data-tour-step="accounts"]')) ||
              document.documentElement.classList.contains('mm-tour-active')
          );

      if (isAccountsTourStep) {
          openTourLocalAudit();
          return;
      }

      if (tourAccountAuditEntries.length > 0) {
          setIsTourAccountAuditOpen(true);
          return;
      }
      onOpenAudit?.();
  };

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleTourOpenAudit = () => openTourLocalAudit();
      const handleTourCloseAudit = () => setIsTourAccountAuditOpen(false);
      window.addEventListener('mm:tour-open-accounts-audit', handleTourOpenAudit as EventListener);
      window.addEventListener('mm:tour-close-accounts-audit', handleTourCloseAudit as EventListener);
      return () => {
          window.removeEventListener('mm:tour-open-accounts-audit', handleTourOpenAudit as EventListener);
          window.removeEventListener('mm:tour-close-accounts-audit', handleTourCloseAudit as EventListener);
      };
  }, [openTourLocalAudit]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(
          new CustomEvent('mm:tour-accounts-audit-state', {
              detail: { open: isTourAccountAuditOpen }
          })
      );
  }, [isTourAccountAuditOpen]);

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

  const displayAccounts = React.useMemo(() => {
      if (tourSimulatedAccounts.length === 0) return accounts;
      const persistedIds = new Set(accounts.map(account => account.id));
      const unresolvedSimulated = tourSimulatedAccounts.filter(account => !persistedIds.has(account.id));
      return [...unresolvedSimulated, ...accounts];
  }, [accounts, tourSimulatedAccounts]);
  const primaryTourAccountId = tourSimulatedAccounts[0]?.id || null;
  const unlockedAccounts = displayAccounts.filter(acc => !acc.locked);
  const isSelectionMode = selectedIds.length > 0;
  const selectableAccounts = displayAccounts.filter(acc => !acc.locked && !acc.decryptError && !isTourSimulatedAccountId(acc.id));

  const resolveDisplayedBalance = (account: Account) => {
    const current = Number(account.currentBalance);
    return Number.isFinite(current) ? current : 0;
  };

  const resolveAuditedBalance = (account: Account) => {
    const computed = balanceSnapshot?.byAccountId?.[account.id];
    return Number.isFinite(computed) ? computed : resolveDisplayedBalance(account);
  };

  const displayBalance = isSelectionMode
    ? unlockedAccounts.filter(acc => selectedIds.includes(acc.id)).reduce((acc, curr) => acc + resolveDisplayedBalance(curr), 0)
    : unlockedAccounts.reduce((acc, curr) => acc + resolveDisplayedBalance(curr), 0);

  const totalBalance = unlockedAccounts.reduce((acc, curr) => acc + resolveDisplayedBalance(curr), 0);
  const displayCount = isSelectionMode ? selectedIds.length : displayAccounts.length;
  const headerTotalBalance = isSelectionMode ? displayBalance : totalBalance;
  const displayLabel = isSelectionMode ? 'Saldo Parcial (Selecionado)' : 'Saldo Total';
  const listSubtitle = `${displayAccounts.length} ${displayAccounts.length === 1 ? 'conta' : 'contas'}`;
  const visibleAccounts = displayAccounts;
  const allowPageScroll = false;
  useEffect(() => {
      const shouldLock = !allowPageScroll;
      document.documentElement.classList.toggle('lock-scroll', shouldLock);
      document.body.classList.toggle('lock-scroll', shouldLock);
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [allowPageScroll]);
  const auditAccount = auditAccountId ? displayAccounts.find(acc => acc.id === auditAccountId) || null : null;
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
  const accountNameById = React.useMemo(() => {
      const map = new Map<string, string>();
      displayAccounts.forEach(account => map.set(account.id, account.name || 'Conta'));
      return map;
  }, [displayAccounts]);
  const eligibleTransferAccounts = React.useMemo(
      () =>
          displayAccounts.filter(
              account => !account.locked && !account.decryptError && !isTourSimulatedAccountId(account.id)
          ),
      [displayAccounts]
  );
  const transfersSorted = React.useMemo(() => {
      if (!transfers?.length) return [] as Transfer[];
      return [...transfers]
          .filter(transfer => transfer.fromAccountId && transfer.toAccountId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [transfers]);
  const getTransferStatusMeta = (status: Transfer['status']) => {
      if (status === 'completed') {
          return {
              label: 'Concluída',
              className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
          };
      }
      if (status === 'pending') {
          return {
              label: 'Pendente',
              className: 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
          };
      }
      return {
          label: 'Cancelada',
          className: 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
      };
  };

  const formatTransferDate = (value?: string) => {
      if (!value) return '--';
      const parsed = new Date(`${value}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleDateString('pt-BR');
  };

  const parseTransferAmount = (value: string) => {
      const cleaned = value
          .replace(/\s/g, '')
          .replace(/[Rr][$]/g, '')
          .replace(/[^0-9,.-]/g, '');
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      const decimalSeparator = lastComma > lastDot ? ',' : '.';
      const normalized = decimalSeparator === ','
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '');
      const parsed = Number(normalized);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
  };

  const buildDefaultTransferDraft = (sourceAccounts: Account[]) => {
      const first = sourceAccounts[0]?.id || '';
      const second = sourceAccounts.find(account => account.id !== first)?.id || '';
      return {
          fromAccountId: first,
          toAccountId: second,
          amount: '',
          date: new Date().toISOString().slice(0, 10),
          notes: '',
          status: 'completed' as Transfer['status']
      };
  };

  const openTransferSheet = () => {
      if (eligibleTransferAccounts.length < 2) return;
      const defaultDraft = buildDefaultTransferDraft(eligibleTransferAccounts);
      setInlineNewOpen(false);
      setInlineEditAccountId(null);
      setDrawerAccount(null);
      setTransferDraft(defaultDraft);
      setTransferSheetOpen(true);
  };

  const closeTransferSheet = () => {
      setTransferSheetOpen(false);
  };

  useEffect(() => {
      if (!transferSheetOpen) return;
      if (eligibleTransferAccounts.length < 2) {
          setTransferSheetOpen(false);
          return;
      }
      setTransferDraft(prev => {
          const fallback = buildDefaultTransferDraft(eligibleTransferAccounts);
          const fromAccountId = eligibleTransferAccounts.some(account => account.id === prev.fromAccountId)
              ? prev.fromAccountId
              : fallback.fromAccountId;
          const toAccountId = eligibleTransferAccounts.some(account => account.id === prev.toAccountId)
              ? prev.toAccountId
              : (eligibleTransferAccounts.find(account => account.id !== fromAccountId)?.id || '');
          return {
              ...prev,
              fromAccountId,
              toAccountId
          };
      });
  }, [eligibleTransferAccounts, transferSheetOpen]);

  const handleSaveTransfer = () => {
      if (!onCreateTransfer) return;
      const fromAccountId = transferDraft.fromAccountId;
      const toAccountId = transferDraft.toAccountId;
      const amount = parseTransferAmount(transferDraft.amount);
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return;
      if (!amount || amount <= 0) return;
      onCreateTransfer({
          fromAccountId,
          toAccountId,
          amount,
          date: transferDraft.date || new Date().toISOString().slice(0, 10),
          notes: transferDraft.notes?.trim() || undefined,
          status: transferDraft.status
      });
      closeTransferSheet();
  };

  const confirmDeleteTransfer = () => {
      if (!transferDeleteTarget || !onDeleteTransfer) return;
      onDeleteTransfer(transferDeleteTarget.id);
      setTransferDeleteTarget(null);
  };

  const buildAccountDetails = (account: Account) =>
      [
          {
              label: 'Saldo atual',
              value: formatCurrency(resolveDisplayedBalance(account))
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
      setTransferSheetOpen(false);
      setInlineNewEditId(null);
      setInlineNewDraft({
          name: '',
          type: '',
          initialBalance: '',
          currentBalance: '',
          nature: '',
          notes: '',
          yieldRate: '',
          color: PREMIUM_COLOR_PRESETS[0] || '#0ea5e9'
      });
      setEditingAccount(null);
      if (isInlineAllowed) {
          setInlineNewOpen(prev => !prev);
          return;
      }
      setInlineNewOpen(false);
      setIsModalOpen(true);
  };

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleTourOpenAccountModal = () => {
          setInlineEditAccountId(null);
          setDrawerAccount(null);
          setInlineNewEditId(null);
          setEditingAccount(null);
          if (isInlineAllowed) {
              setInlineNewOpen(true);
              return;
          }
          setInlineNewOpen(false);
          setIsModalOpen(true);
      };
      window.addEventListener('mm:tour-open-account-modal', handleTourOpenAccountModal);
      return () => window.removeEventListener('mm:tour-open-account-modal', handleTourOpenAccountModal);
  }, [isInlineAllowed]);

  const handleEditAccountDirect = (account: Account) => {
      if (account.locked) return;
      console.info('[ui][accounts][edit]', { accountId: account.id, source: 'drawer' });
      setTransferSheetOpen(false);
      if (isInlineAllowed) {
          setInlineNewEditId(account.id);
          setInlineNewDraft({
              name: account.name || '',
              type: account.type || '',
              initialBalance: Number.isFinite(account.initialBalance) ? String(account.initialBalance) : '',
              currentBalance: Number.isFinite(account.currentBalance) ? String(account.currentBalance) : '',
              nature: account.nature || 'PJ',
              notes: account.notes || '',
              yieldRate: Number.isFinite(account.yieldRate) ? String(account.yieldRate) : '',
              color: account.color || getAccountColor(account)
          });
          setInlineNewOpen(true);
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
      if (!nextName || !inlineNewDraft.type || !inlineNewDraft.nature) return;
      const parsedInitial = parseInlineNumber(inlineNewDraft.initialBalance);
      const parsedCurrent = parseInlineNumber(inlineNewDraft.currentBalance);
      const parsedYield = parseInlineNumber(inlineNewDraft.yieldRate);
      const nextInitialBalance = parsedInitial ?? 0;
      const nextColor = inlineNewDraft.color || PREMIUM_COLOR_PRESETS[0] || '#0ea5e9';
      const nextYieldRate = parsedYield ?? undefined;

      const payload = {
          name: nextName,
          type: inlineNewDraft.type,
          balance: nextInitialBalance,
          currentBalance: parsedCurrent ?? undefined,
          notes: inlineNewDraft.notes ?? '',
          nature: inlineNewDraft.nature,
          color: nextColor,
          yieldRate: nextYieldRate,
          yieldIndex: nextYieldRate !== undefined ? 'CDI' : undefined
      } as any;
      if (inlineNewEditId) {
          payload.id = inlineNewEditId;
      }
      handleSaveAccount(payload);
      setInlineNewOpen(false);
      setInlineNewEditId(null);
      setInlineNewDraft({
          name: '',
          type: '',
          initialBalance: '',
          currentBalance: '',
          nature: '',
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

  const toggleSelectAll = () => {
      if (selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0) {
          setSelectedIds([]);
      } else {
          setSelectedIds(selectableAccounts.map(acc => acc.id));
      }
  };

  useEffect(() => {
      if (selectedIds.length === 0) return;
      const availableIds = new Set(displayAccounts.map(acc => acc.id));
      const blockedIds = new Set(
          displayAccounts
              .filter(acc => acc.locked || acc.decryptError || isTourSimulatedAccountId(acc.id))
              .map(acc => acc.id)
      );
      const nextSelected = selectedIds.filter(id => availableIds.has(id) && !blockedIds.has(id));
      if (nextSelected.length !== selectedIds.length) {
          setSelectedIds(nextSelected);
      }
  }, [displayAccounts, selectedIds]);

  useEffect(() => {
      if (!drawerAccount) return;
      if (inlineEditAccountId && inlineEditAccountId !== drawerAccount.id) {
          setInlineEditAccountId(null);
      }
  }, [drawerAccount, inlineEditAccountId]);

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
    : 'max-w-7xl mx-auto px-4 sm:px-6 pt-[var(--mm-content-gap)] pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500';

  const headerCardRadius = isMobile ? 'rounded-xl' : 'rounded-xl';
  const headerSecondaryRadius = isMobile ? 'rounded-xl' : 'rounded-xl';
  const headerPrimaryRadius = 'rounded-xl';

  const accountsHeader = (
      <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable mm-mobile-header-stable-tight">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />
              <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Contas Bancárias</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
              <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card ${isMobile ? 'text-center' : 'text-left'}`}>
                  <p className="mm-subheader-metric-label">Contas</p>
                  <p className="mm-subheader-metric-value">{displayCount}</p>
              </div>
              <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card ${isMobile ? 'text-center' : 'text-left'}`}>
                  <p className="mm-subheader-metric-label">Saldo total</p>
                  <p className="mm-subheader-metric-value">
                      {formatCurrency(headerTotalBalance)}
                  </p>
              </div>
              <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card ${isMobile ? 'text-center' : 'text-left'}`}>
                  <p className="mm-subheader-metric-label">Saldo atual</p>
                  <p className="mm-subheader-metric-value">
                      {formatCurrency(displayBalance)}
                  </p>
              </div>
          </div>

          {isMobile ? (
              <div className="space-y-2">
                  {(onOpenAudit || tourAccountAuditEntries.length > 0) && (
                      <button
                          onClick={handleAccountsAuditClick}
                          data-tour-anchor="accounts-audit-button"
                          className={`w-full mm-mobile-primary-cta mm-btn-base mm-btn-secondary mm-btn-secondary-indigo ${headerSecondaryRadius}`}
                          title="Auditoria do dia"
                      >
                          Auditoria
                      </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                      <button
                          onClick={openTransferSheet}
                          disabled={!onCreateTransfer || eligibleTransferAccounts.length < 2}
                          className={`w-full mm-mobile-primary-cta mm-btn-base mm-btn-secondary mm-btn-secondary-indigo ${headerSecondaryRadius} ${
                              !onCreateTransfer || eligibleTransferAccounts.length < 2 ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                          title={
                              eligibleTransferAccounts.length < 2
                                  ? 'Cadastre ao menos duas contas para transferir'
                                  : 'Transferência entre contas'
                          }
                      >
                          Transferir
                      </button>
                      <button
                          onClick={handleOpenNew}
                          data-tour-anchor="accounts-new"
                          disabled={tourSimulatedAccounts.length > 0}
                          className={`w-full mm-mobile-primary-cta mm-btn-base mm-btn-primary mm-btn-primary-blue ${headerPrimaryRadius}`}
                      >
                          Nova Conta
                      </button>
                  </div>
              </div>
          ) : (
              <div className="mm-header-actions">
                  {(onOpenAudit || tourAccountAuditEntries.length > 0) && (
                      <button
                          onClick={handleAccountsAuditClick}
                          data-tour-anchor="accounts-audit-button"
                          className={`mm-mobile-primary-cta mm-btn-base mm-btn-secondary mm-btn-secondary-indigo ${headerSecondaryRadius}`}
                          title="Auditoria do dia"
                      >
                          Auditoria
                      </button>
                  )}
                  <button
                      onClick={openTransferSheet}
                      disabled={!onCreateTransfer || eligibleTransferAccounts.length < 2}
                      className={`mm-mobile-primary-cta mm-btn-base mm-btn-secondary mm-btn-secondary-indigo ${headerSecondaryRadius} ${
                          !onCreateTransfer || eligibleTransferAccounts.length < 2 ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                      title={
                          eligibleTransferAccounts.length < 2
                              ? 'Cadastre ao menos duas contas para transferir'
                              : 'Transferência entre contas'
                      }
                  >
                      Transferir
                  </button>
                  <button
                      onClick={handleOpenNew}
                      data-tour-anchor="accounts-new"
                      disabled={tourSimulatedAccounts.length > 0}
                      className={`mm-mobile-primary-cta mm-btn-base mm-btn-primary mm-btn-primary-blue ${headerPrimaryRadius}`}
                  >
                      Nova Conta
                  </button>
              </div>
          )}
      </div>
  );

  const summarySection = (
      <div className={summaryWrapperClass}>
          <div className="mm-subheader mm-subheader-panel">
              {accountsHeader}
          </div>
      </div>
  );

  const inlineNewCardStyle =
      isInlineAllowed && inlineNewOpen
          ? { minHeight: `max(320px, calc(var(--mm-content-available-height, 720px) - 24px))` }
          : undefined;
  const inlineFormLabelClass = 'text-[10px] uppercase tracking-[0.12em] font-semibold text-white/65';
  const inlineFormInputClass =
      'mt-1 w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500';
  const inlineFormSelectClass =
      'mt-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/30';
  const inlineNewActions = isInlineAllowed && inlineNewOpen ? (
      <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0 grid grid-cols-2 gap-2">
          <button
              type="button"
              onClick={() => setInlineNewOpen(false)}
              className="rounded-xl border border-blue-400/50 bg-blue-950/30 py-3 text-sm font-semibold text-blue-200 hover:bg-blue-900/40 transition"
          >
              Cancelar
          </button>
          <button
              type="button"
              disabled={!inlineNewDraft.name.trim() || !inlineNewDraft.type || !inlineNewDraft.nature}
              onClick={handleInlineCreate}
              className={`rounded-xl border border-blue-500/40 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition ${
                  !inlineNewDraft.name.trim() || !inlineNewDraft.type || !inlineNewDraft.nature
                      ? 'opacity-80 cursor-not-allowed'
                      : ''
              }`}
          >
              Salvar
          </button>
      </div>
  ) : null;
  const inlineNewTagColors = buildColorOptions(inlineNewDraft.color);
  const inlineNewTagMid = Math.ceil(inlineNewTagColors.length / 2);
  const normalizedAccountTypes = accountTypes.map((type) => type.trim());

  const handleAddInlineType = () => {
      const normalized = inlineNewTypeName.trim().replace(/\s+/g, ' ');
      if (normalizedAccountTypes.length >= 20) {
          setInlineNewTypeError('Limite de categorias atingido.');
          setInlineNewTypeName('');
          return;
      }
      if (!normalized) {
          setInlineNewTypeError('Informe um nome para a categoria.');
          setInlineNewTypeName('');
          return;
      }
      const exists = normalizedAccountTypes.some(
          (type) => type.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) {
          setInlineNewTypeError('Categoria já existe.');
          setInlineNewTypeName('');
          return;
      }
      onUpdateAccountTypes?.([...normalizedAccountTypes, normalized]);
      setInlineNewTypeName('');
      setInlineNewTypeError('');
  };

  const handleRemoveInlineType = (typeToDelete: string) => {
      if (normalizedAccountTypes.length <= 1) return;
      const nextTypes = normalizedAccountTypes.filter((type) => type !== typeToDelete);
      onUpdateAccountTypes?.(nextTypes);
      if (inlineNewDraft.type === typeToDelete) {
          setInlineNewDraft((prev) => ({ ...prev, type: nextTypes[0] || '' }));
      }
  };

  const toggleTypeSelection = (type: string) => {
      setSelectedTypes((prev) =>
          prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
      );
  };

  const handleBulkDeleteTypes = () => {
      if (selectedTypes.length === 0) return;
      const nextTypes = normalizedAccountTypes.filter((type) => !selectedTypes.includes(type));
      if (nextTypes.length === 0) return;
      onUpdateAccountTypes?.(nextTypes);
      if (selectedTypes.includes(inlineNewDraft.type)) {
          setInlineNewDraft((prev) => ({ ...prev, type: nextTypes[0] || '' }));
      }
      setSelectedTypes([]);
  };

  const handleResetTypes = () => {
      onUpdateAccountTypes?.([]);
      setSelectedTypes([]);
  };

  const inlineNewCard = isInlineAllowed && inlineNewOpen ? (
      <div className="rounded-none border-0 bg-transparent p-0 flex flex-col" style={inlineNewCardStyle}>
          <div className="px-3 pt-2.5 pb-2.5 bg-[#0b0b10] border-b border-white/10">
                      <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                  <Wallet size={16} className="text-white" />
                          <p className="text-[15px] font-semibold text-white truncate">{inlineNewEditId ? 'Editar Conta' : 'Nova Conta'}</p>
                      </div>
                              <p className="text-[11px] text-white/70">Preencha os dados da conta.</p>
                          </div>
                  <button
                      type="button"
                      onClick={() => setInlineNewOpen(false)}
                      className="h-8 w-8 rounded-xl bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                      aria-label="Fechar nova conta"
                  >
                      <X size={16} />
                  </button>
              </div>
          </div>
          <div className="mt-2 px-3 grid grid-cols-1 gap-2">
              <div>
                  <label className={inlineFormLabelClass}>
                      Nome da conta
                  </label>
                  <input
                      type="text"
                      value={inlineNewDraft.name}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Ex.: Conta corrente PJ, carteira digital"
                      className={inlineFormInputClass}
                  />
              </div>

              <div>
                  <div className="flex items-center justify-between">
                      <label className={inlineFormLabelClass}>
                          Tipo
                      </label>
                  <button
                      type="button"
                      onClick={() => {
                          setInlineNewTypesOpen(true);
                          setInlineNewTypeError('');
                      }}
                      className="text-[10px] font-semibold flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                      <Edit2 size={10} /> Editar
                  </button>
                  </div>
                  <SelectDropdown
                      value={inlineNewDraft.type}
                      onChange={(value) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              type: value
                          }))
                      }
                      placeholder="Selecione"
                      options={normalizedAccountTypes.map(type => ({ value: type, label: type }))}
                      buttonClassName={inlineFormSelectClass}
                      placeholderClassName="text-[11px] font-normal text-zinc-400"
                      listClassName="max-h-48"
                  />
              </div>

              <div>
                  <label className={inlineFormLabelClass}>
                      Natureza Fiscal
                  </label>
                  <SelectDropdown
                      value={inlineNewDraft.nature}
                      onChange={(value) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              nature: value as 'PJ' | 'PF'
                          }))
                      }
                      placeholder="Selecione"
                      options={[
                          { value: 'PJ', label: 'Pessoa Jurídica' },
                          { value: 'PF', label: 'Pessoa Física' }
                      ]}
                      buttonClassName={inlineFormSelectClass}
                      placeholderClassName="text-[11px] font-normal text-zinc-400"
                      listClassName="max-h-48"
                  />
              </div>

              <div>
                  <label className={inlineFormLabelClass}>
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
                      placeholder="Ex.: R$ 0,00"
                      className={inlineFormInputClass}
                  />
              </div>

              <div>
                  <label className={inlineFormLabelClass}>
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
                      placeholder="Ex.: R$ 0,00"
                      className={inlineFormInputClass}
                  />
              </div>
              <div>
                  <label className={inlineFormLabelClass}>
                      Cor da tag
                  </label>
                  <div className="mt-1 grid [grid-template-columns:repeat(15,minmax(0,1fr))] gap-1">
                      {inlineNewTagColors.slice(0, inlineNewTagMid).map(color => (
                          <button
                              key={color}
                              type="button"
                              onClick={() => setInlineNewDraft(prev => ({ ...prev, color }))}
                              className={`h-6 w-6 rounded-full border ${
                                  inlineNewDraft.color === color
                                      ? 'ring-2 ring-indigo-500 border-white'
                                      : 'border-white/40'
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`Selecionar cor ${color}`}
                          />
                      ))}
                  </div>
                  <div className="mt-1 grid [grid-template-columns:repeat(15,minmax(0,1fr))] gap-1">
                      {inlineNewTagColors.slice(inlineNewTagMid).map(color => (
                          <button
                              key={`${color}-row2`}
                              type="button"
                              onClick={() => setInlineNewDraft(prev => ({ ...prev, color }))}
                              className={`h-6 w-6 rounded-full border ${
                                  inlineNewDraft.color === color
                                      ? 'ring-2 ring-indigo-500 border-white'
                                      : 'border-white/40'
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`Selecionar cor ${color} segunda linha`}
                          />
                      ))}
                  </div>
              </div>

              <div>
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(true)}
                      className={`${inlineFormInputClass} text-left flex items-center justify-between`}
                  >
                      Observações
                      <span className="text-[10px] font-normal text-zinc-400">Adicionar</span>
                  </button>
              </div>
          </div>
      </div>
  ) : null;

  const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
  const inlineNewSheet = isInlineAllowed && inlineNewOpen ? (
      <div className="fixed inset-0 z-[1200]">
          <button
              type="button"
              onClick={() => setInlineNewOpen(false)}
              className="absolute left-0 right-0 top-0 bg-black/60"
              style={{ bottom: dockOffset }}
              aria-label="Fechar nova conta"
          />
          <div
              className="absolute left-0 right-0 bg-[#0b0b10] text-zinc-900 dark:text-white rounded-none border-0 shadow-none flex flex-col"
              style={{ top: 0, bottom: dockOffset }}
          >
              <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+132px)]">
                  {inlineNewCard}
              </div>
              {inlineNewActions}
          </div>
      </div>
  ) : null;

  const inlineNewNotesSheet = isMobile && inlineNewNotesOpen ? (
      <div className="fixed inset-0 z-[1300]">
          <button
              type="button"
              onClick={() => setInlineNewNotesOpen(false)}
              className="absolute inset-0 bg-black/40"
              aria-label="Fechar observações"
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Observações</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Anote detalhes adicionais.</p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(false)}
                      className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar observações"
                  >
                      <X size={16} />
                  </button>
              </div>
              <div className="mt-4">
                  <textarea
                      value={inlineNewDraft.notes}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({
                              ...prev,
                              notes: event.target.value
                          }))
                      }
                      rows={4}
                      placeholder="Detalhes adicionais..."
                      className="w-full min-h-[92px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/30 resize-none placeholder:text-[11px] placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(false)}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                  >
                      Cancelar
                  </button>
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(false)}
                      className="rounded-xl border border-indigo-500/40 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition"
                  >
                      Salvar
                  </button>
              </div>
          </div>
      </div>
  ) : null;

  const inlineNewTypesSheet = isMobile && inlineNewTypesOpen ? (
      <div className="fixed inset-0 z-[1300]">
          {(() => {
              const dockOffset = 'var(--mm-mobile-dock-height, 68px)';
              return (
          <>
              <button
                  type="button"
                  onClick={() => setInlineNewTypesOpen(false)}
                  className="absolute left-0 right-0 top-0 bg-black/40"
                  style={{ bottom: dockOffset }}
                  aria-label="Fechar categorias"
              />
              <div
                  className="absolute left-0 right-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-none border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 flex flex-col"
                  style={{ bottom: dockOffset, maxHeight: 'calc(100dvh - 24px - var(--mm-mobile-dock-height, 68px))' }}
              >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Categorias</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Gerencie e crie novas.</p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setInlineNewTypesOpen(false)}
                      className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar categorias"
                  >
                      <X size={16} />
                  </button>
              </div>
              <div className="pt-2 flex-1 overflow-hidden px-0.5 pb-2">
                  <div className="flex gap-2 mb-2">
                      <input
                          type="text"
                          autoFocus
                          value={inlineNewTypeName}
                          onChange={(event) => {
                              setInlineNewTypeName(event.target.value);
                              setInlineNewTypeError('');
                          }}
                          onKeyDown={(event) => event.key === 'Enter' && handleAddInlineType()}
                          placeholder={inlineNewTypeError || 'Nova categoria...'}
                          className={`w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500 flex-1 w-auto ${
                              inlineNewTypeError ? 'border-red-500 focus:border-red-500 focus:ring-red-500 placeholder:text-red-500' : ''
                          }`}
                      />
                      <button
                          type="button"
                          onClick={handleAddInlineType}
                          aria-label="Adicionar categoria"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl"
                      >
                          <Plus size={14} />
                      </button>
                  </div>
                  <div className="space-y-0">
                      {normalizedAccountTypes.slice(0, 20).map((type) => (
                          <div
                              key={type}
                              className="flex items-center justify-between px-2 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-none"
                          >
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                      type="checkbox"
                                      checked={selectedTypes.includes(type)}
                                      onChange={() => toggleTypeSelection(type)}
                                      className="h-3 w-3 accent-indigo-500"
                                      aria-label={`Selecionar categoria ${type}`}
                                  />
                                  <span className="text-xs text-zinc-700 dark:text-zinc-300">{type}</span>
                              </label>
                              <button
                                  type="button"
                                  onClick={() => handleRemoveInlineType(type)}
                                  disabled={normalizedAccountTypes.length <= 1}
                                  className={`text-red-500 p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-none ${
                                      normalizedAccountTypes.length <= 1 ? 'opacity-40 cursor-not-allowed' : ''
                                  }`}
                                  aria-label={`Remover categoria ${type}`}
                              >
                                  <Trash2 size={10} />
                              </button>
                          </div>
                      ))}
                  </div>
                  <div className={`mt-1.5 ${selectedTypes.length > 0 ? 'grid grid-cols-2 gap-2' : ''}`}>
                      {selectedTypes.length > 0 && (
                          <button
                              type="button"
                              onClick={handleBulkDeleteTypes}
                              className="w-full rounded-xl border border-red-200 text-red-600 text-[11px] font-semibold py-1.5 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                              Excluir selecionados ({selectedTypes.length})
                          </button>
                      )}
                      <button
                          type="button"
                          onClick={handleResetTypes}
                          className={`${selectedTypes.length > 0 ? '' : 'w-full'} rounded-xl border border-red-200 text-red-600 text-[11px] font-semibold py-1.5 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
                      >
                          Zerar categorias
                      </button>
                  </div>
              </div>
              </div>
          </>
              );
          })()}
      </div>
  ) : null;

  useEffect(() => {
      if (!inlineNewTypesOpen) {
          setSelectedTypes([]);
          setInlineNewTypeError('');
      }
  }, [inlineNewTypesOpen]);

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
                          placeholder="Ex: Conta Corrente PJ, Carteira Digital"
                          className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Tipo
                      </label>
                      <SelectDropdown
                          value={inlineEditDraft.type}
                          onChange={(value) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  type: value
                              }))
                          }
                          placeholder="Selecione"
                          options={typeOptions.map(type => ({ value: type, label: type }))}
                          buttonClassName="mt-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                          listClassName="max-h-48"
                      />
                  </div>

                  <div>
                      <label className="text-[10px] uppercase tracking-wide text-zinc-400">
                          Natureza Fiscal
                      </label>
                      <SelectDropdown
                          value={inlineEditDraft.nature}
                          onChange={(value) =>
                              setInlineEditDraft(prev => ({
                                  ...prev,
                                  nature: value as 'PJ' | 'PF'
                              }))
                          }
                          placeholder="Selecione"
                          options={[
                              { value: 'PJ', label: 'Pessoa Jurídica' },
                              { value: 'PF', label: 'Pessoa Física' }
                          ]}
                          buttonClassName="mt-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                          listClassName="max-h-48"
                      />
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
                          placeholder="R$ 0,00"
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
                          placeholder="R$ 0,00"
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

  const transferRowsInModal = transfersSorted;
  const transferGridColumns =
      'minmax(110px,0.9fr) 8px minmax(180px,1.5fr) 8px minmax(180px,1.5fr) 8px minmax(116px,0.95fr) 8px minmax(220px,1.8fr) 8px minmax(120px,0.95fr) 8px 74px';
  const renderTransferRows = (rows: Transfer[]) => {
      if (rows.length === 0) {
          return (
              <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Nenhuma transferência registrada.
              </div>
          );
      }

      return (
          <>
              {!isMobile && (
                  <div
                      className="grid items-center gap-2 px-2 text-[10px] tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
                      style={{ gridTemplateColumns: transferGridColumns }}
                  >
                      <span>Data</span>
                      <span className="text-zinc-500/70">|</span>
                      <span>Conta de origem</span>
                      <span className="text-zinc-500/70">|</span>
                      <span>Conta de destino</span>
                      <span className="text-zinc-500/70">|</span>
                      <span>Status</span>
                      <span className="text-zinc-500/70">|</span>
                      <span>Descrição</span>
                      <span className="text-zinc-500/70">|</span>
                      <span className="text-right">Valor</span>
                      <span className="text-zinc-500/70">|</span>
                      <span>Ações</span>
                  </div>
              )}

              <div className="space-y-1.5">
                  {rows.map((transfer, index) => {
                      const fromName = accountNameById.get(transfer.fromAccountId) || 'Conta removida';
                      const toName = accountNameById.get(transfer.toAccountId) || 'Conta removida';
                      const locked = Boolean(transfer.locked);
                      const transferStatus = getTransferStatusMeta(transfer.status);
                      const notesLabel = transfer.notes?.trim() || '-';
                      const rowBg = index % 2 === 0 ? 'bg-indigo-500/10' : 'bg-transparent';

                      if (isMobile) {
                          return (
                              <div key={transfer.id} className={`rounded-md px-2 py-2 ${rowBg}`}>
                                  <div className="flex items-center justify-between gap-2">
                                      <p className="truncate text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                                          {fromName} <span className="text-zinc-400">→</span> {toName}
                                      </p>
                                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                                          {formatCurrency(transfer.amount)}
                                      </span>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-zinc-500 dark:text-zinc-400">
                                          <span>{formatTransferDate(transfer.date)}</span>
                                          <span className="text-zinc-500/70">|</span>
                                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${transferStatus.className}`}>
                                              {transferStatus.label}
                                          </span>
                                      </div>
                                      {onDeleteTransfer && !locked ? (
                                          <button
                                              type="button"
                                              onClick={() => setTransferDeleteTarget(transfer)}
                                              className="mm-btn-icon"
                                              aria-label={`Excluir transferência de ${fromName} para ${toName}`}
                                          >
                                              <Trash2 size={13} />
                                          </button>
                                      ) : null}
                                  </div>
                                  {notesLabel !== '-' ? (
                                      <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 truncate" title={notesLabel}>
                                          {notesLabel}
                                      </p>
                                  ) : null}
                              </div>
                          );
                      }

                      return (
                          <div
                              key={transfer.id}
                              className={`grid items-center gap-2 px-2 py-2 text-[11px] md:text-xs rounded-md ${rowBg}`}
                              style={{ gridTemplateColumns: transferGridColumns }}
                          >
                              <span className="text-zinc-800 dark:text-zinc-200">{formatTransferDate(transfer.date)}</span>
                              <span className="text-zinc-500/70">|</span>
                              <span className="truncate text-zinc-900 dark:text-zinc-100" title={fromName}>
                                  {fromName}
                              </span>
                              <span className="text-zinc-500/70">|</span>
                              <span className="truncate text-zinc-900 dark:text-zinc-100" title={toName}>
                                  {toName}
                              </span>
                              <span className="text-zinc-500/70">|</span>
                              <span className={`inline-flex w-full items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${transferStatus.className}`}>
                                  {transferStatus.label}
                              </span>
                              <span className="text-zinc-500/70">|</span>
                              <span className="truncate text-zinc-800 dark:text-zinc-200" title={notesLabel}>
                                  {notesLabel}
                              </span>
                              <span className="text-zinc-500/70">|</span>
                              <span className="text-right font-semibold text-indigo-600 dark:text-indigo-300">
                                  {formatCurrency(transfer.amount)}
                              </span>
                              <span className="text-zinc-500/70">|</span>
                              <span className="flex justify-center">
                                  {onDeleteTransfer && !locked ? (
                                      <button
                                          type="button"
                                          onClick={() => setTransferDeleteTarget(transfer)}
                                          className="mm-btn-icon"
                                          aria-label={`Excluir transferência de ${fromName} para ${toName}`}
                                      >
                                          <Trash2 size={13} />
                                      </button>
                                  ) : (
                                      <span className="text-zinc-400 dark:text-zinc-600">-</span>
                                  )}
                              </span>
                          </div>
                      );
                  })}
              </div>
          </>
      );
  };
  const transferSectionInModal = (
      <section className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400 space-y-3">
          <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Transferências recentes</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Histórico dentro do fluxo de transferência.
                  </p>
              </div>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {transferRowsInModal.length} {transferRowsInModal.length === 1 ? 'registro' : 'registros'}
              </span>
          </div>
          {renderTransferRows(transferRowsInModal)}
      </section>
  );

  const listSection = (
      <main className={listWrapperClass}>
          <div className="space-y-3">
              {isInlineAllowed ? inlineNewCard : null}

              {!isMobile || !inlineNewOpen ? (
              visibleAccounts.length > 0 ? (
                  <>
                      <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                  <button
                                      type="button"
                                      onClick={toggleSelectAll}
                                      disabled={selectableAccounts.length === 0}
                                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
                                  >
                                      {selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? (
                                          <CheckSquare size={14} className="text-indigo-600" />
                                      ) : (
                                          <Square size={14} />
                                      )}
                                      <span>{selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                                  </button>
                                  <span className="text-[11px] font-semibold">{selectedIds.length} selecionados</span>
                                  <span className="text-zinc-400 dark:text-zinc-600">|</span>
                                  <span className="text-[11px]">
                                      Soma:{' '}
                                      <strong className="text-zinc-800 dark:text-zinc-100">
                                          {formatCurrency(displayBalance)}
                                      </strong>
                                  </span>
                              </div>
                          </div>
                      </div>
                      <div className="grid grid-cols-6 gap-3">
                          {[
                              ...visibleAccounts.map((account) => ({ kind: 'account' as const, account })),
                              ...Array.from(
                                  {
                                      length: Math.max(0, 12 - visibleAccounts.length)
                                  },
                                  (_, index) => ({ kind: 'placeholder' as const, id: `account-slot-${index}` })
                              )
                          ].map((entry) => {
                              if (entry.kind === 'placeholder') {
                                  return (
                                      <button
                                          key={entry.id}
                                          type="button"
                                          onClick={handleOpenNew}
                                          className="h-[184px] rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition"
                                      >
                                          <span className="h-10 w-10 rounded-full border border-zinc-400/50 flex items-center justify-center text-2xl leading-none">
                                              +
                                          </span>
                                          <span className="text-xs font-semibold uppercase tracking-wide">Adicionar conta</span>
                                      </button>
                                  );
                              }

                              const account = entry.account;
                              const isHighlighted = highlightedId === account.id;
                              const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                              const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivada' : 'Protegida';
                              const isTourSimulated = isTourSimulatedAccountId(account.id);
                              const isPrimaryTourAccount = Boolean(primaryTourAccountId) && account.id === primaryTourAccountId;
                              const isLocked = Boolean(account.locked || account.decryptError);
                              const isBulkSelectBlocked = isLocked || isTourSimulated;
                              const isSelected = selectedIds.includes(account.id);
                              const computedBalance = resolveDisplayedBalance(account);
                              const isExpanded = drawerAccount?.id === account.id;
                              const cardColor = account.color || getAccountColor(account);
                              const watermarkKind = inferAccountWatermark(account);

                              return (
                                  <div
                                      key={account.id}
                                      id={`account-${account.id}`}
                                      className={`relative overflow-hidden h-[184px] rounded-2xl border transition-all duration-200 flex flex-col ${
                                          isExpanded
                                              ? 'border-indigo-400/70 shadow-[0_12px_30px_rgba(99,102,241,0.25)]'
                                              : 'border-zinc-200/80 dark:border-zinc-800/70'
                                      } ${
                                          isHighlighted
                                              ? 'ring-2 ring-indigo-400/70'
                                              : ''
                                      }`}
                                      style={{
                                          background:
                                              `linear-gradient(165deg, ${withAlpha(cardColor, 0.24)} 0%, ${withAlpha(cardColor, 0.1)} 52%, ${withAlpha('#09090b', 0.75)} 100%)`,
                                          boxShadow: isExpanded ? undefined : `0 10px 24px ${withAlpha(cardColor, 0.16)}`
                                      }}
                                  >
                                      <div className="pointer-events-none absolute right-3 bottom-2 z-0 text-white/15">
                                          {watermarkKind === 'bank' ? (
                                              <Landmark size={62} strokeWidth={1.5} />
                                          ) : watermarkKind === 'yield' ? (
                                              <TrendingUp size={62} strokeWidth={1.5} />
                                          ) : (
                                              <DollarSign size={62} strokeWidth={1.5} />
                                          )}
                                      </div>
                                      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
                                          <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => toggleSelection(account.id)}
                                              onClick={(event) => event.stopPropagation()}
                                              disabled={isBulkSelectBlocked}
                                              className="h-4 w-4 accent-indigo-500"
                                              aria-label={`Selecionar conta ${account.name}`}
                                          />
                                          {!isLocked && (
                                              <>
                                                  <button
                                                      type="button"
                                                      onClick={(event) => {
                                                          event.stopPropagation();
                                                          if (isPrimaryTourAccount && typeof window !== 'undefined') {
                                                              window.dispatchEvent(
                                                                  new CustomEvent('mm:tour-accounts-edit-clicked', {
                                                                      detail: { accountId: account.id }
                                                                  })
                                                              );
                                                          }
                                                          setInlineEditAccountId(null);
                                                          setDrawerAccount(null);
                                                          setEditingAccount(account);
                                                          setIsModalOpen(true);
                                                      }}
                                                      data-tour-anchor={isPrimaryTourAccount ? 'accounts-created-account-edit' : undefined}
                                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200/70 dark:border-zinc-700/70 bg-white/75 dark:bg-zinc-900/55 text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-zinc-900 transition"
                                                      aria-label={`Editar conta ${account.name}`}
                                                  >
                                                      <Edit2 size={13} />
                                                  </button>
                                                  <button
                                                      type="button"
                                                      onClick={(event) => {
                                                          event.stopPropagation();
                                                          handleDeleteAccountDirect(account);
                                                      }}
                                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200/70 dark:border-red-900/50 bg-red-50/75 dark:bg-red-900/25 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/35 transition"
                                                      aria-label={`Excluir conta ${account.name}`}
                                                  >
                                                      <Trash2 size={13} />
                                                  </button>
                                              </>
                                          )}
                                      </div>
                                      <button
                                          type="button"
                                          data-tour-anchor={isPrimaryTourAccount ? 'accounts-created-account-row' : undefined}
                                          onClick={() => {
                                              setDrawerAccount(prev => (prev?.id === account.id ? null : account));
                                              if (isPrimaryTourAccount && typeof window !== 'undefined') {
                                                  window.dispatchEvent(
                                                      new CustomEvent('mm:tour-accounts-created-account-clicked', {
                                                          detail: { accountId: account.id }
                                                      })
                                                  );
                                              }
                                          }}
                                          className="relative z-10 w-full flex-1 p-4 pr-24 text-left"
                                          disabled={isLocked}
                                      >
                                          <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                  <p className={`text-sm font-semibold truncate ${isLocked ? 'text-zinc-400' : 'text-zinc-100'}`}>
                                                      {account.name}
                                                  </p>
                                              </div>
                                          </div>

                                          <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-zinc-400">Valor</p>
                                          <p className={`mt-1 text-xl font-bold ${isLocked ? 'text-zinc-400' : 'text-emerald-300'}`}>
                                              {formatCurrency(computedBalance)}
                                          </p>

                                          <div className="mt-3 flex items-center gap-2">
                                              <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                                                  {account.nature || 'PJ'}
                                              </span>
                                              <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 truncate max-w-[160px]">
                                                  {account.type || 'Conta'}
                                              </span>
                                          </div>

                                          {isLocked && (
                                              <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                                  {lockedLabel}
                                              </div>
                                          )}
                                      </button>

                                  </div>
                              );
                          })}
                      </div>
                  </>
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      title="Nenhuma conta cadastrada"
                      message="Cadastre sua primeira conta para começar a lançar entradas, despesas e acompanhar saldo."
                      actionLabel="Cadastrar conta"
                      onAction={handleOpenNew}
                  />
              )
              ) : null}
          </div>
      </main>
  );

  const drawerLocked = Boolean(
      drawerAccount?.locked ||
      drawerAccount?.decryptError ||
      (drawerAccount ? isTourSimulatedAccountId(drawerAccount.id) : false)
  );
  const drawerDetails = drawerAccount ? buildAccountDetails(drawerAccount) : [];
  const transferAmountParsed = parseTransferAmount(transferDraft.amount);
  const transferSaveDisabled =
      !onCreateTransfer ||
      !transferDraft.fromAccountId ||
      !transferDraft.toAccountId ||
      transferDraft.fromAccountId === transferDraft.toAccountId ||
      !transferAmountParsed ||
      transferAmountParsed <= 0;
  const transferDockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const transferDockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const transferDockMaxHeight =
      'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';
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
            variant="dock"
            forceDock={useDockModal}
          />

          {transferSheetOpen && (
              <div className="fixed inset-0 z-[1260]">
                  <button
                      type="button"
                      onClick={closeTransferSheet}
                      className={isMobile ? 'absolute inset-0 bg-black/55' : 'absolute left-0 right-0 bg-black/60 backdrop-blur-sm'}
                      style={isMobile ? undefined : { top: transferDockTopOffset, bottom: transferDockBottomOffset }}
                      aria-label="Fechar transferência"
                  />
                  <div
                      className={
                          isMobile
                              ? 'absolute left-0 right-0 bottom-[var(--mm-mobile-dock-height,68px)] rounded-t-3xl bg-white dark:bg-[#111114] border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4'
                              : 'absolute left-0 right-0 bg-white dark:bg-[#101014] border border-zinc-200 dark:border-zinc-800 shadow-2xl px-5 py-5 flex flex-col overflow-hidden'
                      }
                      style={
                          isMobile
                              ? undefined
                              : {
                                    bottom: transferDockBottomOffset,
                                    maxHeight: `max(320px, ${transferDockMaxHeight})`
                                }
                      }
                  >
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/70 dark:border-zinc-800/70">
                          <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Transferência entre contas</p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  Movimente saldo sem registrar como entrada/saída.
                              </p>
                          </div>
                          <button
                              type="button"
                              onClick={closeTransferSheet}
                              className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                              aria-label="Fechar transferência"
                          >
                              <X size={16} />
                          </button>
                      </div>

                      <div className={`mt-3 ${isMobile ? '' : 'flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1'} space-y-4`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Conta origem
                                  </label>
                                  <SelectDropdown
                                      value={transferDraft.fromAccountId}
                                      onChange={(value) =>
                                          setTransferDraft(prev => ({
                                              ...prev,
                                              fromAccountId: value,
                                              toAccountId: value === prev.toAccountId
                                                  ? (eligibleTransferAccounts.find(account => account.id !== value)?.id || '')
                                                  : prev.toAccountId
                                          }))
                                      }
                                      placeholder="Selecione"
                                      options={eligibleTransferAccounts.map(account => ({ value: account.id, label: account.name }))}
                                      buttonClassName="mt-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white"
                                      listClassName="max-h-48"
                                  />
                              </div>
                              <div>
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Conta destino
                                  </label>
                                  <SelectDropdown
                                      value={transferDraft.toAccountId}
                                      onChange={(value) => setTransferDraft(prev => ({ ...prev, toAccountId: value }))}
                                      placeholder="Selecione"
                                      options={eligibleTransferAccounts
                                          .filter(account => account.id !== transferDraft.fromAccountId)
                                          .map(account => ({ value: account.id, label: account.name }))}
                                      buttonClassName="mt-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white"
                                      listClassName="max-h-48"
                                  />
                              </div>
                              <div>
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Valor
                                  </label>
                                  <input
                                      type="text"
                                      value={transferDraft.amount}
                                      onChange={(event) => setTransferDraft(prev => ({ ...prev, amount: event.target.value }))}
                                      placeholder="Ex.: 3.708,05"
                                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                                  />
                              </div>
                              <div>
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Data
                                  </label>
                                  <input
                                      type="date"
                                      value={transferDraft.date}
                                      onChange={(event) => setTransferDraft(prev => ({ ...prev, date: event.target.value }))}
                                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                                  />
                              </div>
                              <div className="sm:col-span-2">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Status
                                  </label>
                                  <SelectDropdown
                                      value={transferDraft.status}
                                      onChange={(value) =>
                                          setTransferDraft(prev => ({
                                              ...prev,
                                              status:
                                                  value === 'pending' || value === 'canceled'
                                                      ? value
                                                      : 'completed'
                                          }))
                                      }
                                      placeholder="Selecione"
                                      options={[
                                          { value: 'completed', label: 'Concluída' },
                                          { value: 'pending', label: 'Pendente' },
                                          { value: 'canceled', label: 'Cancelada' }
                                      ]}
                                      buttonClassName="mt-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white"
                                      listClassName="max-h-48"
                                  />
                              </div>
                              <div className="sm:col-span-2">
                                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">
                                      Observações
                                  </label>
                                  <textarea
                                      value={transferDraft.notes}
                                      onChange={(event) => setTransferDraft(prev => ({ ...prev, notes: event.target.value }))}
                                      rows={3}
                                      placeholder="Opcional"
                                      className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                                  />
                              </div>
                          </div>
                          {!isMobile && transferSectionInModal}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-200/70 dark:border-zinc-800/70 pt-4">
                          <button
                              type="button"
                              onClick={closeTransferSheet}
                              className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
                          >
                              Cancelar
                          </button>
                          <button
                              type="button"
                              disabled={transferSaveDisabled}
                              onClick={handleSaveTransfer}
                              className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
                                  transferSaveDisabled
                                      ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed'
                                      : 'bg-indigo-600 hover:bg-indigo-500'
                              }`}
                          >
                              Salvar
                          </button>
                      </div>
                  </div>
              </div>
          )}

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
                                  Saldo atual: R$ {resolveAuditedBalance(auditAccount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                                            : entry.type === 'transfer'
                                              ? 'Transferência'
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
                                                        <span className="flex-1 min-w-0 truncate" title={inc.description || 'Entrada'}>
                                                            {inc.description || 'Entrada'}
                                                        </span>
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
                                                        <span className="flex-1 min-w-0 truncate" title={exp.description || 'Saída'}>
                                                            {exp.description || 'Saída'}
                                                        </span>
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

          {transferDeleteTarget && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 relative animate-in zoom-in-95 duration-200">
                      <button
                          onClick={() => setTransferDeleteTarget(null)}
                          aria-label="Fechar confirmação de exclusão de transferência"
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>
                      <div className="flex flex-col items-center text-center mb-5">
                          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-4 text-rose-600 dark:text-rose-400">
                              <Trash2 size={22} />
                          </div>
                          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Excluir transferência?</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              Esta ação vai remover o registro e desfazer o efeito no saldo das contas.
                          </p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#151517] px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 mb-5">
                          <p>
                              {accountNameById.get(transferDeleteTarget.fromAccountId) || 'Conta removida'} →
                              {' '}
                              {accountNameById.get(transferDeleteTarget.toAccountId) || 'Conta removida'}
                          </p>
                          <p className="mt-1 font-semibold text-zinc-900 dark:text-white">
                              {formatCurrency(transferDeleteTarget.amount)}
                          </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <button
                              onClick={() => setTransferDeleteTarget(null)}
                              className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition"
                          >
                              Cancelar
                          </button>
                          <button
                              onClick={confirmDeleteTransfer}
                              className="rounded-xl border border-rose-500/40 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition"
                          >
                              Excluir
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {isTourAccountAuditOpen && (
              <div className="fixed inset-0 z-[1580] pointer-events-none">
                  <button
                      type="button"
                      onClick={() => setIsTourAccountAuditOpen(false)}
                      aria-label="Fechar auditoria de contas"
                      className="absolute inset-0 bg-transparent pointer-events-auto animate-in fade-in duration-200"
                  />
                  <div
                      data-tour-anchor="accounts-audit-panel"
                      className="absolute z-[1705] left-1/2 -translate-x-1/2 pointer-events-auto bg-white/90 dark:bg-white/5 text-zinc-900 dark:text-white rounded-[26px] border border-black/10 dark:border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl p-5 max-h-[80vh] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-200 w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))]"
                      style={{ bottom: 'var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))' }}
                  >
                      <button
                          onClick={() => setIsTourAccountAuditOpen(false)}
                          aria-label="Fechar auditoria de contas"
                          data-tour-anchor="accounts-audit-close"
                          title="Você pode fechar por aqui"
                          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                          <X size={20} />
                      </button>

                      <div className="flex items-start gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                              <History size={18} />
                          </div>
                          <div>
                              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Auditoria de Contas</h3>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  Registros desta tela no guia de primeiro acesso.
                              </p>
                          </div>
                      </div>

                      <div className="max-h-[calc(min(56vh,540px)-120px)] overflow-auto space-y-2 text-xs">
                          {tourAccountAuditEntries.length === 0 ? (
                              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-zinc-500 dark:text-zinc-400">
                                  Sem registros no momento.
                              </div>
                          ) : (
                              tourAccountAuditEntries.map((entry) => (
                                  <div
                                      key={entry.id}
                                      className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                                  >
                                      <div className="flex flex-col">
                                          <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                                              Conta criada: {entry.accountName}
                                          </span>
                                          <span className="text-[10px] text-zinc-400">
                                              {new Date(entry.createdAt).toLocaleString('pt-BR')}
                                          </span>
                                      </div>
                                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                          {formatCurrency(entry.amount)}
                                      </span>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>
          )}

          <MobileTransactionDrawer
              open={isMobile && Boolean(drawerAccount)}
              title={drawerAccount?.name || ''}
              amount={drawerAccount ? formatCurrency(resolveDisplayedBalance(drawerAccount)) : undefined}
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
              {!inlineNewOpen ? (
              visibleAccounts.length > 0 ? (
                  <>
                      <div className="px-4 pt-2">
                          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                  <button
                                      type="button"
                                      onClick={toggleSelectAll}
                                      disabled={selectableAccounts.length === 0}
                                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
                                  >
                                      {selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? (
                                          <CheckSquare size={14} className="text-indigo-600" />
                                      ) : (
                                          <Square size={14} />
                                      )}
                                      <span>{selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                                  </button>
                                  <span className="text-[11px] font-semibold">{selectedIds.length} selecionados</span>
                                  <span className="text-[11px]">
                                      Soma:{' '}
                                      <strong className="text-zinc-800 dark:text-zinc-100">
                                          {formatCurrency(displayBalance)}
                                      </strong>
                                  </span>
                              </div>
                          </div>
                      </div>
                      <div className="px-4 grid grid-cols-2 gap-2">
                                      {visibleAccounts.map((account) => {
                                          const isTourSimulated = isTourSimulatedAccountId(account.id);
                                          const isLocked = Boolean(account.locked || account.decryptError);
                                          const isBulkSelectBlocked = isLocked || isTourSimulated;
                                          const isSelected = selectedIds.includes(account.id);
                                          const computedBalance = resolveDisplayedBalance(account);
                                          const isExpanded = drawerAccount?.id === account.id;
                                          const cardColor = account.color || getAccountColor(account);
                                          const watermarkKind = inferAccountWatermark(account);
                                          const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                                          const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivada' : 'Protegida';
                                          return (
                                              <div
                                                  key={account.id}
                                                  id={`account-${account.id}`}
                                                  className="min-w-0"
                                              >
                                                  <div
                                                      className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
                                                          isExpanded
                                                              ? 'border-indigo-400/70 shadow-[0_10px_24px_rgba(99,102,241,0.2)]'
                                                              : 'border-zinc-200/80 dark:border-zinc-800/70'
                                                      }`}
                                                      style={{
                                                          background:
                                                              `linear-gradient(160deg, ${withAlpha(cardColor, 0.24)} 0%, ${withAlpha(cardColor, 0.1)} 54%, ${withAlpha('#09090b', 0.78)} 100%)`,
                                                          boxShadow: isExpanded ? undefined : `0 8px 20px ${withAlpha(cardColor, 0.15)}`
                                                      }}
                                                  >
                                                      <div className="pointer-events-none absolute right-2 bottom-1 z-0 text-white/15">
                                                          {watermarkKind === 'bank' ? (
                                                              <Landmark size={44} strokeWidth={1.5} />
                                                          ) : watermarkKind === 'yield' ? (
                                                              <TrendingUp size={44} strokeWidth={1.5} />
                                                          ) : (
                                                              <DollarSign size={44} strokeWidth={1.5} />
                                                          )}
                                                      </div>
                                                      <div className="absolute right-2 top-2 z-20">
                                                          <input
                                                              type="checkbox"
                                                              checked={isSelected}
                                                              onChange={() => toggleSelection(account.id)}
                                                              onClick={(event) => event.stopPropagation()}
                                                              disabled={isBulkSelectBlocked}
                                                              className="h-4 w-4 accent-indigo-500"
                                                              aria-label={`Selecionar conta ${account.name}`}
                                                          />
                                                      </div>
                                                      <button
                                                          type="button"
                                                          onClick={() => setDrawerAccount(account)}
                                                          className="relative z-10 w-full px-3 py-3 text-left"
                                                          disabled={isLocked}
                                                      >
                                                          <p className={`pr-7 text-sm font-semibold truncate ${isLocked ? 'text-zinc-400' : 'text-zinc-100'}`}>
                                                              {account.name}
                                                          </p>
                                                          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">Valor</p>
                                                          <p className={`mt-1 text-lg font-bold ${isLocked ? 'text-zinc-400' : 'text-emerald-300'}`}>
                                                              {formatCurrency(computedBalance)}
                                                          </p>
                                                          <div className="mt-2 flex items-center gap-1.5">
                                                              <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                                                                  {account.nature || 'PJ'}
                                                              </span>
                                                              <span className="inline-flex items-center rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200 truncate max-w-[90px]">
                                                                  {account.type || 'Conta'}
                                                              </span>
                                                          </div>
                                                          {isLocked && (
                                                              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                                                  <Lock size={10} />
                                                                  {lockedLabel}
                                                              </div>
                                                          )}
                                                      </button>
                                                  </div>
                                              </div>
                                          );
                                      })}
                      </div>
                  </>
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      title="Nenhuma conta cadastrada"
                      message="Cadastre sua primeira conta para começar a lançar entradas, despesas e acompanhar saldo."
                      actionLabel="Cadastrar conta"
                      onAction={handleOpenNew}
                  />
              )
              ) : null}
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
                                  {accountsHeader}
                              </div>
                          </div>
                      </div>
                      <div
                          className={`h-full mm-mobile-content-pad ${inlineNewOpen ? 'pb-[calc(env(safe-area-inset-bottom)+16px)]' : 'pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px)+20px)]'} overflow-y-auto overflow-x-hidden`}
                          style={{
                              paddingTop: subHeaderHeight
                                  ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px - ${topAdjust}px)`
                                  : 'calc(var(--mm-mobile-top, 0px))',
                              WebkitOverflowScrolling: 'touch'
                          }}
                      >
                      <div ref={firstSectionRef}>
                        <MobileFullWidthSection contentClassName="mm-mobile-section-pad mm-mobile-section-pad-tight-top">
                            {mobileList}
                        </MobileFullWidthSection>
                      </div>
                      </div>
                  </div>
              </div>
              {inlineNewSheet}
              {inlineNewNotesSheet}
              {inlineNewTypesSheet}
              {modals}
          </>
      );
  }

  return (
    <div className="bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300">
      {summarySection}
      {listSection}
      {modals}
    </div>
  );
};

export default AccountsView;
