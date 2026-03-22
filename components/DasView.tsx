import React from 'react';
import { Check, Copy, Home, Pencil } from 'lucide-react';
import type { Account, CompanyInfo, Expense, ExpenseType } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import { withAlpha } from '../services/cardColorUtils';

interface DasViewProps {
  onBack: () => void;
  company: CompanyInfo;
  onOpenCompany?: () => void;
  expenses?: Expense[];
  accounts?: Account[];
  viewDate?: Date;
  onUpdateExpenses?: (expenses: Expense[]) => void;
  onDeleteExpense?: (id: string) => void;
  onEditExpense?: (id: string, subtype?: ExpenseType) => void;
}

interface DasStream {
  id: string;
  label: string;
  cnpj?: string;
  accountId?: string;
  expenses: Expense[];
}

interface DasMonthCard {
  monthIndex: number;
  monthKey: string;
  dueDateIso: string;
  dueDateLabel: string;
  expenses: Expense[];
  totalAmount: number;
  status: 'paid' | 'pending' | 'mixed' | 'empty';
}

interface DasStreamPlan {
  stream: DasStream;
  year: number;
  templatePaid: Expense | null;
  templateBase: Expense | null;
  dueDay: number;
  monthCards: DasMonthCard[];
  paidTotal: number;
}

