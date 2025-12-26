
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

const DashboardDesktop: React.FC<DashboardProps> = ({ 
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8">
        
        <div className="w-full px-4 mt-2 mb-6">
            <div className="max-w-5xl mx-auto relative" ref={searchContainerRef}>
                <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/80 dark:bg-white/10 border border-white/50 dark:border-zinc-800 text-sm sm:text-base font-semibold text-indigo-700 dark:text-white shadow-lg shadow-indigo-500/10 focus-within:ring-2 focus-within:ring-indigo-400 transition-all">
                    <Search size={18} className="text-indigo-600 dark:text-indigo-300" />
                    <input
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setActiveSearchIndex(0);
                        }}
                        onFocus={() => setIsSearchActive(true)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Pesquisar despesas, entradas, contas e cartões..."
                        className="flex-1 bg-transparent text-sm sm:text-base text-zinc-900 dark:text-white placeholder-zinc-500 outline-none"
                    />
                </div>
                {Boolean(trimmedSearchQuery) && isSearchActive && (
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
                )}
            </div>
        </div>

        {/* Quick Access */}
        <section>
            <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">Acesso Rápido</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {canViewBalances && (
                    <QuickAction 
                        icon={<Wallet />} 
                        label="Contas Bancárias" 
                        color="text-blue-500 dark:text-blue-400" 
                        bg="bg-blue-50 dark:bg-blue-500/10" 
                        border="border-blue-100 dark:border-blue-500/20" 
                        onClick={onOpenAccounts}
                    />
                )}
                {canManageIncomes && (
                    <QuickAction 
                        icon={<ArrowUpCircle />} 
                        label="Entradas" 
                        color="text-emerald-500 dark:text-emerald-400" 
                        bg="bg-emerald-50 dark:bg-emerald-500/10" 
                        border="border-emerald-100 dark:border-emerald-500/20" 
                        onClick={onOpenIncomes}
                    />
                )}
                {canManageExpenses && (
                    <>
                        <QuickAction 
                            icon={<Home />} 
                            label="Despesas Fixas" 
                            color="text-amber-500 dark:text-amber-400" 
                            bg="bg-amber-50 dark:bg-amber-500/10" 
                            border="border-amber-100 dark:border-amber-500/20" 
                            onClick={onOpenFixedExpenses}
                        />
                        <QuickAction 
                            icon={<ShoppingCart />} 
                            label="Despesas Variáveis" 
                            color="text-pink-500 dark:text-pink-400" 
                            bg="bg-pink-50 dark:bg-pink-500/10" 
                            border="border-pink-100 dark:border-pink-500/20" 
                            onClick={onOpenVariableExpenses}
                        />
                        <QuickAction 
                            icon={<User />} 
                            label="Despesas Pessoais" 
                            color="text-cyan-500 dark:text-cyan-400" 
                            bg="bg-cyan-50 dark:bg-cyan-500/10" 
                            border="border-cyan-100 dark:border-cyan-500/20" 
                            onClick={onOpenPersonalExpenses}
                        />
                    </>
                )}
                {canViewBalances && (
                    <QuickAction 
                        icon={<TrendingUp />} 
                        label="Rendimentos" 
                        color="text-violet-500 dark:text-violet-400" 
                        bg="bg-violet-50 dark:bg-violet-500/10" 
                        border="border-violet-100 dark:border-violet-500/20"
                        onClick={onOpenYields} 
                    />
                )}
                {canViewInvoices && (
                    <QuickAction 
                        icon={<CreditCard />} 
                        label="Faturas" 
                        color="text-rose-500 dark:text-rose-400" 
                        bg="bg-rose-50 dark:bg-rose-500/10" 
                        border="border-rose-100 dark:border-rose-500/20" 
                        onClick={onOpenInvoices}
                    />
                )}
                {canViewReports && (
                    <QuickAction 
                        icon={<BarChart3 />} 
                        label="Relatórios" 
                        color="text-zinc-500 dark:text-zinc-400" 
                        bg="bg-zinc-100 dark:bg-zinc-500/10" 
                        border="border-zinc-200 dark:border-zinc-500/20" 
                        onClick={onOpenReports}
                    />
                )}
            </div>
        </section>

        {/* MEI Limit Monitor (GAMIFIED) - Conditionally Rendered */}
        {canViewMeiLimit && (
            <section>
                <div className={`bg-white dark:bg-[#151517] rounded-2xl p-6 border ${meiStatus.level === 'over' ? 'border-red-200 dark:border-red-900/40' : meiStatus.level === 'critical' ? 'border-orange-200 dark:border-orange-900/40' : meiStatus.level === 'attention' ? 'border-amber-200 dark:border-amber-900/40' : 'border-zinc-200 dark:border-zinc-800'} shadow-sm relative overflow-hidden transition-colors duration-300`}>
                    <div className="absolute inset-y-0 right-0 w-32 opacity-5 pointer-events-none">
                        <Building2 size={120} className="w-full h-full" />
                    </div>

                    <div className="relative flex flex-col gap-6">
                        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
                            <div className="flex flex-1 items-start gap-4">
                                <div 
                                    className={`relative w-20 h-20 rounded-2xl border ${mascotConfig.ringClass} flex items-center justify-center shadow-xl ${mascotConfig.auraClass} transition-all duration-500`}
                                    title={mascotConfig.tooltip}
                                >
                                    <mascotConfig.icon size={34} className={`${mascotConfig.faceClass}`} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                            <Building2 size={18} />
                                        </div>
                                        <h3 className="font-bold text-zinc-900 dark:text-white">Faturamento Fiscal MEI (PJ)</h3>
                                    </div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
                                        Acompanhe o seu faturamento anual e evite ultrapassar o limite de R$ 81.000,00 do regime MEI.
                                    </p>
                                    <div className={`mt-3 text-sm font-semibold ${meiStatus.accentText}`}>
                                        {meiStatus.label}
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {meiStatus.description}
                                    </p>
                                </div>
                            </div>
                            <div className={`w-full lg:w-80 rounded-2xl border ${meiStatus.calloutBorder} ${meiStatus.calloutBg} p-4 flex gap-3`}>
                                {React.createElement(calloutIcon, { size: 28, className: `${meiStatus.accentText} shrink-0` })}
                                <p className={`text-sm leading-relaxed ${meiStatus.calloutText}`}>
                                    {statusCalloutText}
                                </p>
                            </div>
                        </div>

                        <div className="relative pt-8">
                            <div className="relative h-4 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                <div 
                                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${meiStatus.gradient} transition-all duration-700 ease-out`}
                                    style={{ width: `${progressVisualPercentage}%` }}
                                ></div>
                            </div>
                            <div 
                                className="absolute -top-8 flex flex-col items-center transition-all duration-500"
                                style={{ left: `calc(${displayPercentage}% - 28px)` }}
                            >
                                <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shadow ${meiStatus.badgeClass}`}>
                                    {rawPercentage.toFixed(1)}%
                                </div>
                                <div className={`w-2 h-2 mt-1 rounded-full bg-gradient-to-r ${meiStatus.gradient}`}></div>
                            </div>
                            {MEI_CHECKPOINTS.map((checkpoint) => {
                                const percent = checkpoint * 100;
                                const value = formatCurrency(MEI_LIMIT * checkpoint);
                                return (
                                    <div
                                        key={checkpoint}
                                        className="absolute top-4 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                                        style={{ left: `${percent}%` }}
                                        title={`${percent}% do limite: ${value}`}
                                    >
                                        <div className="w-3 h-3 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600"></div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">Faturado no ano</p>
                                    <p className="text-xl font-semibold text-zinc-900 dark:text-white mt-1">{formatCurrency(meiRevenue)}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{rawPercentage.toFixed(1)}% do limite</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">{meiStatus.level === 'over' ? 'Excedente sobre o limite' : 'Restante até o limite'}</p>
                                    <p className={`text-xl font-semibold mt-1 ${meiStatus.level === 'over' ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                        {formatCurrency(meiStatus.level === 'over' ? meiExcess : meiRemaining)}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Limite anual de {formatCurrency(MEI_LIMIT)}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800">
                                    <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">Limite MEI</p>
                                    <p className="text-xl font-semibold text-zinc-900 dark:text-white mt-1">{formatCurrency(MEI_LIMIT)}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Atualizado automaticamente pela legislação</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        )}

        {/* Financial X-Ray */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Balance Card - Conditional */}
            {canViewBalances ? (
                <div className="bg-white dark:bg-[#151517] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 relative overflow-hidden group shadow-sm transition-all duration-300 hover:border-zinc-300 dark:hover:border-zinc-700">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400">
                            <Wallet size={20} />
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-1">Saldo Atual</p>
                        <h3 className={`text-3xl font-bold tracking-tight mb-2 ${financialData.balance < 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
                            R$ {financialData.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                            <Calendar size={12} />
                            Disponível em contas
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-6 border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400">
                    <Lock size={24} className="mb-2" />
                    <p className="text-xs">Saldo Oculto</p>
                </div>
            )}

            {canManageIncomes && (
                <SummaryCard 
                title="Entradas do Mês" 
                value={financialData.income} 
                icon={<ArrowUpCircle size={20} />}
                colorClass="text-emerald-600 dark:text-emerald-400"
                bgClass="bg-white dark:bg-[#151517]"
                subtext={`R$ ${financialData.pendingIncome.toLocaleString('pt-BR', {minimumFractionDigits: 2})} a receber`}
                />
            )}

            {canManageExpenses && (
                <SummaryCard 
                title="Saídas do Mês" 
                value={financialData.expenses} 
                icon={<ArrowDownCircle size={20} />}
                colorClass="text-rose-600 dark:text-rose-400"
                bgClass="bg-white dark:bg-[#151517]"
                subtext={`R$ ${financialData.pendingExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})} pendentes`}
                isExpense
                />
            )}
        </section>

        {/* Credit Cards Section */}
        {canViewInvoices && (
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <CreditCard className="text-purple-600 dark:text-purple-500" size={20} />
                        Faturas dos Cartões
                    </h2>
                    <button onClick={onOpenInvoices} className="text-xs text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-white transition-colors">
                        Gerenciar Faturas
                    </button>
                </div>

                {creditCards.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {creditCards.map((card, idx) => {
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
                                    className="rounded-2xl p-6 border border-white/5 relative overflow-hidden shadow-xl shadow-indigo-900/5 dark:shadow-none"
                                    style={{ backgroundImage: `linear-gradient(135deg, ${style.gradient.start}, ${style.gradient.end})` }}
                                >
                                    <div className="absolute top-0 left-0 w-full h-full opacity-10 dark:opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                                    <div className="relative z-10 flex flex-col h-full justify-between">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg text-white mb-1">{card.name}</h3>
                                                <p className="text-xs text-white/70 font-medium">Limite: {card.limit ? `R$ ${card.limit.toLocaleString('pt-BR')}` : 'Não informado'}</p>
                                            </div>
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-lg">
                                                <img src={style.icon} className="w-8 h-8 opacity-90" alt="Card Brand" />
                                            </div>
                                        </div>
                                        <div className="mt-8">
                                            <div className="flex justify-between items-end mb-4">
                                                <div>
                                                    <p className="text-xs text-white/80 mb-1 uppercase tracking-wider">Fatura Atual (Ref. {viewDate.toLocaleDateString('pt-BR', {month: 'long'})})</p>
                                                    <div className="text-2xl font-bold text-white">
                                                        R$ {invoiceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-white/80 mb-1">Vence em</p>
                                                    <p className="text-sm font-bold text-white bg-white/20 px-3 py-1 rounded-md backdrop-blur-sm">
                                                        {formattedDueDate}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-white/20 flex justify-between items-center">
                                                <span 
                                                    className="text-xs font-semibold px-2 py-1 rounded text-white"
                                                    style={{ backgroundColor: style.badgeBg }}
                                                >
                                                    Fatura Aberta
                                                </span>
                                                <button 
                                                    onClick={onOpenInvoices}
                                                    className="flex items-center gap-2 text-xs font-semibold text-white hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
                                                >
                                                    Ver Detalhes <Eye size={14} />
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
            </section>
        )}

        {/* Categorized Expense Breakdown - LINE CHART */}
        {canManageExpenses && (
            <section className="bg-white dark:bg-[#151517] rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors duration-300">
                <div className="flex flex-col gap-3 mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                <PieChart size={20} className="text-indigo-500" />
                                Onde foi parar seu dinheiro? <span className="text-xs font-normal text-zinc-500">(Top 10 categorias)</span>
                            </h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Linha do tempo desde o início do sistema até o mês atual.</p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span className="uppercase tracking-wide font-semibold">Modo</span>
                            <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                {(['monthly', 'accumulated'] as CategoryTrendMode[]).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setCategoryTrendMode(mode)}
                                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                            categoryTrendMode === mode
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-zinc-500 dark:text-zinc-400 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        {mode === 'monthly' ? 'Mensal' : 'Acumulado'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                {trendCategoryNames.length > 0 && categoryTrendPoints.length > 0 ? (
                    <>
                        {renderCategoryTrendChart()}
                        {(categoryTrendSummary.highlights.categoryMaisPesada ||
                          categoryTrendSummary.highlights.maiorCrescimento ||
                          categoryTrendSummary.highlights.maiorQueda) && (
                            <div className="mt-5 grid gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 md:grid-cols-3">
                                {categoryTrendSummary.highlights.categoryMaisPesada && (
                                    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 flex flex-col gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Categoria mais pesada</span>
                                        <span className="font-semibold text-zinc-900 dark:text-white">{categoryTrendSummary.highlights.categoryMaisPesada}</span>
                                        {typeof heavyCategoryForecast === 'number' && (
                                            <span className="text-[10px] text-zinc-400">Previsão próxima: {formatCurrency(heavyCategoryForecast)}</span>
                                        )}
                                    </div>
                                )}
                                {categoryTrendSummary.highlights.maiorCrescimento && (
                                    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 flex flex-col gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Maior crescimento</span>
                                        <span className="font-semibold text-emerald-500">{categoryTrendSummary.highlights.maiorCrescimento}</span>
                                    </div>
                                )}
                                {categoryTrendSummary.highlights.maiorQueda && (
                                    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 flex flex-col gap-1">
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Maior queda</span>
                                        <span className="font-semibold text-rose-500">{categoryTrendSummary.highlights.maiorQueda}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {categoryTrendSummary.insights.length > 0 && (
                            <div className="mt-4 bg-zinc-50 dark:bg-[#111113] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
                                <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400 mb-2">Insights automáticos</p>
                                <ul className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 list-disc list-inside">
                                    {categoryTrendSummary.insights.slice(0, 3).map(text => (
                                        <li key={text}>{text}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                        <PieChart size={40} className="mb-3 opacity-20" />
                        <p className="text-sm text-center">Dados insuficientes para montar a tendência das categorias.</p>
                    </div>
                )}
            </section>
        )}

        <footer className="text-center text-xs text-zinc-500 dark:text-zinc-400 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            versão 1.0.0
        </footer>

    </div>
  );
};

// ... existing subcomponents ...
const QuickAction: React.FC<{ icon: React.ReactNode, label: string, color: string, bg: string, border: string, onClick?: () => void }> = ({ icon, label, color, bg, border, onClick }) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-4 rounded-xl border bg-white dark:bg-[#1a1a1a] hover:bg-gray-50 dark:hover:bg-[#202022] transition-all group active:scale-95 ${border} shadow-sm dark:shadow-none h-full`}
    >
        <div className={`p-3 rounded-full mb-3 ${bg} ${color} group-hover:scale-110 transition-transform`}>
            {icon}
        </div>
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white text-center">{label}</span>
    </button>
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
    <div className={`${bgClass} rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-sm transition-all duration-300 hover:border-zinc-300 dark:hover:border-zinc-700`}>
        <div className="flex justify-between items-start mb-4">
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mb-1">{title}</p>
            {/* Standardized Font Size: text-3xl */}
            <h3 className={`text-3xl font-bold tracking-tight mb-2 ${colorClass}`}>
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
