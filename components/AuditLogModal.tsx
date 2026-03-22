import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Clock,
  FilePlus,
  Filter,
  Pencil,
  Search,
  ShieldCheck,
  TrendingUp,
  Trash2
} from 'lucide-react';
import { auditService, AuditLog, AuditEntityType } from '../services/auditService';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose?: () => void;
  licenseId?: string | null;
  entityTypes?: AuditEntityType[];
}

type PeriodFilter = 'today' | '7d' | '30d';
type OperationFilter = 'all' | 'insercao' | 'edicao' | 'exclusao' | 'outro';
type EntityFilter = 'all' | AuditEntityType;

const periodLabel: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias'
};

const actionIconMap: Record<string, React.ElementType> = {
  account_created: FilePlus,
  account_edited: Pencil,
  expense_created: FilePlus,
  expense_edited: Pencil,
  income_created: FilePlus,
  income_edited: Pencil,
  transfer_created: FilePlus,
  transfer_deleted: Trash2,
  balance_adjustment: CircleDollarSign,
  account_deleted: Trash2,
  expense_deleted: Trash2,
  income_deleted: Trash2,
  invoice_paid: CircleDollarSign,
  invoice_reopened: Pencil,
  yield_added: TrendingUp,
  system_action: ShieldCheck
};

const actionLabelMap: Record<string, string> = {
  account_created: 'Conta criada',
  account_edited: 'Conta atualizada',
  account_deleted: 'Conta excluída',
  balance_adjustment: 'Saldo ajustado',
  expense_created: 'Saída criada',
  expense_edited: 'Saída atualizada',
  expense_deleted: 'Saída excluída',
  income_created: 'Entrada criada',
  income_edited: 'Entrada atualizada',
  income_deleted: 'Entrada excluída',
  transfer_created: 'Transferência criada',
  transfer_deleted: 'Transferência removida',
  invoice_paid: 'Fatura paga',
  invoice_reopened: 'Fatura reaberta',
  yield_added: 'Rendimento registrado',
  system_action: 'Ação do sistema',
  support_read: 'Consulta realizada pelo suporte',
  assign_plan: 'Plano atribuído',
  rollback: 'Ação revertida'
};

const operationMeta: Record<
  Exclude<OperationFilter, 'all'>,
  { label: string; chipClass: string; cardClass: string; borderClass: string }
> = {
  insercao: {
    label: 'Criação',
    chipClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    cardClass: 'bg-emerald-500/10 border-emerald-500/25',
    borderClass: 'border-l-emerald-500/45'
  },
  edicao: {
    label: 'Edição',
    chipClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    cardClass: 'bg-amber-500/10 border-amber-500/25',
    borderClass: 'border-l-amber-500/45'
  },
  exclusao: {
    label: 'Exclusão',
    chipClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    cardClass: 'bg-rose-500/10 border-rose-500/25',
    borderClass: 'border-l-rose-500/45'
  },
  outro: {
    label: 'Outro',
    chipClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    cardClass: 'bg-slate-500/10 border-slate-500/25',
    borderClass: 'border-l-slate-500/45'
  }
};

const entityTypeLabel: Record<AuditEntityType, string> = {
  account: 'Contas',
  expense: 'Saídas',
  income: 'Entradas',
  yield: 'Rendimentos',
  system: 'Sistema'
};

const entityTypeChipClass: Record<AuditEntityType, string> = {
  expense:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300',
  income:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300',
  account:
    'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300',
  yield:
    'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300',
  system:
    'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300'
};

const auditTagSizeClass =
  'inline-flex items-center justify-center rounded-full border px-2 py-0 text-[10px] font-semibold leading-none h-[18px] min-w-[84px] mx-[2px] shrink-0';

const defaultEntityFilterOptions: Array<{ id: EntityFilter; label: string }> = [
  { id: 'all', label: 'Todos os módulos' },
  { id: 'account', label: 'Contas' },
  { id: 'expense', label: 'Saídas' },
  { id: 'income', label: 'Entradas' },
  { id: 'yield', label: 'Rendimentos' }
];

const buildLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currencyMetadataKeys = new Set([
  'amount',
  'value',
  'delta',
  'balanceBefore',
  'balanceAfter',
  'previousBalance',
  'nextBalance',
  'currentBalance',
  'initialBalance'
]);

