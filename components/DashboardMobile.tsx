
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  CreditCard, 
  BarChart3, 
  Home, 
  ShoppingCart, 
  User,
  ArrowUpCircle,
  ArrowDownCircle,
  Eye,
  Calendar,
  Plus,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Tag,
  PieChart,
  Smile,
  Target,
  Flame,
  OctagonAlert,
  FileText,
  GripVertical,
  Lock,
  Download,
  ChevronDown
} from 'lucide-react';
import MobileEmptyState from './mobile/MobileEmptyState';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CreditCard as CreditCardType, Expense, Income, Account } from '../types';
import { getCreditCardInvoiceTotalForMonth } from '../services/invoiceUtils';
import { getCardGradient, withAlpha, getBrandIcon } from '../services/cardColorUtils';
import { useGlobalActions, EntityType } from '../contexts/GlobalActionsContext';
import { CATEGORY_ITEMS_PREVIEW_LIMIT, computeCategoryTotals } from '../utils/categoryTotals';
import { expenseStatusLabel, normalizeExpenseStatus } from '../utils/statusUtils';
import { useDashboardLayout, DashboardBlockId } from '../hooks/useDashboardLayout';
import SearchHelperBar from './SearchHelperBar';
import QuickAccessHelp from './QuickAccessHelp';

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

const CATEGORY_TREND_COLORS = ['#a855f7', '#38bdf8', '#f97316', '#22c55e', '#ec4899', '#facc15', '#0ea5e9', '#f472b6', '#94a3b8', '#fb923c'];

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


interface DashboardProps {
  onOpenAccounts: () => void;
  onOpenVariableExpenses: () => void;
  onOpenFixedExpenses?: () => void;
  onOpenPersonalExpenses?: () => void;
  onOpenIncomes?: () => void;
  onOpenYields?: () => void; 
  onOpenInvoices?: () => void;
  onOpenReports?: () => void; // New Prop
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
}

const MEI_LIMIT = 81000;
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

