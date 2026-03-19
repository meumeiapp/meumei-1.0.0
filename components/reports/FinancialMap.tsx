import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hand, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import type { Account, CreditCard, Expense, Income } from '../../types';
import type { YieldRecord } from '../../services/yieldsService';
import { useGlobalActions } from '../../contexts/GlobalActionsContext';
import { formatCompactCurrency, formatCurrency, getTaxMatchTokens, isTaxExpense } from './reportUtils';

export type ReportTransactions = {
  incomes: Income[];
  expenses: Expense[];
};

type NodeKind = 'center' | 'main' | 'sub' | 'detail';

type NodeGroup =
  | 'income'
  | 'fixed'
  | 'variable'
  | 'personal'
  | 'rendimentos'
  | 'taxes';

type PaymentTag = 'paid' | 'pending' | 'unpaid';

interface ReportNodeData {
  label: string;
  value: number;
  percent: number;
  kind: NodeKind;
  group?: NodeGroup;
  category?: string;
  referenceId?: string;
  parentReferenceId?: string;
  isMore?: boolean;
  insight?: string;
  hasChildren?: boolean;
  expanded?: boolean;
  centerDetails?: Array<{
    label: string;
    value: string;
    tone?: 'positive' | 'negative' | 'neutral';
  }>;
  tagLabel?: string;
  paymentTag?: PaymentTag;
  size: number;
  color: string;
  background: string;
}

type MapNode = {
  id: string;
  position: { x: number; y: number };
  data: ReportNodeData;
};

type MapEdge = {
  id: string;
  source: string;
  target: string;
};

interface FinancialMapProps {
  summary: {
    totalReceitas: number;
    totalDespesas: number;
  };
  transactions: ReportTransactions;
  yields: YieldRecord[];
  accounts: Account[];
  creditCards: CreditCard[];
  isMobile: boolean;
  hideDesktopRail?: boolean;
  fullscreenRequestId?: number;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  previousCarryover?: number;
  previousPeriodLabel?: string;
  incomeTotalOverride?: number;
  currentAvailableBalance?: number;
}

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.6;
const PAYMENT_TAG_META: Record<PaymentTag, { label: string; className: string }> = {
  paid: {
    label: 'Pago',
    className: 'text-emerald-200 border-emerald-300/40 bg-emerald-500/20'
  },
  pending: {
    label: 'Pendente',
    className: 'text-amber-100 border-amber-300/40 bg-amber-500/20'
  },
  unpaid: {
    label: 'Não pago',
    className: 'text-rose-100 border-rose-300/45 bg-rose-500/20'
  }
};

const getNodeDimensions = (size: number, kind: NodeKind, isMobile: boolean) => {
  const config =
    kind === 'center'
      ? {
          widthScale: 1.28,
          heightScale: 0.94,
          minWidth: isMobile ? 176 : 238,
          minHeight: isMobile ? 128 : 168
        }
      : kind === 'main'
        ? {
            widthScale: 1.28,
            heightScale: 0.7,
            minWidth: isMobile ? 130 : 170,
            minHeight: isMobile ? 76 : 92
          }
        : kind === 'sub'
          ? {
              widthScale: 1.2,
              heightScale: 0.68,
              minWidth: isMobile ? 120 : 150,
              minHeight: isMobile ? 80 : 98
            }
          : {
            widthScale: 1.2,
            heightScale: 0.64,
            minWidth: isMobile ? 116 : 148,
            minHeight: isMobile ? 80 : 96
          };

  return {
    width: Math.max(size * config.widthScale, config.minWidth),
    height: Math.max(size * config.heightScale, config.minHeight)
  };
};

type ReportNodeProps = {
  data: ReportNodeData;
  width: number;
  height: number;
  selected: boolean;
  onClick: () => void;
  onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
};

