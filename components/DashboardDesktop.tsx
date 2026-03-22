
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  CreditCard, 
  BarChart3, 
  Home, 
  Repeat,
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
  ChevronDown,
  X
} from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CreditCard as CreditCardType, Expense, Income, Account } from '../types';
import { getCardPurchaseGuidance, getCreditCardInvoiceTotalForMonth, resolveCardDueDateForView } from '../services/invoiceUtils';
import { getCardGradient, withAlpha, getBrandIcon } from '../services/cardColorUtils';
import { useGlobalActions, EntityType } from '../contexts/GlobalActionsContext';
import { computeCategoryTotals } from '../utils/categoryTotals';
import { expenseStatusLabel, normalizeExpenseStatus } from '../utils/statusUtils';
import { isIncomeOperationalForMei } from '../utils/incomeFiscalNature';
import { useDashboardLayout, DashboardBlockId } from '../hooks/useDashboardLayout';
import SearchHelperBar from './SearchHelperBar';
import useIsCompactHeight from '../hooks/useIsCompactHeight';

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

type MoneyFlowMode = 'out' | 'in';

interface MoneyFlowEntry {
    id: string;
    category: string;
    key: string;
    amount: number;
    date: string;
    description: string;
    accountKey: string;
    accountLabel: string;
    method: string;
    nature: string;
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

const normalizeCategoryKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');


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

const DashboardDesktop: React.FC<DashboardProps> = ({ 
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
  assistantHidden,
  onCloseAssistant,
  categoriesCount = 0,
  isPwaInstallable = false,
  isStandalone = false,
  onInstallApp
}) => {
  const isCompactHeight = useIsCompactHeight();
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
          isMobile: false
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
                  "Cadastre suas contas (banco, caixa, carteira). Aqui você acompanha saldo e movimentações. Dica: mantenha uma conta ‘Dinheiro’ para gastos rápidos.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.",
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
                  'Registre tudo o que entra: vendas, serviços, recebimentos. Dica: categorize bem para ver quais fontes mais rendem.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
              onClick: onOpenIncomes,
              showWhen: canManageIncomes
          },
          {
              id: 'fixed_expenses',
              label: 'Despesas Fixas',
              icon: <Repeat />,
              color: 'text-amber-500 dark:text-amber-400',
              bg: 'bg-amber-50 dark:bg-amber-500/10',
              border: 'border-amber-100 dark:border-amber-500/20',
              tipTitle: 'Despesas Fixas',
              tipBody: 'Gastos recorrentes como aluguel, internet, assinaturas. Dica: revise mensalmente para cortar vazamentos.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
                  'Gastos do dia a dia que mudam: mercado, combustível, extras. Dica: anote na hora para não esquecer.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
              tipBody: 'Separação do MEI e do pessoal. Dica: use aqui para evitar misturar despesas da empresa.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
                  'Acompanhe rendas e retornos (investimentos, juros, etc.). Dica: registre a data para entender evolução no tempo.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
              tipBody: 'Controle de cartão e faturas abertas/fechadas. Dica: confira antes de fechar para não perder lançamentos.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
              tipBody: 'Visão geral do mês, comparativos e totais. Dica: olhe semanalmente para corrigir rota rápido.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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
              tipBody: 'Acesso rápido ao DAS do MEI. Dica: mantenha o pagamento em dia para evitar multa e juros.\nAtalho: use ←/→ para navegar pelo Acesso Rápido.',
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

  const quickActionItems = useMemo(
      () => quickActions.filter((action) => action.showWhen),
      [quickActions]
  );
  
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<string[]>([]);
  const [moneyFlowMode, setMoneyFlowMode] = useState<MoneyFlowMode>('out');
  const [flowAccountFilter, setFlowAccountFilter] = useState<string>('all');
  const [flowMethodFilter, setFlowMethodFilter] = useState<string>('all');
  const [flowNatureFilter, setFlowNatureFilter] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<null | { x: number; y: number; label: string }>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Partial<Record<DashboardBlockId, boolean>>>({});
  const [isCreditCardsCollapsed, setIsCreditCardsCollapsed] = useState(true);
  const [isExpenseBreakdownCollapsed, setIsExpenseBreakdownCollapsed] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState<null | 'credit_cards' | 'expense_breakdown'>(null);
  const collapsePrefsLoadedRef = useRef(false);
  const collapsePrefsKey = 'meumei.dashboard.desktop.collapse';
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const expenseChartHostRef = useRef<HTMLDivElement | null>(null);
  const [expenseChartWidth, setExpenseChartWidth] = useState(0);
  const categoryNames = useMemo(() => {
      const names = new Set<string>();
      expenses.forEach(exp => {
          if (exp.category) names.add(exp.category);
      });
      return Array.from(names);
  }, [expenses]);

  const toggleCollapse = (id: DashboardBlockId) => {
      setCollapsedBlocks((prev) => ({
          ...prev,
          [id]: !prev[id]
      }));
  };

  useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
          const raw = window.localStorage.getItem(collapsePrefsKey);
          if (raw) {
              const stored = JSON.parse(raw) as {
                  credit_cards?: boolean;
                  expense_breakdown?: boolean;
              };
              if (typeof stored.credit_cards === 'boolean') {
                  setIsCreditCardsCollapsed(stored.credit_cards);
              }
              if (typeof stored.expense_breakdown === 'boolean') {
                  setIsExpenseBreakdownCollapsed(stored.expense_breakdown);
              }
          }
      } catch (error) {
          console.warn('[dashboard][collapse] load_failed', { message: (error as any)?.message });
      } finally {
          collapsePrefsLoadedRef.current = true;
      }
  }, []);

  useEffect(() => {
      if (!collapsePrefsLoadedRef.current) return;
      if (typeof window === 'undefined') return;
      try {
          window.localStorage.setItem(
              collapsePrefsKey,
              JSON.stringify({
                  credit_cards: isCreditCardsCollapsed,
                  expense_breakdown: isExpenseBreakdownCollapsed
              })
          );
      } catch (error) {
          console.warn('[dashboard][collapse] save_failed', { message: (error as any)?.message });
      }
  }, [collapsePrefsKey, isCreditCardsCollapsed, isExpenseBreakdownCollapsed]);

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

  const monthlyExpenseFlowEntries = useMemo<MoneyFlowEntry[]>(() => {
      return expenses
          .filter(expense => {
              const date = new Date(`${expense.date}T12:00:00`);
              if (Number.isNaN(date.getTime())) return false;
              if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return false;
              const status = normalizeExpenseStatus(expense.status);
              return status === 'paid' || status === 'pending';
          })
          .map(expense => {
              const category = (expense.category || 'Sem categoria').trim() || 'Sem categoria';
              const key = normalizeCategoryKey(category) || 'sem-categoria';
              const sourceKey = expense.accountId
                  ? `account:${expense.accountId}`
                  : expense.cardId
                      ? `card:${expense.cardId}`
                      : 'none';
              const sourceLabel = expense.accountId
                  ? accountNameById[expense.accountId] || 'Conta removida'
                  : expense.cardId
                      ? cardNameById[expense.cardId] || 'Cartão removido'
                      : 'Sem conta';
              return {
                  id: expense.id,
                  category,
                  key,
                  amount: Number(expense.amount) || 0,
                  date: expense.date,
                  description: (expense.description || '').trim() || category,
                  accountKey: sourceKey,
                  accountLabel: sourceLabel,
                  method: (expense.paymentMethod || '').trim() || 'Sem forma',
                  nature: (expense.taxStatus || '').trim() || 'Sem natureza'
              };
          });
  }, [expenses, viewDate, accountNameById, cardNameById]);

  const monthlyIncomeFlowEntries = useMemo<MoneyFlowEntry[]>(() => {
      return incomes
          .filter(income => {
              const date = new Date(`${income.date}T12:00:00`);
              if (Number.isNaN(date.getTime())) return false;
              if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return false;
              return income.status === 'received';
          })
          .map(income => {
              const category = (income.category || 'Sem categoria').trim() || 'Sem categoria';
              const key = normalizeCategoryKey(category) || 'sem-categoria';
              const accountId = income.accountId || '';
              return {
                  id: income.id,
                  category,
                  key,
                  amount: Number(income.amount) || 0,
                  date: income.date,
                  description: (income.description || '').trim() || category,
                  accountKey: accountId ? `account:${accountId}` : 'none',
                  accountLabel: accountId ? accountNameById[accountId] || 'Conta removida' : 'Sem conta',
                  method: (income.paymentMethod || '').trim() || 'Sem forma',
                  nature: (income.taxStatus || '').trim() || 'Sem natureza'
              };
          });
  }, [incomes, viewDate, accountNameById]);

  const activeFlowEntries = useMemo(
      () => (moneyFlowMode === 'in' ? monthlyIncomeFlowEntries : monthlyExpenseFlowEntries),
      [moneyFlowMode, monthlyExpenseFlowEntries, monthlyIncomeFlowEntries]
  );
  const hasOutMonthData = monthlyExpenseFlowEntries.length > 0;
  const hasInMonthData = monthlyIncomeFlowEntries.length > 0;

  useEffect(() => {
      if (moneyFlowMode === 'out' && !hasOutMonthData && hasInMonthData) {
          setMoneyFlowMode('in');
          return;
      }
      if (moneyFlowMode === 'in' && !hasInMonthData && hasOutMonthData) {
          setMoneyFlowMode('out');
      }
  }, [moneyFlowMode, hasOutMonthData, hasInMonthData]);

  const flowMonthLabel = useMemo(
      () => viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      [viewDate]
  );
  const balancePeriodLabel = useMemo(() => {
      const safeLabel = (flowMonthLabel || '').trim();
      if (!safeLabel) return 'Saldo do mês';
      return `Saldo de ${safeLabel}`;
  }, [flowMonthLabel]);

  const categoryTotals = useMemo(
      () =>
          computeCategoryTotals(expenses, {
              viewDate,
              statusRule: 'paid+pending',
              dateField: 'date',
              topN: 8,
              includeOthers: true,
              source: 'dashboard',
              variant: 'desktop',
              expensesRevision,
              refreshNonce
          }),
      [expenses, viewDate, expensesRevision, refreshNonce]
  );

  const incomeCategoryTotals = useMemo(() => {
      const monthIncomes = incomes.filter(income => {
          const date = new Date(`${income.date}T12:00:00`);
          if (Number.isNaN(date.getTime())) return false;
          if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return false;
          return income.status === 'received';
      });

      const totalsByKey = new Map<string, { label: string; total: number; count: number }>();
      const categoryItems: Record<string, Income[]> = {};

      monthIncomes.forEach(income => {
          const categoryLabel = (income.category || 'Sem categoria').trim() || 'Sem categoria';
          const key = normalizeCategoryKey(categoryLabel) || 'sem-categoria';
          const current = totalsByKey.get(key);
          if (!current) {
              totalsByKey.set(key, { label: categoryLabel, total: income.amount, count: 1 });
          } else {
              current.total += income.amount;
              current.count += 1;
          }

          if (!categoryItems[key]) {
              categoryItems[key] = [];
          }
          categoryItems[key].push(income);
      });

      const items = Array.from(totalsByKey.entries())
          .map(([key, item]) => ({ key, category: item.label, total: item.total, count: item.count }))
          .sort((a, b) => b.total - a.total);

      const totalSum = Number(monthIncomes.reduce((sum, income) => sum + (income.amount || 0), 0).toFixed(2));

      Object.keys(categoryItems).forEach(key => {
          categoryItems[key].sort((a, b) => {
              const aDate = new Date(`${a.date}T12:00:00`).getTime();
              const bDate = new Date(`${b.date}T12:00:00`).getTime();
              return bDate - aDate;
          });
      });

      return {
          items,
          totalSum,
          totalReceived: totalSum,
          monthLabel: categoryTotals.monthLabel,
          categoryItems
      };
  }, [incomes, viewDate, categoryTotals.monthLabel]);

  const daysInViewMonth = useMemo(
      () => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate(),
      [viewDate]
  );

  const flowAccountOptions = useMemo(
      () =>
          Array.from(
              activeFlowEntries.reduce((map, entry) => {
                  if (!map.has(entry.accountKey)) {
                      map.set(entry.accountKey, entry.accountLabel);
                  }
                  return map;
              }, new Map<string, string>())
          )
              .map(([value, label]) => ({ value, label }))
              .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      [activeFlowEntries]
  );

  const flowMethodOptions = useMemo(
      () =>
          Array.from(new Set(activeFlowEntries.map(entry => entry.method)))
              .map(value => ({ value, label: value }))
              .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      [activeFlowEntries]
  );

  const flowNatureOptions = useMemo(
      () =>
          Array.from(new Set(activeFlowEntries.map(entry => entry.nature)))
              .map(value => ({ value, label: value }))
              .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      [activeFlowEntries]
  );

  useEffect(() => {
      if (flowAccountFilter !== 'all' && !flowAccountOptions.some(option => option.value === flowAccountFilter)) {
          setFlowAccountFilter('all');
      }
  }, [flowAccountFilter, flowAccountOptions]);

  useEffect(() => {
      if (flowMethodFilter !== 'all' && !flowMethodOptions.some(option => option.value === flowMethodFilter)) {
          setFlowMethodFilter('all');
      }
  }, [flowMethodFilter, flowMethodOptions]);

  useEffect(() => {
      if (flowNatureFilter !== 'all' && !flowNatureOptions.some(option => option.value === flowNatureFilter)) {
          setFlowNatureFilter('all');
      }
  }, [flowNatureFilter, flowNatureOptions]);

  const filteredFlowEntries = useMemo(() => {
      return activeFlowEntries.filter(entry => {
          if (flowAccountFilter !== 'all' && entry.accountKey !== flowAccountFilter) return false;
          if (flowMethodFilter !== 'all' && entry.method !== flowMethodFilter) return false;
          if (flowNatureFilter !== 'all' && entry.nature !== flowNatureFilter) return false;
          return true;
      });
  }, [activeFlowEntries, flowAccountFilter, flowMethodFilter, flowNatureFilter]);

  const activeFlowBreakdown = useMemo(() => {
      const grouped = new Map<
          string,
          {
              key: string;
              category: string;
              total: number;
              count: number;
              entries: MoneyFlowEntry[];
          }
      >();

      filteredFlowEntries.forEach(entry => {
          const current = grouped.get(entry.key);
          if (!current) {
              grouped.set(entry.key, {
                  key: entry.key,
                  category: entry.category,
                  total: entry.amount,
                  count: 1,
                  entries: [entry]
              });
              return;
          }
          current.total += entry.amount;
          current.count += 1;
          current.entries.push(entry);
      });

      const items = Array.from(grouped.values())
          .map(item => ({
              key: item.key,
              category: item.category,
              total: Number(item.total.toFixed(2)),
              count: item.count
          }))
          .sort((a, b) => b.total - a.total);

      const seriesByDay = new Map<string, { total: number; labels: string[]; count: number }[]>();
      grouped.forEach(item => {
          const bucket = Array.from({ length: daysInViewMonth }, () => ({ total: 0, labels: [], count: 0 }));
          item.entries.forEach(entry => {
              const date = new Date(`${entry.date}T12:00:00`);
              if (Number.isNaN(date.getTime())) return;
              const dayIndex = date.getDate() - 1;
              if (dayIndex < 0 || dayIndex >= bucket.length) return;
              const point = bucket[dayIndex];
              point.total += entry.amount;
              point.count += 1;
              if (entry.description && !point.labels.includes(entry.description)) {
                  point.labels.push(entry.description);
              }
          });
          seriesByDay.set(item.key, bucket);
      });

      return {
          items,
          totalSum: Number(filteredFlowEntries.reduce((sum, entry) => sum + entry.amount, 0).toFixed(2)),
          seriesByDay
      };
  }, [filteredFlowEntries, daysInViewMonth]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const node = expenseChartHostRef.current;
      if (!node) return;

      const syncWidth = () => {
          const next = Math.round(node.getBoundingClientRect().width);
          if (!Number.isFinite(next) || next <= 0) return;
          setExpenseChartWidth(prev => (prev === next ? prev : next));
      };

      syncWidth();
      const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWidth) : null;
      resizeObserver?.observe(node);
      window.addEventListener('resize', syncWidth);

      return () => {
          resizeObserver?.disconnect();
          window.removeEventListener('resize', syncWidth);
      };
  }, [isExpenseBreakdownCollapsed, expandedPanel, categoryTotals.items.length, incomeCategoryTotals.items.length, daysInViewMonth, moneyFlowMode]);

  const expenseSeriesByDay = useMemo(() => {
      const map = new Map<string, { total: number; labels: string[]; count: number }[]>();
      categoryTotals.items.forEach(item => {
          map.set(
              item.key,
              Array.from({ length: daysInViewMonth }, () => ({ total: 0, labels: [], count: 0 }))
          );
      });
      categoryTotals.items.forEach(item => {
          const bucket = map.get(item.key);
          if (!bucket) return;
          const entries = categoryTotals.categoryItems[item.key] || [];
          entries.forEach(entry => {
              const date = new Date(`${entry.date}T12:00:00`);
              if (Number.isNaN(date.getTime())) return;
              if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return;
              const dayIndex = date.getDate() - 1;
              if (dayIndex < 0 || dayIndex >= bucket.length) return;
              const dayPoint = bucket[dayIndex];
              dayPoint.total += Number(entry.amount) || 0;
              dayPoint.count += 1;
              const destination = (entry.description || '').trim();
              if (destination && !dayPoint.labels.includes(destination)) {
                  dayPoint.labels.push(destination);
              }
          });
      });
      return map;
  }, [categoryTotals.items, categoryTotals.categoryItems, daysInViewMonth, viewDate]);

  const incomeSeriesByDay = useMemo(() => {
      const map = new Map<string, { total: number; labels: string[]; count: number }[]>();
      incomeCategoryTotals.items.forEach(item => {
          map.set(
              item.key,
              Array.from({ length: daysInViewMonth }, () => ({ total: 0, labels: [], count: 0 }))
          );
      });
      incomeCategoryTotals.items.forEach(item => {
          const bucket = map.get(item.key);
          if (!bucket) return;
          const entries = incomeCategoryTotals.categoryItems[item.key] || [];
          entries.forEach(entry => {
              const date = new Date(`${entry.date}T12:00:00`);
              if (Number.isNaN(date.getTime())) return;
              if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return;
              const dayIndex = date.getDate() - 1;
              if (dayIndex < 0 || dayIndex >= bucket.length) return;
              const dayPoint = bucket[dayIndex];
              dayPoint.total += Number(entry.amount) || 0;
              dayPoint.count += 1;
              const destination = (entry.description || '').trim();
              if (destination && !dayPoint.labels.includes(destination)) {
                  dayPoint.labels.push(destination);
              }
          });
      });
      return map;
  }, [incomeCategoryTotals.items, incomeCategoryTotals.categoryItems, daysInViewMonth, viewDate]);

  const activeCategoryButtons = useMemo(
      () => activeFlowBreakdown.items,
      [activeFlowBreakdown.items]
  );

  useEffect(() => {
      setSelectedCategoryKeys([]);
      setHoveredPoint(null);
      setFlowAccountFilter('all');
      setFlowMethodFilter('all');
      setFlowNatureFilter('all');
  }, [moneyFlowMode]);

  useEffect(() => {
      const validKeys = new Set(activeCategoryButtons.map(item => item.key));
      setSelectedCategoryKeys(prev => {
          const next = prev.filter(key => validKeys.has(key));
          if (next.length === prev.length) return prev;
          return next;
      });
  }, [activeCategoryButtons]);

  const creditCardsPreviewCount = 6;
  const visibleCreditCards = isCreditCardsCollapsed ? creditCards.slice(0, creditCardsPreviewCount) : creditCards;
  const canExpandCreditCards = creditCards.length > creditCardsPreviewCount;

  const handleManualRecalc = () => {
      setRefreshNonce(prev => prev + 1);
      if (onRefreshExpenses) {
          onRefreshExpenses();
      }
      console.info('[category-totals] manual-recalc', {
          monthLabel: categoryTotals.monthLabel,
          variant: 'desktop'
      });
  };

  useEffect(() => {
      const totalSaidasMes = financialData.expenses;
      const totalRank = categoryTotals.totalSum;
      const diff = Number((totalSaidasMes - totalRank).toFixed(2));
      console.info('[category-totals] compare', {
          variant: 'desktop',
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
              variant: 'desktop',
              onlyInMonth: pickTop(onlyInMonth),
              onlyInGrouped: pickTop(onlyInGrouped)
          });
      }
  }, [financialData.expenses, categoryTotals.totalSum, categoryTotals.monthExpensesAll, categoryTotals.categoryItems]);

  // --- MEI Logic ---
  const annualMeiRevenue = financialData.annualMeiRevenue || 0;
  const monthlyMeiRevenue = useMemo(() => {
      return incomes
          .filter(inc => {
              const d = new Date(inc.date + 'T12:00:00');
              return (
                  d.getFullYear() === viewDate.getFullYear() &&
                  d.getMonth() === viewDate.getMonth() &&
                  isIncomeOperationalForMei(inc)
              );
          })
          .reduce((acc, curr) => acc + curr.amount, 0);
  }, [incomes, viewDate]);
  const monthlyMeiLimit = MEI_LIMIT / 12;
  const meiStatusPriority: Record<MeiStatusLevel, number> = {
      safe: 0,
      attention: 1,
      critical: 2,
      over: 3
  };
  const buildMeiSnapshot = (
      id: 'annual' | 'monthly',
      title: string,
      revenue: number,
      limit: number,
      scopeLabel: 'anual' | 'mensal'
  ) => {
      const rawPercentage = limit > 0 ? (revenue / limit) * 100 : 0;
      const displayPercentage = Math.min(Math.max(rawPercentage, 0), 100);
      const progressVisualPercentage = Math.min(Math.max(rawPercentage, 0), 120);
      const progressLabelLeft = Math.min(Math.max(displayPercentage, 6), 94);
      const remaining = Math.max(limit - revenue, 0);
      const excess = Math.max(revenue - limit, 0);
      const status = getMeiStatus(rawPercentage);
      const statusDescription =
          scopeLabel === 'anual'
              ? status.description
              : status.level === 'over'
                ? 'Você ultrapassou o limite mensal estimado do MEI.'
                : status.level === 'critical'
                  ? 'Faltam poucos passos para estourar o limite mensal estimado.'
                  : status.level === 'attention'
                    ? 'Você já passou da metade do limite mensal estimado.'
                    : 'Seu faturamento está bem abaixo do limite mensal estimado.';

      return {
          id,
          title,
          revenue,
          limit,
          scopeLabel,
          rawPercentage,
          displayPercentage,
          progressVisualPercentage,
          progressLabelLeft,
          remaining,
          excess,
          status,
          statusDescription,
          limitLabel: scopeLabel === 'anual' ? 'limite anual' : 'limite mensal estimado'
      };
  };
  const annualMeiSnapshot = useMemo(
      () => buildMeiSnapshot('annual', 'Visão anual', annualMeiRevenue, MEI_LIMIT, 'anual'),
      [annualMeiRevenue]
  );
  const monthlyMeiSnapshot = useMemo(
      () => buildMeiSnapshot('monthly', 'Visão mensal', monthlyMeiRevenue, monthlyMeiLimit, 'mensal'),
      [monthlyMeiRevenue, monthlyMeiLimit]
  );
  const meiSnapshots = [annualMeiSnapshot, monthlyMeiSnapshot];
  const dominantMeiSnapshot = useMemo(() => {
      return meiSnapshots.reduce((worst, current) => {
          const worstPriority = meiStatusPriority[worst.status.level];
          const currentPriority = meiStatusPriority[current.status.level];
          if (currentPriority > worstPriority) return current;
          if (currentPriority === worstPriority && current.rawPercentage > worst.rawPercentage) return current;
          return worst;
      });
  }, [meiSnapshots]);
  const meiStatus = dominantMeiSnapshot.status;
  const meiRemaining = dominantMeiSnapshot.remaining;
  const meiExcess = dominantMeiSnapshot.excess;
  const rawPercentage = dominantMeiSnapshot.rawPercentage;
  const dominantLimitLabel = dominantMeiSnapshot.limitLabel;
  const mascotConfig = getMascotConfig(rawPercentage);
  const incomeAccent = '#22c55e';
  const expenseAccent = '#FF0000';
  const healthScore = useMemo(() => {
      const income = financialData.income;
      const expenses = financialData.expenses;
      if (income <= 0 && expenses <= 0) return 0.5;
      if (income <= 0) return 0;
      const net = income - expenses;
      const margin = net / income;
      const clamped = Math.max(-1, Math.min(1, margin));
      return (clamped + 1) / 2;
  }, [financialData.income, financialData.expenses]);
  const statusCalloutText = (() => {
      switch (meiStatus.level) {
          case 'over':
              return `Você excedeu o ${dominantLimitLabel} em ${formatCurrency(meiExcess)}. Procure orientação contábil.`;
          case 'critical':
              return `Restam ${formatCurrency(meiRemaining)} até alcançar o ${dominantLimitLabel}. Planeje o próximo mês com cuidado.`;
          case 'attention':
              return `Você já utilizou ${rawPercentage.toFixed(1)}% do ${dominantLimitLabel}. Ajuste suas metas para não estourar.`;
          default:
              return `Continue acompanhando o faturamento para manter distância confortável do ${dominantLimitLabel}.`;
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
      quick_access: false,
      mei_limit: canViewMeiLimit,
      financial_xray: false,
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

  const handleDragEnd = (event: { active: { id: string }; over?: { id: string } | null }) => {
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

  const renderCreditCardsSection = (cardsToShow: CreditCardType[], variant: 'compact' | 'expanded' = 'compact') => {
      const shouldFillPlaceholders = variant === 'compact';
      const compactCard = variant === 'compact';
      const slotCount = shouldFillPlaceholders ? 6 : cardsToShow.length;
      const limitedCards = shouldFillPlaceholders ? cardsToShow.slice(0, slotCount) : cardsToShow;
      const placeholderCount = shouldFillPlaceholders ? Math.max(0, slotCount - limitedCards.length) : 0;
      const cardEntries: Array<{ kind: 'card'; card: CreditCardType } | { kind: 'placeholder'; id: string }> = [
          ...limitedCards.map((card) => ({ kind: 'card' as const, card })),
          ...Array.from({ length: placeholderCount }, (_, index) => ({ kind: 'placeholder' as const, id: `card-slot-${index}` }))
      ];
      const gridClass =
          variant === 'expanded' ? 'grid-cols-1 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-6';

      return (
          <section>
              <div
                  className="bg-white dark:bg-[#151517] rounded-2xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-sm h-full"
                  data-tour-anchor={variant === 'compact' ? 'dashboard-credit-cards' : undefined}
              >
                  <div className="flex items-center justify-between mb-2">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          <CreditCard className="text-purple-600 dark:text-purple-500" size={20} />
                          Faturas dos Cartões
                      </h2>
                  </div>

                  {cardEntries.length > 0 ? (
                      <div className={`grid gap-3 ${gridClass}`}>
                          {cardEntries.map((entry) => {
                              if (entry.kind === 'placeholder') {
                                  return (
                                      <button
                                          key={entry.id}
                                          type="button"
                                          onClick={onOpenInvoices}
                                          className={`rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/70 dark:bg-zinc-900/40 flex flex-col items-center justify-center gap-2 text-zinc-500 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors ${
                                              compactCard ? 'p-2 min-h-[116px]' : 'p-2.5 min-h-[128px]'
                                          }`}
                                      >
                                          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                                              <Plus size={20} />
                                          </div>
                                          <span className="text-xs font-semibold">Adicionar cartão</span>
                                      </button>
                                  );
                              }

                              const style = getCardStyle(entry.card);
                              const invoiceTotal = cardTotals[entry.card.id] ?? 0;
                              const dueDateObj = resolveCardDueDateForView(entry.card, expenses, viewDate);
                              const purchaseGuidance = getCardPurchaseGuidance(entry.card, new Date());
                              const formattedDueDate = dueDateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                              const formattedClosingDate = purchaseGuidance.nextClosingDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                              const formattedBestDay = purchaseGuidance.bestPurchaseDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                              const formattedDueIfBuyToday = purchaseGuidance.invoiceDueDateIfBuyToday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                              const dueMonthIfBuyToday = purchaseGuidance.invoiceDueDateIfBuyToday.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                              const dueBorderColor = purchaseGuidance.statusColor;

                              return (
                                  <div
                                      key={entry.card.id}
                                      className={`rounded-2xl border-2 relative overflow-hidden shadow-xl shadow-indigo-900/5 dark:shadow-none ${
                                          compactCard ? 'p-2' : 'p-2.5'
                                      }`}
                                      style={{
                                          backgroundImage: `linear-gradient(135deg, ${style.gradient.start}, ${style.gradient.end})`,
                                          borderColor: dueBorderColor
                                      }}
                                  >
                                      <div className="absolute top-0 left-0 w-full h-full opacity-10 dark:opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                                      <div className="relative z-10 flex flex-col h-full justify-between">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <h3 className={`font-bold text-white mb-0.5 ${compactCard ? 'text-[13px]' : 'text-sm'}`}>{entry.card.name}</h3>
                                                  <p className={`text-white/70 font-medium ${compactCard ? 'text-[10px]' : 'text-[11px]'}`}>
                                                      Limite: {entry.card.limit ? `R$ ${entry.card.limit.toLocaleString('pt-BR')}` : 'Não informado'}
                                                  </p>
                                              </div>
                                              <div className={`bg-white/20 backdrop-blur-md rounded-lg ${compactCard ? 'p-0.5' : 'p-1'}`}>
                                                  <img src={style.icon} className={`${compactCard ? 'w-5 h-5' : 'w-6 h-6'} opacity-90`} alt="Card Brand" />
                                              </div>
                                          </div>
                                          <div className={compactCard ? 'mt-2' : 'mt-3'}>
                                              <div className={`flex justify-between items-end ${compactCard ? 'mb-2' : 'mb-2.5'}`}>
                                                  <div>
                                                      <p className={`text-white/80 mb-1 uppercase tracking-wider ${compactCard ? 'text-[8px]' : 'text-[9px]'}`}>
                                                          Fatura Atual (Ref. {viewDate.toLocaleDateString('pt-BR', { month: 'long' })})
                                                      </p>
                                                      <div className={`font-bold text-white ${compactCard ? 'text-base' : 'text-lg'}`}>
                                                          R$ {invoiceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                      </div>
                                                  </div>
                                                  <div className="text-right">
                                                      <p className={`text-white/80 mb-1 ${compactCard ? 'text-[8px]' : 'text-[9px]'}`}>Vencimento</p>
                                                      <p
                                                          className={`font-bold text-white bg-white/20 rounded-md backdrop-blur-sm border ${
                                                              compactCard ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'
                                                          }`}
                                                          style={{ borderColor: dueBorderColor }}
                                                      >
                                                          {formattedDueDate}
                                                      </p>
                                                  </div>
                                              </div>
                                              <div className={`grid grid-cols-3 ${compactCard ? 'gap-1' : 'gap-1.5'}`}>
                                                  <div className={`rounded-md border border-white/20 bg-black/20 ${compactCard ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
                                                      <p className={`uppercase tracking-wide text-white/70 ${compactCard ? 'text-[7px]' : 'text-[8px]'}`}>Fech.</p>
                                                      <p className={`font-semibold text-white ${compactCard ? 'text-[9px]' : 'text-[10px]'}`}>{formattedClosingDate}</p>
                                                  </div>
                                                  <div className={`rounded-md border border-white/20 bg-black/20 ${compactCard ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
                                                      <p className={`uppercase tracking-wide text-white/70 ${compactCard ? 'text-[7px]' : 'text-[8px]'}`}>Melhor dia</p>
                                                      <p className={`font-semibold text-white ${compactCard ? 'text-[9px]' : 'text-[10px]'}`}>{formattedBestDay}</p>
                                                  </div>
                                                  <div className={`rounded-md border border-white/20 bg-black/20 ${compactCard ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
                                                      <p className={`uppercase tracking-wide text-white/70 ${compactCard ? 'text-[7px]' : 'text-[8px]'}`}>Compra hoje</p>
                                                      <p className={`font-semibold text-white ${compactCard ? 'text-[9px]' : 'text-[10px]'}`}>{formattedDueIfBuyToday}</p>
                                                  </div>
                                              </div>
                                              <p className={`text-white/80 ${compactCard ? 'mt-1 text-[8px]' : 'mt-1.5 text-[9px]'}`}>
                                                  Compra hoje: fatura {dueMonthIfBuyToday} (venc. {formattedDueIfBuyToday}).
                                              </p>
                                              <div className={`border-t border-white/20 flex justify-between items-center ${compactCard ? 'pt-2 mt-1.5' : 'pt-2.5 mt-2'}`}>
                                                  <div className={`flex items-center ${compactCard ? 'gap-1' : 'gap-1.5'}`}>
                                                      <span
                                                          className={`font-semibold rounded text-white ${compactCard ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-2 py-0.5'}`}
                                                          style={{ backgroundColor: style.badgeBg }}
                                                      >
                                                          Fatura Aberta
                                                      </span>
                                                      <span
                                                          className={`font-semibold rounded border ${compactCard ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-2 py-0.5'}`}
                                                          style={{
                                                              borderColor: withAlpha(purchaseGuidance.statusColor, 0.75),
                                                              backgroundColor: withAlpha(purchaseGuidance.statusColor, 0.24),
                                                              color: '#ffffff'
                                                          }}
                                                          title={purchaseGuidance.statusHint}
                                                      >
                                                          {purchaseGuidance.statusLabel}
                                                      </span>
                                                  </div>
                                                  <button
                                                      onClick={onOpenInvoices}
                                                      className={`flex items-center font-semibold text-white hover:bg-white/20 rounded-lg transition-colors ${
                                                          compactCard ? 'gap-1 text-[9px] px-1.5 py-0.5' : 'gap-2 text-[10px] px-2 py-1'
                                                      }`}
                                                  >
                                                      Ver Detalhes <Eye size={compactCard ? 12 : 14} />
                                                  </button>
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="bg-white dark:bg-[#151517] rounded-2xl p-10 text-center border border-zinc-200 dark:border-zinc-800 border-dashed">
                          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                              <CreditCard size={32} />
                          </div>
                          <h3 className="text-zinc-900 dark:text-white font-bold mb-1">Nenhum cartão cadastrado</h3>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">Adicione seus cartões de crédito nas configurações.</p>
                      </div>
                  )}
              </div>
          </section>
      );
  };

  const renderExpenseBreakdownSection = (_itemsToShow: typeof categoryTotals.items) => {
      const isIncomeMode = moneyFlowMode === 'in';
      const categoryButtons = activeCategoryButtons;
      const activeSeriesByDay = activeFlowBreakdown.seriesByDay;
      const activeMonthLabel = flowMonthLabel;
      const activeTotalSum = activeFlowBreakdown.totalSum;
      const paidLabel = isIncomeMode ? 'Recebidas' : 'Pagas';
      const fallbackMode: MoneyFlowMode | null = !isIncomeMode
          ? (hasInMonthData ? 'in' : null)
          : (hasOutMonthData ? 'out' : null);
      const allCategoryKeys = categoryButtons.map(item => item.key);
      const hasAnyCategorySelected = selectedCategoryKeys.length > 0;
      const activeKeySet = new Set(selectedCategoryKeys);
      const chartItems = categoryButtons.filter(item => activeKeySet.has(item.key));
      const effectiveChartItems = chartItems;
      const chartItemsWithGrouping = effectiveChartItems.map(item => ({
          ...item,
          sourceKeys: [item.key],
          synthetic: false
      }));

      const chartSeries = chartItemsWithGrouping.map(item => {
          const dailyValues = item.synthetic
              ? Array.from({ length: daysInViewMonth }, (_, dayIndex) => {
                  const point = { total: 0, labels: [] as string[], count: 0 };
                  item.sourceKeys.forEach(sourceKey => {
                      const sourceDay = activeSeriesByDay.get(sourceKey)?.[dayIndex];
                      if (!sourceDay) return;
                      point.total += sourceDay.total;
                      point.count += sourceDay.count;
                      sourceDay.labels.forEach(label => {
                          if (!point.labels.includes(label)) {
                              point.labels.push(label);
                          }
                      });
                  });
                  return point;
              })
              : activeSeriesByDay.get(item.key) ||
                Array.from({ length: daysInViewMonth }, () => ({ total: 0, labels: [], count: 0 }));
          let running = 0;
          const points = dailyValues.map((dayData, index) => {
              const paidValue = dayData.total;
              running += paidValue;
              const mainDestination = dayData.labels[0] || 'Sem destino';
              const extraDestinations = Math.max(dayData.count - 1, 0);
              const destinationLabelRaw =
                  extraDestinations > 0
                      ? `${mainDestination} +${extraDestinations}`
                      : mainDestination;
              const destinationLabel =
                  destinationLabelRaw.length > 28
                      ? `${destinationLabelRaw.slice(0, 27)}…`
                      : destinationLabelRaw;
              return {
                  day: index + 1,
                  value: running,
                  paid: paidValue,
                  destinationLabel,
                  count: dayData.count
              };
          });
          const sourceIndex = categoryButtons.findIndex(category => category.key === item.key);
          const color =
              item.synthetic || item.category === 'Outros'
                  ? '#94a3b8'
                  : CATEGORY_TREND_COLORS[(sourceIndex >= 0 ? sourceIndex : 0) % CATEGORY_TREND_COLORS.length];
          return {
              item,
              color,
              points
          };
      });

      const maxValue = chartSeries.reduce((max, series) => {
          const top = series.points.reduce((lineMax, point) => Math.max(lineMax, point.value), 0);
          return Math.max(max, top);
      }, 0);
      // A régua esquerda deve refletir apenas o que está visível no gráfico atual.
      // Mantém base em 5k e expande de 1k em 1k somente quando necessário.
      const sharedModeMax = Math.max(maxValue, 0);
      const buildYAxisScale = (rawMax: number) => {
          const safeMax = Math.max(rawMax, 0);
          const baseMax = 5000;
          const baseTicks = [0, 1000, 2000, 3000, 4000, 5000];
          if (safeMax <= baseMax) {
              return { ticks: baseTicks, max: baseMax };
          }
          const expandedMax = Math.ceil(safeMax / 1000) * 1000;
          const extraTicks: number[] = [];
          for (let value = 6000; value <= expandedMax; value += 1000) {
              extraTicks.push(value);
          }
          return { ticks: [...baseTicks, ...extraTicks], max: expandedMax };
      };

      const yAxisScale = buildYAxisScale(sharedModeMax);
      const yMax = Math.max(yAxisScale.max, 1);
      const yTicks = yAxisScale.ticks;
      const dayTicks = Array.from({ length: daysInViewMonth }, (_, index) => index + 1);
      const dayLabelTicks = dayTicks;
      const chartWidth = expenseChartWidth > 0 ? expenseChartWidth : 980;
      const chartHeight = 322;
      const paddingLeft = 86;
      const paddingRight = 144;
      const paddingTop = 16;
      const paddingBottom = 18;
      const plotWidth = Math.max(chartWidth - paddingLeft - paddingRight, 1);
      const plotHeight = Math.max(chartHeight - paddingTop - paddingBottom, 1);
      const rightRulerX = chartWidth - paddingRight;
      const getX = (day: number) =>
          daysInViewMonth <= 1
              ? paddingLeft
              : paddingLeft + (plotWidth * (day - 1)) / (daysInViewMonth - 1);
      const getY = (value: number) => {
          const safeValue = Math.min(Math.max(value, 0), yMax);
          return paddingTop + (1 - safeValue / Math.max(yMax, 1)) * plotHeight;
      };
      const formatAxisValue = (value: number) =>
          Math.abs(value) >= 100
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
              : formatCurrency(value);
      const isDarkMode = typeof document !== 'undefined'
          ? document.documentElement.classList.contains('dark')
          : true;
      const chartColors = isDarkMode
          ? {
                grid: '#1f1f23',
                gridStrong: '#27272a',
                axis: '#3f3f46',
                label: '#a1a1aa',
                rightRulerBg: 'rgba(24,24,27,0.88)',
                rightRulerBorder: 'rgba(161,161,170,0.45)',
                rightRulerText: '#e4e4e7'
            }
          : {
                grid: '#e5e7eb',
                gridStrong: '#d1d5db',
                axis: '#9ca3af',
                label: '#6b7280',
                rightRulerBg: 'rgba(255,255,255,0.94)',
                rightRulerBorder: 'rgba(113,113,122,0.3)',
                rightRulerText: '#27272a'
            };
      const chartSeriesWithTotal = chartSeries.map(series => ({
          ...series,
          total: series.points[series.points.length - 1]?.value ?? 0
      }));
      const selectedTotal = chartSeriesWithTotal.reduce((sum, series) => sum + series.total, 0);
      const selectedPaidTotal = chartSeriesWithTotal.reduce(
          (sum, series) => sum + series.points.reduce((seriesSum, point) => seriesSum + point.paid, 0),
          0
      );
      const rightRulerTotal = selectedTotal;
      const rightRulerPaid = selectedPaidTotal;
      const minRightRulerGap = 16;
      const minRightRulerY = paddingTop + 8;
      const rightSummaryReservedHeight = 52;
      const maxRightRulerY = chartHeight - paddingBottom - rightSummaryReservedHeight;
      const rightRulerCapacity = Math.max(
          1,
          Math.floor((maxRightRulerY - minRightRulerY) / minRightRulerGap) + 1
      );
      let hiddenRightRulerEntriesCount = 0;
      const rightRulerEntriesBase: Array<{
          key: string;
          value: number;
          color: string;
          y: number;
      }> = (() => {
          if (chartSeriesWithTotal.length === 0) {
              return [
                  {
                      key: 'total-selecionado-vazio',
                      value: 0,
                      color: '#a1a1aa',
                      y: getY(0)
                  }
              ];
          }

          const allEntries = chartSeriesWithTotal
              .map(series => ({
                  key: `total-${series.item.key}`,
                  value: series.total,
                  color: series.color,
                  y: getY(series.total)
              }))
              .sort((a, b) => b.value - a.value);

          if (allEntries.length > rightRulerCapacity) {
              hiddenRightRulerEntriesCount = allEntries.length - rightRulerCapacity;
              return allEntries.slice(0, rightRulerCapacity);
          }

          return allEntries;
      })();
      const rightRulerEntries = [...rightRulerEntriesBase]
          .sort((a, b) => a.y - b.y)
          .map(entry => ({ ...entry, yAdjusted: entry.y }));
      for (let index = 0; index < rightRulerEntries.length; index += 1) {
          if (index === 0) {
              rightRulerEntries[index].yAdjusted = Math.max(rightRulerEntries[index].yAdjusted, minRightRulerY);
              continue;
          }
          const previous = rightRulerEntries[index - 1];
          const current = rightRulerEntries[index];
          current.yAdjusted = Math.max(current.yAdjusted, previous.yAdjusted + minRightRulerGap);
      }
      for (let index = rightRulerEntries.length - 1; index >= 0; index -= 1) {
          if (index === rightRulerEntries.length - 1) {
              rightRulerEntries[index].yAdjusted = Math.min(rightRulerEntries[index].yAdjusted, maxRightRulerY);
              continue;
          }
          const next = rightRulerEntries[index + 1];
          const current = rightRulerEntries[index];
          current.yAdjusted = Math.min(current.yAdjusted, next.yAdjusted - minRightRulerGap);
          current.yAdjusted = Math.max(current.yAdjusted, minRightRulerY);
      }
      const shouldShowSingleCategoryLabels =
          selectedCategoryKeys.length === 1 && chartSeries.length === 1;
      const singleCategoryPointLabels = (() => {
          if (!shouldShowSingleCategoryLabels) {
              return [] as Array<{
                  day: number;
                  x: number;
                  y: number;
                  label: string;
                  bubbleX: number;
                  bubbleY: number;
                  bubbleWidth: number;
                  bubbleHeight: number;
              }>;
          }

          const series = chartSeries[0];
          const placed: Array<{
              day: number;
              x: number;
              y: number;
              label: string;
              bubbleX: number;
              bubbleY: number;
              bubbleWidth: number;
              bubbleHeight: number;
          }> = [];
          const minBubbleGap = 4;
          const topLimit = paddingTop + 2;
          const bottomLimit = chartHeight - paddingBottom - 4;
          const rightLimit = rightRulerX - 4;

          series.points.forEach(point => {
              if (point.paid <= 0) return;

              const label = formatCurrency(point.paid);
              const x = getX(point.day);
              const y = getY(point.value);
              const bubbleHeight = 16;
              const approxCharWidth = 5.2;
              const bubbleWidth = Math.max(76, label.length * approxCharWidth + 12);
              const bubbleX = Math.min(
                  Math.max(x - bubbleWidth / 2, paddingLeft + 2),
                  rightLimit - bubbleWidth
              );

              let bubbleY = y - bubbleHeight - 8;
              if (bubbleY < topLimit) {
                  bubbleY = y + 8;
              }

              let safety = 0;
              while (safety < 16) {
                  const hasOverlap = placed.some(existing => {
                      const horizontalOverlap =
                          bubbleX < existing.bubbleX + existing.bubbleWidth + minBubbleGap &&
                          bubbleX + bubbleWidth + minBubbleGap > existing.bubbleX;
                      const verticalOverlap =
                          bubbleY < existing.bubbleY + existing.bubbleHeight + minBubbleGap &&
                          bubbleY + bubbleHeight + minBubbleGap > existing.bubbleY;
                      return horizontalOverlap && verticalOverlap;
                  });
                  if (!hasOverlap) break;

                  if (bubbleY >= y) {
                      bubbleY += bubbleHeight + minBubbleGap;
                      if (bubbleY + bubbleHeight > bottomLimit) {
                          bubbleY = y - bubbleHeight - 8;
                      }
                  } else {
                      bubbleY -= bubbleHeight + minBubbleGap;
                      if (bubbleY < topLimit) {
                          bubbleY = y + 8;
                      }
                  }
                  safety += 1;
              }

              bubbleY = Math.min(Math.max(bubbleY, topLimit), bottomLimit - bubbleHeight);

              placed.push({
                  day: point.day,
                  x,
                  y,
                  label,
                  bubbleX,
                  bubbleY,
                  bubbleWidth,
                  bubbleHeight
              });
          });

          return placed;
      })();
      return (
          <section
              className="bg-white dark:bg-[#151517] rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-300 flex flex-col h-full min-h-0"
              data-tour-anchor="dashboard-spend-ranking"
          >
              <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr] items-start gap-3 mb-2">
                  <div>
                      <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <PieChart size={16} className="text-indigo-500" />
                          Onde foi parar seu dinheiro?
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isIncomeMode
                              ? `Entradas por categoria do mês (${activeMonthLabel}).`
                          : `Ranking das despesas do mês (${activeMonthLabel}).`}
                      </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 xl:pt-0.5">
                      <select
                          value={moneyFlowMode}
                          onChange={event => {
                              setMoneyFlowMode(event.target.value as MoneyFlowMode);
                              setHoveredPoint(null);
                          }}
                          className="h-9 w-[210px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 px-2 outline-none"
                      >
                          <option value="out">Saídas</option>
                          <option value="in">Entradas</option>
                      </select>
                      <select
                          value={flowAccountFilter}
                          onChange={event => setFlowAccountFilter(event.target.value)}
                          className="h-9 w-[210px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 px-2 outline-none"
                      >
                          <option value="all">Todas as contas</option>
                          {flowAccountOptions.map(option => (
                              <option key={`flow-account-${option.value}`} value={option.value}>
                                  {option.label}
                              </option>
                          ))}
                      </select>
                      <select
                          value={flowMethodFilter}
                          onChange={event => setFlowMethodFilter(event.target.value)}
                          className="h-9 w-[210px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 px-2 outline-none"
                      >
                          <option value="all">Todas as formas</option>
                          {flowMethodOptions.map(option => (
                              <option key={`flow-method-${option.value}`} value={option.value}>
                                  {option.label}
                              </option>
                          ))}
                      </select>
                      <select
                          value={flowNatureFilter}
                          onChange={event => setFlowNatureFilter(event.target.value)}
                          className="h-9 w-[210px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 px-2 outline-none"
                      >
                          <option value="all">Todas as naturezas</option>
                          {flowNatureOptions.map(option => (
                              <option key={`flow-nature-${option.value}`} value={option.value}>
                                  {option.label}
                              </option>
                          ))}
                      </select>
                  </div>
              </div>

              {activeTotalSum > 0 && categoryButtons.length > 0 ? (
                  <>
                      <div className="mt-2 flex flex-col lg:flex-row gap-2 flex-1 min-h-0">
                          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1a1a1a] p-2.5 flex-1 min-w-0 min-h-[var(--mm-dashboard-chart-min-height,332px)]">
                              <div ref={expenseChartHostRef} className="relative h-full min-h-[var(--mm-dashboard-chart-min-height,332px)]">
                              <svg
                                  width={chartWidth}
                                  height={chartHeight}
                                  className="block h-full w-full"
                                  onMouseLeave={() => setHoveredPoint(null)}
                              >
                                  {dayLabelTicks.map(day => (
                                      <line
                                          key={`day-grid-${day}`}
                                          x1={getX(day)}
                                          y1={paddingTop}
                                          x2={getX(day)}
                                          y2={chartHeight - paddingBottom}
                                          stroke={chartColors.grid}
                                          strokeWidth="1"
                                          strokeDasharray="4 6"
                                      />
                                  ))}
                                  {yTicks.map((tick, idx) => (
                                      <line
                                          key={`y-grid-${idx}`}
                                          x1={paddingLeft}
                                          y1={getY(tick)}
                                          x2={rightRulerX}
                                          y2={getY(tick)}
                                          stroke={idx === 0 ? chartColors.gridStrong : chartColors.grid}
                                          strokeWidth={idx === 0 ? '1.4' : '1'}
                                          strokeDasharray={idx === 0 ? undefined : '4 6'}
                                      />
                                  ))}

                                  <line
                                      x1={paddingLeft}
                                      y1={paddingTop}
                                      x2={paddingLeft}
                                      y2={chartHeight - paddingBottom}
                                      stroke={chartColors.axis}
                                      strokeWidth="1.3"
                                  />
                                  <line
                                      x1={paddingLeft}
                                      y1={chartHeight - paddingBottom}
                                      x2={rightRulerX}
                                      y2={chartHeight - paddingBottom}
                                      stroke={chartColors.axis}
                                      strokeWidth="1.3"
                                  />
                                  <line
                                      x1={rightRulerX}
                                      y1={paddingTop}
                                      x2={rightRulerX}
                                      y2={chartHeight - paddingBottom}
                                      stroke={chartColors.axis}
                                      strokeWidth="1.3"
                                  />
                                  <text
                                      x={rightRulerX + 10}
                                      y={paddingTop - 8}
                                      textAnchor="start"
                                      style={{ fontSize: '10px', fontWeight: 700, fill: chartColors.label }}
                                  >
                                      Total
                                  </text>

                                  {chartSeries.map(series => (
                                      <polyline
                                          key={`line-${series.item.key}`}
                                          points={series.points.map(point => `${getX(point.day)},${getY(point.value)}`).join(' ')}
                                          fill="none"
                                          stroke={series.color}
                                          strokeWidth="2.4"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                      />
                                  ))}

                                  {chartSeries.map(series =>
                                      series.points.map(point => {
                                          const shouldRenderDot = point.paid > 0 || point.day === daysInViewMonth;
                                          if (!shouldRenderDot) return null;
                                          const pointLabel = [
                                              `${series.item.category}`,
                                              `Dia ${String(point.day).padStart(2, '0')}`,
                                              `Valor do dia ${formatCurrency(point.paid)}`,
                                              `Acumulado ${formatCurrency(point.value)}`,
                                              `${point.count || 0} lanç.`
                                          ].join(' • ');
                                          return (
                                              <circle
                                                  key={`line-dot-${series.item.key}-${point.day}`}
                                                  cx={getX(point.day)}
                                                  cy={getY(point.value)}
                                                  r={point.paid > 0 ? 2.8 : 2.3}
                                                  fill={series.color}
                                                  fillOpacity={point.day === daysInViewMonth ? 1 : 0.92}
                                                  onMouseEnter={() => {
                                                      setHoveredPoint({
                                                          x: getX(point.day),
                                                          y: getY(point.value),
                                                          label: pointLabel
                                                      });
                                                  }}
                                                  onMouseLeave={() => setHoveredPoint(null)}
                                              >
                                                  <title>{pointLabel}</title>
                                              </circle>
                                          );
                                      })
                                  )}

                                  {singleCategoryPointLabels.map(item => (
                                      <g key={`single-category-label-${item.day}`}>
                                          <line
                                              x1={item.x}
                                              y1={item.y}
                                              x2={item.bubbleX + item.bubbleWidth / 2}
                                              y2={item.bubbleY + item.bubbleHeight / 2}
                                              stroke={chartColors.rightRulerBorder}
                                              strokeWidth="1"
                                              strokeDasharray="2 2"
                                          />
                                          <rect
                                              x={item.bubbleX}
                                              y={item.bubbleY}
                                              width={item.bubbleWidth}
                                              height={item.bubbleHeight}
                                              rx="6"
                                              fill={chartColors.rightRulerBg}
                                              stroke={chartColors.rightRulerBorder}
                                              strokeWidth="1"
                                          />
                                          <text
                                              x={item.bubbleX + item.bubbleWidth / 2}
                                              y={item.bubbleY + item.bubbleHeight / 2 + 3}
                                              textAnchor="middle"
                                              style={{ fontSize: '9px', fontWeight: 700, fill: chartColors.rightRulerText }}
                                          >
                                              {item.label}
                                          </text>
                                      </g>
                                  ))}

                                  {rightRulerEntries.map(entry => {
                                      const valueLabel = formatCurrency(entry.value);
                                      const dotX = rightRulerX + 8;
                                      const textX = dotX + 9;
                                      const maxBubbleWidth = chartWidth - textX - 6;
                                      const approxCharWidth = 5.3;
                                      const desiredBubbleWidth = Math.max(78, valueLabel.length * approxCharWidth + 12);
                                      const bubbleWidth = Math.min(desiredBubbleWidth, Math.max(maxBubbleWidth, 78));
                                      const bubbleHeight = 16;
                                      const bubbleY = Math.max(Math.min(entry.yAdjusted - bubbleHeight / 2, maxRightRulerY - bubbleHeight / 2), minRightRulerY - bubbleHeight / 2);
                                      const bubbleCenterY = bubbleY + bubbleHeight / 2;
                                      return (
                                          <g key={`right-ruler-total-${entry.key}`}>
                                              <line
                                                  x1={rightRulerX}
                                                  y1={entry.y}
                                                  x2={dotX}
                                                  y2={entry.y}
                                                  stroke={entry.color}
                                                  strokeWidth="1"
                                                  strokeOpacity="0.8"
                                              />
                                              {Math.abs(bubbleCenterY - entry.y) > 1 && (
                                                  <line
                                                      x1={dotX}
                                                      y1={entry.y}
                                                      x2={textX}
                                                      y2={bubbleCenterY}
                                                      stroke={chartColors.rightRulerBorder}
                                                      strokeWidth="1"
                                                      strokeDasharray="2 2"
                                                  />
                                              )}
                                              <circle cx={dotX} cy={entry.y} r={3} fill={entry.color} />
                                              <rect
                                                  x={textX}
                                                  y={bubbleY}
                                                  width={bubbleWidth}
                                                  height={bubbleHeight}
                                                  rx="6"
                                                  fill={chartColors.rightRulerBg}
                                                  stroke={chartColors.rightRulerBorder}
                                                  strokeWidth="1"
                                              />
                                              <text
                                                  x={textX + 6}
                                                  y={bubbleY + bubbleHeight / 2 + 3}
                                                  textAnchor="start"
                                                  style={{ fontSize: '9px', fontWeight: 700, fill: chartColors.rightRulerText }}
                                              >
                                                  {valueLabel}
                                              </text>
                                          </g>
                                      );
                                  })}
                                  {hiddenRightRulerEntriesCount > 0 && (
                                      (() => {
                                          const extraLabel = `+${hiddenRightRulerEntriesCount}`;
                                          const dotX = rightRulerX + 8;
                                          const textX = dotX + 9;
                                          const approxCharWidth = 5.3;
                                          const bubbleWidth = Math.max(78, extraLabel.length * approxCharWidth + 12);
                                          const bubbleHeight = 16;
                                          const bubbleY = paddingTop + 4;
                                          const bubbleCenterY = bubbleY + bubbleHeight / 2;
                                          return (
                                              <g>
                                                  <line
                                                      x1={rightRulerX}
                                                      y1={bubbleCenterY}
                                                      x2={dotX}
                                                      y2={bubbleCenterY}
                                                      stroke={chartColors.rightRulerBorder}
                                                      strokeWidth="1"
                                                      strokeOpacity="0.8"
                                                  />
                                                  <circle cx={dotX} cy={bubbleCenterY} r={3} fill={chartColors.rightRulerBorder} />
                                                  <rect
                                                      x={textX}
                                                      y={bubbleY}
                                                      width={bubbleWidth}
                                                      height={bubbleHeight}
                                                      rx="6"
                                                      fill={chartColors.rightRulerBg}
                                                      stroke={chartColors.rightRulerBorder}
                                                      strokeWidth="1"
                                                  />
                                                  <text
                                                      x={textX + bubbleWidth / 2}
                                                      y={bubbleY + bubbleHeight / 2 + 3}
                                                      textAnchor="middle"
                                                      style={{ fontSize: '9px', fontWeight: 700, fill: chartColors.rightRulerText }}
                                                  >
                                                      {extraLabel}
                                                  </text>
                                              </g>
                                          );
                                      })()
                                  )}
                                  <text
                                      x={chartWidth - 8}
                                      y={chartHeight - paddingBottom - 26}
                                      textAnchor="end"
                                      style={{ fontSize: '10px', fontWeight: 700, fill: chartColors.label }}
                                  >
                                      Total
                                  </text>
                                  <text
                                      x={chartWidth - 8}
                                      y={chartHeight - paddingBottom - 14}
                                      textAnchor="end"
                                      style={{ fontSize: '11px', fontWeight: 800, fill: '#ef4444' }}
                                  >
                                      {formatCurrency(rightRulerTotal)}
                                  </text>
                                  <text
                                      x={chartWidth - 8}
                                      y={chartHeight - paddingBottom - 2}
                                      textAnchor="end"
                                      style={{ fontSize: '10px', fontWeight: 700, fill: chartColors.label }}
                                  >
                                      {paidLabel}
                                  </text>
                                  <text
                                      x={chartWidth - 8}
                                      y={chartHeight - paddingBottom + 10}
                                      textAnchor="end"
                                      style={{ fontSize: '11px', fontWeight: 800, fill: '#10b981' }}
                                  >
                                      {formatCurrency(rightRulerPaid)}
                                  </text>

                                  {dayLabelTicks.map(day => (
                                      <text
                                          key={`day-label-${day}`}
                                          x={getX(day)}
                                          y={chartHeight - paddingBottom + 11}
                                          textAnchor="middle"
                                          style={{ fontSize: '9px', fill: chartColors.label }}
                                      >
                                          {String(day).padStart(2, '0')}
                                      </text>
                                  ))}
                                  {yTicks.map((tick, idx) => (
                                      <text
                                          key={`y-label-${idx}`}
                                          x={paddingLeft - 10}
                                          y={getY(tick) + 4}
                                          textAnchor="end"
                                          style={{ fontSize: '11px', fill: chartColors.label }}
                                      >
                                          {formatAxisValue(tick)}
                                      </text>
                                  ))}
                              </svg>
                              {hoveredPoint && (
                                  <div
                                      className="pointer-events-none absolute z-10 px-2 py-1 rounded-md border border-zinc-300/70 dark:border-zinc-700/70 bg-white/95 dark:bg-zinc-950/95 text-[10px] font-semibold text-zinc-700 dark:text-zinc-100 whitespace-nowrap shadow-sm"
                                      style={{
                                          left: hoveredPoint.x,
                                          top: hoveredPoint.y - 8,
                                          transform: 'translate(-50%, -100%)'
                                      }}
                                  >
                                      {hoveredPoint.label}
                                  </div>
                              )}
                              </div>
                          </div>

                          <aside className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/35 p-3 lg:w-[420px] lg:shrink-0 flex flex-col">
                              <div className="grid grid-cols-3 gap-1.5 pr-1">
                              {categoryButtons.map((item, index) => {
                                  const accent =
                                      item.category === 'Outros'
                                          ? '#94a3b8'
                                          : CATEGORY_TREND_COLORS[index % CATEGORY_TREND_COLORS.length];
                                  const isActive = selectedCategoryKeys.includes(item.key);
                                  return (
                                      <button
                                          key={`category-filter-${item.key}`}
                                          type="button"
                                          onClick={() => {
                                              setHoveredPoint(null);
                                              setSelectedCategoryKeys(prev => {
                                                  if (prev.includes(item.key)) return prev.filter(key => key !== item.key);
                                                  return [...prev, item.key];
                                              });
                                          }}
                                          className="h-8 rounded-md border text-[10px] font-semibold px-2 transition flex items-center gap-2 min-w-0"
                                          style={{
                                              borderColor: isDarkMode ? '#3f3f46' : '#3f3f46',
                                              backgroundColor: isActive ? '#111113' : '#09090b',
                                              color: '#f4f4f5'
                                          }}
                                          title={item.category}
                                      >
                                          <span
                                              className="h-3.5 w-3.5 rounded-[4px] border shrink-0"
                                              style={{
                                                  borderColor: withAlpha(accent, 0.9),
                                                  backgroundColor: isActive ? withAlpha(accent, 0.92) : 'transparent',
                                                  boxShadow: isActive ? `0 0 0 1px ${withAlpha(accent, 0.35)} inset` : undefined
                                              }}
                                          />
                                          <span className="truncate">{item.category}</span>
                                      </button>
                                  );
                              })}
                              </div>
                              <button
                                  type="button"
                                  onClick={() => {
                                      setSelectedCategoryKeys(prev => (prev.length > 0 ? [] : allCategoryKeys));
                                      setHoveredPoint(null);
                                  }}
                                  className="mt-2 h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-[10px] font-semibold hover:bg-zinc-800 transition"
                                  disabled={allCategoryKeys.length === 0}
                              >
                                  {hasAnyCategorySelected ? 'Limpar seleção' : 'Selecionar todos'}
                              </button>
                          </aside>
                      </div>
                  </>
              ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                      <PieChart size={40} className="mb-3 opacity-20" />
                      <p className="text-sm text-center">
                          {isIncomeMode
                              ? 'Nenhuma entrada recebida encontrada no mês.'
                              : 'Nenhuma despesa paga encontrada no mês.'}
                      </p>
                      {fallbackMode && (
                          <button
                              type="button"
                              onClick={() => {
                                  setMoneyFlowMode(fallbackMode);
                                  setHoveredPoint(null);
                              }}
                              className="mt-3 h-8 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800 transition"
                          >
                              {fallbackMode === 'in' ? 'Ver Entradas' : 'Ver Saídas'}
                          </button>
                      )}
                  </div>
              )}
          </section>
      );
  };

  const renderDashboardBlock = (blockId: DashboardBlockId) => {
      if (blockId === 'quick_access' && availableBlocks.quick_access) {
          return (
                    <SortableBlock
                        key={blockId}
                        id="quick_access"
                        label={blockLabels.quick_access}
                        disabled={layoutLoading}
                        style={{ order: orderMap.quick_access }}
                        isCollapsed={Boolean(collapsedBlocks.quick_access)}
                        onToggleCollapse={() => toggleCollapse('quick_access')}
                    >
                  <section>
                      <div
                          className="bg-white dark:bg-[#151517] rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm"
                          data-tour-anchor="dashboard-quick-actions"
                      >
                          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Acesso Rápido</h2>
                          <div className="grid grid-flow-col auto-cols-fr gap-3">
                              {quickActionItems.map((action) => (
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
          );
      }

      if (blockId === 'mei_limit' && canViewMeiLimit) {
          return (
                    <SortableBlock
                        key={blockId}
                        id="mei_limit"
                        label={blockLabels.mei_limit}
                        disabled={layoutLoading}
                        style={{ order: orderMap.mei_limit }}
                    >
                  <section>
                      <div
                          className={`bg-white dark:bg-[#151517] rounded-2xl p-4 border ${meiStatus.level === 'over' ? 'border-red-200 dark:border-red-900/40' : meiStatus.level === 'critical' ? 'border-orange-200 dark:border-orange-900/40' : meiStatus.level === 'attention' ? 'border-amber-200 dark:border-amber-900/40' : 'border-zinc-200 dark:border-zinc-800'} shadow-sm relative overflow-hidden transition-colors duration-300`}
                          data-tour-anchor="dashboard-mei-limit"
                      >
                          <div className="relative flex flex-col gap-3">
                              <div className="flex flex-col xl:flex-row gap-3 xl:items-start">
                                  <div className="flex flex-1 items-start gap-3">
                                      <div
                                          className={`relative w-16 h-16 rounded-2xl border ${mascotConfig.ringClass} flex items-center justify-center shadow-xl ${mascotConfig.auraClass} transition-all duration-500`}
                                          title={mascotConfig.tooltip}
                                      >
                                          <mascotConfig.icon size={28} className={`${mascotConfig.faceClass}`} />
                                      </div>
                                      <div>
                                          <div className="flex items-center gap-2 mb-1.5">
                                              <div className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                                  <Building2 size={16} />
                                              </div>
                                              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Faturamento Fiscal MEI (PJ)</h3>
                                          </div>
                                          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
                                              Visão completa do limite fiscal com comparativo anual e mensal simultâneo.
                                          </p>
                                          <div className={`mt-2 text-xs font-semibold ${meiStatus.accentText}`}>
                                              {meiStatus.label}
                                          </div>
                                      </div>
                                  </div>
                                  <div className={`w-full xl:w-80 rounded-2xl border ${meiStatus.calloutBorder} ${meiStatus.calloutBg} p-3 flex gap-2`}>
                                      {React.createElement(calloutIcon, { size: 24, className: `${meiStatus.accentText} shrink-0` })}
                                      <p className={`text-xs leading-relaxed ${meiStatus.calloutText}`}>
                                          {statusCalloutText}
                                      </p>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 xl:gap-3">
                                  {meiSnapshots.map((snapshot) => (
                                      <article key={snapshot.id} className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-2.5 xl:p-3">
                                          <div className="flex items-start justify-between gap-3">
                                              <div>
                                                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                                      {snapshot.title}
                                                  </p>
                                                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1">
                                                      {snapshot.statusDescription}
                                                  </p>
                                              </div>
                                              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${snapshot.status.badgeClass}`}>
                                                  {snapshot.status.label}
                                              </span>
                                          </div>

                                          <div className="relative mt-3 xl:mt-4 pt-5 xl:pt-6">
                                              <div className="relative h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                                  <div
                                                      className={`absolute inset-y-0 left-0 bg-gradient-to-r ${snapshot.status.gradient} transition-all duration-700 ease-out`}
                                                      style={{ width: `${snapshot.progressVisualPercentage}%` }}
                                                  ></div>
                                              </div>
                                              <div
                                                  className="absolute -top-1 flex flex-col items-center transition-all duration-500"
                                                  style={{ left: `${snapshot.progressLabelLeft}%`, transform: 'translateX(-50%)' }}
                                              >
                                                  <div className="rounded-full border border-white/40 bg-white/95 px-3 py-1 text-[11px] font-bold text-zinc-900 shadow-lg">
                                                      {snapshot.rawPercentage.toFixed(1)}%
                                                  </div>
                                                  <div className="h-2 w-2 -mt-1 rotate-45 border border-white/40 bg-white/95 shadow-md"></div>
                                                  <div className={`-mt-2 h-2 w-2 rounded-full bg-gradient-to-r ${snapshot.status.gradient}`} />
                                              </div>
                                          </div>

                                          <div className="mt-4 xl:mt-5 grid grid-cols-3 gap-1.5 xl:gap-2">
                                              <div className="p-2 xl:p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#101014]">
                                                  <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">
                                                      Faturado {snapshot.scopeLabel === 'anual' ? 'no ano' : 'no mês'}
                                                  </p>
                                                  <p className="text-[13px] xl:text-sm font-semibold text-zinc-900 dark:text-white mt-1">
                                                      {formatCurrency(snapshot.revenue)}
                                                  </p>
                                              </div>
                                              <div className="p-2 xl:p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#101014]">
                                                  <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">
                                                      {snapshot.status.level === 'over' ? 'Excedente' : 'Restante'}
                                                  </p>
                                                  <p className={`text-[13px] xl:text-sm font-semibold mt-1 ${snapshot.status.level === 'over' ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                                      {formatCurrency(snapshot.status.level === 'over' ? snapshot.excess : snapshot.remaining)}
                                                  </p>
                                              </div>
                                              <div className="p-2 xl:p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#101014]">
                                                  <p className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">
                                                      Limite {snapshot.scopeLabel}
                                                  </p>
                                                  <p className="text-[13px] xl:text-sm font-semibold text-zinc-900 dark:text-white mt-1">
                                                      {formatCurrency(snapshot.limit)}
                                                  </p>
                                              </div>
                                          </div>
                                      </article>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </section>
              </SortableBlock>
          );
      }

      if (blockId === 'financial_xray' && availableBlocks.financial_xray) {
          return null;
      }

      if (blockId === 'credit_cards' && canViewInvoices) {
          return (
            <SortableBlock
                key={blockId}
                id="credit_cards"
                label={blockLabels.credit_cards}
                disabled={layoutLoading}
                style={{ order: orderMap.credit_cards }}
                isCollapsed={false}
                onToggleCollapse={
                    canExpandCreditCards ? () => setExpandedPanel('credit_cards') : undefined
                }
                renderCollapsedChildren
            >
                  {renderCreditCardsSection(visibleCreditCards, 'compact')}
          </SortableBlock>
          );
      }

      if (blockId === 'expense_breakdown' && canManageExpenses) {
          return (
            <SortableBlock
                key={blockId}
                id="expense_breakdown"
                label={blockLabels.expense_breakdown}
                disabled={layoutLoading}
                style={{ order: orderMap.expense_breakdown, flex: 1, minHeight: 0 }}
            >
                  {renderExpenseBreakdownSection(categoryTotals.displayItems)}
          </SortableBlock>
          );
      }

      return null;
  };

  const healthBar = (
      <div>
          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.24em] text-slate-400">
              <span>Saúde da empresa</span>
              <span className="text-slate-500">{Math.round(healthScore * 100)}%</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500">
              <div
                  className="absolute top-1/2"
                  style={{ left: `${healthScore * 100}%`, transform: 'translate(-50%, -50%)' }}
              >
                  <div
                      className="h-3 w-3 rounded-full border border-white/80 shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
                      style={{ backgroundColor: healthScore >= 0.5 ? incomeAccent : expenseAccent }}
                  />
              </div>
          </div>
      </div>
  );

  const dashboardSubheader = (
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 relative z-10 pt-6">
          <div
              className="mm-subheader mm-subheader-panel"
              data-tour-anchor="dashboard-summary"
          >
              <div className="space-y-2">
                  <div className="relative" ref={searchContainerRef}>
                      <SearchHelperBar
                          variant="desktop"
                          appearance="subheader"
                          searchQuery={searchQuery}
                          setSearchQuery={setSearchQuery}
                          setActiveSearchIndex={setActiveSearchIndex}
                          setIsSearchActive={setIsSearchActive}
                          onSearchKeyDown={handleSearchKeyDown}
                          signals={helperSignals}
                          actions={helperActions}
                          tipsEnabled={tipsEnabled}
                          assistantPlacement="floating"
                          assistantHidden={assistantHidden}
                          onAssistantClose={onCloseAssistant}
                          results={
                              Boolean(trimmedSearchQuery) && isSearchActive ? (
                                  <div className="absolute left-0 right-0 mt-3 bg-[#111114] border border-white/10 rounded-2xl shadow-2xl max-h-80 overflow-y-auto z-20">
                                      {visibleInlineResults.length === 0 ? (
                                          <div className="text-sm text-zinc-500 px-6 py-4">Nenhum resultado encontrado.</div>
                                      ) : (
                                          <ul>
                                              {visibleInlineResults.map((item, idx) => {
                                                  const isActive = idx === activeSearchIndex;
                                                  const statusMeta = getInlineExpenseStatusMeta(item);
                                                  return (
                                                      <li
                                                          key={`${item.entity}-${item.id}`}
                                                          className={`px-6 py-4 border-b border-white/5 cursor-pointer ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                                          onMouseEnter={() => setActiveSearchIndex(idx)}
                                                          onClick={() => handleSelectSearchResult(item)}
                                                      >
                                                          <div className="flex items-center justify-between gap-3">
                                                              <div>
                                                                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                                                                      {item.entity === 'expense' && <span className="text-rose-400 text-[10px] uppercase">Despesa</span>}
                                                                      {item.entity === 'income' && <span className="text-emerald-400 text-[10px] uppercase">Entrada</span>}
                                                                      {item.entity === 'account' && <span className="text-blue-400 text-[10px] uppercase">Conta</span>}
                                                                      {item.entity === 'card' && <span className="text-purple-400 text-[10px] uppercase">Cartão</span>}
                                                                      {item.entity === 'category' && <span className="text-zinc-400 text-[10px] uppercase">Categoria</span>}
                                                                      <span>{item.title}</span>
                                                                  </p>
                                                                  {item.subtitle && <p className="text-xs text-zinc-500">{item.subtitle}</p>}
                                                              </div>
                                                              <div className="text-right">
                                                                  {statusMeta && (
                                                                      <p className={`text-[11px] font-semibold flex items-center justify-end gap-1 ${statusMeta.textClass}`}>
                                                                          <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                                                                          {statusMeta.label}
                                                                      </p>
                                                                  )}
                                                                  {typeof item.amount === 'number' && (
                                                                      <p className="text-sm font-bold text-white">
                                                                          {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                      </p>
                                                                  )}
                                                                  {item.entity === 'expense' ? (
                                                                      item.dateLabel ? (
                                                                          <p className="text-[11px] text-zinc-500">
                                                                              {new Date(item.dateLabel + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                                          </p>
                                                                      ) : (
                                                                          <p className="text-[11px] text-zinc-500">Sem vencimento</p>
                                                                      )
                                                                  ) : (
                                                                      item.dateLabel && (
                                                                          <p className="text-[11px] text-zinc-500">
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {canViewBalances ? (
                          <div className="mm-subheader-metric-card">
                              <div className="mm-subheader-metric-label text-emerald-500 dark:text-emerald-400">
                                  {balancePeriodLabel}
                              </div>
                              <div className="mm-subheader-metric-value text-emerald-600 dark:text-emerald-400">
                                  R$ {financialData.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                          </div>
                      ) : (
                          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
                              <div className="mm-subheader-metric-label text-zinc-400">
                                  {balancePeriodLabel}
                              </div>
                              <div className="mm-subheader-metric-value text-zinc-500">
                                  Saldo oculto
                              </div>
                          </div>
                      )}
                      {canManageIncomes && (
                          <div className="mm-subheader-metric-card">
                              <div className="mm-subheader-metric-label text-emerald-500 dark:text-emerald-400">
                                  Entradas do mês
                              </div>
                              <div className="mm-subheader-metric-value text-emerald-600 dark:text-emerald-400">
                                  R$ {financialData.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                          </div>
                      )}
                      {canManageExpenses && (
                          <div className="mm-subheader-metric-card">
                              <div className="mm-subheader-metric-label" style={{ color: expenseAccent }}>
                                  Saídas do mês
                              </div>
                              <div className="mm-subheader-metric-value" style={{ color: expenseAccent }}>
                                  R$ {financialData.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                          </div>
                      )}
                  </div>
                  {healthBar}
              </div>
          </div>
      </div>
  );

  const renderDockSheet = (title: string, content: React.ReactNode) => (
      <div className="fixed inset-0 z-[80] overflow-x-hidden">
          <button
              type="button"
              className="absolute inset-0 bg-transparent"
              onClick={() => setExpandedPanel(null)}
              aria-label="Fechar painel"
          />
          <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                  bottom: 'var(--mm-dock-height, var(--mm-desktop-dock-height, 84px))',
                  width: 'min(var(--mm-desktop-dock-width, calc(100% - 48px)), calc(100% - 24px))',
                  maxWidth: 'min(var(--mm-desktop-dock-width, calc(100% - 48px)), calc(100% - 24px))'
              }}
          >
              <div className="w-full rounded-[26px] border border-black/10 dark:border-white/20 bg-white/80 dark:bg-white/5 shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl overflow-hidden">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                      <button
                          type="button"
                          onClick={() => setExpandedPanel(null)}
                          className="h-8 w-8 rounded-full border border-white/20 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center"
                          aria-label="Fechar painel"
                      >
                          <X size={14} />
                      </button>
                  </div>
                  <div
                      className="overflow-y-auto overflow-x-hidden px-5 pb-4 pt-3"
                      style={{
                          maxHeight: 'min(80vh, max(260px, calc(var(--mm-content-available-height, 720px) - 24px)))'
                      }}
                  >
                      {content}
                  </div>
              </div>
          </div>
      </div>
  );

  const contentSpacingClass = isCompactHeight ? 'mt-[var(--mm-content-gap)]' : 'mt-[var(--mm-content-gap)]';

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 flex flex-col">
        {dashboardSubheader}
        <main
            className={`max-w-7xl mx-auto w-full px-4 sm:px-6 ${contentSpacingClass} flex-1 min-h-0`}
        >
            <div className="dashboard-desktop flex h-full min-h-0 flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
                        <div className="flex h-full min-h-0 flex-col gap-3">
                            {visibleOrder.map((blockId) => renderDashboardBlock(blockId))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </main>
        {expandedPanel === 'credit_cards' &&
            renderDockSheet('Faturas dos Cartões', renderCreditCardsSection(creditCards, 'expanded'))}
        {expandedPanel === 'expense_breakdown' &&
            renderDockSheet('Onde foi parar seu dinheiro?', renderExpenseBreakdownSection(categoryTotals.items))}
    </div>
  );
};

type SortableBlockProps = {
    id: DashboardBlockId;
    label: string;
    disabled: boolean;
    style?: React.CSSProperties;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    renderCollapsedChildren?: boolean;
    children: React.ReactNode;
};

const SortableBlock: React.FC<SortableBlockProps> = ({
    id,
    label,
    disabled,
    style,
    isCollapsed,
    onToggleCollapse,
    renderCollapsedChildren = false,
    children
}) => {
    const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id, disabled });
    const mergedStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...style
    };
    const collapsed = Boolean(isCollapsed);
    const toggleLabel = collapsed ? `Expandir ${label}` : `Recolher ${label}`;

    return (
        <div
            ref={setNodeRef}
            style={mergedStyle}
            data-dashboard-block={id}
            className="relative"
        >
            <div className="absolute -left-3 top-6 z-10">
                <button
                    type="button"
                    disabled={disabled}
                    {...attributes}
                    {...listeners}
                    className="flex h-8 w-6 items-center justify-center rounded-r-xl border border-zinc-200 bg-white text-zinc-400 shadow-sm hover:text-zinc-600 dark:border-zinc-800 dark:bg-[#151517] dark:hover:text-zinc-200"
                    aria-label={`Organizar ${label}`}
                    title="Arrastar para reorganizar"
                >
                    <GripVertical size={16} />
                </button>
            </div>
            {onToggleCollapse && (
                <div className="absolute -right-3 -top-3 z-10">
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        aria-label={toggleLabel}
                        title={collapsed ? 'Expandir bloco' : 'Recolher bloco'}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 text-white shadow-md transition hover:bg-indigo-500 hover:border-indigo-300 dark:border-indigo-400/40 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                    >
                        <ChevronDown size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            )}
            {collapsed && !renderCollapsedChildren && onToggleCollapse ? (
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-5 py-4 shadow-sm text-left hover:border-indigo-200 dark:hover:border-indigo-600/50 transition"
                    aria-label={toggleLabel}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-wider text-zinc-400">Recolhido</p>
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{label}</p>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Clique para expandir</span>
                    </div>
                </button>
            ) : (
                children
            )}
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
}> = ({ icon, label, color, bg, border, tipTitle, tipBody, onClick }) => (
    <div className="relative h-full overflow-visible">
        <button 
            onClick={onClick}
            className={`flex h-full w-full flex-col items-center justify-center p-4 rounded-xl border bg-white dark:bg-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#202022] transition-all group active:scale-95 ${border} shadow-sm dark:shadow-none`}
        >
            <div className={`p-3 rounded-full mb-3 ${bg} ${color} group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white text-center">{label}</span>
        </button>
    </div>
);

const SummaryCard: React.FC<{ 
    title: string, 
    value: number, 
    icon: React.ReactNode, 
    colorClass: string,
    bgClass: string,
    subtext?: string,
    isExpense?: boolean
}> = ({ title, value, icon, colorClass, bgClass, subtext, isExpense }) => (
    <div className={`${bgClass} rounded-2xl p-3 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-sm transition-all duration-300 hover:border-zinc-300 dark:hover:border-zinc-700`}>
        <div className="flex justify-between items-start mb-2">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
                {icon}
            </div>
            {subtext && (
                 <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-2 py-0.5 rounded">
                    Mês Atual
                 </span>
            )}
        </div>
        <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-0.5">{title}</p>
            {/* Standardized Font Size: text-3xl */}
            <h3 className={`text-3xl font-bold tracking-tight mb-1 ${colorClass}`}>
                {isExpense ? '-' : '+'} R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            {subtext && (
                <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                    <Calendar size={12} />
                    {subtext}
                </p>
            )}
        </div>
    </div>
);

export default DashboardDesktop;
