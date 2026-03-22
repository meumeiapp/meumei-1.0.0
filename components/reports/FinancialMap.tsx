import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hand, Minus, Plus, X } from 'lucide-react';
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
  reservedDetailCount?: number;
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

type NodeDetailLaunchItem = {
  key: string;
  title: string;
  amount: number;
  dateLabel: string;
  meta: string;
  openAction?: {
    entity: 'expense' | 'income';
    id: string;
    subtype?: Expense['type'];
  };
};

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

const snapToDevicePixel = (value: number, devicePixelRatio: number) =>
  Math.round(value * devicePixelRatio) / devicePixelRatio;

const normalizeViewportScale = (value: number) => Number(value.toFixed(4));

const MIN_ZOOM = 0.12;
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
      className="relative flex items-center justify-center text-center rounded-2xl border border-white/10 text-white shadow-lg transition-transform duration-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-inherit"
      style={{
        width,
        height,
        background,
        borderColor: hexToRgba(data.color, selected ? 0.7 : 0.45),
        boxShadow: `0 16px 40px ${highlight}, 0 0 0 1px rgba(255,255,255,0.06)`,
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'optimizeLegibility'
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

const isExpenseDetailItem = (item: unknown): item is Expense =>
  typeof item === 'object' &&
  item !== null &&
  'id' in item &&
  'description' in item &&
  'amount' in item &&
  'type' in item &&
  'dueDate' in item;

const isIncomeDetailItem = (item: unknown): item is Income =>
  typeof item === 'object' &&
  item !== null &&
  'id' in item &&
  'description' in item &&
  'amount' in item &&
  'accountId' in item &&
  'status' in item &&
  !('dueDate' in item);

const isYieldDetailItem = (item: unknown): item is YieldRecord =>
  typeof item === 'object' &&
  item !== null &&
  'id' in item &&
  'amount' in item &&
  'accountId' in item &&
  'date' in item &&
  !('status' in item) &&
  !('dueDate' in item);

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
  const [isPanning, setIsPanning] = useState(false);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
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
  const renderViewport = useMemo(() => {
    const dpr =
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? Math.max(window.devicePixelRatio, 1)
        : 1;
    return {
      x: snapToDevicePixel(viewport.x, dpr),
      y: snapToDevicePixel(viewport.y, dpr),
      scale: normalizeViewportScale(viewport.scale)
    };
  }, [viewport.scale, viewport.x, viewport.y]);

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
    const levelGapMain = isMobile ? 36 : 52;
    const levelGapSub = isMobile ? 24 : 34;
    const levelGapDetail = isMobile ? 18 : 26;
    const levelGaps = [0, levelGapMain, levelGapSub, levelGapDetail];
    const siblingGap = isMobile ? 18 : 24;

    type LayoutTreeNode = {
      id: string;
      data: ReportNodeData;
      width: number;
      height: number;
      children: LayoutTreeNode[];
      localX: number;
      absoluteX: number;
      absoluteY: number;
      depth: number;
      contourLeft: number[];
      contourRight: number[];
    };

    const createLayoutNode = (
      id: string,
      data: ReportNodeData,
      dimensions: { width: number; height: number }
    ): LayoutTreeNode => ({
      id,
      data,
      width: dimensions.width,
      height: dimensions.height,
      children: [],
      localX: 0,
      absoluteX: 0,
      absoluteY: 0,
      depth: 0,
      contourLeft: [],
      contourRight: []
    });

    const layoutSubtree = (node: LayoutTreeNode) => {
      if (node.children.length === 0) {
        node.localX = 0;
        node.contourLeft = [-node.width / 2];
        node.contourRight = [node.width / 2];
        return;
      }

      node.children.forEach(child => layoutSubtree(child));

      const placedChildren: Array<{ node: LayoutTreeNode; offset: number }> = [];
      let combinedLeft: number[] = [];
      let combinedRight: number[] = [];

      node.children.forEach(child => {
        let offset = 0;
        if (placedChildren.length > 0) {
          let requiredShift = 0;
          const overlapDepth = Math.min(combinedRight.length, child.contourLeft.length);
          for (let depth = 0; depth < overlapDepth; depth += 1) {
            const overlap = combinedRight[depth] + siblingGap - child.contourLeft[depth];
            if (overlap > requiredShift) {
              requiredShift = overlap;
            }
          }
          offset = requiredShift;
        }

        placedChildren.push({ node: child, offset });

        child.contourLeft.forEach((value, depth) => {
          const shifted = value + offset;
          if (combinedLeft[depth] === undefined) {
            combinedLeft[depth] = shifted;
          } else {
            combinedLeft[depth] = Math.min(combinedLeft[depth], shifted);
          }
        });

        child.contourRight.forEach((value, depth) => {
          const shifted = value + offset;
          if (combinedRight[depth] === undefined) {
            combinedRight[depth] = shifted;
          } else {
            combinedRight[depth] = Math.max(combinedRight[depth], shifted);
          }
        });
      });

      const firstOffset = placedChildren[0]?.offset ?? 0;
      const lastOffset = placedChildren[placedChildren.length - 1]?.offset ?? 0;
      const branchCenter = (firstOffset + lastOffset) / 2;
      placedChildren.forEach(({ node: child, offset }) => {
        child.localX = offset - branchCenter;
      });

      combinedLeft = [];
      combinedRight = [];
      placedChildren.forEach(({ node: child }) => {
        child.contourLeft.forEach((value, depth) => {
          const shifted = value + child.localX;
          if (combinedLeft[depth] === undefined) {
            combinedLeft[depth] = shifted;
          } else {
            combinedLeft[depth] = Math.min(combinedLeft[depth], shifted);
          }
        });
        child.contourRight.forEach((value, depth) => {
          const shifted = value + child.localX;
          if (combinedRight[depth] === undefined) {
            combinedRight[depth] = shifted;
          } else {
            combinedRight[depth] = Math.max(combinedRight[depth], shifted);
          }
        });
      });

      node.localX = 0;
      node.contourLeft = [-node.width / 2];
      node.contourRight = [node.width / 2];

      combinedLeft.forEach((value, depth) => {
        const targetDepth = depth + 1;
        if (node.contourLeft[targetDepth] === undefined) {
          node.contourLeft[targetDepth] = value;
        } else {
          node.contourLeft[targetDepth] = Math.min(node.contourLeft[targetDepth], value);
        }
      });

      combinedRight.forEach((value, depth) => {
        const targetDepth = depth + 1;
        if (node.contourRight[targetDepth] === undefined) {
          node.contourRight[targetDepth] = value;
        } else {
          node.contourRight[targetDepth] = Math.max(node.contourRight[targetDepth], value);
        }
      });
    };

    const assignAbsoluteX = (node: LayoutTreeNode, parentX: number, depth: number) => {
      node.depth = depth;
      node.absoluteX = parentX + node.localX;
      node.children.forEach(child => assignAbsoluteX(child, node.absoluteX, depth + 1));
    };

    const collectDepthHeights = (node: LayoutTreeNode, heights: number[]) => {
      heights[node.depth] = Math.max(heights[node.depth] ?? 0, node.height);
      node.children.forEach(child => collectDepthHeights(child, heights));
    };

    const assignAbsoluteY = (node: LayoutTreeNode, depthCenters: number[]) => {
      node.absoluteY = depthCenters[node.depth] ?? 0;
      node.children.forEach(child => assignAbsoluteY(child, depthCenters));
    };

    const shiftSubtreeX = (node: LayoutTreeNode, deltaX: number) => {
      if (Math.abs(deltaX) < 0.001) return;
      node.absoluteX += deltaX;
      node.children.forEach(child => shiftSubtreeX(child, deltaX));
    };

    const getSubtreeBounds = (node: LayoutTreeNode): { minX: number; maxX: number } => {
      let minX = node.absoluteX - node.width / 2;
      let maxX = node.absoluteX + node.width / 2;
      node.children.forEach(child => {
        const bounds = getSubtreeBounds(child);
        minX = Math.min(minX, bounds.minX);
        maxX = Math.max(maxX, bounds.maxX);
      });
      return { minX, maxX };
    };

    const resolveMainSubtreeCollisions = (root: LayoutTreeNode) => {
      const mainNodesOnly = root.children
        .filter(child => child.data.kind === 'main')
        .sort((a, b) => a.absoluteX - b.absoluteX);
      if (mainNodesOnly.length <= 1) return;

      const centerX = root.absoluteX;
      const minimumGap = isMobile ? 36 : 64;
      const sideClearance = isMobile ? 120 : 170;

      const leftNodes = mainNodesOnly
        .filter(node => node.absoluteX < centerX)
        .sort((a, b) => b.absoluteX - a.absoluteX);
      const rightNodes = mainNodesOnly
        .filter(node => node.absoluteX > centerX)
        .sort((a, b) => a.absoluteX - b.absoluteX);

      leftNodes.forEach(node => {
        const bounds = getSubtreeBounds(node);
        const overflow = bounds.maxX - (centerX - sideClearance);
        if (overflow > 0) {
          shiftSubtreeX(node, -overflow);
        }
      });

      rightNodes.forEach(node => {
        const bounds = getSubtreeBounds(node);
        const overflow = centerX + sideClearance - bounds.minX;
        if (overflow > 0) {
          shiftSubtreeX(node, overflow);
        }
      });

      if (leftNodes.length > 1) {
        let previousBounds = getSubtreeBounds(leftNodes[0]);
        for (let index = 1; index < leftNodes.length; index += 1) {
          const current = leftNodes[index];
          const currentBounds = getSubtreeBounds(current);
          const maxAllowed = previousBounds.minX - minimumGap;
          if (currentBounds.maxX > maxAllowed) {
            const delta = currentBounds.maxX - maxAllowed;
            shiftSubtreeX(current, -delta);
            previousBounds = getSubtreeBounds(current);
          } else {
            previousBounds = currentBounds;
          }
        }
      }

      if (rightNodes.length > 1) {
        let previousBounds = getSubtreeBounds(rightNodes[0]);
        for (let index = 1; index < rightNodes.length; index += 1) {
          const current = rightNodes[index];
          const currentBounds = getSubtreeBounds(current);
          const minAllowed = previousBounds.maxX + minimumGap;
          if (currentBounds.minX < minAllowed) {
            const delta = minAllowed - currentBounds.minX;
            shiftSubtreeX(current, delta);
            previousBounds = getSubtreeBounds(current);
          } else {
            previousBounds = currentBounds;
          }
        }
      }
    };

    const applyMainRowSpacing = (root: LayoutTreeNode) => {
      const mainNodesOnly = root.children.filter(child => child.data.kind === 'main');
      if (mainNodesOnly.length === 0) return;

      const centerX = root.absoluteX;
      const startOffset = isMobile ? 220 : 300;
      const laneSpacing = isMobile ? 270 : 360;
      const incomeOrder: NodeGroup[] = ['income', 'rendimentos'];
      const expenseOrder: NodeGroup[] = ['fixed', 'variable', 'personal', 'taxes'];

      const mainByGroup = new Map<NodeGroup, LayoutTreeNode>();
      mainNodesOnly.forEach(node => {
        if (node.data.group) {
          mainByGroup.set(node.data.group, node);
        }
      });

      incomeOrder.forEach((group, index) => {
        const node = mainByGroup.get(group);
        if (!node) return;
        node.absoluteX = centerX - (startOffset + laneSpacing * index);
      });

      expenseOrder.forEach((group, index) => {
        const node = mainByGroup.get(group);
        if (!node) return;
        node.absoluteX = centerX + (startOffset + laneSpacing * index);
      });

      const assigned = new Set<LayoutTreeNode>([
        ...incomeOrder.map(group => mainByGroup.get(group)).filter(Boolean) as LayoutTreeNode[],
        ...expenseOrder.map(group => mainByGroup.get(group)).filter(Boolean) as LayoutTreeNode[]
      ]);
      const remaining = mainNodesOnly.filter(node => !assigned.has(node));
      remaining.forEach((node, index) => {
        node.absoluteX =
          centerX + (startOffset + laneSpacing * (expenseOrder.length + index));
      });
    };

    const applyMainBranchTrunkLayouts = (root: LayoutTreeNode) => {
      const firstTopGap = isMobile ? 108 : 148;
      const branchGapY = isMobile ? 34 : 48;
      const sideOffsetBase = isMobile ? 42 : 56;
      const mainTrunkClear = isMobile ? 18 : 24;
      const detailTrunkOffsetBase = isMobile ? 30 : 40;
      const subTrunkClear = isMobile ? 16 : 22;
      const detailStartGap = isMobile ? 68 : 92;
      const detailGapY = isMobile ? 34 : 46;
      const detailSideOffsetBase = isMobile ? 18 : 26;
      const detailTrunkClear = isMobile ? 14 : 20;
      const detailTemplate = getNodeDimensions(isMobile ? 74 : 82, 'detail', isMobile);
      const detailSlotHeight = detailTemplate.height;
      const getReservedBranchHeight = (subNode: LayoutTreeNode) => {
        const reservedDetailCount = Math.max(
          subNode.data.reservedDetailCount ?? subNode.children.length,
          subNode.children.length
        );
        const reservedDetailsHeight =
          reservedDetailCount > 0
            ? detailStartGap +
              reservedDetailCount * detailSlotHeight +
              Math.max(reservedDetailCount - 1, 0) * detailGapY
            : 0;
        return Math.max(
          subNode.height,
          subNode.height + reservedDetailsHeight
        );
      };

      root.children.forEach(mainNode => {
        if (mainNode.data.kind !== 'main' || mainNode.children.length === 0) return;
        const trunkX = mainNode.absoluteX;
        let nextTopLeft = mainNode.absoluteY + mainNode.height / 2 + firstTopGap;
        let nextTopRight = nextTopLeft;

        mainNode.children.forEach((subNode, index) => {
          const reserveHeight = getReservedBranchHeight(subNode);
          const imbalance = Math.abs(nextTopLeft - nextTopRight);
          const shouldAlternate = imbalance <= branchGapY * 0.7;
          const preferredSide = index % 2 === 0 ? -1 : 1;
          const side =
            shouldAlternate
              ? preferredSide
              : nextTopLeft <= nextTopRight
                ? -1
                : 1;

          const laneTop = side < 0 ? nextTopLeft : nextTopRight;
          const subCenterOffset = Math.max(sideOffsetBase, subNode.width / 2 + mainTrunkClear);
          const subCenterY = laneTop + subNode.height / 2;

          subNode.absoluteX = trunkX + side * subCenterOffset;
          subNode.absoluteY = subCenterY;

          if (side < 0) {
            nextTopLeft = laneTop + reserveHeight + branchGapY;
          } else {
            nextTopRight = laneTop + reserveHeight + branchGapY;
          }

          if (subNode.children.length === 0) return;

          const detailTrunkOffset = Math.max(
            detailTrunkOffsetBase,
            subNode.width / 2 + subTrunkClear
          );
          const detailTrunkX = subNode.absoluteX + side * detailTrunkOffset;
          const detailTopStart = subNode.absoluteY + subNode.height / 2 + detailStartGap;
          subNode.children.forEach((detailNode, detailIndex) => {
            const branchSide = detailIndex % 2 === 0 ? -1 : 1;
            const detailCenterY =
              detailTopStart +
              detailIndex * (detailSlotHeight + detailGapY) +
              detailNode.height / 2;
            const detailCenterOffset = Math.max(
              detailSideOffsetBase,
              detailNode.width / 2 + detailTrunkClear
            );
            detailNode.absoluteX = detailTrunkX + branchSide * detailCenterOffset;
            detailNode.absoluteY = detailCenterY;
          });
        });
      });
    };

    const flattenTree = (
      node: LayoutTreeNode,
      parentId: string | null,
      nextNodes: MapNode[],
      nextEdges: MapEdge[]
    ) => {
      nextNodes.push({
        id: node.id,
        position: { x: node.absoluteX, y: node.absoluteY },
        data: node.data
      });

      if (parentId) {
        nextEdges.push({
          id: `edge-${parentId}-${node.id}`,
          source: parentId,
          target: node.id
        });
      }

      node.children.forEach(child => flattenTree(child, node.id, nextNodes, nextEdges));
    };

    const centerNode = createLayoutNode(
      'center',
      {
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
      },
      centerDimensions
    );

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

    mainMetrics.forEach((metric, mainIndex) => {
      const { node, size, color, percent, dimensions } = metric;
      const mainNode = createLayoutNode(
        node.id,
        {
          label: node.label,
          value: node.value,
          percent,
          kind: 'main',
          group: node.group,
          tagLabel: expenseCardTagByGroup[node.group],
          size,
          color,
          background: hexToRgba(color, 0.2)
        },
        dimensions
      );

      if (expandedGroups.has(node.group)) {
        const categories = groupData[node.group].categories;
        const totalGroup = Math.max(groupData[node.group].total, 1);

        categories.forEach((item, subIndex) => {
          const isMore = false;
          const subSize = isMobile ? 84 : 96;
          const referenceId =
            !isMore && 'id' in item && typeof item.id === 'string' ? item.id : item.label;
          const subKey = buildSubExpansionKey(node.group, referenceId);
          const subPaymentTag = paymentTagBySubKey.get(subKey);
          const availableDetailItems = detailDataBySubKey.get(subKey) || [];
          const expandedSub = expandedSubNodes.has(subKey);
          const detailItems = expandedSub ? availableDetailItems : [];
          const percentOfGroup = isMore ? 0 : (item.total / totalGroup) * 100;
          const subId = `${node.id}-sub-${mainIndex}-${subIndex}`;
          const subDimensions = getNodeDimensions(subSize, 'sub', isMobile);

          const subNode = createLayoutNode(
            subId,
            {
              label: 'label' in item ? item.label : 'Categoria',
              value: item.total,
              percent: percentOfGroup,
              kind: 'sub',
              group: node.group,
              category: !isMore && 'label' in item ? item.label : undefined,
              referenceId,
              isMore,
              hasChildren: availableDetailItems.length > 0,
              expanded: expandedSub && availableDetailItems.length > 0,
              reservedDetailCount: detailItems.length,
              paymentTag: subPaymentTag,
              tagLabel:
                !isMore && node.group === 'income'
                  ? incomeAccountTagBySubKey.get(subKey)
                  : undefined,
              size: subSize,
              color,
              background: hexToRgba(color, isMore ? 0.08 : 0.12)
            },
            subDimensions
          );

          detailItems.forEach((detailItem, detailIndex) => {
            const detailSize = isMobile ? 74 : 82;
            const detailDimensions = getNodeDimensions(detailSize, 'detail', isMobile);
            const detailPercent = item.total > 0 ? (detailItem.total / item.total) * 100 : 0;
            const detailId = `${subId}-detail-${detailIndex}`;

            const detailNode = createLayoutNode(
              detailId,
              {
                label: detailItem.label,
                value: detailItem.total,
                percent: detailPercent,
                kind: 'detail',
                group: node.group,
                category: detailItem.label,
                referenceId: detailItem.id,
                parentReferenceId: referenceId,
                tagLabel: detailItem.tagLabel,
                paymentTag: detailItem.paymentTag,
                size: detailSize,
                color,
                background: hexToRgba(color, 0.08)
              },
              detailDimensions
            );

            subNode.children.push(detailNode);
          });

          mainNode.children.push(subNode);
        });
      }

      centerNode.children.push(mainNode);
    });

    layoutSubtree(centerNode);
    assignAbsoluteX(centerNode, 0, 0);

    const depthHeights: number[] = [];
    collectDepthHeights(centerNode, depthHeights);
    const depthCenters: number[] = [0];
    for (let depth = 1; depth < depthHeights.length; depth += 1) {
      const gap = levelGaps[Math.min(depth, levelGaps.length - 1)] ?? levelGapDetail;
      const previousHeight = depthHeights[depth - 1] ?? 0;
      const currentHeight = depthHeights[depth] ?? 0;
      depthCenters[depth] =
        (depthCenters[depth - 1] ?? 0) + previousHeight / 2 + gap + currentHeight / 2;
    }
    assignAbsoluteY(centerNode, depthCenters);
    applyMainRowSpacing(centerNode);
    applyMainBranchTrunkLayouts(centerNode);
    resolveMainSubtreeCollisions(centerNode);

    const nextNodes: MapNode[] = [];
    const nextEdges: MapEdge[] = [];
    flattenTree(centerNode, null, nextNodes, nextEdges);

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
    if (isMobile) return;
    void toggleFullscreen();
  };

  const mapControls = (
    <>
      {!isMobile && (
        <>
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
        </>
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
    const padding = isMobile ? 64 : 32;
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

    const childrenBySource = new Map<string, Array<{ x: number; y: number }>>();
    edges.forEach(edge => {
      const target = nodeMap.get(edge.target);
      if (!target) return;
      const bucket = childrenBySource.get(edge.source) || [];
      bucket.push({ x: target.x, y: target.y });
      childrenBySource.set(edge.source, bucket);
    });

    const branchYBySource = new Map<string, number>();
    childrenBySource.forEach((children, sourceId) => {
      const source = nodeMap.get(sourceId);
      if (!source) return;
      const minChildY = Math.min(...children.map(child => child.y));
      if (!(minChildY > source.y)) return;
      const deltaY = minChildY - source.y;
      const offset = clamp(
        deltaY * 0.52,
        isMobile ? 18 : 24,
        isMobile ? 64 : 88
      );
      branchYBySource.set(sourceId, source.y + offset);
    });

    const detailTargetsBySource = new Map<string, Array<{ x: number; y: number }>>();
    edges.forEach(edge => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;
      if (
        source.data.kind !== 'sub' ||
        target.data.kind !== 'detail' ||
        source.data.group !== target.data.group
      ) {
        return;
      }
      const bucket = detailTargetsBySource.get(edge.source) || [];
      bucket.push({ x: target.x, y: target.y });
      detailTargetsBySource.set(edge.source, bucket);
    });
    const detailTrunkXBySource = new Map<string, number>();
    detailTargetsBySource.forEach((targets, sourceId) => {
      const source = nodeMap.get(sourceId);
      if (!source || targets.length === 0) return;
      const averageX = targets.reduce((sum, point) => sum + point.x, 0) / targets.length;
      const outwardSide = averageX < source.x ? -1 : 1;
      const minimumOffset = source.width / 2 + (isMobile ? 12 : 16);
      const minimumTrunkX = source.x + outwardSide * minimumOffset;
      const trunkX =
        outwardSide < 0
          ? Math.min(averageX, minimumTrunkX)
          : Math.max(averageX, minimumTrunkX);
      detailTrunkXBySource.set(sourceId, trunkX);
    });

    type Side = 'left' | 'right';
    const centerMainLaneYByTarget = new Map<string, number>();
    const centerMainLaneYByTargetX = new Map<string, number>();
    const centerNodeForMainLanes = nodeMap.get('center');
    if (centerNodeForMainLanes) {
      const mainLayouts = Array.from(nodeMap.values()).filter(item => item.data.kind === 'main');

      const assignSideLanes = (
        sideLayouts: Array<{ id: string; x: number }>,
        side: Side
      ) => {
        if (sideLayouts.length === 0) return;
        // Near main nodes stay lower; far main nodes go higher to avoid crossing.
        const ordered = [...sideLayouts].sort((a, b) =>
          side === 'left' ? b.x - a.x : a.x - b.x
        );
        const preferredLaneGap = isMobile ? 34 : 46;
        const sideBandShift = isMobile ? 12 : 18;
        const boundaryInset = isMobile ? 10 : 14;
        const safeTop =
          centerNodeForMainLanes.y - centerNodeForMainLanes.height / 2 + boundaryInset;
        const safeBottom =
          centerNodeForMainLanes.y + centerNodeForMainLanes.height / 2 - boundaryInset;
        const sideCenterYRaw =
          centerNodeForMainLanes.y + (side === 'left' ? -sideBandShift : sideBandShift);
        const sideCenterY = clamp(sideCenterYRaw, safeTop, safeBottom);
        const maxBandHalf = Math.max(0, Math.min(sideCenterY - safeTop, safeBottom - sideCenterY));
        const requestedSpan = ((ordered.length - 1) * preferredLaneGap) / 2;
        const laneSpan = Math.min(requestedSpan, maxBandHalf);
        const laneStep = ordered.length > 1 ? (laneSpan * 2) / (ordered.length - 1) : 0;
        const lowestLaneY = sideCenterY + laneSpan;

        ordered.forEach((layoutNode, index) => {
          const laneY =
            ordered.length === 1
              ? sideCenterY
              : lowestLaneY - laneStep * index;
          centerMainLaneYByTarget.set(layoutNode.id, laneY);
          centerMainLaneYByTargetX.set(
            `${side}:${Math.round(layoutNode.x * 1000)}`,
            laneY
          );
        });
      };

      assignSideLanes(
        mainLayouts.filter(item => item.x < centerNodeForMainLanes.x),
        'left'
      );
      assignSideLanes(
        mainLayouts.filter(item => item.x > centerNodeForMainLanes.x),
        'right'
      );
    }

    type PathPoint = { x: number; y: number };
    const EPSILON = 0.5;
    const pointsToPath = (points: PathPoint[]) =>
      points
        .map((point, index) =>
          index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
        )
        .join(' ');

    const getSourceBoundaryPoint = (
      node: { x: number; y: number; width: number; height: number },
      towards: PathPoint
    ): PathPoint => {
      const dx = towards.x - node.x;
      const dy = towards.y - node.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        const y = clamp(
          towards.y,
          node.y - node.height / 2 + 1,
          node.y + node.height / 2 - 1
        );
        return {
          x: node.x + (dx >= 0 ? 1 : -1) * node.width / 2,
          y
        };
      }
      if (Math.abs(dy) > EPSILON) {
        const x = clamp(
          towards.x,
          node.x - node.width / 2 + 1,
          node.x + node.width / 2 - 1
        );
        return {
          x,
          y: node.y + (dy >= 0 ? 1 : -1) * node.height / 2
        };
      }
      return { x: node.x, y: node.y };
    };

    const getTargetBoundaryPoint = (
      node: { x: number; y: number; width: number; height: number },
      from: PathPoint
    ): PathPoint => {
      const dx = node.x - from.x;
      const dy = node.y - from.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        const y = clamp(
          from.y,
          node.y - node.height / 2 + 1,
          node.y + node.height / 2 - 1
        );
        return {
          x: node.x - (dx >= 0 ? 1 : -1) * node.width / 2,
          y
        };
      }
      if (Math.abs(dy) > EPSILON) {
        const x = clamp(
          from.x,
          node.x - node.width / 2 + 1,
          node.x + node.width / 2 - 1
        );
        return {
          x,
          y: node.y - (dy >= 0 ? 1 : -1) * node.height / 2
        };
      }
      return { x: node.x, y: node.y };
    };

    const trimPolylineToNodeBorders = (
      points: PathPoint[],
      source: { x: number; y: number; width: number; height: number },
      target: { x: number; y: number; width: number; height: number }
    ): PathPoint[] => {
      if (points.length < 2) return points;
      const trimmed = [...points];
      trimmed[0] = getSourceBoundaryPoint(source, trimmed[1]);
      trimmed[trimmed.length - 1] = getTargetBoundaryPoint(target, trimmed[trimmed.length - 2]);

      const compact: PathPoint[] = [];
      trimmed.forEach(point => {
        const previous = compact[compact.length - 1];
        if (!previous) {
          compact.push(point);
          return;
        }
        if (Math.abs(previous.x - point.x) <= EPSILON && Math.abs(previous.y - point.y) <= EPSILON) {
          return;
        }
        compact.push(point);
      });

      const simplified: PathPoint[] = [];
      compact.forEach(point => {
        const size = simplified.length;
        if (size < 2) {
          simplified.push(point);
          return;
        }
        const a = simplified[size - 2];
        const b = simplified[size - 1];
        const sameX = Math.abs(a.x - b.x) <= EPSILON && Math.abs(b.x - point.x) <= EPSILON;
        const sameY = Math.abs(a.y - b.y) <= EPSILON && Math.abs(b.y - point.y) <= EPSILON;
        if (sameX || sameY) {
          simplified[size - 1] = point;
          return;
        }
        simplified.push(point);
      });

      return simplified;
    };

    const edgePaths = edges
      .map(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;

        const color =
          edge.source === 'center'
            ? target.data.color
            : source.data.color || target.data.color;
        const isActive =
          hoveredNodeId && (edge.source === hoveredNodeId || edge.target === hoveredNodeId);

        const isCenterToMain =
          edge.source === 'center' &&
          target.data.kind === 'main';
        const isMainToSubTrunk =
          source.data.kind === 'main' &&
          target.data.kind === 'sub' &&
          source.data.group === target.data.group;
        const isSubToDetailBranch =
          source.data.kind === 'sub' &&
          target.data.kind === 'detail' &&
          source.data.group === target.data.group;

        let rawPoints: PathPoint[] = [
          { x: source.x, y: source.y },
          { x: target.x, y: target.y }
        ];
        if (isCenterToMain) {
          const side: Side = target.x < source.x ? 'left' : 'right';
          const laneKey = `${side}:${Math.round(target.x * 1000)}`;
          const laneY =
            centerMainLaneYByTarget.get(edge.target) ??
            centerMainLaneYByTargetX.get(laneKey) ??
            source.y;
          rawPoints = [
            { x: source.x, y: laneY },
            { x: target.x, y: laneY },
            { x: target.x, y: target.y }
          ];
        } else if (isMainToSubTrunk) {
          rawPoints = [
            { x: source.x, y: source.y },
            { x: source.x, y: target.y },
            { x: target.x, y: target.y }
          ];
        } else if (isSubToDetailBranch) {
          const detailTrunkX = detailTrunkXBySource.get(edge.source) ?? (source.x + target.x) / 2;
          rawPoints = [
            { x: source.x, y: source.y },
            { x: detailTrunkX, y: source.y },
            { x: detailTrunkX, y: target.y },
            { x: target.x, y: target.y }
          ];
        } else {
          const branchY = branchYBySource.get(edge.source);
          if (typeof branchY === 'number' && Math.abs(target.y - source.y) > 2) {
            rawPoints = [
              { x: source.x, y: source.y },
              { x: source.x, y: branchY },
              { x: target.x, y: branchY },
              { x: target.x, y: target.y }
            ];
          }
        }
        const path = pointsToPath(trimPolylineToNodeBorders(rawPoints, source, target));

        const strokeWidth =
          isCenterToMain
            ? isActive
              ? 8.8
              : 7.4
            : isMainToSubTrunk
              ? isActive
                ? 5.8
                : 4.8
              : isActive
                ? 3.2
                : 2.4;

        return {
          id: edge.id,
          path,
          color,
          isActive,
          strokeWidth
        };
      })
      .filter(
        (
          edge
        ): edge is {
          id: string;
          path: string;
          color: string;
          isActive: boolean;
          strokeWidth: number;
        } => edge !== null
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
    const fitWidth = (mapSize.width - (isMobile ? 40 : 40)) / contentWidth;
    const fitHeight = (mapSize.height - (isMobile ? 40 : 40)) / contentHeight;
    const rawScale = Number.isFinite(fitWidth) && Number.isFinite(fitHeight)
      ? Math.min(fitWidth, fitHeight)
      : 1;
    const minAutoScale = isMobile ? 0.24 : 0.22;
    const maxAutoScale = isMobile ? 1.1 : 1.58;
    const targetScale = clamp(
      rawScale,
      minAutoScale,
      maxAutoScale
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
        editableIncome: null as Income | null,
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
    const incomeItems = items.filter(
      (item): item is Income =>
        typeof item === 'object' &&
        item !== null &&
        'accountId' in item &&
        'status' in item &&
        'date' in item &&
        !('dueDate' in item)
    );
    const editableIncome = incomeItems.length === 1 ? incomeItems[0] : null;
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
      editableIncome,
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

  const handleOpenLaunchFromNode = () => {
    if (details?.editableExpense) {
      navigateToResult({
        entity: 'expense',
        id: details.editableExpense.id,
        subtype: details.editableExpense.type
      });
      return;
    }
    if (details?.editableIncome) {
      navigateToResult({
        entity: 'income',
        id: details.editableIncome.id
      });
    }
  };

  const handleOpenDetailItem = (action: NonNullable<NodeDetailLaunchItem['openAction']>) => {
    if (action.entity === 'expense') {
      navigateToResult({
        entity: 'expense',
        id: action.id,
        subtype: action.subtype
      });
      return;
    }
    navigateToResult({
      entity: 'income',
      id: action.id
    });
  };

  const detailLaunchItems = useMemo<NodeDetailLaunchItem[]>(() => {
    if (!details || details.group === 'center') return [];
    return details.items.map((item, index) => {
      if (isExpenseDetailItem(item)) {
        const accountTag = item.cardId
          ? `Cartão ${cardNameById.get(item.cardId) || 'não identificado'}`
          : item.accountId
            ? `Conta ${accountNameById.get(item.accountId) || 'não identificada'}`
            : 'Sem conta';
        const statusTag = item.status === 'paid' ? 'Pago' : 'Pendente';
        return {
          key: `expense:${item.id}`,
          title: normalizeLabel(item.description, item.category || 'Despesa'),
          amount: item.amount,
          dateLabel: formatDateLabel(item.dueDate || item.date),
          meta: `${normalizeLabel(item.category, 'Sem categoria')} · ${statusTag} · ${accountTag}`,
          openAction: {
            entity: 'expense',
            id: item.id,
            subtype: item.type
          }
        };
      }
      if (isIncomeDetailItem(item)) {
        const accountTag = item.accountId
          ? `Conta ${accountNameById.get(item.accountId) || 'não identificada'}`
          : 'Sem conta';
        const statusTag = item.status === 'received' ? 'Recebido' : 'Pendente';
        return {
          key: `income:${item.id}`,
          title: normalizeLabel(item.description, item.category || 'Entrada'),
          amount: item.amount,
          dateLabel: formatDateLabel(item.competenceDate || item.date),
          meta: `${normalizeLabel(item.category, 'Sem categoria')} · ${statusTag} · ${accountTag}`,
          openAction: {
            entity: 'income',
            id: item.id
          }
        };
      }
      if (isYieldDetailItem(item)) {
        const accountTag = item.accountId
          ? `Conta ${accountNameById.get(item.accountId) || 'não identificada'}`
          : 'Sem conta';
        return {
          key: `yield:${item.id}`,
          title: normalizeLabel(item.notes, 'Rendimento'),
          amount: item.amount,
          dateLabel: formatDateLabel(item.date),
          meta: `Rendimentos · ${accountTag}`
        };
      }
      return {
        key: `item:${index}`,
        title: `Lançamento ${index + 1}`,
        amount: 0,
        dateLabel: 'Sem data',
        meta: 'Sem detalhes'
      };
    });
  }, [accountNameById, cardNameById, details]);

  const handleCloseFooter = () => {
    setIsFooterExpanded(false);
    setActiveNode(null);
    setHoveredNodeId(null);
    setHoverInfo(null);
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
      {detailLaunchItems.length > 0 && (
        <div className="w-full max-w-[960px] rounded-xl border border-white/15 bg-black/20 px-3 py-3 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200">
            Lançamentos deste node
          </p>
          <div className="mt-2 max-h-[230px] space-y-1.5 overflow-y-auto pr-1">
            {detailLaunchItems.slice(0, 24).map(item => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/35 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-white">{item.title}</p>
                  <p className="truncate text-[10px] text-slate-300">
                    {item.meta} · {item.dateLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] font-semibold text-white">{formatCurrency(item.amount)}</span>
                  {item.openAction && (
                    <button
                      type="button"
                      onClick={() => handleOpenDetailItem(item.openAction)}
                      className="rounded-full border border-indigo-300/35 bg-indigo-500/20 px-2.5 py-1 text-[10px] font-semibold text-indigo-100 hover:bg-indigo-500/30 transition"
                    >
                      Abrir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {detailLaunchItems.length > 24 && (
            <p className="mt-2 text-[10px] text-slate-400">
              Mostrando 24 de {detailLaunchItems.length} lançamentos.
            </p>
          )}
        </div>
      )}
      {(details.editableExpense || details.editableIncome) && (
        <button
          type="button"
          onClick={handleOpenLaunchFromNode}
          className="rounded-full border border-indigo-300/35 bg-indigo-500/20 px-4 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/30 transition"
        >
          Abrir lançamento para corrigir
        </button>
      )}
    </div>
  ) : (
    <div className="text-sm text-slate-400 text-center">Clique em um node para ver detalhes.</div>
  );
  const hasFooterDetails = Boolean(details);

  const footerControls = !isMobile && activeNode ? (
    <div className="pointer-events-auto absolute right-4 bottom-3 flex items-center rounded-full border border-white/15 bg-slate-950/70 px-2 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur">
      <button
        type="button"
        onClick={handleCloseFooter}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Fechar detalhes do rodapé"
        title="Fecha o painel de detalhes do rodapé."
      >
        <X size={16} className="mx-auto" />
      </button>
    </div>
  ) : null;

  const mapFooter = !isMobile && (isFullscreen || Boolean(activeNode)) ? (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <div
        className={`relative border-t border-white/20 bg-white/5 shadow-[0_-10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl ${
          isFullscreen
            ? isFooterExpanded && hasFooterDetails
              ? 'rounded-t-[26px] px-10 py-6 min-h-[150px]'
              : 'rounded-t-[26px] px-10 py-3 min-h-[78px]'
            : isFooterExpanded && hasFooterDetails
              ? 'rounded-t-2xl px-6 py-4 min-h-[112px]'
              : 'rounded-t-2xl px-6 py-3 min-h-[72px]'
        }`}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className={`mx-auto w-full ${isFullscreen ? 'max-w-[1200px]' : 'max-w-[980px]'}`}>
          <div className="mx-auto w-full max-w-[860px]">
            <div className="flex justify-center">
              {hasFooterDetails ? (
                <button
                  type="button"
                  onClick={() => setIsFooterExpanded(prev => !prev)}
                  className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/15"
                  aria-expanded={isFooterExpanded}
                  aria-label={isFooterExpanded ? 'Recolher detalhes do node' : 'Expandir detalhes do node'}
                >
                  <span>Detalhes do node</span>
                  <span className="text-slate-300/80">{isFooterExpanded ? 'Recolher' : 'Expandir'}</span>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm leading-none">
                    {isFooterExpanded ? '−' : '+'}
                  </span>
                </button>
              ) : (
                <div className="text-sm text-slate-400 text-center">Clique em um node para ver detalhes.</div>
              )}
            </div>
            {isFooterExpanded && hasFooterDetails && <div className="mt-4">{footerContent}</div>}
          </div>
        </div>
        {footerControls}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-0">
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
                : 'rounded-3xl w-full flex-1 min-h-[var(--mm-map-surface-min-height,320px)]'
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
                transform: `translate(${renderViewport.x}px, ${renderViewport.y}px) scale(${renderViewport.scale})`,
                transformOrigin: 'center center',
                backfaceVisibility: 'hidden'
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
                    style={{ pointerEvents: 'none', shapeRendering: 'geometricPrecision' }}
                  >
                    {layout.edgePaths.map(edge => (
                      <path
                        key={edge.id}
                        d={edge.path}
                        stroke={hexToRgba(edge.color, edge.isActive ? 0.9 : 0.6)}
                        strokeWidth={edge.strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
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
