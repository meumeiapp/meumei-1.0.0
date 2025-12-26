
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
  ChevronRight,
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
  Lock,
  Search,
  Download
} from 'lucide-react';
import { CreditCard as CreditCardType, Expense, Income, Account } from '../types';
import { getCreditCardInvoiceTotalForMonth } from '../services/invoiceUtils';
import { getCardGradient, withAlpha, getBrandIcon } from '../services/cardColorUtils';
import { useGlobalActions, EntityType } from '../contexts/GlobalActionsContext';

interface FinancialData {
    balance: number;
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

type CategoryTrendPoint = {
  label: string;
  values: Record<string, number>;
};

type TrendTooltipEntry = {
  category: string;
  value: number;
  color: string;
};

type CategoryTrendMode = 'monthly' | 'accumulated';

interface CategoryTrendTooltipEntry {
  category: string;
  mes: string;
  valor: number;
  variacaoVsMesAnterior: number;
  tendencia: 'alta' | 'queda' | 'estavel';
}

interface CategoryTrendSummary {
  months: string[];
  order: string[];
  monthlySeries: Record<string, number[]>;
  accumulatedSeries: Record<string, number[]>;
  variations: Record<string, number[]>;
  stats: Record<string, { maiorGasto: number; mediaMensal: number; aumentoOuQueda: 'subiu' | 'caiu' | 'estavel' }>;
  insights: string[];
  highlights: {
    categoryMaisPesada?: string;
    maiorCrescimento?: string;
    maiorQueda?: string;
  };
  tooltip: Record<string, CategoryTrendTooltipEntry[]>;
  forecasts: Record<string, number>;
}

const CATEGORY_TREND_COLORS = ['#a855f7', '#38bdf8', '#f97316', '#22c55e', '#ec4899', '#facc15', '#0ea5e9', '#f472b6', '#94a3b8', '#fb923c'];
const CATEGORY_TREND_LIMIT = 10;

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
  if (item.status === 'paid') {
      return { label: 'Paga', textClass: 'text-emerald-400', dotClass: 'bg-emerald-400' };
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

const formatMonthLabel = (date: Date) =>
  `${date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(date.getFullYear()).slice(-2)}`;

const buildCategoryTrendSummary = (
  expenses: Expense[],
  companyStart: Date | null,
  viewDate: Date
): CategoryTrendSummary => {
  const endMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  endMonth.setHours(0, 0, 0, 0);

  let startMonth = companyStart ? new Date(companyStart) : new Date(endMonth);
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  if (startMonth > endMonth) {
      startMonth = new Date(endMonth);
  }

  const months: Date[] = [];
  const labels: string[] = [];
  const monthIndexByKey = new Map<string, number>();
  const pointer = new Date(startMonth);

  while (pointer.getTime() <= endMonth.getTime()) {
      const monthKey = `${pointer.getFullYear()}-${pointer.getMonth()}`;
      monthIndexByKey.set(monthKey, months.length);
      months.push(new Date(pointer));
      labels.push(formatMonthLabel(pointer));
      pointer.setMonth(pointer.getMonth() + 1);
  }

  if (months.length === 0) {
      months.push(new Date(endMonth));
      labels.push(formatMonthLabel(endMonth));
      monthIndexByKey.set(`${endMonth.getFullYear()}-${endMonth.getMonth()}`, 0);
  }

  const totalsByCategory = new Map<string, number[]>();

  expenses.forEach(expense => {
      if (!expense.category) return;
      const dateReference = expense.date || expense.dueDate;
      if (!dateReference) return;
      const expenseDate = new Date(`${dateReference}T12:00:00`);
      if (Number.isNaN(expenseDate.getTime())) return;
      expenseDate.setDate(1);
      const key = `${expenseDate.getFullYear()}-${expenseDate.getMonth()}`;
      const index = monthIndexByKey.get(key);
      if (index === undefined) return;

      if (!totalsByCategory.has(expense.category)) {
          totalsByCategory.set(expense.category, Array(months.length).fill(0));
      }
      const series = totalsByCategory.get(expense.category)!;
      series[index] += expense.amount;
  });

  const orderedEntries = Array.from(totalsByCategory.entries())
      .filter(([, series]) => series.some(value => value !== 0))
      .sort((a, b) => b[1].reduce((sum, value) => sum + value, 0) - a[1].reduce((sum, value) => sum + value, 0))
      .slice(0, CATEGORY_TREND_LIMIT);

  const monthlySeries: Record<string, number[]> = {};
  const accumulatedSeries: Record<string, number[]> = {};
  const variations: Record<string, number[]> = {};
  const tooltip: Record<string, CategoryTrendTooltipEntry[]> = {};
  const forecasts: Record<string, number> = {};
  const stats: Record<string, { maiorGasto: number; mediaMensal: number; aumentoOuQueda: 'subiu' | 'caiu' | 'estavel' }> = {};
  const insights: string[] = [];

  let categoryMaisPesada: string | undefined;
  let maiorCrescimento: string | undefined;
  let maiorQueda: string | undefined;
  let maiorValorAtual = -Infinity;
  let maiorVariacao = -Infinity;
  let menorVariacao = Infinity;

  orderedEntries.forEach(([category, series]) => {
      monthlySeries[category] = series.map(value => Number(value.toFixed(2)));
      accumulatedSeries[category] = series.reduce<number[]>((acc, value, idx) => {
          const nextValue = (acc[idx - 1] || 0) + value;
          acc[idx] = Number(nextValue.toFixed(2));
          return acc;
      }, []);

      const variationSeries = series.map((value, idx) => {
          if (idx === 0) return 0;
          const prev = series[idx - 1];
          if (prev === 0) {
              return value === 0 ? 0 : 1;
          }
          return Number(((value - prev) / prev).toFixed(4));
      });
      variations[category] = variationSeries;

      tooltip[category] = series.map((value, idx) => {
          const delta = variationSeries[idx] || 0;
          const tendencia: 'alta' | 'queda' | 'estavel' =
              delta > 0.05 ? 'alta' : delta < -0.05 ? 'queda' : 'estavel';
          return {
              category,
              mes: labels[idx],
              valor: Number(value.toFixed(2)),
              variacaoVsMesAnterior: delta,
              tendencia
          };
      });

      const lastValue = series[series.length - 1];
      if (lastValue > maiorValorAtual) {
          maiorValorAtual = lastValue;
          categoryMaisPesada = category;
      }

      const lastVariation = variationSeries[variationSeries.length - 1] || 0;
      if (lastVariation > maiorVariacao) {
          maiorVariacao = lastVariation;
          maiorCrescimento = category;
      }
      if (lastVariation < menorVariacao) {
          menorVariacao = lastVariation;
          maiorQueda = category;
      }

      const maiorGasto = Math.max(...series);
      const mediaMensal = series.reduce((acc, value) => acc + value, 0) / series.length;
      const movimento: 'subiu' | 'caiu' | 'estavel' =
          lastVariation > 0.05 ? 'subiu' : lastVariation < -0.05 ? 'caiu' : 'estavel';
      stats[category] = {
          maiorGasto: Number(maiorGasto.toFixed(2)),
          mediaMensal: Number(mediaMensal.toFixed(2)),
          aumentoOuQueda: movimento
      };

      if (lastVariation >= 0.15) {
          insights.push(`${category} cresceu ${(lastVariation * 100).toFixed(1)}% em relação ao mês anterior.`);
      } else if (lastVariation <= -0.15) {
          insights.push(`${category} caiu ${(Math.abs(lastVariation) * 100).toFixed(1)}% em relação ao mês anterior.`);
      }
      if (lastValue === Math.max(...series) && lastValue > 0) {
          insights.push(`${category} atingiu o maior gasto de todo o período.`);
      }

      const validVariations = variationSeries.slice(1).filter(v => Number.isFinite(v) && v !== 0);
      const avgVariation = validVariations.length
          ? validVariations.reduce((acc, curr) => acc + curr, 0) / validVariations.length
          : 0;
      forecasts[category] = Number((lastValue * (1 + avgVariation)).toFixed(2));
  });

  const uniqueInsights = Array.from(new Set(insights));

  return {
      months: labels,
      order: orderedEntries.map(([category]) => category),
      monthlySeries,
      accumulatedSeries,
      variations,
      stats,
      insights: uniqueInsights,
      highlights: {
          categoryMaisPesada,
          maiorCrescimento,
          maiorQueda
      },
      tooltip,
      forecasts
  };
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
  financialData: FinancialData;
  creditCards: CreditCardType[];
  expenseBreakdown?: ExpenseBreakdown;
  expenses: Expense[];
  incomes: Income[];
  accounts: Account[];
  viewDate: Date;
  minDate?: string;
  onOpenInstall: () => void;
  isAppInstalled?: boolean;
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

const DashboardMobileV2: React.FC<DashboardProps> = ({ 
    onOpenAccounts, 
    onOpenVariableExpenses,
    onOpenFixedExpenses,
    onOpenPersonalExpenses,
    onOpenIncomes,
    onOpenYields,
    onOpenInvoices,
    onOpenReports,
    financialData,
    creditCards,
    expenseBreakdown = { fixed: 0, variable: 0, personal: 0 },
    expenses,
    incomes,
    accounts,
    viewDate,
    minDate,
    onOpenInstall,
    isAppInstalled
}) => {
  
  const canViewBalances = true;
  const canViewMeiLimit = true;
  const canViewInvoices = true;
  const canViewReports = true;
  const canManageIncomes = true;
  const canManageExpenses = true;
  const [trendTooltip, setTrendTooltip] = useState<{ x: number; label: string; entries: TrendTooltipEntry[] } | null>(null);
  const [categoryTrendMode, setCategoryTrendMode] = useState<CategoryTrendMode>('monthly');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isMeiDetailsOpen, setIsMeiDetailsOpen] = useState(false);
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

  const companyStartMonth = useMemo(() => {
      if (!minDate) return null;
      const base = new Date(`${minDate}T12:00:00`);
      if (Number.isNaN(base.getTime())) return null;
      base.setDate(1);
      base.setHours(0, 0, 0, 0);
      return base;
  }, [minDate]);

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

  const categoryPie = useMemo(() => {
      const totals = new Map<string, number>();
      expenses.forEach(expense => {
          if (!expense.category) return;
          const date = new Date(`${expense.date}T12:00:00`);
          if (Number.isNaN(date.getTime())) return;
          if (date.getFullYear() !== viewDate.getFullYear() || date.getMonth() !== viewDate.getMonth()) return;
          totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
      });

      const sorted = Array.from(totals.entries())
          .filter(([, value]) => value > 0)
          .sort((a, b) => b[1] - a[1]);

      const top = sorted.slice(0, 5);
      const remainingTotal = sorted.slice(5).reduce((acc, [, value]) => acc + value, 0);
      const data = top.map(([category, value], index) => ({
          category,
          value,
          color: CATEGORY_TREND_COLORS[index % CATEGORY_TREND_COLORS.length]
      }));

      if (remainingTotal > 0) {
          data.push({
              category: 'Outros',
              value: remainingTotal,
              color: CATEGORY_TREND_COLORS[data.length % CATEGORY_TREND_COLORS.length]
          });
      }

      const total = data.reduce((acc, item) => acc + item.value, 0);
      return { data, total };
  }, [expenses, viewDate]);

  const categoryPieGradient = useMemo(() => {
      if (categoryPie.total <= 0 || categoryPie.data.length === 0) {
          return 'conic-gradient(#e5e7eb 0% 100%)';
      }
      let start = 0;
      const segments = categoryPie.data.map(item => {
          const pct = item.value / categoryPie.total;
          const end = start + pct;
          const segment = `${item.color} ${start * 100}% ${end * 100}%`;
          start = end;
          return segment;
      });
      return `conic-gradient(${segments.join(', ')})`;
  }, [categoryPie]);

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

  
  // --- Category Visualization (LINE CHART LOGIC) ---
  const { navigateToResult } = useGlobalActions();

  const categoryTrendSummary = useMemo(
      () => buildCategoryTrendSummary(expenses, companyStartMonth, viewDate),
      [expenses, companyStartMonth, viewDate]
  );

  const selectedTrendSeries = useMemo(
      () => (categoryTrendMode === 'monthly' ? categoryTrendSummary.monthlySeries : categoryTrendSummary.accumulatedSeries),
      [categoryTrendMode, categoryTrendSummary]
  );

  const trendCategoryNames = useMemo(() => categoryTrendSummary.order, [categoryTrendSummary]);

  useEffect(() => {
      setHiddenCategories((prev) => {
          const next = new Set<string>();
          trendCategoryNames.forEach((name) => {
              if (prev.has(name)) {
                  next.add(name);
              }
          });
          return next;
      });
  }, [trendCategoryNames]);

  const categoryTrendPoints = useMemo<CategoryTrendPoint[]>(() => {
      if (categoryTrendSummary.months.length === 0 || trendCategoryNames.length === 0) return [];
      return categoryTrendSummary.months.map((label, index) => {
          const values: Record<string, number> = {};
          trendCategoryNames.forEach(category => {
              values[category] = selectedTrendSeries[category]?.[index] ?? 0;
          });
          return { label, values };
      });
  }, [categoryTrendSummary, selectedTrendSeries, trendCategoryNames]);

  const categoryTrendColors = useMemo(() => {
      const colorMap: Record<string, string> = {};
      trendCategoryNames.forEach((category, index) => {
          colorMap[category] = CATEGORY_TREND_COLORS[index % CATEGORY_TREND_COLORS.length];
      });
      return colorMap;
  }, [trendCategoryNames]);
  const heavyCategoryForecast = categoryTrendSummary.highlights.categoryMaisPesada
      ? categoryTrendSummary.forecasts[categoryTrendSummary.highlights.categoryMaisPesada]
      : undefined;

  const toggleCategoryVisibility = (category: string) => {
      setHiddenCategories((prev) => {
          const next = new Set(prev);
          if (next.has(category)) {
              next.delete(category);
          } else {
              next.add(category);
          }
          return next;
      });
  };

  const renderCategoryTrendChart = () => {
      if (categoryTrendPoints.length === 0 || trendCategoryNames.length === 0) return null;

      const width = 900;
      const height = 260;
      const leftPadding = 60;
      const rightPadding = 24;
      const topPadding = 30;
      const bottomPadding = 40;
      const usableWidth = width - leftPadding - rightPadding;
      const usableHeight = height - topPadding - bottomPadding;
      const allValues = categoryTrendPoints.flatMap(point => trendCategoryNames.map(category => point.values[category] ?? 0));
      const maxValue = Math.max(...allValues, 0);
      const valueRange = maxValue <= 0 ? 1 : maxValue;

      const getX = (index: number) => {
          if (categoryTrendPoints.length <= 1) return leftPadding + usableWidth / 2;
          return leftPadding + (usableWidth * index) / (categoryTrendPoints.length - 1);
      };

      const getY = (value: number) => height - bottomPadding - (value / valueRange) * usableHeight;

      const getPointsAttr = (category: string) =>
          categoryTrendPoints
              .map((point, index) => `${getX(index)},${getY(point.values[category] || 0)}`)
              .join(' ');

      const monthTicks = Array.from({ length: Math.min(6, categoryTrendPoints.length) }, (_, idx) => {
          if (categoryTrendPoints.length <= 1) return 0;
          const steps = Math.min(5, categoryTrendPoints.length - 1);
          return Math.round(((categoryTrendPoints.length - 1) / steps) * idx);
      });

      const valueTicks = Array.from({ length: 4 }, (_, idx) => (valueRange / 4) * (idx + 1));

      return (
          <div className="relative">
              <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="w-full h-64"
                  onMouseLeave={() => setTrendTooltip(null)}
              >
                  {[0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = topPadding + usableHeight * ratio;
                      return (
                          <line
                              key={ratio}
                              x1={leftPadding}
                              y1={y}
                              x2={width - rightPadding}
                              y2={y}
                              stroke="#27272a"
                              strokeWidth="1"
                              strokeDasharray="4"
                          />
                      );
                  })}

                  <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={height - bottomPadding} stroke="#3f3f46" strokeWidth="1.5" />
                  <line x1={leftPadding} y1={height - bottomPadding} x2={width - rightPadding} y2={height - bottomPadding} stroke="#3f3f46" strokeWidth="1.5" />

                  {trendCategoryNames.map((category, index) => (
                      hiddenCategories.has(category) ? null : (
                          <polyline
                              key={category}
                              points={getPointsAttr(category)}
                              fill="none"
                              stroke={categoryTrendColors[category]}
                              strokeWidth={index < 3 ? 3 : 2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={index < 3 ? 1 : 0.7}
                          />
                      )
                  ))}

                  {categoryTrendPoints.map((point, index) => {
                      const xCenter = getX(index);
                      const widthSegment = categoryTrendPoints.length > 1 ? usableWidth / (categoryTrendPoints.length - 1) : usableWidth;
                      return (
                          <rect
                              key={`hover-${point.label}`}
                              x={Math.max(leftPadding, xCenter - widthSegment / 2)}
                              y={topPadding}
                              width={Math.max(widthSegment, 16)}
                              height={usableHeight}
                              fill="transparent"
                              onMouseEnter={() => {
                                  const entries = trendCategoryNames
                                      .filter(category => !hiddenCategories.has(category))
                                      .map(category => ({
                                          category,
                                          value: point.values[category] ?? 0,
                                          color: categoryTrendColors[category]
                                      }))
                                      .sort((a, b) => b.value - a.value)
                                      .slice(0, 4);
                                  if (entries.length > 0) {
                                      setTrendTooltip({ x: xCenter, label: point.label, entries });
                                  } else {
                                      setTrendTooltip(null);
                                  }
                              }}
                          />
                      );
                  })}

                  {monthTicks.map((tick, idx) => (
                      <text
                          key={`tick-${tick}-${idx}`}
                          x={getX(Math.min(tick, categoryTrendPoints.length - 1))}
                          y={height - bottomPadding + 18}
                          textAnchor="middle"
                          className="text-[10px] fill-zinc-500"
                      >
                          {categoryTrendPoints[Math.min(tick, categoryTrendPoints.length - 1)]?.label || ''}
                      </text>
                  ))}

                  {valueTicks.map((tick, idx) => (
                      <text
                          key={`value-${idx}`}
                          x={leftPadding - 10}
                          y={getY(tick)}
                          textAnchor="end"
                          className="text-[10px] fill-zinc-500"
                      >
                          {formatCurrency(tick).replace('R$', 'R$ ')}
                      </text>
                  ))}

                  {trendTooltip && (
                      <g
                          transform={`translate(${Math.min(
                              Math.max(trendTooltip.x - 90, leftPadding),
                              width - rightPadding - 180
                          )}, ${topPadding + 8})`}
                      >
                          <rect width={180} height={32 + trendTooltip.entries.length * 16} rx={12} fill="rgba(9,9,11,0.85)" stroke="#3f3f46" />
                          <text x={12} y={16} className="text-[10px] fill-zinc-200 font-semibold">
                              {trendTooltip.label}
                          </text>
                          {trendTooltip.entries.map((entry, idx) => (
                              <text key={entry.category} x={12} y={32 + idx * 14} className="text-[10px] fill-zinc-400">
                                  <tspan fill={entry.color}>● </tspan>
                                  {entry.category}: {formatCurrency(entry.value)}
                              </text>
                          ))}
                      </g>
                  )}
              </svg>

              <div className="flex flex-wrap gap-3 justify-center text-[11px] text-zinc-500 mt-4">
                  {trendCategoryNames.map((category) => {
                      const isHidden = hiddenCategories.has(category);
                      return (
                          <button
                              key={category}
                              onClick={() => toggleCategoryVisibility(category)}
                              className={`flex items-center gap-2 transition-opacity ${isHidden ? 'opacity-40' : 'opacity-100'}`}
                              type="button"
                          >
                              <span
                                  className="w-3 h-1 rounded-full"
                                  style={{ backgroundColor: categoryTrendColors[category], opacity: isHidden ? 0.4 : 1 }}
                              ></span>
                              <span className="underline-offset-2" style={{ textDecoration: isHidden ? 'line-through' : 'underline' }}>
                                  {category}
                              </span>
                          </button>
                      );
                  })}
              </div>
          </div>
      );
  };

  return (
    <div className="w-full max-w-full px-4 py-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-full mt-1">
            <div className="relative" ref={searchContainerRef}>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/90 dark:bg-white/10 border border-white/60 dark:border-zinc-800 text-sm font-semibold text-indigo-700 dark:text-white shadow-lg shadow-indigo-500/10 focus-within:ring-2 focus-within:ring-indigo-400 transition-all">
                    <Search size={16} className="text-indigo-600 dark:text-indigo-300" />
                    <input
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setActiveSearchIndex(0);
                        }}
                        onFocus={() => setIsSearchActive(true)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Pesquisar despesas, entradas, contas e cartões..."
                        className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none"
                    />
                </div>
                {Boolean(trimmedSearchQuery) && isSearchActive && (
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
                )}
            </div>
        </div>

        {/* Quick Access */}
        <section>
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Acesso Rápido</h2>
            <div className="space-y-2">
                {canViewBalances && (
                    <MobileListItem 
                        icon={<Wallet size={18} className="text-blue-500 dark:text-blue-400" />} 
                        label="Contas Bancárias" 
                        onClick={onOpenAccounts}
                    />
                )}
                {canManageIncomes && (
                    <MobileListItem 
                        icon={<ArrowUpCircle size={18} className="text-emerald-500 dark:text-emerald-400" />} 
                        label="Entradas" 
                        onClick={onOpenIncomes}
                    />
                )}
                {canManageExpenses && (
                    <>
                        <MobileListItem 
                            icon={<Home size={18} className="text-amber-500 dark:text-amber-400" />} 
                            label="Despesas Fixas" 
                            onClick={onOpenFixedExpenses}
                        />
                        <MobileListItem 
                            icon={<ShoppingCart size={18} className="text-pink-500 dark:text-pink-400" />} 
                            label="Despesas Variáveis" 
                            onClick={onOpenVariableExpenses}
                        />
                        <MobileListItem 
                            icon={<User size={18} className="text-cyan-500 dark:text-cyan-400" />} 
                            label="Despesas Pessoais" 
                            onClick={onOpenPersonalExpenses}
                        />
                    </>
                )}
                {canViewBalances && (
                    <MobileListItem 
                        icon={<TrendingUp size={18} className="text-violet-500 dark:text-violet-400" />} 
                        label="Rendimentos" 
                        onClick={onOpenYields} 
                    />
                )}
                {canViewInvoices && (
                    <MobileListItem 
                        icon={<CreditCard size={18} className="text-rose-500 dark:text-rose-400" />} 
                        label="Faturas" 
                        onClick={onOpenInvoices}
                    />
                )}
                {canViewReports && onOpenReports && (
                    <MobileListItem 
                        icon={<BarChart3 size={18} className="text-zinc-500 dark:text-zinc-400" />} 
                        label="Relatórios" 
                        onClick={onOpenReports}
                    />
                )}
            </div>
        </section>

        {/* MEI Limit Monitor (GAMIFIED) - Conditionally Rendered */}
        {canViewMeiLimit && (
            <section>
                <div className={`bg-white dark:bg-[#151517] rounded-2xl p-4 border ${meiStatus.level === 'over' ? 'border-red-200 dark:border-red-900/40' : meiStatus.level === 'critical' ? 'border-orange-200 dark:border-orange-900/40' : meiStatus.level === 'attention' ? 'border-amber-200 dark:border-amber-900/40' : 'border-zinc-200 dark:border-zinc-800'} shadow-sm transition-colors duration-300`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                <Building2 size={14} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-semibold text-sm text-zinc-900 dark:text-white truncate">Faturamento Fiscal MEI (PJ)</h3>
                                <p className={`text-[11px] font-semibold ${meiStatus.accentText}`}>{meiStatus.label}</p>
                            </div>
                        </div>
                        <div className={`text-[11px] font-semibold px-2 py-1 rounded-full ${meiStatus.badgeClass}`}>
                            {rawPercentage.toFixed(1)}%
                        </div>
                    </div>

                    <div className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-500 dark:text-zinc-400">Faturado no ano</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(meiRevenue)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-500 dark:text-zinc-400">{meiStatus.level === 'over' ? 'Excedente sobre o limite' : 'Restante até o limite'}</span>
                            <span className={`font-semibold ${meiStatus.level === 'over' ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {formatCurrency(meiStatus.level === 'over' ? meiExcess : meiRemaining)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-500 dark:text-zinc-400">Limite MEI</span>
                            <span className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(MEI_LIMIT)}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsMeiDetailsOpen(prev => !prev)}
                        className="mt-3 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    >
                        {isMeiDetailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                    </button>

                    {isMeiDetailsOpen && (
                        <div className="mt-3 space-y-3">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{meiStatus.description}</p>
                            <div className="relative h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                <div 
                                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${meiStatus.gradient} transition-all duration-700 ease-out`}
                                    style={{ width: `${progressVisualPercentage}%` }}
                                ></div>
                            </div>
                            <div className={`rounded-xl border ${meiStatus.calloutBorder} ${meiStatus.calloutBg} p-3 flex gap-2`}>
                                {React.createElement(calloutIcon, { size: 18, className: `${meiStatus.accentText} shrink-0` })}
                                <p className={`text-xs leading-relaxed ${meiStatus.calloutText}`}>
                                    {statusCalloutText}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        )}

        {/* Financial X-Ray */}
        <section>
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Indicadores do mês</h2>
            <div className="space-y-2">
                {canViewBalances ? (
                    <MobileListItem
                        icon={<Wallet size={18} className="text-indigo-500 dark:text-indigo-400" />}
                        label="Saldo Atual"
                        description="Disponível em contas"
                        value={`R$ ${financialData.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        valueClassName={financialData.balance < 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}
                    />
                ) : (
                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-4 border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400">
                        <Lock size={20} className="mb-2" />
                        <p className="text-xs">Saldo Oculto</p>
                    </div>
                )}

                {canManageIncomes && (
                    <MobileListItem 
                        icon={<ArrowUpCircle size={18} className="text-emerald-500 dark:text-emerald-400" />}
                        label="Entradas do mês"
                        description={`R$ ${financialData.pendingIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a receber`}
                        value={`+ R$ ${financialData.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        valueClassName="text-emerald-600 dark:text-emerald-400"
                    />
                )}

                {canManageExpenses && (
                    <MobileListItem 
                        icon={<ArrowDownCircle size={18} className="text-rose-500 dark:text-rose-400" />}
                        label="Saídas do mês"
                        description={`R$ ${financialData.pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} pendentes`}
                        value={`- R$ ${financialData.expenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        valueClassName="text-rose-600 dark:text-rose-400"
                    />
                )}
            </div>
        </section>

        {/* Credit Cards Section */}
        {canViewInvoices && (
            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <CreditCard className="text-purple-600 dark:text-purple-500" size={18} />
                        Faturas dos Cartões
                    </h2>
                    {onOpenInvoices && (
                        <button onClick={onOpenInvoices} className="text-[11px] text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-white transition-colors">
                            Ver todas
                        </button>
                    )}
                </div>

                {creditCards.length > 0 ? (
                    <div className="space-y-2">
                        {creditCards.map((card) => {
                            const style = getCardStyle(card); 
                            const invoiceTotal = cardTotals[card.id] ?? 0;
                            const dueDateObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), card.dueDay);
                            if (card.dueDay < card.closingDay) {
                                dueDateObj.setMonth(dueDateObj.getMonth() + 1);
                            }
                            const formattedDueDate = dueDateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});

                            return (
                                <MobileListItem
                                    key={card.id}
                                    icon={
                                        <div
                                            className="h-10 w-10 rounded-xl flex items-center justify-center"
                                            style={{ backgroundImage: `linear-gradient(135deg, ${style.gradient.start}, ${style.gradient.end})` }}
                                        >
                                            <img src={style.icon} className="w-6 h-6" alt="Card Brand" />
                                        </div>
                                    }
                                    label={card.name}
                                    description={`Vence em ${formattedDueDate}`}
                                    value={`R$ ${invoiceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    iconContainerClassName="bg-transparent p-0"
                                    onClick={onOpenInvoices}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-[#151517] rounded-2xl p-6 text-center border border-zinc-200 dark:border-zinc-800 border-dashed">
                        <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3 text-zinc-400">
                            <CreditCard size={24} />
                        </div>
                        <h3 className="text-zinc-900 dark:text-white font-bold mb-1">Nenhum cartão cadastrado</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Adicione seus cartões de crédito nas configurações.</p>
                    </div>
                )}
            </section>
        )}

        {/* Categorized Expense Breakdown - LINE CHART */}
        {canManageExpenses && (
            <section className="bg-white dark:bg-[#151517] rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-300">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <PieChart size={18} className="text-indigo-500" />
                            Onde foi parar seu dinheiro?
                        </h2>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Resumo do mês atual por categoria.</p>
                    </div>
                </div>
                {categoryPie.data.length > 0 && categoryPie.total > 0 ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-40 h-40">
                            <div className="w-full h-full rounded-full" style={{ background: categoryPieGradient }}></div>
                            <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white dark:bg-[#151517]"></div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Total</span>
                                <span className="text-xs font-semibold text-zinc-900 dark:text-white">{formatCurrency(categoryPie.total)}</span>
                            </div>
                        </div>
                        <ul className="w-full space-y-2">
                            {categoryPie.data.map(item => {
                                const pct = categoryPie.total > 0 ? (item.value / categoryPie.total) * 100 : 0;
                                return (
                                    <li key={item.category} className="flex items-center justify-between gap-3 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                                            <span className="truncate text-zinc-600 dark:text-zinc-300">{item.category}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(item.value)}</span>
                                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{pct.toFixed(1)}%</span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                        <PieChart size={32} className="mb-3 opacity-20" />
                        <p className="text-xs text-center">Nenhum gasto encontrado no mês atual.</p>
                    </div>
                )}
            </section>
        )}

        <footer className="text-center text-[10px] text-zinc-500 dark:text-zinc-400 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            versão 1.0.0
        </footer>
    </div>
  );
};

// ... existing subcomponents ...
const QuickAction: React.FC<{ icon: React.ReactNode, label: string, color: string, bg: string, border: string, onClick?: () => void }> = ({ icon, label, color, bg, border, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center w-full min-h-[104px] p-4 rounded-2xl border bg-white dark:bg-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#202022] transition-all group active:scale-95 ${border} shadow-sm dark:shadow-none`}
    >
        <div className={`p-3 rounded-full mb-2.5 ${bg} ${color} group-hover:scale-110 transition-transform`}>
            {icon}
        </div>
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white text-center leading-snug">{label}</span>
    </button>
);

const MobileListItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    description?: string;
    value?: string;
    valueClassName?: string;
    onClick?: () => void;
    iconContainerClassName?: string;
}> = ({ icon, label, description, value, valueClassName, onClick, iconContainerClassName }) => {
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

    return onClick ? (
        <button
            type="button"
            onClick={onClick}
            className={`w-full min-h-[52px] px-3 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] flex items-center justify-between gap-3 text-left transition-all ${wrapperClasses}`}
        >
            {content}
        </button>
    ) : (
        <div className="w-full min-h-[52px] px-3 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] flex items-center justify-between gap-3">
            {content}
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
