
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Smile,
  Target,
  Flame,
  OctagonAlert
} from 'lucide-react';
// Mobile layout does not support drag reordering.
import { CreditCard as CreditCardType, Expense, Income, Account } from '../types';
import { useGlobalActions, EntityType } from '../contexts/GlobalActionsContext';
import { expenseStatusLabel, normalizeExpenseStatus } from '../utils/statusUtils';
import { useDashboardLayout, DashboardBlockId } from '../hooks/useDashboardLayout';
import useIsMobile from '../hooks/useIsMobile';
import { notificationsService } from '../services/notificationsService';

interface FinancialData {
    balance: number;
    legacyBalance?: number;
    income: number;
    expenses: number;
    pendingExpenses: number;
    pendingIncome: number;
    annualMeiRevenue?: number; 
}

interface ExpenseBreakdown {
    fixed: number;
    variable: number;
    personal: number;
}


const MONTH_ALIASES: Record<string, string> = {
  jan: '01',
  fev: '02',
  mar: '03',
  abr: '04',
  mai: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  set: '09',
  out: '10',
  nov: '11',
  dez: '12'
};

interface InlineSearchFilters {
  type?: EntityType;
  category?: string;
  month?: string;
  valueComparison?: { op: '>' | '<' | '>=' | '<=' | '='; value: number };
}

interface InlineSearchItem {
  id: string;
  entity: EntityType | 'category';
  title: string;
  subtitle?: string;
  category?: string;
  amount?: number;
  dateLabel?: string;
  keywords: string[];
  subtype?: string;
  sortDate?: string;
  status?: string;
}

const parseInlineFilters = (query: string): InlineSearchFilters => {
  const filters: InlineSearchFilters = {};
  const tokens = query.toLowerCase().split(/\s+/);
  tokens.forEach(token => {
      if (token.startsWith('tipo:')) {
          const value = token.replace('tipo:', '');
          if (['despesa', 'expense'].includes(value)) filters.type = 'expense';
          if (['entrada', 'income'].includes(value)) filters.type = 'income';
          if (['conta', 'account'].includes(value)) filters.type = 'account';
          if (['cartao', 'cartão', 'card'].includes(value)) filters.type = 'card';
          if (['rendimento', 'earning'].includes(value)) filters.type = 'earning';
      } else if (token.startsWith('categoria:')) {
          filters.category = token.replace('categoria:', '');
      } else if (token.startsWith('mes:') || token.startsWith('mês:')) {
          filters.month = token.split(':')[1];
      } else if (/^(valor|v):/.test(token)) {
          const match = token.match(/valor([><]=?|=)(\d+(?:[\.,]\d+)?)/);
          if (match) {
              filters.valueComparison = { op: match[1] as any, value: parseFloat(match[2].replace(',', '.')) };
          }
      } else if (/^[><]=?\d+/.test(token)) {
          const match = token.match(/([><]=?)(\d+(?:[\.,]\d+)?)/);
          if (match) {
              filters.valueComparison = { op: match[1] as any, value: parseFloat(match[2].replace(',', '.')) };
          }
      }
  });
  return filters;
};

const parseDateLabel = (value?: string): Date | null => {
  if (!value) return null;
  const date = new Date(value + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
};

const getInlineExpenseStatusMeta = (item: InlineSearchItem) => {
  if (item.entity !== 'expense') return null;
  const normalizedStatus = normalizeExpenseStatus(item.status);
  if (normalizedStatus === 'paid') {
      return { label: expenseStatusLabel(normalizedStatus), textClass: 'text-emerald-400', dotClass: 'bg-emerald-400' };
  }
  const dueDate = parseDateLabel(item.sortDate || item.dateLabel);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!dueDate) {
      return { label: 'Pendente', textClass: 'text-amber-400', dotClass: 'bg-amber-400' };
  }
  if (dueDate < today) {
      return { label: 'Em aberto', textClass: 'text-rose-400', dotClass: 'bg-rose-400' };
  }
  return { label: 'Pendente', textClass: 'text-amber-400', dotClass: 'bg-amber-400' };
};

const matchInlineValue = (amount = 0, comparison?: InlineSearchFilters['valueComparison']) => {
  if (!comparison) return true;
  switch (comparison.op) {
      case '>':
          return amount > comparison.value;
      case '<':
          return amount < comparison.value;
      case '>=':
          return amount >= comparison.value;
      case '<=':
          return amount <= comparison.value;
      default:
          return amount === comparison.value;
  }
};