const dateMetadataKeys = new Set(['date', 'dueDate', 'paymentDate', 'createdAt', 'updatedAt']);

const metadataLabelMap: Record<string, string> = {
  amount: 'Valor',
  value: 'Valor',
  category: 'Categoria',
  date: 'Data',
  dueDate: 'Data de vencimento',
  paymentDate: 'Data de pagamento',
  status: 'Situação',
  description: 'Descrição',
  fromAccountName: 'Conta de origem',
  toAccountName: 'Conta de destino',
  accountName: 'Conta',
  paymentMethod: 'Forma de pagamento',
  type: 'Tipo',
  balanceBefore: 'Saldo anterior',
  balanceAfter: 'Saldo após a ação',
  previousBalance: 'Saldo anterior',
  nextBalance: 'Saldo após a ação',
  currentBalance: 'Saldo atual',
  initialBalance: 'Saldo inicial'
};

const genericValueLabelMap: Record<string, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  fixed: 'Fixa',
  variable: 'Variável',
  personal: 'Pessoal',
  income: 'Entrada',
  expense: 'Saída',
  yield: 'Rendimento',
  account: 'Conta',
  transfer: 'Transferência'
};

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const applyFriendlyTerms = (value: string) =>
  value
    .replace(/\byeld\b/gi, 'rendimento')
    .replace(/\byield\b/gi, 'rendimento')
    .replace(/\bexpense\b/gi, 'saída')
    .replace(/\bincome\b/gi, 'entrada')
    .replace(/\baccount\b/gi, 'conta')
    .replace(/\btransfer\b/gi, 'transferência');

const toFriendlyValue = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (genericValueLabelMap[normalized]) return genericValueLabelMap[normalized];
  return applyFriendlyTerms(value.trim());
};