const ReportNode = ({
  data,
  width,
  height,
  selected,
  onClick,
  onMouseEnter,
  onMouseMove,
  onMouseLeave
}: ReportNodeProps) => {
  const isCenter = data.kind === 'center';
  const label = data.isMore ? '+ ver mais' : data.label;
  const valueText = data.isMore ? '' : formatCompactCurrency(data.value);
  const percentText = data.isMore ? '' : `${Math.round(data.percent)}%`;
  const paymentMeta = data.paymentTag ? PAYMENT_TAG_META[data.paymentTag] : null;
  const hasFooterTag = !isCenter && (Boolean(paymentMeta) || Boolean(data.tagLabel));
  const highlight = selected ? hexToRgba(data.color, 0.45) : hexToRgba(data.color, 0.28);
  const contentWidth = Math.max(width - 28, 0);
  const contentHeight = Math.max(height - (hasFooterTag ? 12 : 20), 0);
  const centerDetails = isCenter ? data.centerDetails?.slice(0, 3) : undefined;
  const isCompact = height < 90;
  const labelLineClamp = hasFooterTag ? 1 : 2;
  const statusBadgeClass =
    'inline-flex h-4 w-[58px] shrink-0 items-center justify-center rounded-full border px-1 text-[7px] font-semibold uppercase tracking-[0.06em] leading-none';
  const cardBadgeClass =
    'inline-flex h-4 max-w-[92px] min-w-0 items-center rounded-full border border-sky-300/40 bg-sky-500/20 px-1 text-[7px] font-semibold uppercase tracking-[0.06em] text-sky-100 leading-none';
  const background = data.isMore
    ? 'linear-gradient(135deg, rgba(15,23,42,0.75), rgba(30,41,59,0.7))'
    : `radial-gradient(circle at 30% 25%, ${hexToRgba(data.color, 0.38)}, ${hexToRgba(
        data.color,
        0.16
      )} 55%, rgba(15,23,42,0.65) 100%)`;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative flex items-center justify-center text-center rounded-2xl border border-white/10 text-white shadow-lg backdrop-blur-sm transition-transform duration-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-inherit"
      style={{
        width,
        height,
        background,
        borderColor: hexToRgba(data.color, selected ? 0.7 : 0.45),
        boxShadow: `0 16px 40px ${highlight}, 0 0 0 1px rgba(255,255,255,0.06)`
      }}
    >
      <div
        className={`px-3 ${isCenter ? 'space-y-1.5' : hasFooterTag ? 'space-y-0.5' : 'space-y-1'}`}
        style={{ maxWidth: contentWidth, maxHeight: contentHeight, overflow: 'hidden' }}
      >
        <div
          className={`uppercase tracking-[0.18em] text-white/70 leading-tight ${
            isCompact ? 'text-[9px]' : 'text-[10px]'
          }`}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: labelLineClamp,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {label}
        </div>
        {isCenter ? (
          <>
            <div className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-semibold text-white`}>
              {Math.round(data.percent)}%
            </div>
            <div className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-semibold text-white/85`}>
              Despesas do período: {valueText}
            </div>
            {centerDetails && centerDetails.length > 0 && (
              <div className="grid grid-cols-3 gap-1">
                {centerDetails.map(detail => (
                  <div
                    key={detail.label}
                    className="rounded-lg border border-white/10 bg-black/20 px-1.5 py-1"
                  >
                    <div className="text-[7px] uppercase tracking-[0.12em] text-white/60 truncate">
                      {detail.label}
                    </div>
                    <div
                      className={`text-[9px] font-semibold truncate ${
                        detail.tone === 'positive'
                          ? 'text-emerald-200'
                          : detail.tone === 'negative'
                            ? 'text-rose-200'
                            : 'text-white/85'
                      }`}
                    >
                      {detail.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.insight && (
              <div
                className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-white/65 leading-tight`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: isCompact ? 2 : 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {data.insight}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-white`}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {valueText}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1 min-w-0">
              <div className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-white/60`}>
                {percentText}
              </div>
              {paymentMeta && (
                <div
                  className={`${statusBadgeClass} ${paymentMeta.className}`}
                >
                  {paymentMeta.label}
                </div>
              )}
              {data.tagLabel && (
                <div className={cardBadgeClass}>
                  <span className="truncate">{data.tagLabel}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {data.kind === 'sub' && data.hasChildren && (
        <div className="pointer-events-none absolute right-2 top-2 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full border border-white/25 bg-white/10 px-1 text-[8px] font-semibold leading-none text-white/90">
          {data.expanded ? '−' : '+'}
        </div>
      )}
    </button>
  );
};

const sumAmounts = (items: Array<{ amount: number }>) =>
  items.reduce((acc, item) => acc + item.amount, 0);

const buildCategoryTotals = (items: Array<{ category?: string; amount: number }>) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    const key = String(item.category || '')
      .trim()
      .replace(/\s+/g, ' ') || 'Sem categoria';
    map.set(key, (map.get(key) || 0) + item.amount);
  });
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
};

const buildYieldTotals = (items: YieldRecord[], accounts: Account[]) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    map.set(item.accountId, (map.get(item.accountId) || 0) + item.amount);
  });
  const accountMap = new Map(accounts.map(account => [account.id, account.name]));
  return Array.from(map.entries())
    .map(([accountId, total]) => ({
      id: accountId,
      label: accountMap.get(accountId) || 'Conta',
      total
    }))
    .sort((a, b) => b.total - a.total);
};

type DetailEntry = {
  id: string;
  label: string;
  total: number;
  count: number;
  sourceIds: string[];
  tagLabel?: string;
  paymentCounters: PaymentCounters;
  paymentTag?: PaymentTag;
};

type PaymentCounters = {
  paid: number;
  pending: number;
  unpaid: number;
};

const createPaymentCounters = (): PaymentCounters => ({
  paid: 0,
  pending: 0,
  unpaid: 0
});

const addPaymentCounter = (counters: PaymentCounters, tag?: PaymentTag) => {
  if (!tag) return;
  counters[tag] += 1;
};

const mergePaymentCounters = (target: PaymentCounters, source: PaymentCounters) => {
  target.paid += source.paid;
  target.pending += source.pending;
  target.unpaid += source.unpaid;
};

const resolvePaymentTag = (counters: PaymentCounters): PaymentTag | undefined => {
  if (counters.unpaid > 0) return 'unpaid';
  if (counters.pending > 0) return 'pending';
  if (counters.paid > 0) return 'paid';
  return undefined;
};

const parseComparableDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveExpensePaymentTag = (item: Expense, todayRef: Date): PaymentTag => {
  if (item.status === 'paid') return 'paid';
  const due = parseComparableDate(item.dueDate || item.date);
  if (due && due.getTime() < todayRef.getTime()) return 'unpaid';
  return 'pending';
};

const resolveIncomePaymentTag = (item: Income): PaymentTag =>
  item.status === 'received' ? 'paid' : 'pending';

const normalizeLabel = (value: string | null | undefined, fallback: string) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
};

const formatDateLabel = (dateValue?: string | null) => {
  if (!dateValue) return 'Sem data';
  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Sem data';
  return parsed.toLocaleDateString('pt-BR');
};

const sortDetailEntries = (entries: DetailEntry[]) =>
  entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.count - a.count;
  });

const buildSubExpansionKey = (group: NodeGroup, referenceId: string) => `${group}::${referenceId}`;
const CARRYOVER_CATEGORY_ID = '__carryover__';
const CARRYOVER_SOURCE_ID = '__carryover_source__';
const BALANCE_BUFFER_CATEGORY_ID = '__balance_buffer__';

const FinancialMap: React.FC<FinancialMapProps> = ({
  summary,
  transactions,
  yields,
  accounts,
  creditCards,
  isMobile,
  hideDesktopRail = false,
  fullscreenRequestId,
  onFullscreenChange,
  previousCarryover = 0,
  previousPeriodLabel,
  incomeTotalOverride,
  currentAvailableBalance
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [activeNode, setActiveNode] = useState<ReportNodeData | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<NodeGroup>>(new Set());
  const [expandedSubNodes, setExpandedSubNodes] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsNativeFullscreen, setSupportsNativeFullscreen] = useState(false);
  const [isTouchInteractionEnabled, setIsTouchInteractionEnabled] = useState(false);
  const [showDesktopOnlyNotice, setShowDesktopOnlyNotice] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<
    | {
        node: ReportNodeData;
        x: number;
        y: number;
      }
    | null
  >(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef(viewport);
  const viewportFrameRef = useRef<number | null>(null);
  const pendingViewportRef = useRef<{ x: number; y: number; scale: number } | null>(null);
  const [autoCenter, setAutoCenter] = useState(true);
  const fullscreenRequestRef = useRef(fullscreenRequestId ?? 0);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    type: 'pan' | 'pinch';
    startX: number;
    startY: number;
    startScale: number;
    startTranslate: { x: number; y: number };
    startDistance?: number;
    startCenter?: { x: number; y: number };
  } | null>(null);
  const { navigateToResult } = useGlobalActions();

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    if (observer) observer.observe(element);

    return () => {
      if (observer) observer.disconnect();
    };
  }, []);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && viewportFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportFrameRef.current);
      }
      viewportFrameRef.current = null;
      pendingViewportRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const element = containerRef.current;
    setSupportsNativeFullscreen(Boolean(document.fullscreenEnabled && element?.requestFullscreen));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!supportsNativeFullscreen) return;
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [supportsNativeFullscreen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (isMobile && isFullscreen) {
      root.classList.add('allow-landscape');
    } else {
      root.classList.remove('allow-landscape');
    }
    return () => {
      root.classList.remove('allow-landscape');
    };
  }, [isFullscreen, isMobile]);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    if (typeof fullscreenRequestId !== 'number') return;
    if (fullscreenRequestId === fullscreenRequestRef.current) return;
    fullscreenRequestRef.current = fullscreenRequestId;
    handleFullscreenClick();
  }, [fullscreenRequestId]);

  useEffect(() => {
    if (!isMobile) {
      setIsTouchInteractionEnabled(true);
      return;
    }
    if (isFullscreen) {
      setIsTouchInteractionEnabled(true);
    }
  }, [isFullscreen, isMobile]);

  const isOverlayFullscreen = isFullscreen && !supportsNativeFullscreen;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isOverlayFullscreen) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    style.overflow = 'hidden';
    return () => {
      style.overflow = prevOverflow;
    };
  }, [isOverlayFullscreen]);

  const expenseFixed = transactions.expenses.filter(exp => exp.type === 'fixed');
  const expenseVariable = transactions.expenses.filter(exp => exp.type === 'variable');
  const expensePersonal = transactions.expenses.filter(exp => exp.type === 'personal');
  const expenseTaxes = transactions.expenses.filter(isTaxExpense);
  const cardNameById = useMemo(
    () =>
      new Map(
        creditCards.map(card => [
          card.id,
          normalizeLabel(card.name, 'Cartão')
        ])
      ),
    [creditCards]
  );
  const accountNameById = useMemo(
    () =>
      new Map(
        accounts.map(account => [
          account.id,
          normalizeLabel(account.name, 'Conta')
        ])
      ),
    [accounts]
  );

  const totalFixed = sumAmounts(expenseFixed);
  const totalVariable = sumAmounts(expenseVariable);
  const totalPersonal = sumAmounts(expensePersonal);
  const totalTaxes = sumAmounts(expenseTaxes);
  const totalRendimentos = sumAmounts(yields);
  const totalFixedOnCard = sumAmounts(expenseFixed.filter(exp => Boolean(exp.cardId)));
  const totalVariableOnCard = sumAmounts(expenseVariable.filter(exp => Boolean(exp.cardId)));
  const totalPersonalOnCard = sumAmounts(expensePersonal.filter(exp => Boolean(exp.cardId)));
  const carryoverPositive = Math.max(previousCarryover, 0);
  const derivedIncomeSources = summary.totalReceitas + carryoverPositive;
  const normalizedIncomeOverride =
    typeof incomeTotalOverride === 'number' && Number.isFinite(incomeTotalOverride)
      ? Math.max(incomeTotalOverride, 0)
      : null;
  const totalIncomeSources =
    normalizedIncomeOverride === null
      ? derivedIncomeSources
      : Math.max(derivedIncomeSources, normalizedIncomeOverride);
  const carryoverAccountAllocations = useMemo(() => {
    if (carryoverPositive <= 0) return [] as Array<{ accountId: string; accountName: string; amount: number }>;
    const candidates = accounts
      .map(account => {
        const rawBalance =
          typeof account.currentBalance === 'number'
            ? account.currentBalance
            : typeof account.initialBalance === 'number'
              ? account.initialBalance
              : 0;
        const balance = Number.isFinite(rawBalance) ? Math.max(rawBalance, 0) : 0;
        return {
          accountId: account.id,
          accountName: normalizeLabel(account.name, 'Conta'),
          balance
        };
      })
      .filter(item => item.accountId && item.balance > 0);
    if (candidates.length === 0) return [] as Array<{ accountId: string; accountName: string; amount: number }>;

    const totalBalance = candidates.reduce((sum, item) => sum + item.balance, 0);
    if (!(totalBalance > 0)) return [] as Array<{ accountId: string; accountName: string; amount: number }>;

    const carryoverCents = Math.max(Math.round(carryoverPositive * 100), 0);
    if (carryoverCents <= 0) return [] as Array<{ accountId: string; accountName: string; amount: number }>;

    const rawAllocations = candidates.map(item => {
      const exactCents = (item.balance / totalBalance) * carryoverCents;
      const baseCents = Math.floor(exactCents);
      return {
        ...item,
        cents: baseCents,
        remainder: exactCents - baseCents
      };
    });

    let allocatedCents = rawAllocations.reduce((sum, item) => sum + item.cents, 0);
    let remainingCents = Math.max(carryoverCents - allocatedCents, 0);
    if (remainingCents > 0) {
      const ranked = [...rawAllocations].sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        return b.balance - a.balance;
      });
      for (let index = 0; index < remainingCents; index += 1) {
        ranked[index % ranked.length].cents += 1;
      }
      allocatedCents = rawAllocations.reduce((sum, item) => sum + item.cents, 0);
      if (allocatedCents < carryoverCents) {
        rawAllocations[0].cents += carryoverCents - allocatedCents;
      }
    }

    return rawAllocations
      .filter(item => item.cents > 0)
      .map(item => ({
        accountId: item.accountId,
        accountName: item.accountName,
        amount: item.cents / 100
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [accounts, carryoverPositive]);

  const hasTaxNode = totalTaxes > 0;
  const expenseCardTagByGroup = useMemo<Partial<Record<NodeGroup, string>>>(() => {
    const buildTag = (value: number) =>
      value > 0 ? `No cartão ${formatCompactCurrency(value)}` : undefined;
    return {
      fixed: buildTag(totalFixedOnCard),
      variable: buildTag(totalVariableOnCard),
      personal: buildTag(totalPersonalOnCard)
    };
  }, [totalFixedOnCard, totalPersonalOnCard, totalVariableOnCard]);
  const incomeAccountTagBySubKey = useMemo(() => {
    const map = new Map<string, string>();
    const groupedAccounts = new Map<string, Set<string>>();

    transactions.incomes.forEach(item => {
      const referenceId = normalizeLabel(item.category, 'Sem categoria');
      const subKey = buildSubExpansionKey('income', referenceId);
      const accountName = accountNameById.get(item.accountId);
      if (!accountName) return;
      const bucket = groupedAccounts.get(subKey) || new Set<string>();
      bucket.add(accountName);
      groupedAccounts.set(subKey, bucket);
    });

    groupedAccounts.forEach((accountNames, subKey) => {
      const names = Array.from(accountNames);
      if (names.length === 1) {
        map.set(subKey, `Conta ${names[0]}`);
        return;
      }
      if (names.length > 1) {
        map.set(subKey, `${names.length} contas`);
      }
    });

    if (carryoverPositive > 0) {
      const carryoverSubKey = buildSubExpansionKey('income', CARRYOVER_CATEGORY_ID);
      if (carryoverAccountAllocations.length === 1) {
        map.set(carryoverSubKey, `Conta ${carryoverAccountAllocations[0].accountName}`);
      } else if (carryoverAccountAllocations.length > 1) {
        map.set(carryoverSubKey, `${carryoverAccountAllocations.length} contas`);
      } else {
        map.set(carryoverSubKey, 'Saldo anterior');
      }
    }

    return map;
  }, [accountNameById, carryoverAccountAllocations, carryoverPositive, transactions.incomes]);

  const incomeCategories = useMemo(() => {
    const categories = buildCategoryTotals(transactions.incomes).map(item => ({
      label: item.label,
      total: item.total
    }));

    if (carryoverPositive > 0) {
      categories.push({
        id: CARRYOVER_CATEGORY_ID,
        label: previousPeriodLabel ? `Sobra ${previousPeriodLabel}` : 'Sobra mês anterior',
        total: carryoverPositive
      });
    }

    const categorizedTotal = categories.reduce((sum, item) => sum + item.total, 0);
    const accumulatedGap = totalIncomeSources - categorizedTotal;
    if (accumulatedGap > 0.01) {
      categories.push({
        id: BALANCE_BUFFER_CATEGORY_ID,
        label: 'Saldo acumulado',
        total: accumulatedGap
      });
    }

    return categories.sort((a, b) => b.total - a.total);
  }, [carryoverPositive, previousPeriodLabel, totalIncomeSources, transactions.incomes]);

  const mainNodes = useMemo(() => {
    const nodes = [
      { id: 'income', label: 'Base do mapa', value: totalIncomeSources, group: 'income' as const },
      { id: 'fixed', label: 'Despesas Fixas', value: totalFixed, group: 'fixed' as const },
      {
        id: 'variable',
        label: 'Despesas Variáveis',
        value: totalVariable,
        group: 'variable' as const
      },
      {
        id: 'personal',
        label: 'Despesas Pessoais',
        value: totalPersonal,
        group: 'personal' as const
      },
      {
        id: 'rendimentos',
        label: 'Rendimentos',
        value: totalRendimentos,
        group: 'rendimentos' as const
      }
    ];

    if (hasTaxNode) {
      nodes.push({ id: 'taxes', label: 'Impostos / MEI', value: totalTaxes, group: 'taxes' as const });
    }

    return nodes;
  }, [
    hasTaxNode,
    totalIncomeSources,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable
  ]);

  const groupColor = {
    income: '#10b981',
    fixed: '#38bdf8',
    variable: '#f97316',
    personal: '#f472b6',
    rendimentos: '#8b5cf6',
    taxes: '#eab308'
  } satisfies Record<NodeGroup, string>;

  const commitmentBase = totalIncomeSources > 0 ? totalIncomeSources : summary.totalReceitas;
  const commitmentPercent = commitmentBase > 0
    ? (summary.totalDespesas / commitmentBase) * 100
    : 0;

  const commitmentColor =
    commitmentPercent <= 60
      ? '#22c55e'
      : commitmentPercent <= 80
        ? '#f59e0b'
        : '#ef4444';
  const freeCash = commitmentBase - summary.totalDespesas;
  const postBillsMessage =
    freeCash >= 0
      ? `após pagar todas as contas do mês, sobram ${formatCompactCurrency(freeCash)}.`
      : `após pagar todas as contas do mês, faltam ${formatCompactCurrency(Math.abs(freeCash))}.`;
  const centerInsight =
    commitmentBase <= 0
      ? 'Sem recursos registrados no período.'
      : `Base do mapa = receita do período + sobra anterior. ${postBillsMessage} Saldo atual disponível no topo = posição de caixa agora.`;

  const groupData = useMemo(() => {
    return {
      fixed: {
        items: expenseFixed,
        total: totalFixed,
        categories: buildCategoryTotals(expenseFixed)
      },
      income: {
        items: transactions.incomes,
        total: totalIncomeSources,
        categories: incomeCategories
      },
      variable: {
        items: expenseVariable,
        total: totalVariable,
        categories: buildCategoryTotals(expenseVariable)
      },
      personal: {
        items: expensePersonal,
        total: totalPersonal,
        categories: buildCategoryTotals(expensePersonal)
      },
      rendimentos: {
        items: yields,
        total: totalRendimentos,
        categories: buildYieldTotals(yields, accounts)
      },
      taxes: {
        items: expenseTaxes,
        total: totalTaxes,
        categories: buildCategoryTotals(expenseTaxes)
      }
    };
  }, [
    accounts,
    expenseFixed,
    expensePersonal,
    expenseTaxes,
    expenseVariable,
    incomeCategories,
    totalIncomeSources,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable,
    transactions.incomes,
    yields
  ]);

  const detailDataBySubKey = useMemo(() => {
    const grouped = new Map<string, Map<string, DetailEntry>>();
    const todayRef = new Date();
    todayRef.setHours(12, 0, 0, 0);

    const appendDetail = (
      subKey: string,
      detailId: string,
      detailLabel: string,
      amount: number,
      sourceId: string,
      paymentTag?: PaymentTag,
      tagLabel?: string
    ) => {
      const detailMap = grouped.get(subKey) || new Map<string, DetailEntry>();
      const current =
        detailMap.get(detailId) || {
          id: detailId,
          label: detailLabel,
          total: 0,
          count: 0,
          sourceIds: [],
          tagLabel,
          paymentCounters: createPaymentCounters(),
          paymentTag: undefined
        };
      current.total += Number.isFinite(amount) ? amount : 0;
      current.count += 1;
      if (sourceId) current.sourceIds.push(sourceId);
      if (!current.tagLabel && tagLabel) current.tagLabel = tagLabel;
      addPaymentCounter(current.paymentCounters, paymentTag);
      current.paymentTag = resolvePaymentTag(current.paymentCounters);
      detailMap.set(detailId, current);
      grouped.set(subKey, detailMap);
    };

    const appendExpenseGroup = (group: NodeGroup, items: Expense[]) => {
      items.forEach(item => {
        const referenceId = normalizeLabel(item.category, 'Sem categoria');
        const detailLabel = normalizeLabel(item.description, 'Lançamento');
        const cardLabel = item.cardId
          ? `Cartão ${cardNameById.get(item.cardId) || 'não identificado'}`
          : undefined;
        const detailId = `${detailLabel.toLowerCase()}::${item.cardId || 'sem-cartao'}`;
        appendDetail(
          buildSubExpansionKey(group, referenceId),
          detailId,
          detailLabel,
          item.amount,
          item.id,
          resolveExpensePaymentTag(item, todayRef),
          cardLabel
        );
      });
    };

    appendExpenseGroup('fixed', expenseFixed);
    appendExpenseGroup('variable', expenseVariable);
    appendExpenseGroup('personal', expensePersonal);
    appendExpenseGroup('taxes', expenseTaxes);

    transactions.incomes.forEach(item => {
      const referenceId = normalizeLabel(item.category, 'Sem categoria');
      const detailLabel = normalizeLabel(item.description, 'Receita');
      const accountName = accountNameById.get(item.accountId);
      const accountTag = accountName ? `Conta ${accountName}` : undefined;
      const detailId = `${detailLabel.toLowerCase()}::${item.accountId || 'sem-conta'}`;
      appendDetail(
        buildSubExpansionKey('income', referenceId),
        detailId,
        detailLabel,
        item.amount,
        item.id,
        resolveIncomePaymentTag(item),
        accountTag
      );
    });

    if (carryoverPositive > 0) {
      const carryoverSubKey = buildSubExpansionKey('income', CARRYOVER_CATEGORY_ID);
      if (carryoverAccountAllocations.length > 0) {
        carryoverAccountAllocations.forEach(allocation => {
          appendDetail(
            carryoverSubKey,
            `carryover-account-${allocation.accountId}`,
            `Saldo em ${allocation.accountName}`,
            allocation.amount,
            CARRYOVER_SOURCE_ID,
            'paid',
            `Conta ${allocation.accountName}`
          );
        });
      } else {
        const detailLabel = previousPeriodLabel
          ? `Sobra de ${previousPeriodLabel}`
          : 'Sobra do período anterior';
        appendDetail(
          carryoverSubKey,
          'carryover-origin',
          detailLabel,
          carryoverPositive,
          CARRYOVER_SOURCE_ID,
          'paid',
          'Saldo anterior'
        );
      }
    }

    yields.forEach(item => {
      const referenceId = item.accountId || '';
      if (!referenceId) return;
      const dateLabel = formatDateLabel(item.date);
      const notes = normalizeLabel(item.notes, '');
      const detailLabel = notes ? `${dateLabel} • ${notes}` : `Rendimento em ${dateLabel}`;
      const detailId = `${detailLabel.toLowerCase()}::${item.id}`;
      appendDetail(
        buildSubExpansionKey('rendimentos', referenceId),
        detailId,
        detailLabel,
        item.amount,
        item.id
      );
    });

    const finalized = new Map<string, DetailEntry[]>();
    grouped.forEach((detailMap, subKey) => {
      const normalizedEntries = Array.from(detailMap.values()).map(item => ({
        ...item,
        sourceIds: Array.from(new Set(item.sourceIds)),
        paymentTag: resolvePaymentTag(item.paymentCounters)
      }));
      const sorted = sortDetailEntries(normalizedEntries);
      finalized.set(subKey, sorted);
    });

    return finalized;
  }, [
    accountNameById,
    cardNameById,
    carryoverAccountAllocations,
    carryoverPositive,
    expenseFixed,
    expensePersonal,
    expenseTaxes,
    expenseVariable,
    previousPeriodLabel,
    transactions.incomes,
    yields
  ]);

  const paymentTagBySubKey = useMemo(() => {
    const map = new Map<string, PaymentTag | undefined>();
    detailDataBySubKey.forEach((entries, subKey) => {
      const counters = createPaymentCounters();
      entries.forEach(entry => mergePaymentCounters(counters, entry.paymentCounters));
      map.set(subKey, resolvePaymentTag(counters));
    });
    return map;
  }, [detailDataBySubKey]);

  const { nodes, edges } = useMemo(() => {
    const baseSize = isMobile ? 100 : 128;

    const centerRadius = isMobile ? 196 : 252;
    const centerDimensions = getNodeDimensions(centerRadius, 'center', isMobile);

    const nextNodes: MapNode[] = [];
    const nextEdges: MapEdge[] = [];

    const mainMetrics = mainNodes.map(node => {
      const size = baseSize;
      const color = groupColor[node.group];
      const totalBase =
        node.group === 'rendimentos'
          ? summary.totalReceitas
          : node.group === 'income'
            ? totalIncomeSources
            : summary.totalDespesas;
      const percent = totalBase > 0 ? (node.value / totalBase) * 100 : 0;
      const dimensions = getNodeDimensions(size, 'main', isMobile);
      return { node, size, color, percent, dimensions };
    });

    const maxMainWidth = Math.max(...mainMetrics.map(item => item.dimensions.width), 0);
    const gapX = isMobile ? 24 : 32;
    const gapY = isMobile ? 20 : 28;
    const subGapX = isMobile ? 22 : 28;
    const subGapY = isMobile ? 14 : 18;
    const mainOffset = centerDimensions.width / 2 + maxMainWidth / 2 + gapX;
    const centerX = 0;
    const leftMainX = centerX - mainOffset;
    const rightMainX = centerX + mainOffset;

    const detailGapX = isMobile ? 18 : 24;
    const detailGapY = isMobile ? 10 : 12;

    const mainLayout = mainMetrics.map(metric => {
      const categories = expandedGroups.has(metric.node.group)
        ? groupData[metric.node.group].categories
        : [];
      const totalGroup = Math.max(groupData[metric.node.group].total, 1);
      const subItems = categories.map(item => ({
        item,
        size: isMobile ? 84 : 96,
        isMore: false
      }));
      const subMetrics = subItems.map(item => {
        const referenceId =
          !item.isMore && 'id' in item.item && typeof item.item.id === 'string'
            ? item.item.id
            : item.item.label;
        const subKey = buildSubExpansionKey(metric.node.group, referenceId);
        const subPaymentTag = paymentTagBySubKey.get(subKey);
        const detailItems = expandedSubNodes.has(subKey)
          ? detailDataBySubKey.get(subKey) || []
          : [];
        const detailMetrics = detailItems.map(detailItem => {
          const detailSize = isMobile ? 74 : 82;
          return {
            item: detailItem,
            size: detailSize,
            dimensions: getNodeDimensions(detailSize, 'detail', isMobile)
          };
        });
        const detailColumnHeight =
          detailMetrics.reduce((sum, detailItem) => sum + detailItem.dimensions.height, 0) +
          detailGapY * Math.max(detailMetrics.length - 1, 0);
        const detailMaxWidth = Math.max(
          ...detailMetrics.map(detailItem => detailItem.dimensions.width),
          0
        );
        const subDimensions = getNodeDimensions(item.size, 'sub', isMobile);
        const rowHeight = Math.max(subDimensions.height, detailColumnHeight);
        return {
          ...item,
          referenceId,
          subKey,
          dimensions: subDimensions,
          detailMetrics,
          detailColumnHeight,
          detailMaxWidth,
          rowHeight,
          paymentTag: subPaymentTag
        };
      });
      const subColumnHeight =
        subMetrics.reduce((sum, metricItem) => sum + metricItem.rowHeight, 0) +
        subGapY * Math.max(subMetrics.length - 1, 0);
      const maxSubWidth = Math.max(...subMetrics.map(item => item.dimensions.width), 0);
      const baseBlockHeight = Math.max(metric.dimensions.height, subColumnHeight);
      const blockHeight = baseBlockHeight;
      const maxDetailWidth = Math.max(...subMetrics.map(item => item.detailMaxWidth), 0);

      return {
        ...metric,
        categories,
        totalGroup,
        subMetrics,
        subColumnHeight,
        maxSubWidth,
        maxDetailWidth,
        baseBlockHeight,
        blockHeight
      };
    });

    const receivableGroups = new Set<NodeGroup>(['income', 'rendimentos']);
    const leftLayout = mainLayout.filter(metric => receivableGroups.has(metric.node.group));
    const rightLayout = mainLayout.filter(metric => !receivableGroups.has(metric.node.group));
    const computeColumnHeight = (columnLayout: typeof mainLayout) =>
      columnLayout.reduce((sum, metric) => sum + metric.blockHeight, 0) +
      gapY * Math.max(columnLayout.length - 1, 0);

    nextNodes.push({
      id: 'center',
      position: { x: centerX, y: 0 },
      data: {
        label: 'Comprometimento da base',
        value: summary.totalDespesas,
        percent: commitmentPercent,
        kind: 'center',
        insight: centerInsight,
        centerDetails: [
          {
            label: 'Base do mapa',
            value: formatCompactCurrency(totalIncomeSources),
            tone: 'neutral'
          },
          {
            label: 'Receita período',
            value: formatCompactCurrency(summary.totalReceitas),
            tone: 'positive'
          },
          {
            label: 'Sobra anterior',
            value: formatCompactCurrency(carryoverPositive),
            tone: carryoverPositive > 0 ? 'positive' : 'neutral'
          }
        ],
        size: centerRadius,
        color: commitmentColor,
        background: hexToRgba(commitmentColor, 0.22)
      }
    });

    const renderColumn = (
      columnLayout: typeof mainLayout,
      direction: 'left' | 'right',
      mainX: number
    ) => {
      if (!columnLayout.length) return;
      const columnHeight = computeColumnHeight(columnLayout);
      let cursorY = -columnHeight / 2;

      columnLayout.forEach((metric, index) => {
        const {
          node,
          size,
          color,
          percent,
          subMetrics,
          subColumnHeight,
          maxSubWidth,
          maxDetailWidth,
          baseBlockHeight,
          blockHeight,
          totalGroup
        } = metric;
        const blockTop = cursorY;
        const blockCenterY = blockTop + blockHeight / 2;
        const pos = {
          x: mainX,
          y: blockCenterY
        };
        cursorY += blockHeight + (index < columnLayout.length - 1 ? gapY : 0);

        nextNodes.push({
          id: node.id,
          position: pos,
          data: {
            label: node.label,
            value: node.value,
            percent,
            kind: 'main',
            group: node.group,
            tagLabel: expenseCardTagByGroup[node.group],
            size,
            color,
            background: hexToRgba(color, 0.2)
          }
        });

        nextEdges.push({
          id: `edge-center-${node.id}`,
          source: 'center',
          target: node.id
        });

        if (!expandedGroups.has(node.group)) return;
        if (subMetrics.length === 0) return;

        const offsetToSub = maxMainWidth / 2 + maxSubWidth / 2 + subGapX;
        const subX = direction === 'right' ? mainX + offsetToSub : mainX - offsetToSub;
        const offsetToDetail = maxSubWidth / 2 + maxDetailWidth / 2 + detailGapX;
        const detailX = direction === 'right' ? subX + offsetToDetail : subX - offsetToDetail;
        const subTop = blockTop + (baseBlockHeight - subColumnHeight) / 2;
        let subCursor = subTop;

        subMetrics.forEach((metricItem, idx) => {
          const {
            item,
            size: subSize,
            isMore,
            rowHeight,
            paymentTag: subPaymentTag,
            subKey,
            referenceId,
            detailMetrics,
            detailColumnHeight
          } = metricItem;
          const subPos = {
            x: subX,
            y: subCursor + rowHeight / 2
          };
          subCursor += rowHeight + (idx < subMetrics.length - 1 ? subGapY : 0);

          const percentOfGroup = isMore ? 0 : (item.total / totalGroup) * 100;
          const subId = `${node.id}-sub-${idx}`;

          nextNodes.push({
            id: subId,
            position: subPos,
            data: {
              label: 'label' in item ? item.label : 'Categoria',
              value: item.total,
              percent: percentOfGroup,
              kind: 'sub',
              group: node.group,
              category: !isMore && 'label' in item ? item.label : undefined,
              referenceId,
              isMore,
              hasChildren: detailMetrics.length > 0,
              expanded: detailMetrics.length > 0 && expandedSubNodes.has(subKey),
              paymentTag: subPaymentTag,
              tagLabel:
                !isMore && node.group === 'income'
                  ? incomeAccountTagBySubKey.get(subKey)
                  : undefined,
              size: subSize,
              color,
              background: hexToRgba(color, isMore ? 0.08 : 0.12)
            }
          });

          nextEdges.push({
            id: `edge-${node.id}-${subId}`,
            source: node.id,
            target: subId
          });

          if (!detailMetrics.length) return;

          let detailCursor = subPos.y - detailColumnHeight / 2;
          detailMetrics.forEach((detailMetric, detailIdx) => {
            const detailPos = {
              x: detailX,
              y: detailCursor + detailMetric.dimensions.height / 2
            };
            detailCursor +=
              detailMetric.dimensions.height + (detailIdx < detailMetrics.length - 1 ? detailGapY : 0);

            const detailPercent = item.total > 0 ? (detailMetric.item.total / item.total) * 100 : 0;
            const detailId = `${subId}-detail-${detailIdx}`;

            nextNodes.push({
              id: detailId,
              position: detailPos,
              data: {
                label: detailMetric.item.label,
                value: detailMetric.item.total,
                percent: detailPercent,
                kind: 'detail',
                group: node.group,
                category: detailMetric.item.label,
                referenceId: detailMetric.item.id,
                parentReferenceId: referenceId,
                tagLabel: detailMetric.item.tagLabel,
                paymentTag: detailMetric.item.paymentTag,
                size: detailMetric.size,
                color,
                background: hexToRgba(color, 0.08)
              }
            });

            nextEdges.push({
              id: `edge-${subId}-${detailId}`,
              source: subId,
              target: detailId
            });
          });
        });
      });
    };

    renderColumn(leftLayout, 'left', leftMainX);
    renderColumn(rightLayout, 'right', rightMainX);

    return { nodes: nextNodes, edges: nextEdges };
  }, [
    commitmentColor,
    commitmentPercent,
    centerInsight,
    detailDataBySubKey,
    expenseCardTagByGroup,
    expandedGroups,
    expandedSubNodes,
    freeCash,
    groupColor,
    groupData,
    incomeAccountTagBySubKey,
    isMobile,
    mainNodes,
    paymentTagBySubKey,
    summary.totalDespesas,
    summary.totalReceitas,
    totalIncomeSources
  ]);

  const handleNodeClick = (node: ReportNodeData) => {
    if (node.kind === 'main' && node.group) {
      const willCollapse = expandedGroups.has(node.group);
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(node.group)) {
          next.delete(node.group);
        } else {
          next.add(node.group);
        }
        return next;
      });
      if (willCollapse) {
        setExpandedSubNodes(prevSub => {
          const nextSub = new Set(prevSub);
          Array.from(nextSub).forEach(key => {
            if (key.startsWith(`${node.group}::`)) {
              nextSub.delete(key);
            }
          });
          return nextSub;
        });
      }
      setActiveNode(node);
      return;
    }
    if (node.kind === 'sub' && node.group && node.referenceId) {
      const subKey = buildSubExpansionKey(node.group, node.referenceId);
      setExpandedSubNodes(prev => {
        const next = new Set(prev);
        if (next.has(subKey)) {
          next.delete(subKey);
        } else {
          next.add(subKey);
        }
        return next;
      });
      setActiveNode(node);
      return;
    }
    if (node.kind === 'center') {
      setExpandedGroups(new Set());
      setExpandedSubNodes(new Set());
      setActiveNode(node);
      return;
    }
    setActiveNode(node);
  };

  const queueViewportUpdate = (next: { x: number; y: number; scale: number }) => {
    viewportRef.current = next;
    pendingViewportRef.current = next;
    if (typeof window === 'undefined') {
      setViewport(next);
      return;
    }
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = window.requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      const pending = pendingViewportRef.current;
      if (!pending) return;
      pendingViewportRef.current = null;
      setViewport(prev =>
        prev.x === pending.x && prev.y === pending.y && prev.scale === pending.scale ? prev : pending
      );
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (isMobile && event.pointerType === 'touch' && !isTouchInteractionEnabled) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    if (autoCenter) {
      setAutoCenter(false);
    }
    if (!isMobile) {
      setHoveredNodeId(null);
      setHoverInfo(null);
    }
    containerRef.current.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        type: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        startScale: viewportRef.current.scale,
        startTranslate: { x: viewportRef.current.x, y: viewportRef.current.y }
      };
      if (!isMobile && event.pointerType !== 'touch') {
        setIsPanning(true);
      }
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      gestureRef.current = {
        type: 'pinch',
        startX: center.x,
        startY: center.y,
        startScale: viewportRef.current.scale,
        startTranslate: { x: viewportRef.current.x, y: viewportRef.current.y },
        startDistance: distance,
        startCenter: center
      };
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile && event.pointerType === 'touch' && !isTouchInteractionEnabled) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.type === 'pan' && pointersRef.current.size === 1) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const next = {
        x: gesture.startTranslate.x + dx,
        y: gesture.startTranslate.y + dy,
        scale: viewportRef.current.scale
      };
      queueViewportUpdate(next);
      return;
    }

    if (pointersRef.current.size >= 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const nextScale = clamp(
        gesture.startDistance ? gesture.startScale * (distance / gesture.startDistance) : gesture.startScale,
        MIN_ZOOM,
        MAX_ZOOM
      );
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const dx = center.x - (gesture.startCenter?.x ?? center.x);
      const dy = center.y - (gesture.startCenter?.y ?? center.y);
      const next = {
        x: gesture.startTranslate.x + dx,
        y: gesture.startTranslate.y + dy,
        scale: nextScale
      };
      queueViewportUpdate(next);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile && event.pointerType === 'touch' && !isTouchInteractionEnabled) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      gestureRef.current = {
        type: 'pan',
        startX: remaining.x,
        startY: remaining.y,
        startScale: viewportRef.current.scale,
        startTranslate: { x: viewportRef.current.x, y: viewportRef.current.y }
      };
      return;
    }
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      setIsPanning(false);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isMobile) return;
    event.preventDefault();
    if (autoCenter) {
      setAutoCenter(false);
    }
    const multiplier =
      event.deltaMode === 1
        ? 0.045
        : event.deltaMode === 2
          ? 0.12
          : 0.0015;
    const scaleDelta = event.deltaY * -multiplier;
    if (Math.abs(scaleDelta) < 0.0001) return;
    const nextScale = clamp(viewportRef.current.scale + scaleDelta, MIN_ZOOM, MAX_ZOOM);
    const next = { ...viewportRef.current, scale: nextScale };
    queueViewportUpdate(next);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (autoCenter) {
      setAutoCenter(false);
    }
    const step = direction === 'in' ? 0.12 : -0.12;
    const nextScale = clamp(viewportRef.current.scale + step, MIN_ZOOM, MAX_ZOOM);
    const next = { ...viewportRef.current, scale: nextScale };
    queueViewportUpdate(next);
  };

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;
    const element = containerRef.current;
    if (!element) return;
    if (!supportsNativeFullscreen) {
      setIsFullscreen(prev => !prev);
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (error) {
      console.warn('[fullscreen] fallback', error);
      setIsFullscreen(prev => !prev);
    }
  };

  const handleFullscreenClick = () => {
    if (isMobile) {
      setShowDesktopOnlyNotice(true);
      window.setTimeout(() => setShowDesktopOnlyNotice(false), 2000);
      return;
    }
    void toggleFullscreen();
  };

  const mapControls = (
    <>
      <button
        type="button"
        onClick={handleFullscreenClick}
        className={`h-9 w-9 rounded-full border border-white/10 text-white transition ${
          isMobile ? 'bg-white/5 text-white/60' : 'bg-white/10 hover:bg-white/20'
        }`}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
        title={
          isFullscreen
            ? 'Sair da tela cheia e voltar ao layout normal.'
            : 'Abrir em tela cheia para visualizar o mapa melhor.'
        }
      >
        {isFullscreen ? (
          <Minimize2 size={16} className="mx-auto" />
        ) : (
          <Maximize2 size={16} className="mx-auto" />
        )}
      </button>
      {isMobile && (
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
          Tela cheia só no computador
        </div>
      )}
      {isMobile && showDesktopOnlyNotice && (
        <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-[11px] text-white shadow-lg">
          Tela cheia disponível apenas no computador.
        </div>
      )}
      {isMobile && (
        <button
          type="button"
          onClick={() => setIsTouchInteractionEnabled(prev => !prev)}
          className={`h-9 rounded-full border border-white/10 px-3 text-xs font-semibold text-white transition ${
            isTouchInteractionEnabled ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label={isTouchInteractionEnabled ? 'Desativar interação no mapa' : 'Ativar interação no mapa'}
          title={
            isTouchInteractionEnabled
              ? 'Desativa o arrastar no mapa para permitir rolagem da tela.'
              : 'Ativa o modo de arrastar o mapa com o dedo.'
          }
        >
          <span className="flex items-center gap-2">
            <Hand size={14} />
            {isTouchInteractionEnabled ? 'Mapa ativo' : 'Mapa scroll'}
          </span>
        </button>
      )}
    </>
  );

  const layout = useMemo(() => {
    if (!mapSize.width || !mapSize.height) return null;
    const padding = isMobile ? 80 : 110;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    nodes.forEach(node => {
      const { width, height } = getNodeDimensions(node.data.size, node.data.kind, isMobile);
      minX = Math.min(minX, node.position.x - width / 2);
      maxX = Math.max(maxX, node.position.x + width / 2);
      minY = Math.min(minY, node.position.y - height / 2);
      maxY = Math.max(maxY, node.position.y + height / 2);
    });

    const contentWidth = Math.max(maxX - minX, 0);
    const contentHeight = Math.max(maxY - minY, 0);
    const canvasWidth = Math.max(mapSize.width, contentWidth + padding * 2);
    const canvasHeight = Math.max(mapSize.height, contentHeight + padding * 2);
    const extraX = canvasWidth - (contentWidth + padding * 2);
    const extraY = canvasHeight - (contentHeight + padding * 2);
    const offsetX = -minX + padding + extraX / 2;
    const offsetY = -minY + padding + extraY / 2;
    const nodeMap = new Map<
      string,
      { x: number; y: number; width: number; height: number; size: number; data: ReportNodeData }
    >();

    nodes.forEach(node => {
      const minSize =
        node.data.kind === 'center'
          ? isMobile
            ? 130
            : 160
          : node.data.kind === 'main'
            ? isMobile
              ? 92
              : 116
            : isMobile
              ? 72
              : 86;
      const size = Math.max(node.data.size, minSize);
      const dimensions = getNodeDimensions(size, node.data.kind, isMobile);
      nodeMap.set(node.id, {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
        size,
        width: dimensions.width,
        height: dimensions.height,
        data: node.data
      });
    });

    const edgePaths = edges
      .map(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const curve = 0.18;
        const cx = source.x + dx / 2 - dy * curve;
        const cy = source.y + dy / 2 + dx * curve;
        const color =
          edge.source === 'center'
            ? target.data.color
            : source.data.color || target.data.color;
        const isActive =
          hoveredNodeId && (edge.source === hoveredNodeId || edge.target === hoveredNodeId);

        return {
          id: edge.id,
          path: `M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`,
          color,
          isActive
        };
      })
      .filter(
        (edge): edge is { id: string; path: string; color: string; isActive: boolean } =>
          edge !== null
      );

    return {
      nodeMap,
      edgePaths,
      rings: [],
      canvas: {
        width: canvasWidth,
        height: canvasHeight
      },
      content: {
        width: contentWidth,
        height: contentHeight
      }
    };
  }, [edges, hoveredNodeId, isMobile, mapSize.height, mapSize.width, nodes]);

  useEffect(() => {
    if (!layout || !autoCenter) return;
    const contentWidth = Math.max(layout.content.width, 1);
    const contentHeight = Math.max(layout.content.height, 1);
    const fitWidth = (mapSize.width - (isMobile ? 72 : 120)) / contentWidth;
    const fitHeight = (mapSize.height - (isMobile ? 72 : 120)) / contentHeight;
    const rawScale = Number.isFinite(fitWidth) && Number.isFinite(fitHeight)
      ? Math.min(fitWidth, fitHeight)
      : 1;
    const targetScale = clamp(
      rawScale,
      isMobile ? 0.7 : 0.55,
      isMobile ? 1.05 : 1.38
    );
    const next = {
      x: Math.round((mapSize.width - layout.canvas.width) / 2),
      y: Math.round((mapSize.height - layout.canvas.height) / 2),
      scale: Number(targetScale.toFixed(3))
    };
    const current = viewportRef.current;
    if (current.x === next.x && current.y === next.y && current.scale === next.scale) return;
    queueViewportUpdate(next);
  }, [autoCenter, isMobile, layout, mapSize.height, mapSize.width]);

  const details = useMemo(() => {
    if (!activeNode) return null;
    if (!activeNode.group) {
      const normalizedCurrentAvailable =
        typeof currentAvailableBalance === 'number' && Number.isFinite(currentAvailableBalance)
          ? currentAvailableBalance
          : null;
      return {
        title: activeNode.label,
        value: activeNode.value,
        percent: activeNode.percent,
        items: transactions.expenses,
        group: 'center' as const,
        editableExpense: null as Expense | null,
        taxReasons: [] as string[],
        centerBreakdown: {
          receitaPeriodo: summary.totalReceitas,
          sobraAnterior: carryoverPositive,
          baseMapa: totalIncomeSources,
          despesasPeriodo: summary.totalDespesas,
          saldoPosContas: freeCash,
          saldoAtualDisponivel: normalizedCurrentAvailable
        }
      };
    }
    const group = groupData[activeNode.group];
    let items = group.items;
    if (activeNode.kind === 'detail' && activeNode.parentReferenceId && activeNode.referenceId) {
      const subKey = buildSubExpansionKey(activeNode.group, activeNode.parentReferenceId);
      const detailEntries = detailDataBySubKey.get(subKey) || [];
      const selectedDetail = detailEntries.find(entry => entry.id === activeNode.referenceId);
      const sourceIds = new Set(selectedDetail?.sourceIds || []);
      if (sourceIds.size > 0) {
        items = items.filter(item => sourceIds.has(item.id) && item.id !== CARRYOVER_SOURCE_ID);
      }
    } else if (activeNode.kind === 'sub' && activeNode.referenceId) {
      if (activeNode.group === 'rendimentos') {
        items = items.filter(item => 'accountId' in item && item.accountId === activeNode.referenceId);
      } else if (activeNode.group === 'income' && activeNode.referenceId === CARRYOVER_CATEGORY_ID) {
        items = [];
      } else {
        items = items.filter(
          item => normalizeLabel(item.category, 'Sem categoria') === activeNode.referenceId
        );
      }
    }
    const expenseItems = items.filter(
      (item): item is Expense =>
        typeof item === 'object' &&
        item !== null &&
        'paymentMethod' in item &&
        'status' in item &&
        'type' in item &&
        'dueDate' in item
    );
    const editableExpense = expenseItems.length === 1 ? expenseItems[0] : null;
    const taxReasons =
      activeNode.group === 'taxes'
        ? expenseItems.slice(0, 4).map(item => {
            const matches = getTaxMatchTokens(item);
            const reason = matches.length > 0 ? matches.join(', ') : 'sem termo fiscal';
            return `${item.description || item.category || 'Lançamento'} → ${reason}`;
          })
        : [];
    return {
      title: activeNode.label,
      value: activeNode.kind === 'main' ? group.total : activeNode.value,
      percent: activeNode.percent,
      items,
      group: activeNode.group,
      editableExpense,
      taxReasons,
      centerBreakdown: null as null
    };
  }, [
    activeNode,
    carryoverPositive,
    currentAvailableBalance,
    detailDataBySubKey,
    freeCash,
    groupData,
    summary.totalDespesas,
    summary.totalReceitas,
    totalIncomeSources,
    transactions.expenses
  ]);

  const handleOpenExpenseFromNode = () => {
    if (!details?.editableExpense) return;
    navigateToResult({
      entity: 'expense',
      id: details.editableExpense.id,
      subtype: details.editableExpense.type
    });
  };

  const renderInfoItem = (label: string, value: string, hint: string, accent?: string) => (
    <div className="min-w-[180px] max-w-[240px] text-center">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`text-[15px] font-semibold ${accent || 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );

  const groupLabels: Record<NodeGroup | 'center', string> = {
    income: 'Entradas',
    fixed: 'Despesas fixas',
    variable: 'Despesas variáveis',
    personal: 'Despesas pessoais',
    rendimentos: 'Rendimentos',
    taxes: 'Impostos',
    center: 'Geral'
  };

  const footerContent = details ? (
    <div className="flex flex-col gap-3 min-w-0 items-center text-center">
      <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
        Detalhes do node
      </div>
      {details.taxReasons.length > 0 && (
        <div className="w-full max-w-[860px] rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
            Procedência Fiscal
          </p>
          <div className="mt-1 space-y-1">
            {details.taxReasons.map((reason, index) => (
              <p key={`${reason}-${index}`} className="text-[11px] text-amber-100/90 truncate" title={reason}>
                {reason}
              </p>
            ))}
          </div>
        </div>
      )}
      {details.group === 'center' && details.centerBreakdown && (
        <div className="w-full max-w-[960px] rounded-xl border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100">
            Como ler os números
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Base do mapa</p>
              <p className="text-[14px] font-semibold text-white">
                {formatCurrency(details.centerBreakdown.baseMapa)}
              </p>
              <p className="text-[10px] text-slate-300">
                Receita do período ({formatCurrency(details.centerBreakdown.receitaPeriodo)}) + sobra anterior ({formatCurrency(details.centerBreakdown.sobraAnterior)}).
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Projeção pós contas</p>
              <p
                className={`text-[14px] font-semibold ${
                  details.centerBreakdown.saldoPosContas >= 0 ? 'text-emerald-200' : 'text-rose-200'
                }`}
              >
                {formatCurrency(details.centerBreakdown.saldoPosContas)}
              </p>
              <p className="text-[10px] text-slate-300">
                Base do mapa ({formatCurrency(details.centerBreakdown.baseMapa)}) - despesas do período ({formatCurrency(details.centerBreakdown.despesasPeriodo)}).
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Saldo atual (topo)</p>
              <p className="text-[14px] font-semibold text-white">
                {details.centerBreakdown.saldoAtualDisponivel === null
                  ? 'Sem base'
                  : formatCurrency(details.centerBreakdown.saldoAtualDisponivel)}
              </p>
              <p className="text-[10px] text-slate-300">
                Posição de caixa atual, pode diferir da projeção do mês.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
        {renderInfoItem('Node', details.title, 'Categoria/agrupamento selecionado.')}
        {renderInfoItem(
          'Grupo',
          groupLabels[details.group ?? 'center'],
          'Tipo de bloco no mapa.'
        )}
        {renderInfoItem('Total', formatCurrency(details.value), 'Soma dos valores.')}
        {renderInfoItem(
          'Participação',
          `${details.percent.toFixed(1)}%`,
          'Percentual dentro do mapa.',
          'text-slate-200'
        )}
        {renderInfoItem('Itens', String(details.items.length), 'Quantidade de lançamentos.')}
      </div>
      {details.editableExpense && (
        <button
          type="button"
          onClick={handleOpenExpenseFromNode}
          className="rounded-full border border-indigo-300/35 bg-indigo-500/20 px-4 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/30 transition"
        >
          Abrir lançamento para corrigir
        </button>
      )}
    </div>
  ) : (
    <div className="text-sm text-slate-400 text-center">Clique em um node para ver detalhes.</div>
  );

  const footerControls = !isMobile ? (
    <div className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleFullscreenClick}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
        title={
          isFullscreen
            ? 'Sair da tela cheia e voltar ao layout normal.'
            : 'Abrir em tela cheia para visualizar o mapa melhor.'
        }
      >
        {isFullscreen ? (
          <Minimize2 size={16} className="mx-auto" />
        ) : (
          <Maximize2 size={16} className="mx-auto" />
        )}
      </button>
      <div className="h-px w-8 bg-white/10" />
      <button
        type="button"
        onClick={() => handleZoom('out')}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Diminuir zoom"
        title="Reduz o zoom para ver mais do mapa."
      >
        <Minus size={16} className="mx-auto" />
      </button>
      <button
        type="button"
        onClick={() => handleZoom('in')}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Aumentar zoom"
        title="Aumenta o zoom para ver detalhes dos nodes."
      >
        <Plus size={16} className="mx-auto" />
      </button>
    </div>
  ) : null;

  const mapFooter = !isMobile && (isFullscreen || Boolean(activeNode)) ? (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <div
        className={`relative flex items-center justify-center border-t border-white/20 bg-white/5 shadow-[0_-10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl ${
          isFullscreen ? 'rounded-t-[26px] px-10 py-6 min-h-[150px]' : 'rounded-t-2xl px-6 py-4 min-h-[112px]'
        }`}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className={`mx-auto w-full ${isFullscreen ? 'max-w-[1200px]' : 'max-w-[980px]'}`}>{footerContent}</div>
        {footerControls}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      <div
        className={`relative ${isOverlayFullscreen ? 'fixed inset-0 z-[90] h-[100dvh] w-[100dvw]' : 'flex-1 min-h-0 flex flex-col'}`}
        style={{
          paddingTop: isOverlayFullscreen ? 'env(safe-area-inset-top)' : undefined,
          paddingBottom: isOverlayFullscreen ? 'env(safe-area-inset-bottom)' : undefined
        }}
      >
        <div className="flex gap-4 items-stretch flex-1 min-h-0">
          <div
            ref={containerRef}
            data-mm-measure-target="mapa-financeiro"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            className={`mm-map-surface relative border border-white/10 overflow-hidden flex-1 select-none ${
              isFullscreen
                ? 'rounded-none h-full w-full box-border'
                : 'rounded-3xl w-full flex-1 mb-[22px] min-h-[var(--mm-map-surface-min-height,320px)]'
            } ${isMobile ? '' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.14), rgba(15,23,42,0.75) 45%), radial-gradient(circle at 80% 10%, rgba(236,72,153,0.16), rgba(15,23,42,0.6) 55%)',
              touchAction: isMobile && !isTouchInteractionEnabled ? 'pan-y' : 'none'
            }}
          >
            {isMobile && !isFullscreen && (
              <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
                {mapControls}
              </div>
            )}
            {!isMobile && isFullscreen && (
              <div className="pointer-events-none absolute left-5 top-5 z-20 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
                Movimento livre: arraste e use o scroll para zoom
              </div>
            )}
            {mapFooter}

            <div
              className="absolute inset-0"
              style={{
                transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
                transformOrigin: 'center center',
                willChange: 'transform'
              }}
            >
              {layout && (
                <div
                  className="relative"
                  style={{ width: layout.canvas.width, height: layout.canvas.height }}
                >
                  <svg
                    className="absolute inset-0"
                    width={layout.canvas.width}
                    height={layout.canvas.height}
                    viewBox={`0 0 ${layout.canvas.width} ${layout.canvas.height}`}
                    fill="none"
                    style={{ pointerEvents: 'none' }}
                  >
                    {layout.edgePaths.map(edge => (
                      <path
                        key={edge.id}
                        d={edge.path}
                        stroke={hexToRgba(edge.color, edge.isActive ? 0.9 : 0.6)}
                        strokeWidth={edge.isActive ? 2.6 : 2}
                        strokeLinecap="round"
                      />
                    ))}
                  </svg>

                  <div className="absolute inset-0">
                    {nodes.map(node => {
                      const nodeLayout = layout.nodeMap.get(node.id);
                      if (!nodeLayout) return null;
                      const data = { ...node.data, size: nodeLayout.size };
                      return (
                        <div
                          key={node.id}
                          style={{
                            position: 'absolute',
                            left: nodeLayout.x,
                            top: nodeLayout.y,
                            transform: 'translate(-50%, -50%)'
                          }}
                        >
                          <ReportNode
                            data={data}
                            width={nodeLayout.width}
                            height={nodeLayout.height}
                            selected={activeNode?.label === node.data.label}
                            onClick={() => handleNodeClick(node.data)}
                            onMouseEnter={event => {
                              if (isMobile || isPanning) return;
                              setHoveredNodeId(node.id);
                              setHoverInfo({ node: node.data, x: event.clientX, y: event.clientY });
                            }}
                            onMouseMove={event => {
                              if (isMobile || isPanning) return;
                              setHoverInfo({ node: node.data, x: event.clientX, y: event.clientY });
                            }}
                            onMouseLeave={() => {
                              if (isMobile) return;
                              setHoveredNodeId(null);
                              setHoverInfo(null);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {hoverInfo && !isPanning && (
              <div
                className="fixed z-30 pointer-events-none bg-slate-900/95 text-white text-xs px-3 py-2 rounded-lg shadow-lg"
                style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
              >
                <div className="font-semibold">{hoverInfo.node.label}</div>
                <div>{formatCurrency(hoverInfo.node.value)}</div>
                <div className="text-slate-400">{hoverInfo.node.percent.toFixed(1)}%</div>
              </div>
            )}

          </div>
          {!isMobile && !isFullscreen && !hideDesktopRail && (
            <div className="flex flex-col items-center gap-2 self-stretch rounded-2xl border border-white/10 bg-slate-950/40 px-2 py-3 min-w-[52px]">
              {mapControls}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinancialMap;
