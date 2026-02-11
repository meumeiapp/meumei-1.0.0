
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Landmark,
  Wallet,
  Trash2,
  X,
  Edit2,
  Plus,
  CheckSquare,
  Square,
  Lock,
  AlertTriangle,
  History,
  Info,
  ChevronDown
} from 'lucide-react';
import NewAccountModal from './NewAccountModal';
import { Account, Expense, Income } from '../types';
import { AuditLogInput } from '../services/auditService';
import { getAccountColor, withAlpha } from '../services/cardColorUtils';
import { PREMIUM_COLOR_PRESETS } from './ui/colorPresets';
import { DEFAULT_ACCOUNT_TYPES } from '../constants';
import { useGlobalActions } from '../contexts/GlobalActionsContext';
import useIsMobile from '../hooks/useIsMobile';
import useIsCompactHeight from '../hooks/useIsCompactHeight';
import MobileTransactionDrawer from './mobile/MobileTransactionDrawer';
import SelectDropdown from './common/SelectDropdown';
import MobileEmptyState from './mobile/MobileEmptyState';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
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
  const chunkItems = <T,>(items: T[], size: number): T[][] => {
      if (size <= 0) return [items];
      const result: T[][] = [];
      for (let i = 0; i < items.length; i += size) {
          result.push(items.slice(i, i + size));
      }
      return result;
  };
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
  const [mobilePageIndex, setMobilePageIndex] = useState(0);
  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
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
          const desired = 5;
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
      if (!isMobile || typeof window === 'undefined') return;
      const handleDockClick = () => {
          setDrawerAccount(null);
          setInlineNewOpen(false);
          setInlineEditAccountId(null);
          setInlineNewEditId(null);
          setInlineNewNotesOpen(false);
          setInlineNewTypesOpen(false);
          setEditingAccount(null);
          setAccountToDelete(null);
          setAuditAccountId(null);
          setIsModalOpen(false);
      };
      window.addEventListener('mm:mobile-dock-click', handleDockClick);
      return () => window.removeEventListener('mm:mobile-dock-click', handleDockClick);
  }, [isMobile]);

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
  const selectableAccounts = accounts.filter(acc => !acc.locked && !acc.decryptError);

  const resolveRealBalance = (account: Account) => {
    const computed = balanceSnapshot?.byAccountId?.[account.id];
    return Number.isFinite(computed) ? computed : account.currentBalance;
  };

  const displayBalance = isSelectionMode
    ? unlockedAccounts.filter(acc => selectedIds.includes(acc.id)).reduce((acc, curr) => acc + resolveRealBalance(curr), 0)
    : unlockedAccounts.reduce((acc, curr) => acc + resolveRealBalance(curr), 0);

  const totalBalance = unlockedAccounts.reduce((acc, curr) => acc + resolveRealBalance(curr), 0);
  const displayCount = isSelectionMode ? selectedIds.length : accounts.length;
  const headerTotalBalance = isSelectionMode ? displayBalance : totalBalance;
  const displayLabel = isSelectionMode ? 'Saldo Parcial (Selecionado)' : 'Saldo Total';
  const listSubtitle = `${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'}`;
  const ACCOUNT_DESKTOP_VISIBLE_LIMIT = 10;
  const visibleAccounts = accounts;
  const accountDesktopNeedsScroll = isCompactHeight || accounts.length > ACCOUNT_DESKTOP_VISIBLE_LIMIT;
  const allowPageScroll = isMobile ? false : accountDesktopNeedsScroll;
  const MOBILE_PAGE_SIZE = 6;
  const mobilePages = chunkItems(visibleAccounts, MOBILE_PAGE_SIZE);
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

  const handleEditAccountDirect = (account: Account) => {
      if (account.locked) return;
      console.info('[ui][accounts][edit]', { accountId: account.id, source: 'drawer' });
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
    : 'max-w-7xl mx-auto px-4 sm:px-6 pt-[var(--mm-content-gap)] pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500';

  const headerCardRadius = isMobile ? 'rounded-none' : 'rounded-xl';
  const headerSecondaryRadius = isMobile ? 'rounded-none' : 'rounded-xl';
  const headerPrimaryRadius = isMobile ? 'rounded-none' : 'rounded-2xl';

  const accountsHeader = (
      <div className="space-y-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
              <div className="h-8 w-8" aria-hidden="true" />
              <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Contas Bancárias</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{listSubtitle}</p>
              </div>
              <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
              <div className={`${headerCardRadius} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center`}>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Contas</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{displayCount}</p>
              </div>
              <div className={`${headerCardRadius} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center`}>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Saldo total</p>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                      {formatCurrency(headerTotalBalance)}
                  </p>
              </div>
              <div className={`${headerCardRadius} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-2 py-1.5 text-center`}>
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
                      className={`flex items-center justify-center gap-2 ${headerSecondaryRadius} border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition`}
                      title="Auditoria do dia"
                  >
                      <History size={14} />
                      Auditoria
                  </button>
              )}
              <button
                  onClick={handleOpenNew}
                  className={`w-full ${headerPrimaryRadius} bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-blue-900/20 transition active:scale-[0.98]`}
              >
                  Nova Conta
              </button>
          </div>
      </div>
  );

  const summarySection = (
      <div className={summaryWrapperClass}>
          <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
              {accountsHeader}
          </div>
      </div>
  );

  const inlineNewCardStyle =
      isInlineAllowed && inlineNewOpen
          ? { minHeight: `calc(var(--app-height, 100vh) - ${subHeaderHeight + 28}px)` }
          : undefined;
  const inlineNewActions = isInlineAllowed && inlineNewOpen ? (
      <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-2 pt-1.5 pb-0 grid grid-cols-2 gap-2">
          <button
              type="button"
              onClick={() => setInlineNewOpen(false)}
              className="rounded-none border border-blue-400/50 bg-blue-950/30 py-3 text-sm font-semibold text-blue-200 hover:bg-blue-900/40 transition"
          >
              Cancelar
          </button>
          <button
              type="button"
              disabled={!inlineNewDraft.name.trim() || !inlineNewDraft.type || !inlineNewDraft.nature}
              onClick={handleInlineCreate}
              className={`rounded-none border border-blue-500/40 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition ${
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
      onUpdateAccountTypes?.(DEFAULT_ACCOUNT_TYPES);
      setSelectedTypes([]);
  };

  const inlineNewCard = isInlineAllowed && inlineNewOpen ? (
      <div className="rounded-none border-0 bg-transparent p-0 flex flex-col" style={inlineNewCardStyle}>
          <div className="px-3 pt-2 pb-2 bg-[#0b0b10] border-b border-white/10">
                      <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                  <Wallet size={16} className="text-white" />
                          <p className="text-[13px] font-semibold text-white truncate">{inlineNewEditId ? 'Editar Conta' : 'Nova Conta'}</p>
                      </div>
                              <p className="text-[9px] text-white/70">Preencha os dados da conta.</p>
                          </div>
                  <button
                      type="button"
                      onClick={() => setInlineNewOpen(false)}
                      className="h-8 w-8 rounded-none bg-white/15 text-white/80 hover:text-white flex items-center justify-center"
                      aria-label="Fechar nova conta"
                  >
                      <X size={16} />
                  </button>
              </div>
          </div>
          <div className="mt-2 px-3 grid grid-cols-1 gap-1.5">
              <div>
                  <label className="text-[9px] uppercase tracking-wide font-bold text-white">
                      Nome da conta
                  </label>
                  <input
                      type="text"
                      value={inlineNewDraft.name}
                      onChange={(event) =>
                          setInlineNewDraft(prev => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="EX: CONTA CORRENTE PJ, CARTEIRA DIGITAL"
                      className="mt-0.5 w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:uppercase placeholder:font-light placeholder:text-[9px]"
                  />
              </div>

              <div>
                  <div className="flex items-center justify-between">
                      <label className="text-[9px] uppercase tracking-wide font-bold text-white">
                          Tipo
                      </label>
                  <button
                      type="button"
                      onClick={() => {
                          setInlineNewTypesOpen(true);
                          setInlineNewTypeError('');
                      }}
                      className="text-[9px] font-bold flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
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
                      placeholder="SELECIONE"
                      options={normalizedAccountTypes.map(type => ({ value: type, label: type }))}
                      buttonClassName="mt-0.5 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      placeholderClassName="text-[9px] font-light uppercase"
                      listClassName="max-h-48"
                  />
              </div>

              <div>
                  <label className="text-[9px] uppercase tracking-wide font-bold text-white">
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
                      placeholder="SELECIONE"
                      options={[
                          { value: 'PJ', label: 'Pessoa Jurídica' },
                          { value: 'PF', label: 'Pessoa Física' }
                      ]}
                      buttonClassName="mt-0.5 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                      placeholderClassName="text-[9px] font-light uppercase"
                      listClassName="max-h-48"
                  />
              </div>

              <div>
                  <label className="text-[9px] uppercase tracking-wide font-bold text-white">
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
                      placeholder="EX: R$0,00"
                      className="mt-0.5 w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:uppercase placeholder:font-light placeholder:text-[9px]"
                  />
              </div>

              <div>
                  <label className="text-[9px] uppercase tracking-wide font-bold text-white">
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
                      placeholder="EX: R$0,00"
                      className="mt-0.5 w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:uppercase placeholder:font-light placeholder:text-[9px]"
                  />
              </div>
              <div>
                  <label className="text-[9px] uppercase tracking-wide font-bold text-white">
                      Cor da tag
                  </label>
                  <div className="mt-1 grid [grid-template-columns:repeat(15,minmax(0,1fr))] gap-1">
                      {inlineNewTagColors.slice(0, inlineNewTagMid).map(color => (
                          <button
                              key={color}
                              type="button"
                              onClick={() => setInlineNewDraft(prev => ({ ...prev, color }))}
                              className={`h-6 w-6 rounded-none border ${
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
                              className={`h-6 w-6 rounded-none border ${
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
                      className="w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-left text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 flex items-center justify-between"
                  >
                      Observações
                      <span className="text-[9px] font-light text-zinc-400 uppercase">Adicionar</span>
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
              <div className="flex-1 overflow-hidden px-3 pt-0 pb-16">
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
                      placeholder="DETALHES ADICIONAIS..."
                      className="w-full rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-2.5 py-1.5 text-[12px] text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                  />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(false)}
                      className="rounded-none border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                  >
                      Cancelar
                  </button>
                  <button
                      type="button"
                      onClick={() => setInlineNewNotesOpen(false)}
                      className="rounded-none border border-indigo-500/40 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition"
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
                      <p className="text-xs font-semibold truncate">Categorias</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Gerencie e crie novas.</p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setInlineNewTypesOpen(false)}
                      className="h-7 w-7 rounded-none bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                      aria-label="Fechar categorias"
                  >
                      <X size={14} />
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
                          placeholder={inlineNewTypeError || 'NOVA CATEGORIA...'}
                          className={`w-full bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700 text-xs text-zinc-900 dark:text-white rounded-none px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400 placeholder:uppercase placeholder:font-light placeholder:text-[9px] flex-1 w-auto ${
                              inlineNewTypeError ? 'border-red-500 focus:border-red-500 focus:ring-red-500 placeholder:text-red-500' : ''
                          }`}
                      />
                      <button
                          type="button"
                          onClick={handleAddInlineType}
                          aria-label="Adicionar categoria"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-none"
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
                              className="w-full rounded-none border border-red-200 text-red-600 text-[11px] font-semibold py-1.5 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                              Excluir selecionados ({selectedTypes.length})
                          </button>
                      )}
                      <button
                          type="button"
                          onClick={handleResetTypes}
                          className={`${selectedTypes.length > 0 ? '' : 'w-full'} rounded-none border border-red-200 text-red-600 text-[11px] font-semibold py-1.5 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
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

  const listSection = (
      <main className={listWrapperClass}>
          <div className="space-y-3">
              {isInlineAllowed ? inlineNewCard : null}

              {!isMobile || !inlineNewOpen ? (
              accounts.length > 0 ? (
                  <>
                      <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <button
                              type="button"
                              onClick={toggleSelectAll}
                              disabled={selectableAccounts.length === 0}
                              className="flex items-center gap-2 font-semibold disabled:opacity-50"
                          >
                              {selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? (
                                  <CheckSquare size={14} className="text-indigo-600" />
                              ) : (
                                  <Square size={14} />
                              )}
                              <span>{selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                          </button>
                          <span className="text-[11px]">{selectedIds.length} selecionados</span>
                      </div>
                      {visibleAccounts.map(account => {
                          const isHighlighted = highlightedId === account.id;
                          const lockedReason = account.lockedReason || (account.decryptError ? 'decrypt_failed' : undefined);
                          const lockedLabel = lockedReason === 'epoch_mismatch' ? 'Arquivado' : 'Protegida';
                          const isLocked = Boolean(account.locked || account.decryptError);
                          const isSelected = selectedIds.includes(account.id);
                          const computedBalance = resolveRealBalance(account);
                          const isExpanded = drawerAccount?.id === account.id;
                          const isInlineEditing = inlineEditAccountId === account.id;
                          const details = isExpanded ? buildAccountDetails(account) : [];
                          const rowBg = withAlpha(account.color || getAccountColor(account), 0.12);

                          return (
                              <div key={account.id} id={`account-${account.id}`}>
                                  <div
                                      className="py-2 rounded-md"
                                      style={{ backgroundColor: rowBg }}
                                  >
                                      <button
                                          type="button"
                                          onClick={() => setDrawerAccount(prev => (prev?.id === account.id ? null : account))}
                                          className="w-full flex items-center justify-between gap-3 text-left"
                                          disabled={isLocked}
                                      >
                                          <div className="flex items-center gap-2 min-w-0">
                                              <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleSelection(account.id)}
                                                  onClick={(event) => event.stopPropagation()}
                                                  disabled={isLocked}
                                                  className="h-4 w-4 accent-indigo-500"
                                                  aria-label={`Selecionar conta ${account.name}`}
                                              />
                                              <span className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                  {account.name}
                                              </span>
                                          </div>
                                          <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                              {formatCurrency(computedBalance)}
                                          </span>
                                      </button>
                                  </div>
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
                  </>
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      message="Nenhuma conta cadastrada."
                  />
              )
              ) : null}
          </div>
      </main>
  );

  const drawerLocked = Boolean(drawerAccount?.locked || drawerAccount?.decryptError);
  const drawerDetails = drawerAccount ? buildAccountDetails(drawerAccount) : [];
  const desktopScrollPadding =
      (accountDesktopNeedsScroll || inlineNewOpen || inlineEditAccountId) ? 'pb-28' : 'pb-6';

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
              {!inlineNewOpen ? (
              accounts.length > 0 ? (
                  <>
                      <div className="px-4 py-2">
                          <button
                              type="button"
                              onClick={toggleSelectAll}
                              disabled={selectableAccounts.length === 0}
                              className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 disabled:opacity-50"
                          >
                              <span>{selectedIds.length === selectableAccounts.length && selectableAccounts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                              <span>{selectedIds.length} selecionados</span>
                          </button>
                      </div>
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
                                  <div
                                      key={`page-${pageIndex}`}
                                      className="min-w-full snap-start space-y-2"
                                  >
                                      {page.map((account) => {
                                          const isLocked = Boolean(account.locked || account.decryptError);
                                          const isSelected = selectedIds.includes(account.id);
                                          const computedBalance = resolveRealBalance(account);
                                          const rowBg = withAlpha(account.color || getAccountColor(account), 0.12);
                                          return (
                                              <div
                                                  key={account.id}
                                                  id={`account-${account.id}`}
                                                  className="px-4 py-2 rounded-none"
                                                  style={{ backgroundColor: rowBg }}
                                              >
                                                  <button
                                                      type="button"
                                                      onClick={() => setDrawerAccount(account)}
                                                      className="w-full flex items-center justify-between gap-3 text-left"
                                                      disabled={isLocked}
                                                  >
                                                      <div className="flex items-center gap-2 min-w-0">
                                                          <input
                                                              type="checkbox"
                                                              checked={isSelected}
                                                              onChange={() => toggleSelection(account.id)}
                                                              onClick={(event) => event.stopPropagation()}
                                                              disabled={isLocked}
                                                              className="h-4 w-4 accent-indigo-500"
                                                              aria-label={`Selecionar conta ${account.name}`}
                                                          />
                                                          <span className={`text-sm font-medium truncate ${isLocked ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                              {account.name}
                                                          </span>
                                                      </div>
                                                      <span className={`text-sm font-semibold shrink-0 mr-2 ${isLocked ? 'text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                          {formatCurrency(computedBalance)}
                                                      </span>
                                                  </button>
                                              </div>
                                          );
                                      })}
                                  </div>
                              ))}
                          </div>
                          {hasMobilePages && (
                              <div className="mt-2 px-4 flex items-center justify-end gap-2">
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
                  </>
              ) : (
                  <MobileEmptyState
                      icon={<Landmark size={18} />}
                      message="Nenhuma conta cadastrada."
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
                              <div className="px-3 pb-3 pt-2">
                                  {accountsHeader}
                              </div>
                          </div>
                      </div>
                      <div
                          className={`h-full px-4 ${inlineNewOpen ? 'pb-[calc(env(safe-area-inset-bottom)+16px)]' : 'pb-[calc(env(safe-area-inset-bottom)+88px)]'} overflow-hidden`}
                          style={{
                              paddingTop: subHeaderHeight
                                  ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px + 2px - ${topAdjust}px)`
                                  : 'calc(var(--mm-mobile-top, 0px) + 2px)'
                          }}
                      >
                      <div ref={firstSectionRef}>
                        <MobileFullWidthSection contentClassName="px-3 py-3">
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
    <div className={`min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter ${desktopScrollPadding} transition-colors duration-300 ${accountDesktopNeedsScroll ? '' : 'overflow-hidden'}`}>
      {summarySection}
      {listSection}
      {modals}
    </div>
  );
};

export default AccountsView;