const PGMEI_URL =
  'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao';

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const DAS_AUTO_TAG = '[DAS_AUTO]';
const DAS_STREAM_PREFIX = '[DAS_STREAM:';
const DAS_STREAM_COLORS = ['#14b8a6', '#38bdf8', '#f97316', '#ec4899', '#eab308', '#8b5cf6'];
const LEGACY_AUTO_DAS_DESCRIPTION_REGEX =
  /^das\s+.+\s+[•-]\s*(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/\d{4}$/i;
const hasLegacyDasStreamTag = (notes?: string | null) => Boolean(notes && notes.includes(DAS_STREAM_PREFIX));
const isLegacyAutoDasDescription = (expense: Expense) => {
  const description = (expense.description || '').trim();
  if (!description) return false;
  if (!LEGACY_AUTO_DAS_DESCRIPTION_REGEX.test(description)) return false;
  const category = normalizeText(expense.category || '');
  return /\bimpostos?\b/.test(category);
};
const isAutoDasGeneratedExpense = (expense: Expense) =>
  Boolean(
    expense.notes?.includes(DAS_AUTO_TAG) ||
      hasLegacyDasStreamTag(expense.notes) ||
      isLegacyAutoDasDescription(expense)
  );

const normalizeText = (value: unknown) =>
  (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const extractCnpjDigits = (value: string) => {
  const match = value.match(/(\d{2}\.?\d{3}\.?\d{3}\/??\d{4}-?\d{2})/);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
};

const formatCnpj = (digits?: string | null) => {
  if (!digits || digits.length !== 14) return digits || '';
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const extractStreamTag = (notes?: string | null) => {
  if (!notes) return null;
  const start = notes.indexOf(DAS_STREAM_PREFIX);
  if (start < 0) return null;
  const end = notes.indexOf(']', start);
  if (end < 0) return null;
  const value = notes.slice(start + DAS_STREAM_PREFIX.length, end).trim();
  return value || null;
};

const toSlug = (value: string) => {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'principal';
};

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const extractDescriptionBucket = (description?: string) => {
  const cleaned = normalizeText(description || '')
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ')
    .replace(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g, ' ')
    .replace(/\b(das|mei|pgmei|guia|imposto|impostos|competencia|referente|ref|pagamento|simples|nacional|simei)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;
  return cleaned.split(' ').slice(0, 3).join(' ');
};

const ACCOUNT_BUCKET_HINTS = [
  'nubank',
  'sicredi',
  'cora',
  'caixa',
  'itau',
  'santander',
  'bradesco',
  'inter',
  'mercado pago',
  'mercado-pago',
  'dinheiro',
  'mastercard',
  'visa',
  'elo',
  'cartao',
  'conta',
  'mp ',
  ' mp'
];

const isLikelyAccountBucket = (value?: string | null) => {
  if (!value) return false;
  const normalized = normalizeText(value);
  return ACCOUNT_BUCKET_HINTS.some((token) => normalized.includes(token));
};

const getLabelQualityScore = (label: string) => {
  const normalized = normalizeText(label);
  let score = normalized.length;
  if (normalized.includes('principal')) score -= 20;
  if (normalized.includes('conta')) score -= 12;
  if (normalized.includes('das ')) score += 4;
  if (normalized.includes('mei')) score += 8;
  return score;
};

const pickBetterLabel = (current: string, next: string) => {
  return getLabelQualityScore(next) > getLabelQualityScore(current) ? next : current;
};

const isDasExpense = (expense: Expense) => {
  const description = normalizeText(expense.description || '');
  const category = normalizeText(expense.category || '');
  const notes = normalizeText(expense.notes || '');
  const all = `${description} ${category} ${notes}`.trim();
  if (!all) return false;

  const hasStreamTag = Boolean(extractStreamTag(expense.notes));
  const hasPgmeiSignal = /\b(pgmei|simei)\b/.test(all);
  const hasGuideSignal = /\bguia\s+das\b/.test(all);
  const hasDasMeiSignal = /\bdas\s+mei\b/.test(all);

  const hasDasPrefixInDescription =
    description.startsWith('das ') || description.startsWith('guia das ');

  const hasMeiTaxSignalInText =
    /\bmei\b/.test(`${description} ${notes}`) &&
    /\b(imposto|impostos|simples nacional|tributo|arrecadacao|guia)\b/.test(`${description} ${notes}`);

  const hasDasCategoryHint =
    /\bimpostos?\b/.test(category) &&
    /\bmei\b/.test(category) &&
    hasDasPrefixInDescription;

  const hasStrongDasSignal =
    hasPgmeiSignal ||
    hasGuideSignal ||
    hasDasMeiSignal ||
    hasMeiTaxSignalInText ||
    hasDasCategoryHint;

  if (hasStrongDasSignal) return true;

  // Stream tags generated automaticamente só valem quando a descrição ainda mantém contexto fiscal.
  if (hasStreamTag) {
    return (
      description.startsWith('das ') ||
      /\bdas\s+mei\b/.test(description) ||
      /\b(pgmei|simei|guia\s+das)\b/.test(description)
    );
  }

  return false;
};

const resolveExpenseDate = (expense: Expense) => expense.dueDate || expense.date;

const getExpenseYear = (expense: Expense) => {
  const parsed = toDate(resolveExpenseDate(expense));
  return parsed ? parsed.getFullYear() : null;
};

const getExpenseMonthIndex = (expense: Expense) => {
  const parsed = toDate(resolveExpenseDate(expense));
  return parsed ? parsed.getMonth() : null;
};

const getExpenseDay = (expense: Expense, fallback = 20) => {
  const parsed = toDate(resolveExpenseDate(expense));
  if (!parsed) return fallback;
  return Math.max(1, Math.min(31, parsed.getDate()));
};

const toIsoDate = (year: number, monthIndex: number, day: number) => {
  const safeDay = Math.max(1, Math.min(day, new Date(year, monthIndex + 1, 0).getDate()));
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

const getDasStreamColor = (streamId: string) => {
  let hash = 0;
  for (let index = 0; index < streamId.length; index += 1) {
    hash = (hash * 31 + streamId.charCodeAt(index)) >>> 0;
  }
  return DAS_STREAM_COLORS[hash % DAS_STREAM_COLORS.length] || DAS_STREAM_COLORS[0];
};

const statusMeta = (status: DasMonthCard['status']) => {
  if (status === 'paid') {
    return {
      label: 'Pago',
      badge: 'bg-emerald-500/15 border-emerald-300/50 text-emerald-300'
    };
  }
  if (status === 'mixed') {
    return {
      label: 'Parcial',
      badge: 'bg-amber-500/15 border-amber-300/50 text-amber-300'
    };
  }
  if (status === 'pending') {
    return {
      label: 'Pendente',
      badge: 'bg-rose-500/15 border-rose-300/50 text-rose-300'
    };
  }
  return {
    label: 'Sem lançamento',
    badge: 'bg-zinc-500/10 border-zinc-400/40 text-zinc-300'
  };
};

const DasView: React.FC<DasViewProps> = ({
  onBack,
  company,
  onOpenCompany,
  expenses = [],
  accounts = [],
  viewDate,
  onUpdateExpenses,
  onDeleteExpense,
  onEditExpense
}) => {
  const isMobile = useIsMobile();
  const [copied, setCopied] = React.useState(false);
  const cnpj = (company.cnpj || '').trim();
  const subHeaderRef = React.useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = React.useState(0);
  const [headerFill, setHeaderFill] = React.useState({ top: 0, height: 0 });
  const [selectedStreamId, setSelectedStreamId] = React.useState<string>('');
  const autoCleanupRef = React.useRef('');

  const activeYear = viewDate?.getFullYear() || new Date().getFullYear();

  const accountNameById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );

  React.useEffect(() => {
    if (!onUpdateExpenses) return;
    const autoGenerated = expenses.filter((expense) => isAutoDasGeneratedExpense(expense));
    if (autoGenerated.length === 0) {
      autoCleanupRef.current = '';
      return;
    }

    const fingerprint = autoGenerated
      .map((expense) => expense.id || `${expense.description}-${expense.dueDate || expense.date}`)
      .sort()
      .join('|');

    if (autoCleanupRef.current === fingerprint) return;
    autoCleanupRef.current = fingerprint;
    if (onDeleteExpense) {
      autoGenerated.forEach((expense) => {
        onDeleteExpense(expense.id);
      });
      return;
    }
    onUpdateExpenses(expenses.filter((expense) => !isAutoDasGeneratedExpense(expense)));
  }, [expenses, onDeleteExpense, onUpdateExpenses]);

  const dasExpenses = React.useMemo(
    () => expenses.filter((expense) => isDasExpense(expense) && !isAutoDasGeneratedExpense(expense)),
    [expenses]
  );

  const dasStreams = React.useMemo<DasStream[]>(() => {
    const map = new Map<string, DasStream>();
    const companyDigits = extractCnpjDigits(cnpj || '') || undefined;

    dasExpenses.forEach((expense) => {
      const noteTag = extractStreamTag(expense.notes);
      const rawText = `${expense.description || ''} ${expense.notes || ''}`;
      const streamCnpj = extractCnpjDigits(rawText);
      const rawBucket = extractDescriptionBucket(expense.description || expense.category || '');
      const bucket = rawBucket && !isLikelyAccountBucket(rawBucket) ? rawBucket : null;

      let streamId = '';
      let streamLabel = '';

      if (streamCnpj) {
        streamId = `cnpj-${streamCnpj}`;
        streamLabel = `MEI ${formatCnpj(streamCnpj)}`;
      } else if (noteTag?.startsWith('cnpj-')) {
        streamId = noteTag;
        streamLabel = `MEI ${formatCnpj(noteTag.slice(5))}`;
      } else if (bucket) {
        streamId = `desc-${toSlug(bucket)}`;
        streamLabel = `DAS ${toTitleCase(bucket)}`;
      } else if (noteTag?.startsWith('desc-')) {
        const descLabel = noteTag.slice(5).replace(/-/g, ' ');
        if (!isLikelyAccountBucket(descLabel)) {
          streamId = noteTag;
          streamLabel = `DAS ${toTitleCase(descLabel)}`;
        }
      } else if (noteTag?.startsWith('acc-')) {
        const accountId = noteTag.slice(4);
        if (companyDigits) {
          streamId = `cnpj-${companyDigits}`;
          streamLabel = `MEI ${formatCnpj(companyDigits)}`;
        } else {
          streamId = noteTag;
          streamLabel = `DAS ${accountNameById.get(accountId) || 'Conta'}`;
        }
      } else if (noteTag) {
        streamId = noteTag;
        streamLabel = `DAS ${toTitleCase(noteTag.replace(/[-_]/g, ' '))}`;
      } else if (companyDigits) {
        streamId = `cnpj-${companyDigits}`;
        streamLabel = `MEI ${formatCnpj(companyDigits)}`;
      } else if (expense.accountId) {
        streamId = `acc-${expense.accountId}`;
        streamLabel = `DAS ${accountNameById.get(expense.accountId) || 'Conta'}`;
      } else {
        streamId = 'principal';
        streamLabel = 'DAS principal';
      }

      if (!streamId || !streamLabel) {
        streamId = companyDigits ? `cnpj-${companyDigits}` : 'principal';
        streamLabel = companyDigits ? `MEI ${formatCnpj(companyDigits)}` : 'DAS principal';
      }

      const existing = map.get(streamId);
      if (existing) {
        existing.expenses.push(expense);
        return;
      }

      map.set(streamId, {
        id: streamId,
        label: streamLabel,
        cnpj: streamCnpj || companyDigits,
        accountId: expense.accountId,
        expenses: [expense]
      });
    });

    const mergedMap = new Map<string, DasStream>();
    map.forEach((stream) => {
      const normalizedLabel = normalizeText(stream.label || '')
        .replace(/^das\s+/, '')
        .replace(/^mei\s+/, '')
        .trim();
      const canonicalKey = stream.cnpj
        ? `cnpj-${stream.cnpj}`
        : normalizedLabel && !isLikelyAccountBucket(normalizedLabel)
          ? `label-${toSlug(normalizedLabel)}`
          : stream.accountId
            ? `acc-${stream.accountId}`
            : stream.id;

      const existing = mergedMap.get(canonicalKey);
      if (!existing) {
        mergedMap.set(canonicalKey, {
          id: canonicalKey,
          label: stream.cnpj ? `MEI ${formatCnpj(stream.cnpj)}` : stream.label,
          cnpj: stream.cnpj,
          accountId: stream.accountId,
          expenses: [...stream.expenses]
        });
        return;
      }

      const existingIds = new Set(existing.expenses.map((expense) => expense.id));
      const nextExpenses = stream.expenses.filter((expense) => !existingIds.has(expense.id));
      existing.expenses.push(...nextExpenses);
      existing.label = pickBetterLabel(existing.label, stream.label);
      if (!existing.cnpj && stream.cnpj) {
        existing.cnpj = stream.cnpj;
        existing.label = `MEI ${formatCnpj(stream.cnpj)}`;
      }
      if (!existing.accountId && stream.accountId) {
        existing.accountId = stream.accountId;
      }
    });

    if (mergedMap.size === 0) {
      if (companyDigits) {
        mergedMap.set(`cnpj-${companyDigits}`, {
          id: `cnpj-${companyDigits}`,
          label: `MEI ${formatCnpj(companyDigits)}`,
          cnpj: companyDigits,
          expenses: []
        });
      } else {
        mergedMap.set('principal', {
          id: 'principal',
          label: 'DAS principal',
          expenses: []
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [accountNameById, cnpj, dasExpenses]);

  React.useEffect(() => {
    if (dasStreams.length === 0) {
      setSelectedStreamId('');
      return;
    }
    const keep = dasStreams.some((stream) => stream.id === selectedStreamId);
    if (!keep) {
      setSelectedStreamId(dasStreams[0].id);
    }
  }, [dasStreams, selectedStreamId]);

  const streamPlans = React.useMemo(() => {
    const map = new Map<string, DasStreamPlan>();

    dasStreams.forEach((stream) => {
      const yearExpenses = stream.expenses
        .filter((expense) => getExpenseYear(expense) === activeYear)
        .sort((a, b) => {
          const dateA = toDate(resolveExpenseDate(a))?.getTime() || 0;
          const dateB = toDate(resolveExpenseDate(b))?.getTime() || 0;
          return dateA - dateB;
        });

      const paidExpenses = yearExpenses.filter((expense) => expense.status === 'paid');
      const templatePaid = paidExpenses[0] || null;
      const templateBase = templatePaid || yearExpenses[0] || stream.expenses[0] || null;
      const dueDay = getExpenseDay(templateBase || templatePaid || ({} as Expense), 20);

      const monthMap = new Map<number, Expense[]>();
      yearExpenses.forEach((expense) => {
        const monthIndex = getExpenseMonthIndex(expense);
        if (monthIndex === null) return;
        const current = monthMap.get(monthIndex) || [];
        current.push(expense);
        monthMap.set(monthIndex, current);
      });

      const monthCards: DasMonthCard[] = Array.from({ length: 12 }).map((_, monthIndex) => {
        const monthKey = `${activeYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        const monthExpenses = (monthMap.get(monthIndex) || []).sort((a, b) => {
          const dateA = toDate(resolveExpenseDate(a))?.getTime() || 0;
          const dateB = toDate(resolveExpenseDate(b))?.getTime() || 0;
          return dateA - dateB;
        });
        const totalAmount = monthExpenses.reduce((sum, expense) => sum + Math.max(0, expense.amount), 0);

        let status: DasMonthCard['status'] = 'empty';
        if (monthExpenses.length > 0) {
          const allPaid = monthExpenses.every((expense) => expense.status === 'paid');
          const allPending = monthExpenses.every((expense) => expense.status === 'pending');
          status = allPaid ? 'paid' : allPending ? 'pending' : 'mixed';
        }

        const dueDateIso =
          monthExpenses[0]?.dueDate || monthExpenses[0]?.date || toIsoDate(activeYear, monthIndex, dueDay);

        return {
          monthIndex,
          monthKey,
          dueDateIso,
          dueDateLabel: toDate(dueDateIso)?.toLocaleDateString('pt-BR') || '-',
          expenses: monthExpenses,
          totalAmount,
          status
        };
      });

      const paidTotal = yearExpenses
        .filter((expense) => expense.status === 'paid')
        .reduce((sum, expense) => sum + Math.max(0, expense.amount), 0);

      map.set(stream.id, {
        stream,
        year: activeYear,
        templatePaid,
        templateBase,
        dueDay,
        monthCards,
        paidTotal
      });
    });

    return map;
  }, [activeYear, dasStreams]);

  const selectedPlan = React.useMemo(() => {
    if (selectedStreamId && streamPlans.has(selectedStreamId)) {
      return streamPlans.get(selectedStreamId) || null;
    }
    if (dasStreams[0]) {
      return streamPlans.get(dasStreams[0].id) || null;
    }
    return null;
  }, [dasStreams, selectedStreamId, streamPlans]);

  const paidTaxTotalAllStreams = React.useMemo(() => {
    let total = 0;
    streamPlans.forEach((plan) => {
      total += plan.paidTotal;
    });
    return total;
  }, [streamPlans]);

  const handleCopy = async () => {
    if (!cnpj) return;
    try {
      await navigator.clipboard.writeText(cnpj);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenPgmei = () => {
    if (typeof window === 'undefined') return;
    window.open(PGMEI_URL, '_blank', 'noopener,noreferrer');
  };

  const renderMonthCard = (card: DasMonthCard) => {
    const meta = statusMeta(card.status);
    const cardAmount = formatCurrency(card.totalAmount);
    const hasLaunch = card.expenses.length > 0;
    const streamLabel = selectedPlan?.stream.label || 'DAS';
    const streamTheme = getDasStreamColor(selectedPlan?.stream.id || 'principal');
    const dueDay = toDate(card.dueDateIso)?.getDate();
    const dueLabel = Number.isFinite(dueDay) ? `Dia ${dueDay}` : card.dueDateLabel;
    const firstExpense = card.expenses[0] || null;
    const isPaid = card.status === 'paid';
    const isDisabled = !hasLaunch;

    return (
      <article
        key={card.monthKey}
        className={`rounded-2xl border shadow-sm transition ${isDisabled ? 'opacity-70' : ''}`}
        style={{
          background: withAlpha(streamTheme, isDisabled ? 0.08 : 0.18),
          borderColor: withAlpha(streamTheme, 0.35)
        }}
      >
        <div className="flex items-center justify-between px-3 pt-3 gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-900 dark:text-white/80 truncate">
            {streamLabel}
          </p>
          <span
            className={`inline-flex h-5 min-w-[88px] items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}
          >
            {meta.label}
          </span>
        </div>

        <div className="mt-3 px-3 pb-3">
          <div className="flex items-center gap-2">
            <p className={`text-lg font-semibold text-zinc-900 dark:text-white ${isPaid ? 'line-through text-emerald-200/80' : ''}`}>
              R$ {cardAmount}
            </p>
            {isPaid && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Pago</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-700 dark:text-white/70">
            {hasLaunch ? `${card.expenses.length} lançamento(s)` : 'Sem lançamentos'}
          </p>

          <div className="mt-4 flex items-end justify-between">
            <span className="text-[10px] uppercase tracking-wide text-zinc-700 dark:text-white/70">
              {MONTH_LABELS[card.monthIndex]}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-900 dark:text-white/80">
              {dueLabel}
            </span>
          </div>

          {hasLaunch && onEditExpense && firstExpense && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onEditExpense(firstExpense.id, firstExpense.type)}
                className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2 py-1 text-[10px] font-semibold text-zinc-900 dark:text-white/85 hover:text-zinc-900 dark:hover:text-white"
              >
                <Pencil size={11} />
                Editar
              </button>
            </div>
          )}
        </div>
      </article>
    );
  };

  React.useEffect(() => {
    if (!isMobile) return;
    const node = subHeaderRef.current;
    if (!node) return;

    const updateMetrics = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.round(rect.height);
      setSubHeaderHeight((prev) => (prev === height ? prev : height));
      const fillHeight = Math.max(0, Math.round(rect.top));
      setHeaderFill((prev) => (prev.top === 0 && prev.height === fillHeight ? prev : { top: 0, height: fillHeight }));
    };

    updateMetrics();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMetrics) : null;
    observer?.observe(node);
    window.addEventListener('resize', updateMetrics);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [isMobile]);

  const cnpjStatus = cnpj ? 'OK' : 'Pendente';
  const streamCount = dasStreams.length;

  const streamButtons = (
    <div className="flex flex-wrap gap-2">
      {dasStreams.map((stream) => (
        <button
          key={stream.id}
          type="button"
          onClick={() => setSelectedStreamId(stream.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            selectedPlan?.stream.id === stream.id
              ? 'border-teal-400/70 bg-teal-500/20 text-teal-200'
              : 'border-zinc-300/70 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          {stream.label}
        </button>
      ))}
    </div>
  );

  const planSummary = (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="mm-subheader-metric-card rounded-xl">
        <p className="mm-subheader-metric-label">Imposto pago ({activeYear})</p>
        <p className="mm-subheader-metric-value">R$ {formatCurrency(paidTaxTotalAllStreams)}</p>
      </div>
      <div className="mm-subheader-metric-card rounded-xl">
        <p className="mm-subheader-metric-label">Fluxos DAS</p>
        <p className="mm-subheader-metric-value">{streamCount}</p>
      </div>
      <div className="mm-subheader-metric-card rounded-xl">
        <p className="mm-subheader-metric-label">Vencimento base</p>
        <p className="mm-subheader-metric-value">
          {selectedPlan?.templatePaid ? `Dia ${selectedPlan.dueDay}` : 'Aguardando pagamento'}
        </p>
      </div>
    </div>
  );

  const cardsGrid = selectedPlan ? (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {selectedPlan.monthCards.map(renderMonthCard)}
    </div>
  ) : (
    <div className="rounded-xl border border-dashed border-zinc-300/70 dark:border-zinc-700 p-4 text-sm text-zinc-500 dark:text-zinc-400">
      Nenhum fluxo de DAS identificado para {activeYear}.
    </div>
  );

  if (isMobile) {
    const mobileHeader = (
      <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable">
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
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Emissão DAS</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">Calendário anual automático</p>
          </div>
          <div className="min-w-[32px]" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
            <p className="mm-subheader-metric-label">CNPJ</p>
            <p className={`mm-subheader-metric-value ${cnpj ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {cnpjStatus}
            </p>
          </div>
          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
            <p className="mm-subheader-metric-label">Imposto pago</p>
            <p className="mm-subheader-metric-value">R$ {formatCurrency(paidTaxTotalAllStreams)}</p>
          </div>
          <div className="rounded-xl mm-subheader-metric-card mm-mobile-header-card">
            <p className="mm-subheader-metric-label">Fluxos</p>
            <p className="mm-subheader-metric-value">{streamCount}</p>
          </div>
        </div>

        <div className={`grid ${cnpj ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          <button
            type="button"
            onClick={handleOpenPgmei}
            data-tour-anchor="das-open"
            className="w-full mm-btn-base mm-btn-secondary mm-btn-secondary-emerald mm-mobile-primary-cta"
          >
            Abrir PGMEI
          </button>
          {cnpj && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full mm-btn-base mm-btn-secondary mm-btn-secondary-indigo mm-mobile-primary-cta"
            >
              {copied ? 'Copiado' : 'Copiar CNPJ'}
            </button>
          )}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
        <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
          {headerFill.height > 0 && (
            <div
              className="fixed left-0 right-0 z-20 bg-white dark:bg-[#151517] backdrop-blur-xl"
              style={{ top: headerFill.top, height: headerFill.height }}
            />
          )}
          <div className="fixed left-0 right-0 z-30" style={{ top: 'var(--mm-mobile-top, 0px)' }}>
            <div
              ref={subHeaderRef}
              className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
            >
              <div className="mm-mobile-subheader-pad">{mobileHeader}</div>
            </div>
          </div>
          <div
            className="h-full overflow-y-auto mm-mobile-content-pad pb-[calc(env(safe-area-inset-bottom)+88px)]"
            style={{
              paddingTop: subHeaderHeight
                ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px + 2px)`
                : 'calc(var(--mm-mobile-top, 0px) + 2px)'
            }}
          >
            <div className="space-y-0">
              <MobileFullWidthSection contentClassName="mm-mobile-section-pad">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Passo a passo</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">1) Copie o CNPJ do MEI.</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">2) Gere a guia no PGMEI.</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    3) Lance manualmente o pagamento realizado no mês para preencher o card correspondente.
                  </p>
                </div>
              </MobileFullWidthSection>

              <MobileFullWidthSection contentClassName="mm-mobile-section-pad" withDivider={false}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Fluxos DAS</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Ano {activeYear}</p>
                  </div>
                  {streamButtons}
                </div>
              </MobileFullWidthSection>

              <MobileFullWidthSection
                contentClassName="mm-mobile-section-pad"
                withDivider={false}
                backgroundClassName="bg-zinc-50 dark:bg-zinc-900/30"
              >
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Resumo dos fluxos</p>
                  {planSummary}
                </div>
              </MobileFullWidthSection>

              <MobileFullWidthSection
                contentClassName="mm-mobile-section-pad"
                withDivider={false}
                backgroundClassName="bg-zinc-50 dark:bg-zinc-900/40"
              >
                {cardsGrid}
              </MobileFullWidthSection>

              <MobileFullWidthSection contentClassName="mm-mobile-section-pad" withDivider={false}>
                <div className="flex flex-col gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">CNPJ</div>
                  {cnpj ? (
                    <div className="flex flex-col gap-3">
                      <div className="text-lg font-semibold text-zinc-900 dark:text-white break-all">{cnpj}</div>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                      >
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        {copied ? 'Copiado' : 'Copiar CNPJ'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm text-rose-500">
                      <p>CNPJ não informado.</p>
                      {onOpenCompany && (
                        <button
                          type="button"
                          onClick={onOpenCompany}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Preencher na gestão da empresa
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </MobileFullWidthSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const desktopSummarySection = (
    <div className="w-full px-4 sm:px-6 pt-6 relative z-10">
      <div className="mm-subheader mm-subheader-panel w-full">
        <div className="space-y-2">
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
            <div className="h-8 w-8" aria-hidden="true" />
            <div className="min-w-0 text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Emissão DAS</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">Calendário anual automático</p>
            </div>
            <div className="min-w-[32px]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="mm-subheader-metric-card">
              <p className="mm-subheader-metric-label">CNPJ</p>
              <p className={`mm-subheader-metric-value ${cnpj ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                {cnpjStatus}
              </p>
            </div>
            <div className="mm-subheader-metric-card">
              <p className="mm-subheader-metric-label">Imposto pago</p>
              <p className="mm-subheader-metric-value">R$ {formatCurrency(paidTaxTotalAllStreams)}</p>
            </div>
            <div className="mm-subheader-metric-card">
              <p className="mm-subheader-metric-label">Fluxos</p>
              <p className="mm-subheader-metric-value">{streamCount}</p>
            </div>
          </div>

          <div className="mm-header-actions">
            <button
              type="button"
              onClick={handleOpenPgmei}
              data-tour-anchor="das-open"
              className="mm-btn-base mm-btn-primary mm-btn-primary-teal"
            >
              Abrir PGMEI
            </button>
            {cnpj && (
              <button
                type="button"
                onClick={handleCopy}
                className="mm-btn-base mm-btn-secondary mm-btn-secondary-indigo"
              >
                {copied ? 'Copiado' : 'Copiar CNPJ'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter flex flex-col overflow-hidden">
      {desktopSummarySection}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-[var(--mm-content-gap)] flex-1 min-h-0 pb-0">
        <div className="bg-white dark:bg-[#151517] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-3 flex-1 min-h-0 flex flex-col">
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 mb-2">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Fluxos de Imposto</h2>
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Ano {activeYear}</span>
            </div>
            {streamButtons}
          </section>
          <section className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
            {cardsGrid}
          </section>
        </div>
      </main>
    </div>
  );
};

export default DasView;