const mapMonthAlias = (token: string) => {
  const clean = token.slice(0, 3);
  return MONTH_ALIASES[clean as keyof typeof MONTH_ALIASES] || clean;
};

const resolveCardDueDate = (card: CreditCardType, expenses: Expense[], viewDate: Date) => {
  const monthExpenses = expenses.filter(exp => {
    if (!exp.cardId || exp.cardId !== card.id) return false;
    if (!exp.dueDate) return false;
    const due = new Date(exp.dueDate + 'T12:00:00');
    return due.getMonth() === viewDate.getMonth() && due.getFullYear() === viewDate.getFullYear();
  });
  const dueDateFromExpenses = monthExpenses.length
    ? monthExpenses.reduce((latest, exp) => {
        const next = new Date(exp.dueDate + 'T12:00:00');
        return next > latest ? next : latest;
      }, new Date(monthExpenses[0].dueDate + 'T12:00:00'))
    : null;
  if (dueDateFromExpenses) return dueDateFromExpenses;
  const fallback = new Date(viewDate.getFullYear(), viewDate.getMonth(), card.dueDay);
  if (card.dueDay < card.closingDay) {
    fallback.setMonth(fallback.getMonth() + 1);
  }
  return fallback;
};


interface DashboardProps {
  onOpenAccounts: () => void;
  onOpenVariableExpenses: () => void;
  onOpenFixedExpenses?: () => void;
  onOpenPersonalExpenses?: () => void;
  onOpenIncomes?: () => void;
  onOpenYields?: () => void; 
  onOpenInvoices?: () => void;
  onOpenReports?: () => void; // New Prop
  onOpenLaunches?: () => void;
  onOpenExpenseAll?: () => void;
  onOpenDas: () => void;
  financialData: FinancialData;
  creditCards: CreditCardType[];
  expenseBreakdown?: ExpenseBreakdown;
  expenses: Expense[];
  expensesRevision: number;
  onRefreshExpenses?: () => void;
  incomes: Income[];
  accounts: Account[];
  viewDate: Date;
  minDate?: string;
  onOpenInstall: () => void;
  isAppInstalled?: boolean;
  tipsEnabled?: boolean;
  onOpenSettings?: () => void;
  categoriesCount?: number;
  isPwaInstallable?: boolean;
  isStandalone?: boolean;
  onInstallApp?: () => void;
  assistantHidden?: boolean;
  onCloseAssistant?: () => void;
}

const MEI_LIMIT = 81000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEI_CHECKPOINTS = [0.25, 0.5, 0.75, 1];

type MeiStatusLevel = 'safe' | 'attention' | 'critical' | 'over';

interface MeiStatus {
  level: MeiStatusLevel;
  label: string;
  description: string;
  accentText: string;
  badgeClass: string;
  gradient: string;
  calloutBg: string;
  calloutBorder: string;
  calloutText: string;
}

const MEI_STATUS_CONFIG: Record<MeiStatusLevel, Omit<MeiStatus, 'level'>> = {
  safe: {
    label: 'Distância segura',
    description: 'Seu faturamento está bem abaixo do limite anual.',
    accentText: 'text-emerald-500',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    gradient: 'from-emerald-400 to-emerald-500',
    calloutBg: 'bg-emerald-50 dark:bg-emerald-900/10',
    calloutBorder: 'border-emerald-100 dark:border-emerald-900/40',
    calloutText: 'text-emerald-700 dark:text-emerald-200'
  },
  attention: {
    label: 'Atenção',
    description: 'Você já passou da metade do limite anual do MEI.',
    accentText: 'text-amber-500',
    badgeClass: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-400 to-amber-500',
    calloutBg: 'bg-amber-50 dark:bg-amber-900/10',
    calloutBorder: 'border-amber-100 dark:border-amber-900/40',
    calloutText: 'text-amber-700 dark:text-amber-200'
  },
  critical: {
    label: 'Zona crítica',
    description: 'Faltam poucos passos para estourar o limite anual.',
    accentText: 'text-orange-500',
    badgeClass: 'bg-orange-100 text-orange-700',
    gradient: 'from-orange-400 to-orange-500',
    calloutBg: 'bg-orange-50 dark:bg-orange-900/10',
    calloutBorder: 'border-orange-100 dark:border-orange-900/30',
    calloutText: 'text-orange-700 dark:text-orange-200'
  },
  over: {
    label: 'Limite estourado',
    description: 'Você ultrapassou o teto anual do MEI, consulte seu contador.',
    accentText: 'text-red-500',
    badgeClass: 'bg-red-100 text-red-700',
    gradient: 'from-red-500 to-red-600',
    calloutBg: 'bg-red-50 dark:bg-red-900/10',
    calloutBorder: 'border-red-100 dark:border-red-900/40',
    calloutText: 'text-red-700 dark:text-red-200'
  }
};

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatCurrencyCompact = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const getMeiStatus = (percentage: number): MeiStatus => {
  if (percentage > 100) return { level: 'over', ...MEI_STATUS_CONFIG.over };
  if (percentage >= 80) return { level: 'critical', ...MEI_STATUS_CONFIG.critical };
  if (percentage >= 50) return { level: 'attention', ...MEI_STATUS_CONFIG.attention };
  return { level: 'safe', ...MEI_STATUS_CONFIG.safe };
};

