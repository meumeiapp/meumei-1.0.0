import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hand, Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react';
import type { Account, CreditCard, Expense, Income } from '../../types';
import type { YieldRecord } from '../../services/yieldsService';
import {
  formatCompactCurrency,
  formatCurrency,
  formatShortDate,
  isTaxExpense
} from './reportUtils';

export type ReportTransactions = {
  incomes: Income[];
  expenses: Expense[];
};

type NodeKind = 'center' | 'main' | 'sub';

type NodeGroup =
  | 'fixed'
  | 'variable'
  | 'personal'
  | 'cards'
  | 'rendimentos'
  | 'taxes';

interface ReportNodeData {
  label: string;
  value: number;
  percent: number;
  kind: NodeKind;
  group?: NodeGroup;
  category?: string;
  referenceId?: string;
  isMore?: boolean;
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

const getNodeDimensions = (size: number, kind: NodeKind, isMobile: boolean) => {
  const config =
    kind === 'center'
      ? {
          widthScale: 1.15,
          heightScale: 0.78,
          minWidth: isMobile ? 150 : 190,
          minHeight: isMobile ? 96 : 120
        }
      : kind === 'main'
        ? {
            widthScale: 1.28,
            heightScale: 0.7,
            minWidth: isMobile ? 130 : 170,
            minHeight: isMobile ? 76 : 92
          }
        : {
            widthScale: 1.2,
            heightScale: 0.68,
            minWidth: isMobile ? 120 : 150,
            minHeight: isMobile ? 72 : 86
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
  const highlight = selected ? hexToRgba(data.color, 0.45) : hexToRgba(data.color, 0.28);
  const contentWidth = Math.max(width - 28, 0);
  const contentHeight = Math.max(height - 20, 0);
  const isCompact = height < 90;
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
      className="flex items-center justify-center text-center rounded-2xl border border-white/10 text-white shadow-lg backdrop-blur-sm transition-transform duration-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        width,
        height,
        background,
        borderColor: hexToRgba(data.color, selected ? 0.7 : 0.45),
        boxShadow: `0 16px 40px ${highlight}, 0 0 0 1px rgba(255,255,255,0.06)`
      }}
    >
      <div
        className="px-3 space-y-1"
        style={{ maxWidth: contentWidth, maxHeight: contentHeight, overflow: 'hidden' }}
      >
        <div
          className={`uppercase tracking-[0.18em] text-white/70 leading-tight ${
            isCompact ? 'text-[9px]' : 'text-[10px]'
          }`}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {label}
        </div>
        {isCenter ? (
          <div className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-semibold text-white`}>
            {Math.round(data.percent)}%
          </div>
        ) : (
          <>
            <div
              className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-white`}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {valueText}
            </div>
            <div className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-white/60`}>
              {percentText}
            </div>
          </>
        )}
      </div>
    </button>
  );
};

const sumAmounts = (items: Array<{ amount: number }>) =>
  items.reduce((acc, item) => acc + item.amount, 0);

const buildCategoryTotals = (items: Array<{ category?: string; amount: number }>) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    const key = item.category?.trim() || 'Sem categoria';
    map.set(key, (map.get(key) || 0) + item.amount);
  });
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
};

const buildCardTotals = (items: Expense[], cards: CreditCard[]) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    if (!item.cardId) return;
    map.set(item.cardId, (map.get(item.cardId) || 0) + item.amount);
  });
  const cardMap = new Map(cards.map(card => [card.id, card.name]));
  return Array.from(map.entries())
    .map(([cardId, total]) => ({
      id: cardId,
      label: cardMap.get(cardId) || 'Cartão',
      total
    }))
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

const FinancialMap: React.FC<FinancialMapProps> = ({
  summary,
  transactions,
  yields,
  accounts,
  creditCards,
  isMobile
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [activeNode, setActiveNode] = useState<ReportNodeData | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<NodeGroup>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsNativeFullscreen, setSupportsNativeFullscreen] = useState(false);
  const [isTouchInteractionEnabled, setIsTouchInteractionEnabled] = useState(false);
  const [showDesktopOnlyNotice, setShowDesktopOnlyNotice] = useState(false);
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
  const expenseCards = transactions.expenses.filter(exp => Boolean(exp.cardId));
  const expenseTaxes = transactions.expenses.filter(isTaxExpense);

  const totalFixed = sumAmounts(expenseFixed);
  const totalVariable = sumAmounts(expenseVariable);
  const totalPersonal = sumAmounts(expensePersonal);
  const totalCards = sumAmounts(expenseCards);
  const totalTaxes = sumAmounts(expenseTaxes);
  const totalRendimentos = sumAmounts(yields);

  const hasTaxNode = totalTaxes > 0;

  const mainNodes = useMemo(() => {
    const nodes = [
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
      { id: 'cards', label: 'Cartões', value: totalCards, group: 'cards' as const },
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
    totalCards,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable
  ]);

  const groupColor = {
    fixed: '#38bdf8',
    variable: '#f97316',
    personal: '#f472b6',
    cards: '#6366f1',
    rendimentos: '#22c55e',
    taxes: '#eab308'
  } satisfies Record<NodeGroup, string>;

  const commitmentPercent = summary.totalReceitas > 0
    ? (summary.totalDespesas / summary.totalReceitas) * 100
    : 0;

  const commitmentColor =
    commitmentPercent <= 60
      ? '#22c55e'
      : commitmentPercent <= 80
        ? '#f59e0b'
        : '#ef4444';

  const groupData = useMemo(() => {
    return {
      fixed: {
        items: expenseFixed,
        total: totalFixed,
        categories: buildCategoryTotals(expenseFixed)
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
      cards: {
        items: expenseCards,
        total: totalCards,
        categories: buildCardTotals(expenseCards, creditCards)
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
    creditCards,
    expenseCards,
    expenseFixed,
    expensePersonal,
    expenseTaxes,
    expenseVariable,
    totalCards,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable,
    yields
  ]);

  const { nodes, edges } = useMemo(() => {
    const baseSize = isMobile ? 100 : 128;

    const centerRadius = isMobile ? 170 : 210;
    const centerDimensions = getNodeDimensions(centerRadius, 'center', isMobile);

    const nextNodes: MapNode[] = [];
    const nextEdges: MapEdge[] = [];

    const mainMetrics = mainNodes.map(node => {
      const size = baseSize;
      const color = groupColor[node.group];
      const totalBase = node.group === 'rendimentos' ? summary.totalReceitas : summary.totalDespesas;
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
    const centerX = -mainOffset * 0.6;
    const mainX = centerX + mainOffset;

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
      const subMetrics = subItems.map(item => ({
        ...item,
        dimensions: getNodeDimensions(item.size, 'sub', isMobile)
      }));
      const subColumnHeight =
        subMetrics.reduce((sum, metricItem) => sum + metricItem.dimensions.height, 0) +
        subGapY * Math.max(subMetrics.length - 1, 0);
      const maxSubWidth = Math.max(...subMetrics.map(item => item.dimensions.width), 0);
      const blockHeight = Math.max(metric.dimensions.height, subColumnHeight);

      return {
        ...metric,
        categories,
        totalGroup,
        subMetrics,
        subColumnHeight,
        maxSubWidth,
        blockHeight
      };
    });

    const mainColumnHeight =
      mainLayout.reduce((sum, metric) => sum + metric.blockHeight, 0) +
      gapY * Math.max(mainLayout.length - 1, 0);

    nextNodes.push({
      id: 'center',
      position: { x: centerX, y: 0 },
      data: {
        label: 'Receita Comprometida',
        value: summary.totalDespesas,
        percent: commitmentPercent,
        kind: 'center',
        size: centerRadius,
        color: commitmentColor,
        background: hexToRgba(commitmentColor, 0.22)
      }
    });

    let cursorY = -mainColumnHeight / 2;
    mainLayout.forEach((metric, index) => {
      const { node, size, color, percent, dimensions, subMetrics, subColumnHeight, maxSubWidth, blockHeight, totalGroup } = metric;
      const blockTop = cursorY;
      const blockCenterY = blockTop + blockHeight / 2;
      const pos = {
        x: mainX,
        y: blockCenterY
      };
      cursorY += blockHeight + (index < mainLayout.length - 1 ? gapY : 0);

      nextNodes.push({
        id: node.id,
        position: pos,
        data: {
          label: node.label,
          value: node.value,
          percent,
          kind: 'main',
          group: node.group,
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

      const subX = mainX + maxMainWidth / 2 + maxSubWidth / 2 + subGapX;
      const subTop = blockTop + (blockHeight - subColumnHeight) / 2;
      let subCursor = subTop;

      subMetrics.forEach((metricItem, idx) => {
        const { item, size: subSize, isMore, dimensions: subDimensions } = metricItem;
        const subPos = {
          x: subX,
          y: subCursor + subDimensions.height / 2
        };
        subCursor += subDimensions.height + (idx < subMetrics.length - 1 ? subGapY : 0);

        const percentOfGroup = isMore ? 0 : (item.total / totalGroup) * 100;
        const subId = `${node.id}-sub-${idx}`;
        const referenceId =
          !isMore && 'id' in item && typeof item.id === 'string' ? item.id : item.label;

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
      });
    });

    return { nodes: nextNodes, edges: nextEdges };
  }, [
    commitmentColor,
    commitmentPercent,
    expandedGroups,
    groupColor,
    groupData,
    isMobile,
    mainNodes,
    summary.totalDespesas,
    summary.totalReceitas
  ]);

  const handleNodeClick = (node: ReportNodeData) => {
    if (node.kind === 'main' && node.group) {
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(node.group)) {
          next.delete(node.group);
        } else {
          next.add(node.group);
        }
        return next;
      });
      return;
    }
    if (node.kind === 'center') {
      setExpandedGroups(new Set());
      setActiveNode(null);
      return;
    }
    setActiveNode(node);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (isMobile && event.pointerType === 'touch' && !isTouchInteractionEnabled) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
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
      viewportRef.current = next;
      setViewport(next);
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
      viewportRef.current = next;
      setViewport(next);
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
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const scaleDelta = event.deltaY * -0.0015;
    const nextScale = clamp(viewportRef.current.scale + scaleDelta, MIN_ZOOM, MAX_ZOOM);
    const next = { ...viewportRef.current, scale: nextScale };
    viewportRef.current = next;
    setViewport(next);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const step = direction === 'in' ? 0.12 : -0.12;
    const nextScale = clamp(viewportRef.current.scale + step, MIN_ZOOM, MAX_ZOOM);
    const next = { ...viewportRef.current, scale: nextScale };
    viewportRef.current = next;
    setViewport(next);
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
        >
          <span className="flex items-center gap-2">
            <Hand size={14} />
            {isTouchInteractionEnabled ? 'Mapa ativo' : 'Mapa scroll'}
          </span>
        </button>
      )}
    </>
  );

  const fullscreenFooter = !isMobile && isFullscreen ? (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={handleFullscreenClick}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Sair da tela cheia"
      >
        <Minimize2 size={16} className="mx-auto" />
      </button>
      <div className="h-5 w-px bg-white/10" />
      <button
        type="button"
        onClick={() => handleZoom('out')}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Diminuir zoom"
      >
        <Minus size={16} className="mx-auto" />
      </button>
      <button
        type="button"
        onClick={() => handleZoom('in')}
        className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Aumentar zoom"
      >
        <Plus size={16} className="mx-auto" />
      </button>
    </div>
  ) : null;

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
      }
    };
  }, [edges, hoveredNodeId, isMobile, mapSize.height, mapSize.width, nodes]);

  const details = useMemo(() => {
    if (!activeNode) return null;
    if (!activeNode.group) {
      return {
        title: activeNode.label,
        value: activeNode.value,
        percent: activeNode.percent,
        items: transactions.expenses,
        group: 'center' as const
      };
    }
    const group = groupData[activeNode.group];
    let items = group.items;
    if (activeNode.kind === 'sub' && activeNode.referenceId) {
      if (activeNode.group === 'cards') {
        items = items.filter(item => 'cardId' in item && item.cardId === activeNode.referenceId);
      } else if (activeNode.group === 'rendimentos') {
        items = items.filter(item => 'accountId' in item && item.accountId === activeNode.referenceId);
      } else {
        items = items.filter(item => (item.category || 'Sem categoria') === activeNode.referenceId);
      }
    }
    return {
      title: activeNode.label,
      value: activeNode.kind === 'sub' ? activeNode.value : group.total,
      percent: activeNode.percent,
      items,
      group: activeNode.group
    };
  }, [activeNode, groupData, transactions.expenses]);

  const cardNameById = useMemo(
    () => new Map(creditCards.map(card => [card.id, card.name])),
    [creditCards]
  );

  const accountNameById = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts]
  );

  const detailRows = useMemo(() => {
    if (!details) return [];
    if (details.group === 'rendimentos') {
      const sorted = [...(details.items as YieldRecord[])].sort((a, b) => {
        const aDate = new Date(a.date + 'T12:00:00').getTime();
        const bDate = new Date(b.date + 'T12:00:00').getTime();
        return bDate - aDate;
      });
      return sorted.slice(0, 12).map(item => ({
        id: item.id,
        title: accountNameById.get(item.accountId) || 'Conta',
        subtitle: item.notes || 'Rendimento',
        date: formatShortDate(item.date),
        amount: item.amount,
        badge: 'Rendimento'
      }));
    }
    const sorted = [...(details.items as Expense[])].sort((a, b) => {
      const aDate = new Date((a.dueDate || a.date) + 'T12:00:00').getTime();
      const bDate = new Date((b.dueDate || b.date) + 'T12:00:00').getTime();
      return bDate - aDate;
    });
    return sorted.slice(0, 12).map(item => ({
      id: item.id,
      title: item.description || 'Lançamento',
      subtitle: item.category || 'Sem categoria',
      date: formatShortDate(item.dueDate || item.date),
      amount: item.amount,
      badge: item.cardId ? cardNameById.get(item.cardId) || 'Cartão' : 'Despesa'
    }));
  }, [accountNameById, cardNameById, details]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-start justify-start">
        <div>
          <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-white`}>Mapa Financeiro</h2>
          <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-slate-400`}>
            Receita comprometida{' '}
            <span className="text-white font-semibold">{commitmentPercent.toFixed(1)}%</span>
          </p>
        </div>
      </div>

      <div
        className={`relative ${isOverlayFullscreen ? 'fixed inset-0 z-[90] h-[100dvh] w-[100dvw]' : 'flex-1 min-h-0'}`}
        style={{
          paddingTop: isOverlayFullscreen ? 'env(safe-area-inset-top)' : undefined,
          paddingBottom: isOverlayFullscreen ? 'env(safe-area-inset-bottom)' : undefined
        }}
      >
        <div className="flex gap-4 items-stretch h-full min-h-0">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            className={`relative border border-white/10 overflow-hidden flex-1 ${
              isFullscreen
                ? 'rounded-none h-full w-full box-border'
                : 'rounded-3xl h-full min-h-[420px] md:min-h-[520px]'
            }`}
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
            {fullscreenFooter}

            <div
              className="absolute inset-0"
              style={{
                transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
                transformOrigin: 'center center'
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
                              if (isMobile) return;
                              setHoveredNodeId(node.id);
                              setHoverInfo({ node: node.data, x: event.clientX, y: event.clientY });
                            }}
                            onMouseMove={event => {
                              if (isMobile) return;
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

            {hoverInfo && (
              <div
                className="fixed z-30 pointer-events-none bg-slate-900/95 text-white text-xs px-3 py-2 rounded-lg shadow-lg"
                style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
              >
                <div className="font-semibold">{hoverInfo.node.label}</div>
                <div>{formatCurrency(hoverInfo.node.value)}</div>
                <div className="text-slate-400">{hoverInfo.node.percent.toFixed(1)}%</div>
              </div>
            )}

            {activeNode && details && (
              <div
                className={`absolute top-0 right-0 h-full w-full max-w-sm bg-slate-950/95 border-l border-white/10 p-5 overflow-y-auto ${
                  isMobile ? 'max-w-full' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Detalhes</div>
                    <h3 className="text-lg font-semibold text-white mt-2">{details.title}</h3>
                    <p className="text-sm text-slate-300">
                      {formatCurrency(details.value)} • {details.percent.toFixed(1)}%
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveNode(null);
                    }}
                    className="text-slate-400 hover:text-white"
                    aria-label="Fechar detalhes"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {detailRows.length === 0 && (
                    <div className="text-sm text-slate-400">Sem lançamentos no período.</div>
                  )}
                  {detailRows.map(row => (
                    <div
                      key={row.id}
                      className="flex items-start justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{row.title}</div>
                        <div className="text-xs text-slate-400">{row.subtitle}</div>
                        <div className="text-[11px] text-slate-500">{row.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">
                          {formatCurrency(row.amount)}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                          {row.badge}
                        </div>
                      </div>
                    </div>
                  ))}
                  {details.items.length > detailRows.length && (
                    <div className="text-xs text-slate-400">
                      Mostrando {detailRows.length} de {details.items.length} lançamentos.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isMobile && !isFullscreen && (
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