const DashboardMobile: React.FC<DashboardProps> = ({
  onOpenAccounts,
  onOpenVariableExpenses,
  onOpenFixedExpenses,
  onOpenPersonalExpenses,
  onOpenIncomes,
  onOpenYields,
  onOpenInvoices,
  onOpenReports,
  onOpenDas,
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
  tipsEnabled,
  onOpenSettings,
  categoriesCount = 0,
  isPwaInstallable = false,
  isStandalone = false,
  onInstallApp
}) => {
  const canViewBalances = true;
  const canViewMeiLimit = true;
  const canViewInvoices = true;
  const canViewReports = true;
  const canManageIncomes = true;
  const canManageExpenses = true;

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

  const helperActions = useMemo(
      () => ({
          accounts: onOpenAccounts,
          incomes: onOpenIncomes,
          expenses: onOpenVariableExpenses,
          personal_expenses: onOpenPersonalExpenses,
          reports: onOpenReports,
          invoices: onOpenInvoices,
          yields: onOpenYields,
          das: onOpenDas,
          pwa_install: onInstallApp || onOpenInstall
      }),
      [
          onInstallApp,
          onOpenAccounts,
          onOpenDas,
          onOpenIncomes,
          onOpenInstall,
          onOpenInvoices,
          onOpenPersonalExpenses,
          onOpenReports,
          onOpenVariableExpenses,
          onOpenYields
      ]
  );

  const quickActions = useMemo(
      () => [
          {
              id: 'accounts',
              label: 'Contas Bancárias',
              icon: <Wallet />,
              color: 'text-blue-500 dark:text-blue-400',
              bg: 'bg-blue-50 dark:bg-blue-500/10',
              border: 'border-blue-100 dark:border-blue-500/20',
              tipTitle: 'Contas Bancárias',
              tipBody:
                  "Cadastre suas contas (banco, caixa, carteira). Aqui você acompanha saldo e movimentações. Dica: mantenha uma conta ‘Dinheiro’ para gastos rápidos.\nAtalho: 1",
              onClick: onOpenAccounts,
              showWhen: canViewBalances
          },
          {
              id: 'incomes',
              label: 'Entradas',
              icon: <ArrowUpCircle />,
              color: 'text-emerald-500 dark:text-emerald-400',
              bg: 'bg-emerald-50 dark:bg-emerald-500/10',
              border: 'border-emerald-100 dark:border-emerald-500/20',
              tipTitle: 'Entradas',
              tipBody:
                  'Registre tudo o que entra: vendas, serviços, recebimentos. Dica: categorize bem para ver quais fontes mais rendem.\nAtalho: 2',
              onClick: onOpenIncomes,
              showWhen: canManageIncomes
          },
          {
              id: 'fixed_expenses',
              label: 'Despesas Fixas',
              icon: <Home />,
              color: 'text-amber-500 dark:text-amber-400',
              bg: 'bg-amber-50 dark:bg-amber-500/10',
              border: 'border-amber-100 dark:border-amber-500/20',
              tipTitle: 'Despesas Fixas',
              tipBody: 'Gastos recorrentes como aluguel, internet, assinaturas. Dica: revise mensalmente para cortar vazamentos.\nAtalho: 3',
              onClick: onOpenFixedExpenses,
              showWhen: canManageExpenses
          },
          {
              id: 'variable_expenses',
              label: 'Despesas Variáveis',
              icon: <ShoppingCart />,
              color: 'text-pink-500 dark:text-pink-400',
              bg: 'bg-pink-50 dark:bg-pink-500/10',
              border: 'border-pink-100 dark:border-pink-500/20',
              tipTitle: 'Despesas Variáveis',
              tipBody:
                  'Gastos do dia a dia que mudam: mercado, combustível, extras. Dica: anote na hora para não esquecer.\nAtalho: 4',
              onClick: onOpenVariableExpenses,
              showWhen: canManageExpenses
          },
          {
              id: 'personal_expenses',
              label: 'Despesas Pessoais',
              icon: <User />,
              color: 'text-cyan-500 dark:text-cyan-400',
              bg: 'bg-cyan-50 dark:bg-cyan-500/10',
              border: 'border-cyan-100 dark:border-cyan-500/20',
              tipTitle: 'Despesas Pessoais',
              tipBody: 'Separação do MEI e do pessoal. Dica: use aqui para evitar misturar despesas da empresa.\nAtalho: 5',
              onClick: onOpenPersonalExpenses,
              showWhen: canManageExpenses
          },
          {
              id: 'yields',
              label: 'Rendimentos',
              icon: <TrendingUp />,
              color: 'text-violet-500 dark:text-violet-400',
              bg: 'bg-violet-50 dark:bg-violet-500/10',
              border: 'border-violet-100 dark:border-violet-500/20',
              tipTitle: 'Rendimentos',
              tipBody:
                  'Acompanhe rendas e retornos (investimentos, juros, etc.). Dica: registre a data para entender evolução no tempo.\nAtalho: 6',
              onClick: onOpenYields,
              showWhen: canViewBalances
          },
          {
              id: 'invoices',
              label: 'Faturas',
              icon: <CreditCard />,
              color: 'text-rose-500 dark:text-rose-400',
              bg: 'bg-rose-50 dark:bg-rose-500/10',
              border: 'border-rose-100 dark:border-rose-500/20',
              tipTitle: 'Faturas',
              tipBody: 'Controle de cartão e faturas abertas/fechadas. Dica: confira antes de fechar para não perder lançamentos.\nAtalho: 7',
              onClick: onOpenInvoices,
              showWhen: canViewInvoices
          },
          {
              id: 'reports',
              label: 'Relatórios',
              icon: <BarChart3 />,
              color: 'text-zinc-500 dark:text-zinc-400',
              bg: 'bg-zinc-100 dark:bg-zinc-500/10',
              border: 'border-zinc-200 dark:border-zinc-500/20',
              tipTitle: 'Relatórios',
              tipBody: 'Visão geral do mês, comparativos e totais. Dica: olhe semanalmente para corrigir rota rápido.\nAtalho: 8',
              onClick: onOpenReports,
              showWhen: canViewReports && Boolean(onOpenReports)
          },
          {
              id: 'das',
              label: 'Emissão DAS',
              icon: <FileText />,
              color: 'text-teal-600 dark:text-teal-400',
              bg: 'bg-teal-50 dark:bg-teal-500/10',
              border: 'border-teal-100 dark:border-teal-500/20',
              tipTitle: 'Emissão DAS',
              tipBody: 'Acesso rápido ao DAS do MEI. Dica: mantenha o pagamento em dia para evitar multa e juros.\nAtalho: 9',
              onClick: onOpenDas,
              showWhen: true
          }
      ],
      [
          canManageExpenses,
          canManageIncomes,
          canViewBalances,
          canViewInvoices,
          canViewReports,
          onOpenAccounts,
          onOpenDas,
          onOpenFixedExpenses,
          onOpenIncomes,
          onOpenInvoices,
          onOpenPersonalExpenses,
          onOpenReports,
          onOpenVariableExpenses,
          onOpenYields
      ]
  );
  
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState<string | null>(null);
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

  const getCardStyle = (card: CreditCardType) => {
      const gradient = getCardGradient(card);
      return {
          gradient,
          icon: getBrandIcon(card.brand || card.name),
          badgeBg: withAlpha(gradient.base, 0.3)
      };
  };

  const cardTotals = useMemo(() => {
      return creditCards.reduce<Record<string, number>>((totals, card) => {
          totals[card.id] = getCreditCardInvoiceTotalForMonth(expenses, card.id, viewDate, card);
          return totals;
      }, {});
  }, [creditCards, expenses, viewDate]);

  const accountNameById = useMemo(() => {
      return accounts.reduce<Record<string, string>>((acc, account) => {
          acc[account.id] = account.name;
          return acc;
      }, {});
  }, [accounts]);

  const cardNameById = useMemo(() => {
      return creditCards.reduce<Record<string, string>>((acc, card) => {
          acc[card.id] = card.name;
          return acc;
      }, {});
  }, [creditCards]);

  const categoryTotals = useMemo(
      () =>
          computeCategoryTotals(expenses, {
              viewDate,
              statusRule: 'paid+pending',
              dateField: 'date',
              topN: 8,
              includeOthers: true,
              source: 'dashboard',
              variant: 'mobile',
              expensesRevision,
              refreshNonce,
              expandedCategory: expandedCategoryKey
          }),
      [expenses, viewDate, expensesRevision, refreshNonce, expandedCategoryKey]
  );

  const maxCategoryTotal = useMemo(
      () => Math.max(...categoryTotals.items.map(item => item.total), 0),
      [categoryTotals.items]
  );

  const spendInsights = useMemo(() => {
      if (!categoryTotals.items.length || categoryTotals.totalSum <= 0) return [];
      const topCategory = categoryTotals.items[0];
      const top3Total = categoryTotals.items
          .slice(0, 3)
          .reduce((sum, item) => sum + item.total, 0);
      const top3Percent = categoryTotals.totalSum > 0 ? (top3Total / categoryTotals.totalSum) * 100 : 0;
      return [
          {
              label: 'Categoria líder',
              value: topCategory.category,
              sub: formatCurrency(topCategory.total)
          },
          {
              label: 'Top 3',
              value: `${top3Percent.toFixed(1)}% do total`
          }
      ];
  }, [categoryTotals]);

  useEffect(() => {
      if (!expandedCategoryKey) return;
      if (!categoryTotals.categoryItems[expandedCategoryKey]) {
          console.info('[category-totals] expanded_reset', {
              variant: 'mobile',
              key: expandedCategoryKey
          });
          setExpandedCategoryKey(null);
      }
  }, [categoryTotals.categoryItems, expandedCategoryKey]);

  const handleManualRecalc = () => {
      setRefreshNonce(prev => prev + 1);
      if (onRefreshExpenses) {
          onRefreshExpenses();
      }
      console.info('[category-totals] manual-recalc', {
          monthLabel: categoryTotals.monthLabel,
          variant: 'mobile'
      });
  };

  useEffect(() => {
      const totalSaidasMes = financialData.expenses;
      const totalRank = categoryTotals.totalSum;
      const diff = Number((totalSaidasMes - totalRank).toFixed(2));
      console.info('[category-totals] compare', {
          variant: 'mobile',
          totalSaidasMes,
          totalRank,
          diff
      });

      if (Math.abs(diff) > 0.01) {
          const monthList = categoryTotals.monthExpensesAll;
          const groupedList = Object.values(categoryTotals.categoryItems).flat();
          const monthMap = new Map(monthList.map(item => [item.id, item]));
          const groupedMap = new Map(groupedList.map(item => [item.id, item]));
          const onlyInMonth = monthList.filter(item => !groupedMap.has(item.id));
          const onlyInGrouped = groupedList.filter(item => !monthMap.has(item.id));
          const pickTop = (list: Expense[]) =>
              [...list]
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 5)
                  .map(item => ({
                      id: item.id,
                      amount: item.amount,
                      category: item.category,
                      date: item.date
                  }));
          console.info('[category-totals] diff_items', {
              variant: 'mobile',
              onlyInMonth: pickTop(onlyInMonth),
              onlyInGrouped: pickTop(onlyInGrouped)
          });
      }
  }, [financialData.expenses, categoryTotals.totalSum, categoryTotals.monthExpensesAll, categoryTotals.categoryItems]);

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

  const { navigateToResult } = useGlobalActions();
  const { layout, setOrder, loading: layoutLoading } = useDashboardLayout();

  const blockLabels: Record<DashboardBlockId, string> = {
      quick_access: 'Acesso rápido',
      mei_limit: 'Faturamento fiscal',
      financial_xray: 'Raio-X financeiro',
      credit_cards: 'Faturas',
      expense_breakdown: 'Despesas por categoria'
  };

  const availableBlocks = useMemo<Record<DashboardBlockId, boolean>>(() => ({
      quick_access: true,
      mei_limit: canViewMeiLimit,
      financial_xray: true,
      credit_cards: canViewInvoices,
      expense_breakdown: canManageExpenses
  }), [canViewMeiLimit, canViewInvoices, canManageExpenses]);

  const visibleOrder = useMemo(
      () => layout.order.filter((id) => availableBlocks[id]),
      [layout.order, availableBlocks]
  );

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

  const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = visibleOrder.indexOf(active.id as DashboardBlockId);
      const newIndex = visibleOrder.indexOf(over.id as DashboardBlockId);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextVisible = arrayMove(visibleOrder, oldIndex, newIndex) as DashboardBlockId[];
      const visibleSet = new Set(nextVisible);
      let pointer = 0;
      const merged = layout.order.map((id) => {
          if (!visibleSet.has(id)) return id;
          const nextId = nextVisible[pointer];
          pointer += 1;
          return nextId;
      });
      setOrder(merged as DashboardBlockId[]);
  };

  return (
    <div className="w-full max-w-full px-4 py-4 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-full mt-1">
            <div className="relative" ref={searchContainerRef}>
                <SearchHelperBar
                    variant="mobile"
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    setActiveSearchIndex={setActiveSearchIndex}
                    setIsSearchActive={setIsSearchActive}
                    onSearchKeyDown={handleSearchKeyDown}
                    signals={helperSignals}
                    actions={helperActions}
                    tipsEnabled={tipsEnabled}
                    results={
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
                        ) : null
                    }
                />
            </div>
        </div>

        

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-6">

        {/* Quick Access */}
        {availableBlocks.quick_access && (
        <SortableBlock
            id="quick_access"
            label={blockLabels.quick_access}
            disabled={layoutLoading}
            style={{ order: orderMap.quick_access }}
        >
        <section>
            <div className="bg-white dark:bg-[#151517] rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Acesso Rápido</h2>
            <div className="grid grid-flow-col auto-cols-fr gap-2">
                {quickActions
                    .filter((action) => action.showWhen)
                    .map((action) => (
                        <QuickAction
                            key={action.id}
                            icon={action.icon}
                            label={action.label}
                            color={action.color}
                            bg={action.bg}
                            border={action.border}
                            tipTitle={action.tipTitle}
                            tipBody={action.tipBody}
                            onClick={action.onClick}
                        />
                    ))}
                </div>
            </div>
        </section>
        </SortableBlock>
        )}

        {/* MEI Limit Monitor (GAMIFIED) - Conditionally Rendered */}
        {canViewMeiLimit && (
            <SortableBlock
                id="mei_limit"
                label={blockLabels.mei_limit}
                disabled={layoutLoading}
                style={{ order: orderMap.mei_limit }}
            >
            <section>
                <div className={`bg-white dark:bg-[#151517] rounded-2xl p-4 border ${meiStatus.level === 'over' ? 'border-red-200 dark:border-red-900/40' : meiStatus.level === 'critical' ? 'border-orange-200 dark:border-orange-900/40' : meiStatus.level === 'attention' ? 'border-amber-200 dark:border-amber-900/40' : 'border-zinc-200 dark:border-zinc-800'} shadow-sm transition-colors duration-300`}>
                    <div className="flex items-start gap-3">
                        <div 
                            className={`relative w-14 h-14 rounded-2xl border ${mascotConfig.ringClass} flex items-center justify-center shadow-lg ${mascotConfig.auraClass}`}
                            title={mascotConfig.tooltip}
                        >
                            <mascotConfig.icon size={24} className={`${mascotConfig.faceClass}`} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                    <Building2 size={14} />
                                </div>
                                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">Faturamento Fiscal MEI (PJ)</h3>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Acompanhe o faturamento anual e evite ultrapassar o limite de R$ 81.000,00 do regime MEI.
                            </p>
                            <div className={`mt-2 text-xs font-semibold ${meiStatus.accentText}`}>
                                {meiStatus.label}
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                {meiStatus.description}
                            </p>
                        </div>
                    </div>

                    <div className={`mt-3 rounded-xl border ${meiStatus.calloutBorder} ${meiStatus.calloutBg} p-3 flex gap-2`}>
                        {React.createElement(calloutIcon, { size: 20, className: `${meiStatus.accentText} shrink-0` })}
                        <p className={`text-xs leading-relaxed ${meiStatus.calloutText}`}>
                            {statusCalloutText}
                        </p>
                    </div>

                    <div className="relative pt-6">
                        <div className="relative h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div 
                                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${meiStatus.gradient} transition-all duration-700 ease-out`}
                                style={{ width: `${progressVisualPercentage}%` }}
                            ></div>
                        </div>
                        <div 
                            className="absolute -top-7 flex flex-col items-center transition-all duration-500"
                            style={{ left: `calc(${displayPercentage}% - 22px)` }}
                        >
                            <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shadow ${meiStatus.badgeClass}`}>
                                {rawPercentage.toFixed(1)}%
                            </div>
                            <div className={`w-2 h-2 mt-1 rounded-full bg-gradient-to-r ${meiStatus.gradient}`}></div>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-3">
                            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">Faturado no ano</p>
                                <p className="text-lg font-semibold text-zinc-900 dark:text-white mt-1">{formatCurrency(meiRevenue)}</p>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{rawPercentage.toFixed(1)}% do limite</p>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">{meiStatus.level === 'over' ? 'Excedente sobre o limite' : 'Restante até o limite'}</p>
                                <p className={`text-lg font-semibold mt-1 ${meiStatus.level === 'over' ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                    {formatCurrency(meiStatus.level === 'over' ? meiExcess : meiRemaining)}
                                </p>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Limite anual de {formatCurrency(MEI_LIMIT)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">Limite MEI</p>
                                <p className="text-lg font-semibold text-zinc-900 dark:text-white mt-1">{formatCurrency(MEI_LIMIT)}</p>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Atualizado automaticamente</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            </SortableBlock>
        )}

        {/* Financial X-Ray */}
        {availableBlocks.financial_xray && (
        <SortableBlock
            id="financial_xray"
            label={blockLabels.financial_xray}
            disabled={layoutLoading}
            style={{ order: orderMap.financial_xray }}
        >
        <section className="grid grid-cols-1 gap-3">
            {canViewBalances ? (
                <div className="bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 relative overflow-hidden shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
                            <Wallet size={18} />
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mb-1">Saldo atual</p>
                        <h3 className={`text-2xl font-bold tracking-tight mb-2 ${financialData.balance < 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                            R$ {financialData.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-[11px] text-zinc-500 font-medium flex items-center gap-1">
                            <Calendar size={12} />
                            Disponível em contas
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-4 border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400">
                    <Lock size={20} className="mb-2" />
                    <p className="text-xs">Saldo Oculto</p>
                </div>
            )}

            {canManageIncomes && (
                <SummaryCard 
                    title="Entradas do Mês" 
                    value={financialData.income} 
                    icon={<ArrowUpCircle size={18} />}
                    colorClass="text-emerald-600 dark:text-emerald-400"
                    bgClass="bg-white dark:bg-[#151517]"
                    subtext={`R$ ${financialData.pendingIncome.toLocaleString('pt-BR', {minimumFractionDigits: 2})} a receber`}
                />
            )}

            {canManageExpenses && (
                <SummaryCard 
                    title="Saídas do Mês" 
                    value={financialData.expenses} 
                    icon={<ArrowDownCircle size={18} />}
                    colorClass="text-rose-600 dark:text-rose-400"
                    bgClass="bg-white dark:bg-[#151517]"
                    subtext={`R$ ${financialData.pendingExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})} pendentes`}
                    isExpense
                />
            )}
        </section>
        </SortableBlock>
        )}

        {/* Credit Cards Section */}
        {canViewInvoices && (
            <SortableBlock
                id="credit_cards"
                label={blockLabels.credit_cards}
                disabled={layoutLoading}
                style={{ order: orderMap.credit_cards }}
            >
            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <CreditCard className="text-purple-600 dark:text-purple-500" size={18} />
                        Faturas dos Cartões
                    </h2>
                    <button onClick={onOpenInvoices} className="text-[11px] text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-white transition-colors">
                        Gerenciar
                    </button>
                </div>

                {creditCards.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {creditCards.map((card) => {
                            const style = getCardStyle(card); 
                            const invoiceTotal = cardTotals[card.id] ?? 0;
                            const dueDateObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), card.dueDay);
                            if (card.dueDay < card.closingDay) {
                                dueDateObj.setMonth(dueDateObj.getMonth() + 1);
                            }
                            const formattedDueDate = dueDateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});

                            return (
                                <div 
                                    key={card.id} 
                                    className="rounded-2xl p-4 border border-white/5 relative overflow-hidden shadow-lg shadow-indigo-900/5 dark:shadow-none"
                                    style={{ backgroundImage: `linear-gradient(135deg, ${style.gradient.start}, ${style.gradient.end})` }}
                                >
                                    <div className="absolute top-0 left-0 w-full h-full opacity-10 dark:opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                                    <div className="relative z-10 flex flex-col gap-4">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-base text-white mb-1 break-words">{card.name}</h3>
                                                <p className="text-[11px] text-white/70 font-medium">Limite: {card.limit ? `R$ ${card.limit.toLocaleString('pt-BR')}` : 'Não informado'}</p>
                                            </div>
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-lg shrink-0">
                                                <img src={style.icon} className="w-7 h-7 opacity-90" alt="Card Brand" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-white/80 mb-1 uppercase tracking-wider">Fatura Atual (Ref. {viewDate.toLocaleDateString('pt-BR', {month: 'long'})})</p>
                                            <div className="text-xl font-bold text-white">
                                                R$ {invoiceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] text-white/80 mb-1">Vence em</p>
                                                    <p className="text-[11px] font-bold text-white bg-white/20 px-2.5 py-1 rounded-md backdrop-blur-sm inline-flex">
                                                        {formattedDueDate}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={onOpenInvoices}
                                                    className="flex items-center gap-2 text-[11px] font-semibold text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
                                                >
                                                    Ver Detalhes <Eye size={12} />
                                                </button>
                                            </div>
                                            <div className="pt-3 border-t border-white/20 flex justify-between items-center mt-3">
                                                <span 
                                                    className="text-[10px] font-semibold px-2 py-1 rounded text-white"
                                                    style={{ backgroundColor: style.badgeBg }}
                                                >
                                                    Fatura Aberta
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <MobileEmptyState
                        icon={<CreditCard size={18} />}
                        title="Nenhum cartão cadastrado"
                        message="Adicione seus cartões de crédito nas configurações."
                    />
                )}
            </section>
            </SortableBlock>
        )}

        {/* Categorized Expense Breakdown - BAR RANKING */}
        {canManageExpenses && (
            <SortableBlock
                id="expense_breakdown"
                label={blockLabels.expense_breakdown}
                disabled={layoutLoading}
                style={{ order: orderMap.expense_breakdown }}
            >
            <section className="bg-white dark:bg-[#151517] rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-300">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <PieChart size={18} className="text-indigo-500" />
                            Onde foi parar seu dinheiro?
                        </h2>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Ranking das despesas do mês ({categoryTotals.monthLabel}).
                        </p>
                    </div>
                    <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col items-end gap-1">
                        <span className="uppercase tracking-wide font-semibold">Total</span>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {formatCurrency(categoryTotals.totalSum)}
                        </div>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            Pagas: {formatCurrency(categoryTotals.totalPaid)}
                        </span>
                    </div>
                </div>
                {categoryTotals.displayItems.length > 0 && categoryTotals.totalSum > 0 ? (
                    <div className="space-y-3">
                        <ul className="space-y-2.5">
                            {categoryTotals.items.map((item, index) => {
                                const pct = categoryTotals.totalSum > 0 ? (item.total / categoryTotals.totalSum) * 100 : 0;
                                const barWidth = maxCategoryTotal > 0 ? (item.total / maxCategoryTotal) * 100 : 0;
                                const barColor =
                                    item.category === 'Outros'
                                        ? '#94a3b8'
                                        : CATEGORY_TREND_COLORS[index % CATEGORY_TREND_COLORS.length];
                                const isExpanded = expandedCategoryKey === item.key;
                                const categoryExpenses = categoryTotals.categoryItems[item.key] || [];
                                const itemsToShow = categoryExpenses.slice(0, CATEGORY_ITEMS_PREVIEW_LIMIT);
                                const extraCount = Math.max(categoryExpenses.length - itemsToShow.length, 0);
                                return (
                                    <li key={item.key} className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedCategoryKey(prev => (prev === item.key ? null : item.key))
                                            }
                                            aria-expanded={isExpanded}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-center justify-between gap-2 text-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate">
                                                        {item.category}
                                                    </span>
                                                    <ChevronDown
                                                        size={12}
                                                        className={`text-zinc-400 transition-transform ${
                                                            isExpanded ? 'rotate-180' : ''
                                                        }`}
                                                    />
                                                </div>
                                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                                                    {formatCurrency(item.total)} • {pct.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                                                ></div>
                                            </div>
                                        </button>
                                        {isExpanded && (
                                            <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3 space-y-2">
                                                <ul className="space-y-2">
                                                    {itemsToShow.map(expense => {
                                                        const meta =
                                                            (expense.accountId && accountNameById[expense.accountId]) ||
                                                            (expense.cardId && cardNameById[expense.cardId]) ||
                                                            expense.paymentMethod ||
                                                            null;
                                                        return (
                                                            <li
                                                                key={expense.id}
                                                                className="flex items-start justify-between gap-3 text-[11px]"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="font-medium text-zinc-700 dark:text-zinc-200 truncate">
                                                                        {expense.description || 'Sem descrição'}
                                                                    </p>
                                                                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                                                                        <span>
                                                                            {new Date(
                                                                                `${expense.date}T12:00:00`
                                                                            ).toLocaleDateString('pt-BR', {
                                                                                day: '2-digit',
                                                                                month: '2-digit'
                                                                            })}
                                                                        </span>
                                                                        {meta && <span className="truncate">{meta}</span>}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[11px] font-semibold text-zinc-900 dark:text-white shrink-0">
                                                                    {formatCurrency(expense.amount)}
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                                {extraCount > 0 && (
                                                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                                        + {extraCount} itens
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {spendInsights.length > 0 && (
                            <div className="grid gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                                {spendInsights.map(insight => (
                                    <div
                                        key={insight.label}
                                        className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 flex flex-col gap-1"
                                    >
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                                            {insight.label}
                                        </span>
                                        <span className="font-semibold text-zinc-900 dark:text-white">
                                            {insight.value}
                                        </span>
                                        {insight.sub && (
                                            <span className="text-[10px] text-zinc-400">{insight.sub}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <MobileEmptyState
                        icon={<PieChart size={18} />}
                        message="Nenhuma despesa paga encontrada no mês."
                    />
                )}
            </section>
            </SortableBlock>
        )}

                </div>
            </SortableContext>
        </DndContext>

    </div>
  );
};

const SortableBlock: React.FC<{
    id: DashboardBlockId;
    label: string;
    disabled: boolean;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ id, label, disabled, style, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const mergedStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        ...style
    };

    return (
        <div
            ref={setNodeRef}
            style={mergedStyle}
            className={`relative ${isDragging ? 'z-20' : ''}`}
        >
            <div className="absolute -left-2 top-4 z-10">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    disabled={disabled}
                    className="flex h-7 w-5 items-center justify-center rounded-r-lg border border-zinc-200 bg-white text-zinc-400 shadow-sm hover:text-zinc-600 dark:border-zinc-800 dark:bg-[#151517] dark:hover:text-zinc-200"
                    aria-label={`Mover ${label}`}
                >
                    <GripVertical size={14} />
                </button>
            </div>
            {children}
        </div>
    );
};

// ... existing subcomponents ...
const QuickAction: React.FC<{
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    border: string;
    tipTitle: string;
    tipBody: string;
    onClick?: () => void;
}> = ({ icon, label, color, bg, border, tipTitle, tipBody, onClick }) => {
    const renderedIcon = React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement, { size: 18 })
        : icon;
    return (
    <div className="relative overflow-visible">
        <QuickAccessHelp label={label} title={tipTitle} body={tipBody} />
        <button 
            onClick={onClick}
            className={`flex w-full flex-col items-center justify-center px-2 py-2 rounded-2xl border bg-white dark:bg-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#202022] transition-all group active:scale-95 ${border} shadow-sm dark:shadow-none min-w-0`}
        >
            <div className={`p-2 rounded-full mb-2 ${bg} ${color} group-hover:scale-110 transition-transform`}>
                {renderedIcon}
            </div>
            <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white text-center leading-tight">
                {label}
            </span>
        </button>
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

export default DashboardMobile;