type MascotConfig = {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  ringClass: string;
  faceClass: string;
  auraClass: string;
  tooltip: string;
};

const getMascotConfig = (percentage: number): MascotConfig => {
  if (percentage > 100) {
    return {
      icon: OctagonAlert,
      ringClass: 'border-red-500/70 bg-red-500/10',
      faceClass: 'text-red-400',
      auraClass: 'shadow-red-500/40',
      tooltip: 'Limite anual excedido. Procure seu contador.'
    };
  }
  if (percentage >= 80) {
    return {
      icon: Flame,
      ringClass: 'border-orange-500/70 bg-orange-500/10',
      faceClass: 'text-orange-400',
      auraClass: 'shadow-orange-500/30',
      tooltip: 'Alerta máximo: o limite está muito próximo.'
    };
  }
  if (percentage >= 50) {
    return {
      icon: AlertTriangle,
      ringClass: 'border-amber-500/70 bg-amber-500/10',
      faceClass: 'text-amber-400',
      auraClass: 'shadow-amber-500/30',
      tooltip: 'Zona de atenção: redobre o planejamento.'
    };
  }
  if (percentage >= 20) {
    return {
      icon: Target,
      ringClass: 'border-indigo-500/60 bg-indigo-500/10',
      faceClass: 'text-indigo-400',
      auraClass: 'shadow-indigo-500/30',
      tooltip: 'Foco total na execução e controle do caixa.'
    };
  }
  return {
    icon: Smile,
    ringClass: 'border-emerald-500/60 bg-emerald-500/10',
    faceClass: 'text-emerald-400',
    auraClass: 'shadow-emerald-500/30',
    tooltip: 'Tudo tranquilo! Aproveite a distância do limite.'
  };
};