const formatMaybeDate = (value: string) => {
  if (!value.trim()) return null;
  const hasSimpleIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const parsed = hasSimpleIsoDate ? new Date(`${value.trim()}T12:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const toMetadataLabel = (key: string) => {
  if (metadataLabelMap[key]) return metadataLabelMap[key];
  return titleCase(key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '));
};

const formatMetadataValue = (key: string, value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'number') {
    if (currencyMetadataKeys.has(key) || /(amount|balance|value|total)/i.test(key)) return formatCurrency(value);
    return value.toLocaleString('pt-BR');
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    if (dateMetadataKeys.has(key) || /date/i.test(key)) {
      const dateValue = formatMaybeDate(raw);
      if (dateValue) return dateValue;
    }

    if (currencyMetadataKeys.has(key) || /(amount|balance|value|total)/i.test(key)) {
      const normalized = raw.replace(/\./g, '').replace(',', '.');
      const maybeNumber = Number(normalized);
      if (Number.isFinite(maybeNumber)) return formatCurrency(maybeNumber);
    }

    return toFriendlyValue(raw);
  }

  if (Array.isArray(value)) {
    const values = value.map((item) => toFriendlyValue(String(item))).filter(Boolean);
    return values.length ? values.join(', ') : null;
  }

  if (typeof value === 'object') {
    const possibleTimestamp = value as { toDate?: () => Date };
    if (typeof possibleTimestamp.toDate === 'function') {
      const date = possibleTimestamp.toDate();
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }
  }

  return toFriendlyValue(String(value));
};

const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const toDate = (log: AuditLog): Date | null => {
  const timestamp = (log as any).timestamp;
  const date: Date | null = timestamp?.toDate ? timestamp.toDate() : null;
  if (date && !Number.isNaN(date.getTime())) return date;
  if (typeof log.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(log.dateKey)) {
    const parsed = new Date(`${log.dateKey}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toDateKey = (log: AuditLog) => {
  const date = toDate(log);
  if (date) return buildLocalDateKey(date);
  return log.dateKey || 'sem_data';
};

const getOperation = (actionType: string): Exclude<OperationFilter, 'all'> => {
  const key = String(actionType || '').toLowerCase();
  if (/(delete|deleted|remove|removed|revoke)/.test(key)) return 'exclusao';
  if (/(edit|edited|adjust|adjustment|update|updated|reopen|reopened|paid|payment)/.test(key)) return 'edicao';
  if (/(create|created|add|added|yield_added)/.test(key)) return 'insercao';
  return 'outro';
};

const toActionLabel = (actionType: string) => {
  const normalized = String(actionType || '').toLowerCase().trim();
  if (actionLabelMap[normalized]) return actionLabelMap[normalized];
  return titleCase(applyFriendlyTerms(normalized.replace(/_/g, ' ')));
};

const toReadableDescription = (log: AuditLog) => {
  const raw = String(log.description || '').trim();
  if (raw) return applyFriendlyTerms(raw);
  const moduleLabel = entityTypeLabel[log.entityType] || 'Sistema';
  return `${toActionLabel(log.actionType)} no módulo ${moduleLabel}.`;
};

const formatDateTitle = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const formatDateTime = (log: AuditLog) => {
  const date = toDate(log);
  if (!date) return '--/-- --:--';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatOnlyTime = (log: AuditLog) => {
  const date = toDate(log);
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getMetadataPreview = (log: AuditLog) => {
  const meta = log.metadata && typeof log.metadata === 'object' ? (log.metadata as Record<string, unknown>) : null;
  if (!meta) return null;
  const keysPriority = [
    'amount',
    'category',
    'date',
    'dueDate',
    'status',
    'fromAccountName',
    'toAccountName'
  ];
  const lines: string[] = [];
  keysPriority.forEach((key) => {
    if (meta[key] === undefined || meta[key] === null || meta[key] === '') return;
    const formattedValue = formatMetadataValue(key, meta[key]);
    if (!formattedValue) return;
    lines.push(`${toMetadataLabel(key)}: ${formattedValue}`);
  });

  if (lines.length === 0) {
    Object.keys(meta)
      .slice(0, 3)
      .forEach((key) => {
        const formattedValue = formatMetadataValue(key, meta[key]);
        if (!formattedValue) return;
        lines.push(`${toMetadataLabel(key)}: ${formattedValue}`);
      });
  }

  return lines.slice(0, 3);
};

const getStats = (rows: AuditLog[]) => {
  const stats = { total: rows.length, insercao: 0, edicao: 0, exclusao: 0, outro: 0 };
  rows.forEach((log) => {
    const op = getOperation(log.actionType);
    stats[op] += 1;
  });
  return stats;
};

const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, licenseId, entityTypes }) => {
  const defaultPeriod: PeriodFilter = '7d';
  const scopedEntityTypes = useMemo<AuditEntityType[]>(() => {
    if (!Array.isArray(entityTypes) || entityTypes.length === 0) return [];
    const valid = entityTypes.filter((type): type is AuditEntityType =>
      ['account', 'expense', 'income', 'yield', 'system'].includes(type)
    );
    return Array.from(new Set(valid));
  }, [entityTypes]);
  const isScopedAudit = scopedEntityTypes.length > 0;
  const scopedEntitySet = useMemo(() => new Set(scopedEntityTypes), [scopedEntityTypes]);
  const [period, setPeriod] = useState<PeriodFilter>(defaultPeriod);
  const [operation, setOperation] = useState<OperationFilter>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopedDefaultEntityFilter: EntityFilter =
    isScopedAudit && scopedEntityTypes.length === 1 ? scopedEntityTypes[0] : 'all';

  useEffect(() => {
    if (!isOpen) return;
    setPeriod(defaultPeriod);
    setOperation('all');
    setEntityFilter(scopedDefaultEntityFilter);
    setSearch('');
  }, [defaultPeriod, isOpen, scopedDefaultEntityFilter]);

  useEffect(() => {
    if (!isOpen || !licenseId) return;
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      if (period === 'today') {
        const today = new Date();
        const recentItems = await auditService.loadLogsForRecentDays(licenseId, 7);
        const todayKey = buildLocalDateKey(today);
        return recentItems.filter((item) => toDateKey(item) === todayKey);
      }
      return auditService.loadLogsForRecentDays(licenseId, period === '7d' ? 7 : 30);
    };

    load()
      .then((items) => {
        if (!active) return;
        setLogs(
          items.filter((item) => {
            if (item.entityType === 'system') return false;
            if (!isScopedAudit) return true;
            return scopedEntitySet.has(item.entityType);
          })
        );
      })
      .catch((err) => {
        if (!active) return;
        setError((err as Error)?.message || 'Falha ao carregar auditoria.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, licenseId, period, isScopedAudit, scopedEntitySet]);

  const entityFilterOptions = useMemo<Array<{ id: EntityFilter; label: string }>>(() => {
    if (!isScopedAudit) return defaultEntityFilterOptions;
    const scopedOptions = scopedEntityTypes
      .filter((type): type is Exclude<AuditEntityType, 'system'> => type !== 'system')
      .map((type) => ({ id: type as EntityFilter, label: entityTypeLabel[type] || type }));
    if (scopedOptions.length <= 1) return scopedOptions;
    return [{ id: 'all', label: 'Todos os módulos desta tela' }, ...scopedOptions];
  }, [isScopedAudit, scopedEntityTypes]);

  const scopeTitle = useMemo(() => {
    if (!isScopedAudit) return 'Auditoria do Sistema';
    const labels = scopedEntityTypes
      .filter((type): type is Exclude<AuditEntityType, 'system'> => type !== 'system')
      .map((type) => entityTypeLabel[type] || type);
    if (labels.length === 0) return 'Auditoria da Tela';
    if (labels.length === 1) return `Auditoria de ${labels[0]}`;
    return `Auditoria de ${labels.join(', ')}`;
  }, [isScopedAudit, scopedEntityTypes]);

  const scopeSubtitle = useMemo(() => {
    if (!isScopedAudit) return 'Resumo de tudo que foi criado, alterado ou excluído.';
    return 'Resumo do que foi criado, alterado ou excluído neste módulo.';
  }, [isScopedAudit]);

  const filteredLogs = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return logs.filter((log) => {
      const op = getOperation(log.actionType);
      if (operation !== 'all' && op !== operation) return false;
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (!searchTerm) return true;
      const haystack = [
        toReadableDescription(log),
        toActionLabel(log.actionType),
        entityTypeLabel[log.entityType] || log.entityType,
        log.userEmail || '',
        ...(getMetadataPreview(log) || [])
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [entityFilter, logs, operation, search]);

  const periodStats = useMemo(() => getStats(logs), [logs]);
  const filteredStats = useMemo(() => getStats(filteredLogs), [filteredLogs]);

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, AuditLog[]>();
    filteredLogs.forEach((log) => {
      const key = toDateKey(log);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(log);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredLogs]);

  const recentTimeline = useMemo(() => {
    return groupedLogs.slice(0, 7).map(([dateKey, rows]) => ({
      dateKey,
      total: rows.length,
      critical: rows.filter((row) => getOperation(row.actionType) === 'exclusao').length
    }));
  }, [groupedLogs]);

  const hasActiveFilters =
    operation !== 'all' || entityFilter !== scopedDefaultEntityFilter || search.trim() !== '';
  const newestLog = filteredLogs[0] || null;

  if (!isOpen) return null;

  return (
    <div className="bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300">
      <div className="w-full px-4 sm:px-6 pt-6 relative z-10">
        <div className="max-w-7xl mx-auto">
        <div className="mm-subheader mm-subheader-panel">
              <div className="space-y-2 mm-subheader-stack">
              <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
                <div className="h-8 w-8" aria-hidden="true" />
                <div className="min-w-0 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{scopeTitle}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {scopeSubtitle}
                  </p>
                </div>
                <div className="min-w-[32px]" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                <div className="mm-subheader-metric-card">
                <p className="mm-subheader-metric-label">Eventos no período</p>
                <p className="mm-subheader-metric-value">{periodStats.total}</p>
              </div>
              <div className="mm-subheader-metric-card">
                <p className="mm-subheader-metric-label">Após filtros</p>
                <p className="mm-subheader-metric-value">{filteredStats.total}</p>
              </div>
              {(
                [
                  { key: 'insercao', valueClass: 'text-emerald-600 dark:text-emerald-400' },
                  { key: 'edicao', valueClass: 'text-amber-600 dark:text-amber-400' },
                  { key: 'exclusao', valueClass: 'text-rose-600 dark:text-rose-400' },
                  { key: 'outro', valueClass: 'text-slate-600 dark:text-slate-400' }
                ] as const
              ).map(({ key, valueClass }) => (
                <div key={key} className="mm-subheader-metric-card">
                  <p className="mm-subheader-metric-label">{operationMeta[key].label}</p>
                  <p className={`mm-subheader-metric-value ${valueClass}`}>{filteredStats[key]}</p>
                </div>
              ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-1">
                <Clock size={12} />
                {periodLabel[period]}
              </span>
              {isScopedAudit ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/35 bg-indigo-500/10 px-2 py-1 text-indigo-300">
                  <ShieldCheck size={12} />
                  Módulo filtrado
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-1">
                Dias com movimentações: {groupedLogs.length}
              </span>
              {newestLog ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-1">
                  Último evento: {formatDateTime(newestLog)}
                </span>
              ) : null}
              {filteredStats.exclusao > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-rose-300">
                  <AlertTriangle size={12} />
                  {filteredStats.exclusao}{' '}
                  {pluralize(filteredStats.exclusao, 'exclusão', 'exclusões')} no filtro atual
                </span>
              ) : null}
              </div>
              </div>
        </div>
        </div>
      </div>

      <main className="w-full px-4 sm:px-6 pt-[var(--mm-content-gap,16px)] pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-3 space-y-2">
            <div className={`grid gap-2 ${isScopedAudit ? 'lg:grid-cols-[1fr_auto_auto]' : 'lg:grid-cols-[1fr_auto_auto_auto]'}`}>
              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-1 py-1">
                {([
                  { id: 'today' as const, label: 'Hoje' },
                  { id: '7d' as const, label: '7 dias' },
                  { id: '30d' as const, label: '30 dias' }
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPeriod(item.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition ${
                      period === item.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
                <Filter size={14} className="text-zinc-400" />
                <select
                  value={operation}
                  onChange={(event) => setOperation(event.target.value as OperationFilter)}
                  className="h-10 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-200"
                >
                  <option value="all">Todas as operações</option>
                  <option value="insercao">Criações</option>
                  <option value="edicao">Edições</option>
                  <option value="exclusao">Exclusões</option>
                  <option value="outro">Outros</option>
                </select>
              </div>

              {!isScopedAudit && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
                  <CalendarDays size={14} className="text-zinc-400" />
                  <select
                    value={entityFilter}
                    onChange={(event) => setEntityFilter(event.target.value as EntityFilter)}
                    className="h-10 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-200"
                  >
                    {entityFilterOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setOperation('all');
                  setEntityFilter(scopedDefaultEntityFilter);
                  setSearch('');
                }}
                disabled={!hasActiveFilters}
                className={`h-10 rounded-xl border px-3 text-sm font-semibold transition ${
                  hasActiveFilters
                    ? 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed'
                }`}
              >
                Limpar filtros
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
                <Search size={14} className="text-zinc-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por o que aconteceu, módulo ou usuário..."
                  className="w-full h-10 bg-transparent text-sm outline-none text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400"
                />
              </div>
            </div>
          </section>

          {loading && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-4 py-4 text-sm text-zinc-500">
              Carregando eventos de auditoria...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && filteredLogs.length === 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] px-6 py-10 text-center">
              <div className="mx-auto h-12 w-12 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 mb-3">
                <Clock size={20} />
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Nenhum evento encontrado para este filtro.
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Altere o período, módulo ou termos de busca para ampliar a investigação.
              </p>
            </div>
          )}

          {!loading && !error && filteredLogs.length > 0 && (
            <>
              <section>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      Linha do tempo recente
                    </p>
                    <span className="text-[11px] text-zinc-500">
                      {recentTimeline.length} dias analisados
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {recentTimeline.map((item) => (
                      <div
                        key={item.dateKey}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2"
                      >
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{formatDateTitle(item.dateKey)}</p>
                        <p className="text-base font-semibold">
                          {item.total} {pluralize(item.total, 'movimentação', 'movimentações')}
                        </p>
                        <p className="text-[11px] text-rose-400">Exclusões: {item.critical}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {groupedLogs.map(([dateKey, items]) => {
                const dayStats = getStats(items);
                return (
                  <section key={dateKey} className="space-y-2">
                    <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-[#08080b]/95 backdrop-blur py-1">
                      <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                        <CalendarDays size={12} />
                        <span>{formatDateTitle(dateKey)}</span>
                        <span>•</span>
                        <span>{items.length} {pluralize(items.length, 'movimentação', 'movimentações')}</span>
                        <span>•</span>
                        <span className="text-rose-400">Exclusões: {dayStats.exclusao}</span>
                      </div>
                    </div>

                    <div className="hidden lg:block rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#111114]">
                      <div className="grid grid-cols-[88px_110px_120px_170px_minmax(260px,1fr)_220px] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50">
                        <span className="pr-2 border-r border-zinc-200 dark:border-zinc-800">Hora</span>
                        <span className="px-2 border-r border-zinc-200 dark:border-zinc-800">Operação</span>
                        <span className="px-2 border-r border-zinc-200 dark:border-zinc-800">Módulo</span>
                        <span className="px-2 border-r border-zinc-200 dark:border-zinc-800">O que aconteceu</span>
                        <span className="px-2 border-r border-zinc-200 dark:border-zinc-800">Descrição</span>
                        <span>Usuário</span>
                      </div>
                      {items.map((log) => {
                        const op = getOperation(log.actionType);
                        const meta = getMetadataPreview(log);
                        return (
                          <div
                            key={log.id}
                            className={`grid grid-cols-[88px_110px_120px_170px_minmax(260px,1fr)_220px] px-3 py-3 border-t border-zinc-200 dark:border-zinc-800 border-l-4 ${operationMeta[op].borderClass}`}
                          >
                            <div className="pr-2 border-r border-zinc-200 dark:border-zinc-800 flex items-center text-xs text-zinc-500 dark:text-zinc-400">
                              {formatOnlyTime(log)}
                            </div>
                            <div className="px-2 border-r border-zinc-200 dark:border-zinc-800 flex items-center">
                              <span className={`${auditTagSizeClass} ${operationMeta[op].chipClass}`}>
                                {operationMeta[op].label}
                              </span>
                            </div>
                            <div className="px-2 border-r border-zinc-200 dark:border-zinc-800 flex items-center">
                              <span className={`${auditTagSizeClass} ${entityTypeChipClass[log.entityType]}`}>
                                {entityTypeLabel[log.entityType] || log.entityType}
                              </span>
                            </div>
                            <div className="px-2 border-r border-zinc-200 dark:border-zinc-800 flex items-center text-[11px] text-zinc-500 dark:text-zinc-300">
                              {toActionLabel(log.actionType)}
                            </div>
                            <div className="min-w-0 px-2 border-r border-zinc-200 dark:border-zinc-800 flex flex-col justify-center">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                                {toReadableDescription(log)}
                              </p>
                              {meta && meta.length > 0 ? (
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{meta.join(' • ')}</p>
                              ) : null}
                            </div>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex items-center">
                              {log.userEmail || 'Usuário não identificado'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-2 lg:hidden">
                      {items.map((log) => {
                        const Icon = actionIconMap[log.actionType] || Clock;
                        const op = getOperation(log.actionType);
                        const metaPreview = getMetadataPreview(log);
                        return (
                          <article
                            key={log.id}
                            className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-3 border-l-4 ${operationMeta[op].borderClass}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-indigo-500 shrink-0">
                                <Icon size={16} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className={`${auditTagSizeClass} ${operationMeta[op].chipClass}`}>
                                    {operationMeta[op].label}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-300">
                                    {toActionLabel(log.actionType)}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white break-words">
                                  {toReadableDescription(log)}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  <span
                                    className={`${auditTagSizeClass} ${entityTypeChipClass[log.entityType]}`}
                                  >
                                    {entityTypeLabel[log.entityType] || log.entityType}
                                  </span>
                                  <span>•</span>
                                  <span>{formatDateTime(log)}</span>
                                  <span>•</span>
                                  <span>{log.userEmail || 'Usuário não identificado'}</span>
                                </div>
                                {metaPreview && metaPreview.length > 0 ? (
                                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {metaPreview.map((line) => (
                                      <span key={`${log.id}-${line}`} className="truncate">
                                        {line}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuditLogModal;