const DashboardMobileV2: React.FC<DashboardProps> = ({
  onOpenVariableExpenses,
  onOpenIncomes,
  onOpenReports,
  onOpenLaunches,
  onOpenExpenseAll,
    financialData,
    creditCards,
    expenseBreakdown = { fixed: 0, variable: 0, personal: 0 },
    expenses,
    expensesRevision,
    onRefreshExpenses,
    incomes,
    accounts,
    viewDate,
  onOpenInstall,
  isAppInstalled,
  onOpenSettings,
  categoriesCount = 0,
  isPwaInstallable = false,
  isStandalone = false,
  onInstallApp
}) => {
  const canViewBalances = true;
  const canViewMeiLimit = true;
  const canManageIncomes = true;
  const canManageExpenses = true;
  const incomeAccent = '#22c55e';
  const expenseAccent = '#FF0000';
  const isMobile = useIsMobile();
  const resultValue = financialData.income - financialData.expenses;
  const resultTextClass = resultValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';
  const handleViewMore = onOpenLaunches ?? onOpenIncomes ?? onOpenVariableExpenses;

  useEffect(() => {
    if (!isMobile) return;
    if (typeof window === 'undefined') return;
    if (!creditCards.length) return;
    if (!notificationsService.getLocalEnabled()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alertWindowDays = 5;

    const sendAlerts = async () => {
      for (const card of creditCards) {
        const dueDateObj = resolveCardDueDate(card, expenses, viewDate);
        if (!dueDateObj) continue;
        const daysUntil = Math.ceil((dueDateObj.getTime() - today.getTime()) / DAY_MS);
        if (daysUntil < 0 || daysUntil > alertWindowDays) continue;
        const dueKey = dueDateObj.toISOString().slice(0, 10);
        const storageKey = `meumei_invoice_due_notice_${card.id}_${dueKey}`;
        if (localStorage.getItem(storageKey)) continue;
        const formatted = dueDateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const body =
          daysUntil === 0
            ? `A fatura do cartão ${card.name} vence hoje (${formatted}).`
            : `A fatura do cartão ${card.name} vence em ${daysUntil} dias (${formatted}).`;
        try {
          await notificationsService.sendTestNotification({
            title: 'Vencimento de fatura',
            body,
            url: '/app'
          });
          localStorage.setItem(storageKey, '1');
        } catch (error) {
          console.warn('[notifications] invoice_due_failed', error);
        }
      }
    };

    void sendAlerts();
  }, [creditCards, expenses, isMobile, viewDate]);
  const recentTransactions = useMemo(() => {
      const toTimestamp = (value?: string) => {
          if (!value) return null;
          const parsed = new Date(`${value}T12:00:00`);
          return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
      };

      const items = [
          ...incomes.map(income => ({
              id: `income-${income.id}`,
              kind: 'income' as const,
              title: income.description || 'Entrada',
              amount: income.amount,
              date: income.date
          })),
          ...expenses.map(expense => ({
              id: `expense-${expense.id}`,
              kind: 'expense' as const,
              title: expense.description || 'Despesa',
              amount: expense.amount,
              date: expense.date || expense.dueDate
          }))
      ];

      return items
          .map(item => {
              const timestamp = toTimestamp(item.date);
              return timestamp ? { ...item, timestamp } : null;
          })
          .filter((item): item is typeof items[number] & { timestamp: number } => Boolean(item))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 3);
  }, [expenses, incomes]);

  const helperSignals = useMemo(
      () => ({
          isLoggedIn: true,
          hasAccounts: accounts.length > 0,
          hasIncomes: incomes.length > 0,
          hasExpenses: expenses.length > 0,
          hasCategories: categoriesCount > 0,
          isPwaInstallable,
          isStandalone,
          isMobile: true
      }),
      [accounts.length, categoriesCount, expenses.length, incomes.length, isPwaInstallable, isStandalone]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const categoryNames = useMemo(() => {
      const names = new Set<string>();
      expenses.forEach(exp => {
          if (exp.category) names.add(exp.category);
      });
      return Array.from(names);
  }, [expenses]);

  const expenseSearchItems = useMemo<InlineSearchItem[]>(() =>
      expenses.map(expense => {
          const dueDate = expense.dueDate || null;
          const formattedDueDate = dueDate
              ? new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
              : undefined;
          return {
              id: expense.id,
              entity: 'expense',
              subtype: expense.type,
              title: expense.description,
              subtitle: expense.category,
              category: expense.category,
              amount: expense.amount,
              dateLabel: dueDate || undefined,
              sortDate: dueDate || undefined,
              status: expense.status,
              keywords: [expense.description, expense.category, expense.notes || '', dueDate, formattedDueDate]
                  .filter(Boolean)
                  .map(text => text!.toString().toLowerCase())
          };
      }), [expenses]);

  const incomeSearchItems = useMemo<InlineSearchItem[]>(() =>
      incomes.map(income => ({
          id: income.id,
          entity: 'income',
          title: income.description,
          subtitle: income.category,
          category: income.category,
          amount: income.amount,
          dateLabel: income.date,
          sortDate: income.date,
          keywords: [income.description, income.category, income.date, income.notes || '']
              .filter(Boolean)
              .map(text => text!.toLowerCase())
      })), [incomes]);

  const accountSearchItems = useMemo<InlineSearchItem[]>(() =>
      accounts.map(account => ({
          id: account.id,
          entity: 'account',
          title: account.name,
          subtitle: account.type,
          amount: account.currentBalance,
          keywords: [account.name, account.type].filter(Boolean).map(text => text!.toLowerCase())
      })), [accounts]);

  const cardSearchItems = useMemo<InlineSearchItem[]>(() =>
      creditCards.map(card => ({
          id: card.id,
          entity: 'card',
          title: card.name,
          subtitle: card.brand,
          amount: card.limit,
          keywords: [card.name, card.brand].filter(Boolean).map(text => text!.toLowerCase())
      })), [creditCards]);

  const categorySearchItems = useMemo<InlineSearchItem[]>(() =>
      categoryNames.map(category => ({
          id: `category-${category}`,
          entity: 'category',
          title: category,
          keywords: [category.toLowerCase()]
      })), [categoryNames]);

  const allSearchItems = useMemo(
      () => [...expenseSearchItems, ...incomeSearchItems, ...accountSearchItems, ...cardSearchItems, ...categorySearchItems],
      [expenseSearchItems, incomeSearchItems, accountSearchItems, cardSearchItems, categorySearchItems]
  );

  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const inlineFilters = useMemo(() => parseInlineFilters(searchQuery), [searchQuery]);

  const inlineResults = useMemo(() => {
      if (!normalizedSearchQuery) return [] as InlineSearchItem[];
      const tokens = normalizedSearchQuery.split(/\s+/).filter(Boolean);

      return allSearchItems.filter(item => {
          if (inlineFilters.type && item.entity !== inlineFilters.type) return false;
          if (inlineFilters.category) {
              const target = inlineFilters.category;
              const matchesCategory =
                  item.category?.toLowerCase().includes(target) ||
                  item.title.toLowerCase().includes(target);
              if (!matchesCategory) return false;
          }
          if (inlineFilters.month && item.dateLabel) {
              const monthToken = mapMonthAlias(inlineFilters.month.toLowerCase());
              if (!item.dateLabel.toLowerCase().includes(monthToken)) return false;
          }
          if (!matchInlineValue(item.amount, inlineFilters.valueComparison)) return false;

          const searchableFields = [
              item.title,
              item.subtitle,
              item.category,
              ...(item.keywords || [])
          ].filter(Boolean).map(text => text!.toString().toLowerCase());

          return tokens.every(token => {
              if (token.includes(':')) return true;
              return searchableFields.some(field => field.includes(token));
          });
      });
  }, [allSearchItems, inlineFilters, normalizedSearchQuery]);

  const sortedInlineResults = useMemo(() => {
      const baseDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const computeScore = (date: Date | null) => {
          if (!date) return Number.MAX_SAFE_INTEGER;
          const monthDelta = (date.getFullYear() - baseDate.getFullYear()) * 12 + (date.getMonth() - baseDate.getMonth());
          const normalized = monthDelta >= 0 ? monthDelta : 1000 + monthDelta;
          return normalized * 100 + date.getDate();
      };
      return [...inlineResults].sort((a, b) => {
          const aDate = parseDateLabel(a.sortDate || a.dateLabel);
          const bDate = parseDateLabel(b.sortDate || b.dateLabel);
          const scoreDiff = computeScore(aDate) - computeScore(bDate);
          if (scoreDiff !== 0) return scoreDiff;
          if (aDate && bDate && aDate.getTime() !== bDate.getTime()) {
              return aDate.getTime() - bDate.getTime();
          }
          return a.title.localeCompare(b.title);
      });
  }, [inlineResults, viewDate]);

  const visibleInlineResults = sortedInlineResults.slice(0, 10);

  useEffect(() => {
      setActiveSearchIndex(prev => Math.min(prev, Math.max(visibleInlineResults.length - 1, 0)));
  }, [visibleInlineResults.length]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (!isSearchActive) return;
          const target = event.target as Node;
          if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
              setIsSearchActive(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchActive]);

  const handleSelectSearchResult = (item: InlineSearchItem) => {
      if (!item) return;
      if (item.entity === 'category') {
          setSearchQuery(`categoria:${item.title}`);
          setActiveSearchIndex(0);
          return;
      }
      navigateToResult({ entity: item.entity as EntityType, id: item.id, subtype: item.subtype });
      setSearchQuery('');
      setActiveSearchIndex(0);
      setIsSearchActive(false);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!visibleInlineResults.length) return;
      if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveSearchIndex(prev => Math.min(prev + 1, visibleInlineResults.length - 1));
      } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveSearchIndex(prev => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter') {
          event.preventDefault();
          handleSelectSearchResult(visibleInlineResults[activeSearchIndex]);
      }
  };

  // --- MEI Logic ---
  const meiRevenue = financialData.annualMeiRevenue || 0;
  const rawPercentage = (meiRevenue / MEI_LIMIT) * 100;
  const displayPercentage = Math.min(Math.max(rawPercentage, 0), 100);
  const progressVisualPercentage = Math.min(Math.max(rawPercentage, 0), 120);
  const meiRemaining = Math.max(MEI_LIMIT - meiRevenue, 0);
  const meiExcess = Math.max(meiRevenue - MEI_LIMIT, 0);
  const meiStatus = getMeiStatus(rawPercentage);
  const mascotConfig = getMascotConfig(rawPercentage);
  const statusCalloutText = (() => {
      switch (meiStatus.level) {
          case 'over':
              return `Você excedeu o limite em ${formatCurrency(meiExcess)}. Procure orientação contábil.`;
          case 'critical':
              return `Restam ${formatCurrency(meiRemaining)} até alcançar o limite anual. Planeje o próximo mês com cuidado.`;
          case 'attention':
              return `Você já utilizou ${rawPercentage.toFixed(1)}% do limite anual. Ajuste suas metas para não estourar.`;
          default:
              return 'Continue acompanhando o faturamento para manter distância confortável do limite.';
      }
  })();
  const calloutIcon = meiStatus.level === 'over' ? OctagonAlert : meiStatus.level === 'critical' ? Flame : meiStatus.level === 'attention' ? AlertTriangle : CheckCircle2;
  const healthScore = useMemo(() => {
      const totalReceitas = financialData.income;
      const totalDespesas = financialData.expenses;
      if (totalReceitas <= 0 && totalDespesas <= 0) return 0.5;
      if (totalReceitas <= 0) return 0;
      const margin = (totalReceitas - totalDespesas) / totalReceitas;
      const clamped = Math.max(-1, Math.min(1, margin));
      return (clamped + 1) / 2;
  }, [financialData.expenses, financialData.income]);
  const { navigateToResult } = useGlobalActions();
  const { layout, loading: layoutLoading } = useDashboardLayout();

  const blockLabels: Record<DashboardBlockId, string> = {
      quick_access: 'Acesso rápido',
      mei_limit: 'Faturamento fiscal',
      financial_xray: 'Raio-X financeiro',
      credit_cards: 'Faturas',
      expense_breakdown: 'Despesas por categoria'
  };

  const availableBlocks = useMemo<Record<DashboardBlockId, boolean>>(() => ({
      quick_access: false,
      mei_limit: canViewMeiLimit,
      financial_xray: false,
      credit_cards: false,
      expense_breakdown: false
  }), [canViewMeiLimit]);

  const orderMap = useMemo(() => {
      const map: Record<DashboardBlockId, number> = {
          quick_access: 0,
          mei_limit: 1,
          financial_xray: 2,
          credit_cards: 3,
          expense_breakdown: 4
      };
      layout.order.forEach((id, index) => {
          map[id] = index;
      });
      return map;
  }, [layout.order]);

  const meiCheckpoint = Math.floor(rawPercentage / 10) * 10;
  const showMeiAlert = canViewMeiLimit && rawPercentage >= 10;
  const showHealthAlert = true;
  const meiAlertText = `Limite MEI ${meiCheckpoint.toFixed(0)}% usado`;
  const healthPercent = Math.round(healthScore * 100);
  const shouldRotateAlerts = showMeiAlert && showHealthAlert;
  const [alertMode, setAlertMode] = useState<'mei' | 'health'>(showMeiAlert ? 'mei' : 'health');

  useEffect(() => {
      if (!shouldRotateAlerts) {
          setAlertMode(showMeiAlert ? 'mei' : 'health');
          return;
      }
      const interval = window.setInterval(() => {
          setAlertMode(prev => (prev === 'mei' ? 'health' : 'mei'));
      }, 5000);
      return () => window.clearInterval(interval);
  }, [shouldRotateAlerts, showMeiAlert]);

  useEffect(() => {
      if (!isMobile) return;
      document.documentElement.classList.add('lock-scroll');
      document.body.classList.add('lock-scroll');
      return () => {
          document.documentElement.classList.remove('lock-scroll');
          document.body.classList.remove('lock-scroll');
      };
  }, [isMobile]);

  const searchResultsNode =
      Boolean(trimmedSearchQuery) && isSearchActive ? (
          <div className="absolute left-0 right-0 mt-3 bg-[#111114] border border-white/10 rounded-2xl shadow-2xl max-h-72 overflow-y-auto z-20">
              {visibleInlineResults.length === 0 ? (
                  <div className="text-xs text-zinc-500 px-4 py-3">Nenhum resultado encontrado.</div>
              ) : (
                  <ul>
                      {visibleInlineResults.map((item, idx) => {
                          const isActive = idx === activeSearchIndex;
                          const statusMeta = getInlineExpenseStatusMeta(item);
                          return (
                              <li
                                  key={`${item.entity}-${item.id}`}
                                  className={`px-4 py-3 border-b border-white/5 cursor-pointer ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                  onMouseEnter={() => setActiveSearchIndex(idx)}
                                  onClick={() => handleSelectSearchResult(item)}
                              >
                                  <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                          <p className="text-xs font-semibold text-white flex items-center gap-2">
                                              {item.entity === 'expense' && <span className="text-rose-400 text-[10px] uppercase">Despesa</span>}
                                              {item.entity === 'income' && <span className="text-emerald-400 text-[10px] uppercase">Entrada</span>}
                                              {item.entity === 'account' && <span className="text-blue-400 text-[10px] uppercase">Conta</span>}
                                              {item.entity === 'card' && <span className="text-purple-400 text-[10px] uppercase">Cartão</span>}
                                              {item.entity === 'category' && <span className="text-zinc-400 text-[10px] uppercase">Categoria</span>}
                                              <span className="truncate">{item.title}</span>
                                          </p>
                                          {item.subtitle && <p className="text-[11px] text-zinc-500 truncate">{item.subtitle}</p>}
                                      </div>
                                      <div className="text-right shrink-0">
                                          {statusMeta && (
                                              <p className={`text-[10px] font-semibold flex items-center justify-end gap-1 ${statusMeta.textClass}`}>
                                                  <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                                                  {statusMeta.label}
                                              </p>
                                          )}
                                          {typeof item.amount === 'number' && (
                                              <p className="text-xs font-bold text-white">
                                                  {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                              </p>
                                          )}
                                          {item.entity === 'expense' ? (
                                              item.dateLabel ? (
                                                  <p className="text-[10px] text-zinc-500">
                                                      {new Date(item.dateLabel + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                  </p>
                                              ) : (
                                                  <p className="text-[10px] text-zinc-500">Sem vencimento</p>
                                              )
                                          ) : (
                                              item.dateLabel && (
                                                  <p className="text-[10px] text-zinc-500">
                                                      {new Date(item.dateLabel + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                  </p>
                                              )
                                          )}
                                     </div>
                                 </div>
                              </li>
                          );
                      })}
                  </ul>
              )}
          </div>
      ) : null;

  return (
    <div className="min-h-screen mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
        <div className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+88px)]">
                <div className="flex flex-col gap-[5px]">
                    <div className="-mx-4 rounded-none border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 px-4 py-6 text-center">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Seu dinheiro agora</p>
                        <p className={`mt-2 text-4xl font-bold ${financialData.balance < 0 ? 'text-rose-500' : 'text-zinc-900 dark:text-white'}`}>
                            {formatCurrency(financialData.balance)}
                        </p>
                    </div>

                    <div className="-mx-4 rounded-none border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 px-4 py-3 text-sm">
                        <div className="flex items-center justify-between border-b border-zinc-200/70 dark:border-zinc-800/70 pb-2">
                            <span className="text-zinc-500 dark:text-zinc-400">Resultado</span>
                            <span className={`font-semibold ${resultTextClass}`}>
                                {formatCurrencyCompact(resultValue)}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-zinc-500 dark:text-zinc-400">Entradas</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCurrencyCompact(financialData.income)}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-zinc-500 dark:text-zinc-400">Saídas</span>
                            <span className="font-semibold text-rose-500 dark:text-rose-400">
                                {formatCurrencyCompact(financialData.expenses)}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-[5px] -mx-4 px-4 mt-[5px]">
                        <button
                            type="button"
                            onClick={onOpenIncomes}
                            className="h-14 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base shadow-lg shadow-emerald-900/25"
                        >
                            + Entrada
                        </button>
                        <button
                            type="button"
                            onClick={onOpenExpenseAll ?? onOpenVariableExpenses}
                            className="h-14 rounded-none bg-[#FF0000] hover:bg-red-600 text-white font-semibold text-base shadow-lg shadow-red-900/25"
                        >
                            – Saída
                        </button>
                    </div>

                    {(showMeiAlert || showHealthAlert) && (
                        <div
                            className={`-mx-4 mt-[5px] rounded-none border px-4 py-3 flex items-center justify-between gap-2 text-xs ${
                                alertMode === 'mei'
                                    ? 'border-amber-200/70 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-900/10 text-amber-700 dark:text-amber-200'
                                    : 'border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-200'
                            }`}
                        >
                            {alertMode === 'mei' ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={14} />
                                        <span>{meiAlertText}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={14} />
                                        <span>Saúde da empresa {healthPercent}%</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="-mx-4 mt-[5px] rounded-none border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Últimos lançamentos</span>
                        </div>
                        {recentTransactions.length === 0 ? (
                            <p className="text-xs text-zinc-500">Sem lançamentos recentes.</p>
                        ) : (
                            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                                {recentTransactions.map(item => {
                                    const itemDate = item.date
                                        ? new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                                        : '';
                                    const isIncome = item.kind === 'income';
                                    return (
                                        <div key={item.id} className="flex items-center justify-between py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-zinc-900 dark:text-white truncate flex items-center gap-2">
                                                    <span className={`h-2 w-2 rounded-full ${isIncome ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    <span className="truncate">{item.title}</span>
                                                </p>
                                                <p className="text-[11px] text-zinc-500">
                                                    {isIncome ? 'Entrada' : 'Despesa'}{itemDate ? ` • ${itemDate}` : ''}
                                                </p>
                                            </div>
                                            <span className={`text-sm font-semibold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                                {isIncome ? '+' : '-'} {formatCurrencyCompact(item.amount)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen mt-[5px]">
                        <button
                            type="button"
                            onClick={handleViewMore}
                            disabled={!handleViewMore}
                            className="h-12 w-full rounded-none border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-[#151517]/90 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Ver mais
                        </button>
                    </div>
                </div>
        </div>
    </div>
  );
};

const SortableBlock: React.FC<{
    id: DashboardBlockId;
    label: string;
    disabled: boolean;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ style, children }) => {
    return (
        <div
            style={style}
            className="relative"
        >
            {children}
        </div>
    );
};

// ... existing subcomponents ...
const MobileListItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    description?: string;
    value?: string;
    valueClassName?: string;
    onClick?: () => void;
    iconContainerClassName?: string;
    tipTitle?: string;
    tipBody?: string;
}> = ({ icon, label, description, value, valueClassName, onClick, iconContainerClassName, tipTitle, tipBody }) => {
    const wrapperClasses = onClick
        ? 'hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-[#1c1c20] active:scale-[0.99]'
        : '';
    const content = (
        <>
            <div className="flex items-center gap-3 min-w-0">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${iconContainerClassName || 'bg-zinc-100 dark:bg-zinc-800/60'}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{label}</p>
                    {description && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{description}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {value && (
                    <span className={`text-sm font-semibold ${valueClassName || 'text-zinc-900 dark:text-white'}`}>
                        {value}
                    </span>
                )}
                {onClick && <ChevronRight size={16} className="text-zinc-400" />}
            </div>
        </>
    );

    const baseClasses = `w-full min-h-[52px] px-3 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] flex items-center justify-between gap-3 text-left transition-all ${wrapperClasses}`;
    const paddedClasses = tipTitle && tipBody ? `${baseClasses} pr-10` : baseClasses;

    return (
        <div className="relative overflow-visible">
            {tipTitle && tipBody && (
                <QuickAccessHelp label={label} title={tipTitle} body={tipBody} />
            )}
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    className={paddedClasses}
                >
                    {content}
                </button>
            ) : (
                <div className={paddedClasses}>
                    {content}
                </div>
            )}
        </div>
    );
};

const SummaryCard: React.FC<{ 
    title: string, 
    value: number, 
    icon: React.ReactNode, 
    colorClass: string,
    bgClass: string,
    subtext?: string,
    isExpense?: boolean
}> = ({ title, value, icon, colorClass, bgClass, subtext, isExpense }) => (
    <div className={`${bgClass} rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-sm transition-all duration-300 hover:border-zinc-300 dark:hover:border-zinc-700`}>
        <div className="flex justify-between items-start mb-3">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
                {icon}
            </div>
            {subtext && (
                 <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-2 py-1 rounded">
                    Mês Atual
                 </span>
            )}
        </div>
        <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mb-1">{title}</p>
            <h3 className={`text-2xl font-bold tracking-tight mb-2 ${colorClass}`}>
                {isExpense ? '-' : '+'} R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            {subtext && (
                <p className="text-[11px] text-zinc-500 font-medium flex items-center gap-1">
                    <Calendar size={12} />
                    {subtext}
                </p>
            )}
        </div>
    </div>
);

export default DashboardMobileV2;
