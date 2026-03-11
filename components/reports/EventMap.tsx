import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import type { Account, CreditCard, Expense, Income } from '../../types';
import { formatCompactCurrency, formatCurrency, formatShortDate } from './reportUtils';
import { getAccountColor, getCardColor, withAlpha } from '../../services/cardColorUtils';

type ReportTransactions = {
  incomes: Income[];
  expenses: Expense[];
};

type EventLane = {
  id: string;
  label: string;
  kind: 'account' | 'card' | 'other';
  color?: string;
  balance?: number;
  events: EventItem[];
};

type EventItem = {
  id: string;
  type: 'start' | 'income' | 'expense';
  label: string;
  amount?: number;
  dateLabel?: string;
};

type LaneStats = {
  totalIncomes: number;
  totalExpenses: number;
  netTotal: number;
  volumeTotal: number;
  incomePercent: number;
  expensePercent: number;
  maxIncome: number;
  maxExpense: number;
  averageTicket: number;
  lastEvent?: EventItem;
  eventCount: number;
};

type SelectedNode =
  | { kind: 'event'; lane: EventLane; event: EventItem; stats: LaneStats }
  | { kind: 'origin'; lane: EventLane; stats: LaneStats }
  | { kind: 'summary'; lane: EventLane; stats: LaneStats };

interface EventMapProps {
  transactions: ReportTransactions;
  accounts: Account[];
  creditCards: CreditCard[];
  isMobile: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.8;
const EVENT_COLORS = {
  income: '#22c55e',
  expense: '#ef4444',
  start: '#94a3b8'
};

const resolveBalance = (account?: Account) => {
  if (!account) return 0;
  const value =
    typeof account.currentBalance === 'number'
      ? account.currentBalance
      : typeof account.initialBalance === 'number'
        ? account.initialBalance
        : 0;
  return Number.isFinite(value) ? value : 0;
};

const buildNeonGradient = (balance?: number) => {
  if (typeof balance !== 'number') {
    return {
      backgroundImage: `linear-gradient(90deg, ${withAlpha(EVENT_COLORS.income, 0.35)} 0%, ${withAlpha(
        EVENT_COLORS.expense,
        0.35
      )} 100%)`,
      boxShadow: `0 0 12px ${withAlpha(EVENT_COLORS.income, 0.3)}, 0 0 18px ${withAlpha(
        EVENT_COLORS.expense,
        0.3
      )}`
    };
  }
  const normalized = clamp(balance / 5000, -1, 1);
  const t = clamp(0.5 - normalized * 0.35, 0.15, 0.85);
  const greenAlpha = 0.2 + 0.6 * (1 - t);
  const redAlpha = 0.2 + 0.6 * t;
  return {
    backgroundImage: `linear-gradient(90deg, ${withAlpha(EVENT_COLORS.income, greenAlpha)} 0%, ${withAlpha(
      EVENT_COLORS.expense,
      redAlpha
    )} 100%)`,
    boxShadow: `0 0 12px ${withAlpha(EVENT_COLORS.income, greenAlpha)}, 0 0 18px ${withAlpha(
      EVENT_COLORS.expense,
      redAlpha
    )}`
  };
};

const buildLaneStats = (events: EventItem[]): LaneStats => {
  const totalIncomes = events.reduce(
    (sum, event) => sum + (event.type === 'income' ? Math.abs(event.amount ?? 0) : 0),
    0
  );
  const totalExpenses = events.reduce(
    (sum, event) => sum + (event.type === 'expense' ? Math.abs(event.amount ?? 0) : 0),
    0
  );
  const netTotal = totalIncomes - totalExpenses;
  const volumeTotal = totalIncomes + totalExpenses;
  const incomePercent = volumeTotal > 0 ? Math.round((totalIncomes / volumeTotal) * 100) : 0;
  const expensePercent = volumeTotal > 0 ? Math.round((totalExpenses / volumeTotal) * 100) : 0;
  const maxIncome = events.reduce(
    (max, event) =>
      event.type === 'income' && event.amount !== undefined
        ? Math.max(max, Math.abs(event.amount))
        : max,
    0
  );
  const maxExpense = events.reduce(
    (max, event) =>
      event.type === 'expense' && event.amount !== undefined
        ? Math.max(max, Math.abs(event.amount))
        : max,
    0
  );
  const eventCount = events.length;
  const averageTicket = eventCount > 0 ? volumeTotal / eventCount : 0;
  const lastEvent = events.length > 0 ? events[events.length - 1] : undefined;

  return {
    totalIncomes,
    totalExpenses,
    netTotal,
    volumeTotal,
    incomePercent,
    expensePercent,
    maxIncome,
    maxExpense,
    averageTicket,
    lastEvent,
    eventCount
  };
};

const EventMap: React.FC<EventMapProps> = ({
  transactions,
  accounts,
  creditCards,
  isMobile
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const normalViewRef = useRef<{ zoom: number; left: number; top: number } | null>(null);
  const fullscreenViewRef = useRef<{ zoom: number; left: number; top: number } | null>(null);
  const zoomRef = useRef(1);
  const prevFullscreenRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsNativeFullscreen, setSupportsNativeFullscreen] = useState(false);
  const [showDesktopOnlyNotice, setShowDesktopOnlyNotice] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mapViewport, setMapViewport] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const autoFitKeyRef = useRef('');
  const accountNameById = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts]
  );
  const accountById = useMemo(
    () => new Map(accounts.map(account => [account.id, account])),
    [accounts]
  );
  const accountColorById = useMemo(
    () => new Map(accounts.map(account => [account.id, getAccountColor(account)])),
    [accounts]
  );
  const cardNameById = useMemo(
    () => new Map(creditCards.map(card => [card.id, card.name])),
    [creditCards]
  );
  const cardColorById = useMemo(
    () => new Map(creditCards.map(card => [card.id, getCardColor(card)])),
    [creditCards]
  );

  const lanes = useMemo<EventLane[]>(() => {
    const laneMap = new Map<string, EventLane>();
    const events: Array<{
      id: string;
      type: 'income' | 'expense';
      label: string;
      amount: number;
      dateLabel: string;
      time: number;
      accountId?: string;
      cardId?: string;
    }> = [];

    transactions.incomes.forEach(inc => {
      const date = new Date(inc.date + 'T12:00:00');
      events.push({
        id: inc.id,
        type: 'income',
        label: inc.description || inc.category || 'Entrada',
        amount: inc.amount,
        dateLabel: formatShortDate(inc.date),
        time: date.getTime(),
        accountId: inc.accountId
      });
    });

    transactions.expenses.forEach(exp => {
      const dateValue = exp.dueDate || exp.date;
      const date = new Date(dateValue + 'T12:00:00');
      events.push({
        id: exp.id,
        type: 'expense',
        label: exp.description || exp.category || 'Despesa',
        amount: exp.amount,
        dateLabel: formatShortDate(dateValue),
        time: date.getTime(),
        accountId: exp.accountId,
        cardId: exp.cardId
      });
    });

    events
      .sort((a, b) => a.time - b.time)
      .forEach(event => {
        let laneKey = '';
        let label = 'Sem origem';
        let kind: EventLane['kind'] = 'other';
        let color: string | undefined;
        let balance: number | undefined;

        if (event.cardId) {
          laneKey = `card:${event.cardId}`;
          label = cardNameById.get(event.cardId) || 'Cartão';
          kind = 'card';
          color = cardColorById.get(event.cardId);
        } else if (event.accountId) {
          laneKey = `account:${event.accountId}`;
          label = accountNameById.get(event.accountId) || 'Conta';
          kind = 'account';
          color = accountColorById.get(event.accountId);
          balance = resolveBalance(accountById.get(event.accountId));
        }

        if (!laneMap.has(laneKey)) {
          laneMap.set(laneKey, {
            id: laneKey,
            label,
            kind,
            color,
            balance,
            events: []
          });
        }

        laneMap.get(laneKey)!.events.push({
          id: event.id,
          type: event.type,
          label: event.label,
          amount: event.amount,
          dateLabel: event.dateLabel
        });
      });

    const lanesList = Array.from(laneMap.values()).map(lane => {
      const trimmed = lane.events.slice(-10);
      return {
        ...lane,
        events: trimmed
      };
    });

    return lanesList;
  }, [
    accountById,
    accountColorById,
    accountNameById,
    cardColorById,
    cardNameById,
    transactions.expenses,
    transactions.incomes
  ]);

  const totalEvents = lanes.reduce((sum, lane) => sum + lane.events.length, 0);

  const laneLayout = useMemo(() => {
    const cardWidth = isMobile ? 180 : 210;
    const accountWidth = cardWidth;
    const cardHeight = 72;
    const gap = 14;
    const laneGap = 20;
    const laneSpacing = 24;
    const padding = 24;
    const laneWidths = lanes.map(lane => {
      const eventCount = lane.events.length + 1;
      return accountWidth + laneGap + eventCount * cardWidth + Math.max(eventCount - 1, 0) * gap;
    });
    const contentWidth = laneWidths.length > 0 ? Math.max(...laneWidths) : accountWidth;
    const contentHeight = lanes.length * cardHeight + Math.max(lanes.length - 1, 0) * laneSpacing;
    const baseWidth = contentWidth + padding * 2;
    const baseHeight = contentHeight + padding * 2;
    return {
      cardWidth,
      accountWidth,
      cardHeight,
      gap,
      laneGap,
      laneSpacing,
      padding,
      contentWidth,
      contentHeight,
      baseWidth,
      baseHeight
    };
  }, [isMobile, lanes]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateViewport = () => {
      const next = {
        width: Math.round(element.clientWidth),
        height: Math.round(element.clientHeight)
      };
      setMapViewport(prev =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };

    updateViewport();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewport) : null;
    observer?.observe(element);

    return () => observer?.disconnect();
  }, [lanes.length, isFullscreen]);

  useEffect(() => {
    if (isMobile || isFullscreen) return;
    if (!mapViewport.width || !mapViewport.height) return;
    if (!laneLayout.baseWidth || !laneLayout.baseHeight) return;

    const fitWidth = (mapViewport.width - 20) / laneLayout.baseWidth;
    const fitHeight = (mapViewport.height - 20) / laneLayout.baseHeight;
    const nextZoom = clamp(Math.min(1, fitWidth, fitHeight), MIN_ZOOM, 1);
    const key = [
      mapViewport.width,
      mapViewport.height,
      Math.round(laneLayout.baseWidth),
      Math.round(laneLayout.baseHeight),
      nextZoom.toFixed(4)
    ].join(':');
    if (autoFitKeyRef.current === key) return;
    autoFitKeyRef.current = key;

    setZoom(nextZoom);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    });
  }, [
    isFullscreen,
    isMobile,
    laneLayout.baseHeight,
    laneLayout.baseWidth,
    mapViewport.height,
    mapViewport.width
  ]);

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
    const prev = prevFullscreenRef.current;
    if (prev === isFullscreen) return;
    prevFullscreenRef.current = isFullscreen;
    const container = scrollRef.current;
    if (!container) return;

    if (isFullscreen) {
      normalViewRef.current = {
        zoom: zoomRef.current,
        left: container.scrollLeft,
        top: container.scrollTop
      };
      const target = fullscreenViewRef.current;
      if (!target) return;
      setZoom(target.zoom);
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollLeft = target.left;
        scrollRef.current.scrollTop = target.top;
      });
      return;
    }

    fullscreenViewRef.current = {
      zoom: zoomRef.current,
      left: container.scrollLeft,
      top: container.scrollTop
    };
    const target = normalViewRef.current;
    if (!target) return;
    setZoom(target.zoom);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = target.left;
      scrollRef.current.scrollTop = target.top;
    });
  }, [isFullscreen]);

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

  const handleZoom = (direction: 'in' | 'out') => {
    const step = direction === 'in' ? 0.12 : -0.12;
    setZoom(prev => clamp(prev + step, MIN_ZOOM, MAX_ZOOM));
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
      {null}
    </>
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    if (target?.closest('[data-map-node="true"]')) return;
    const container = scrollRef.current;
    if (!container) return;
    container.setPointerCapture(event.pointerId);
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: container.scrollLeft,
      top: container.scrollTop
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !scrollRef.current) return;
    const dx = event.clientX - panRef.current.x;
    const dy = event.clientY - panRef.current.y;
    scrollRef.current.scrollLeft = panRef.current.left - dx;
    scrollRef.current.scrollTop = panRef.current.top - dy;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !scrollRef.current) return;
    scrollRef.current.releasePointerCapture(event.pointerId);
    panRef.current = null;
    setIsPanning(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isFullscreen) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollLeft += event.deltaX;
    container.scrollTop += event.deltaY;
    event.preventDefault();
  };

  const selectNode = (next: SelectedNode) => {
    setSelectedNode(next);
  };

  const renderInfoItem = (label: string, value: string, hint: string, accent?: string) => (
    <div className="min-w-[180px] max-w-[240px] text-center">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`text-[15px] font-semibold ${accent || 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );

  const footerContent = (() => {
    if (!selectedNode) {
      return (
        <div className="text-sm text-slate-400 text-center">
          Clique em um node para ver detalhes.
        </div>
      );
    }

    if (selectedNode.kind === 'event') {
      return (
        <div className="flex flex-col gap-3 min-w-0 items-center text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            Evento selecionado
          </div>
          <div className="text-[16px] font-semibold text-white truncate">
            {selectedNode.event.label}
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            {renderInfoItem(
              'Tipo',
              selectedNode.event.type === 'income'
                ? 'Entrada'
                : selectedNode.event.type === 'expense'
                  ? 'Saída'
                  : 'Movimento',
              'Indica se entrou ou saiu dinheiro.',
              selectedNode.event.type === 'income'
                ? 'text-emerald-300'
                : selectedNode.event.type === 'expense'
                  ? 'text-rose-300'
                  : 'text-slate-200'
            )}
            {renderInfoItem('Data', selectedNode.event.dateLabel || '—', 'Dia do lançamento.')}
            {renderInfoItem(
              'Valor',
              formatCompactCurrency(Math.abs(selectedNode.event.amount ?? 0)),
              'Valor movimentado.',
              selectedNode.event.type === 'income'
                ? 'text-emerald-300'
                : selectedNode.event.type === 'expense'
                  ? 'text-rose-300'
                  : 'text-slate-200'
            )}
            {renderInfoItem(
              selectedNode.lane.kind === 'account'
                ? 'Conta'
                : selectedNode.lane.kind === 'card'
                  ? 'Cartão'
                  : 'Origem',
              selectedNode.lane.label,
              'Origem da movimentação.',
              'text-slate-200'
            )}
          </div>
        </div>
      );
    }

    if (selectedNode.kind === 'origin') {
      return (
        <div className="flex flex-col gap-3 min-w-0 items-center text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            Origem selecionada
          </div>
          <div className="text-[16px] font-semibold text-white truncate">
            {selectedNode.lane.label}
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            {renderInfoItem(
              'Entradas',
              formatCompactCurrency(selectedNode.stats.totalIncomes),
              'Somatório de entradas.',
              'text-emerald-300'
            )}
            {renderInfoItem(
              'Saídas',
              formatCompactCurrency(selectedNode.stats.totalExpenses),
              'Somatório de saídas.',
              'text-rose-300'
            )}
            {renderInfoItem(
              'Saldo',
              formatCompactCurrency(selectedNode.stats.netTotal),
              'Entradas menos saídas.',
              selectedNode.stats.netTotal >= 0 ? 'text-emerald-300' : 'text-rose-300'
            )}
            {renderInfoItem(
              'Eventos',
              String(selectedNode.stats.eventCount),
              'Quantidade de lançamentos.'
            )}
            {renderInfoItem(
              '% E/S',
              `${selectedNode.stats.incomePercent}%/${selectedNode.stats.expensePercent}%`,
              'Participação de entradas/saídas.',
              'text-slate-200'
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 min-w-0 items-center text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
          Resumo final
        </div>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
          {renderInfoItem(
            'Entradas',
            formatCompactCurrency(selectedNode.stats.totalIncomes),
            'Somatório de entradas.',
            'text-emerald-300'
          )}
          {renderInfoItem(
            'Saídas',
            formatCompactCurrency(selectedNode.stats.totalExpenses),
            'Somatório de saídas.',
            'text-rose-300'
          )}
          {renderInfoItem(
            'Saldo',
            formatCompactCurrency(selectedNode.stats.netTotal),
            'Entradas menos saídas.',
            selectedNode.stats.netTotal >= 0 ? 'text-emerald-300' : 'text-rose-300'
          )}
          {renderInfoItem(
            '% E/S',
            `${selectedNode.stats.incomePercent}%/${selectedNode.stats.expensePercent}%`,
            'Participação de entradas/saídas.',
            'text-slate-200'
          )}
          {renderInfoItem(
            'Maior +',
            formatCompactCurrency(selectedNode.stats.maxIncome),
            'Maior entrada do período.',
            'text-emerald-300'
          )}
          {renderInfoItem(
            'Maior -',
            formatCompactCurrency(selectedNode.stats.maxExpense),
            'Maior saída do período.',
            'text-rose-300'
          )}
          {renderInfoItem(
            'Eventos',
            String(selectedNode.stats.eventCount),
            'Quantidade de lançamentos.'
          )}
          {renderInfoItem(
            'Ticket',
            formatCompactCurrency(selectedNode.stats.averageTicket),
            'Média por evento.'
          )}
          {renderInfoItem(
            'Último',
            selectedNode.stats.lastEvent
              ? `${selectedNode.stats.lastEvent.dateLabel || '—'} • ${formatCompactCurrency(
                  Math.abs(selectedNode.stats.lastEvent.amount ?? 0)
                )}`
              : '—',
            'Última movimentação.',
            'text-slate-200'
          )}
        </div>
      </div>
    );
  })();

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

  const mapFooter = !isMobile && isFullscreen ? (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      <div
        className="relative flex items-center justify-center rounded-t-[26px] border-t border-white/20 bg-white/5 px-10 py-6 shadow-[0_-10px_24px_rgba(0,0,0,0.25)] backdrop-blur-2xl min-h-[150px]"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="mx-auto w-full max-w-[1200px]">{footerContent}</div>
        {footerControls}
      </div>
    </div>
  ) : null;

  return (
      <div className="flex flex-1 min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold text-white`}>Mapa de Eventos</h2>
          <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-slate-400 whitespace-nowrap`}>
            Eventos: <span className="text-white font-semibold">{totalEvents}</span>
          </p>
        </div>

      {lanes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-300">
          Nenhum evento registrado neste período.
        </div>
      ) : (
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
              className={`mm-map-surface relative border border-white/10 overflow-hidden flex-1 select-none ${
                isFullscreen
                  ? 'rounded-none h-full w-full box-border'
                  : 'rounded-3xl w-full flex-1 min-h-[420px]'
              }`}
            >
              {isMobile && !isFullscreen && (
                <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
                  {mapControls}
                </div>
              )}
              {!isMobile && isFullscreen && (
                <div className="pointer-events-none absolute left-5 top-5 z-20 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
                  Movimento horizontal: arraste para esquerda/direita
                </div>
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 10% 20%, rgba(56,189,248,0.12), rgba(15,23,42,0.8) 45%), radial-gradient(circle at 80% 10%, rgba(99,102,241,0.14), rgba(15,23,42,0.7) 60%)'
                }}
              />
              {mapFooter}
              <div
                ref={scrollRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={isFullscreen ? handleWheel : undefined}
                onClick={() => {
                  setSelectedNode(null);
                }}
                className={`relative overflow-auto scrollbar-hide select-none h-full ${
                  isMobile ? '' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
            {(() => {
              const scaledWidth = laneLayout.baseWidth * zoom;
              const scaledHeight = laneLayout.baseHeight * zoom;

              return (
                <div
                  className="relative"
                  style={{
                    width: scaledWidth,
                    height: scaledHeight,
                    minWidth: '100%',
                    minHeight: '100%'
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      width: laneLayout.baseWidth,
                      height: laneLayout.baseHeight,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left'
                    }}
                  >
                    <div className="space-y-6 p-6">
                      {lanes.map(lane => {
                        const cardWidth = laneLayout.cardWidth;
                        const cardHeight = laneLayout.cardHeight;
                        const gap = laneLayout.gap;
                        const laneGap = laneLayout.laneGap;
                        const accountWidth = laneLayout.accountWidth;
                        const laneAccent = lane.color || EVENT_COLORS.start;
                        const laneStats = buildLaneStats(lane.events);
                        const lineStyle = buildNeonGradient(
                          lane.kind === 'account' ? lane.balance : undefined
                        );
                        return (
                          <div key={lane.id} className="flex items-start" style={{ gap: laneGap }}>
                            <div
                              data-map-node="true"
                              className="shrink-0 rounded-2xl border bg-white/5 px-4 py-3 cursor-pointer"
                              style={{
                                width: accountWidth,
                                height: cardHeight,
                                borderColor: withAlpha(laneAccent, 0.6),
                                backgroundColor: withAlpha(laneAccent, 0.08)
                              }}
                              onClick={event => {
                                event.stopPropagation();
                                selectNode({ kind: 'origin', lane, stats: laneStats });
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: laneAccent }}
                                />
                                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                                  {lane.kind === 'card'
                                    ? 'Cartão'
                                    : lane.kind === 'account'
                                      ? 'Conta'
                                      : 'Origem'}
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-white truncate mt-1">
                                {lane.label}
                              </div>
                              {lane.kind === 'account' && typeof lane.balance === 'number' && (
                                <div className="text-[10px] font-semibold text-emerald-200 mt-1">
                                  Saldo atual: {formatCurrency(lane.balance)}
                                </div>
                              )}
                            </div>
                            <div className="relative flex-1">
                              <div className="relative flex items-start" style={{ gap }}>
                                {lane.events.map((event, index) => {
                                  const eventColor = EVENT_COLORS[event.type];
                                  const connectorWidth = index === 0 ? laneGap : gap;
                                  return (
                                    <div
                                      key={event.id}
                                      data-map-node="true"
                                      className="relative shrink-0 cursor-pointer"
                                      style={{ width: cardWidth }}
                                      onClick={mouseEvent => {
                                        mouseEvent.stopPropagation();
                                        selectNode({ kind: 'event', lane, event, stats: laneStats });
                                      }}
                                    >
                                      <div
                                        className="absolute z-10"
                                        style={{
                                          left: -connectorWidth,
                                          top: '50%',
                                          width: connectorWidth,
                                          height: 2,
                                          transform: 'translateY(-50%)',
                                          borderRadius: 999,
                                          ...lineStyle
                                        }}
                                      />
                                      <div
                                        className="rounded-xl border bg-slate-900/70 px-3 py-2 overflow-hidden"
                                        style={{
                                          height: cardHeight,
                                          borderColor: withAlpha(eventColor, 0.6),
                                          boxShadow: `0 0 0 1px ${withAlpha(eventColor, 0.2)} inset`
                                        }}
                                      >
                                        <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                          {event.type === 'income'
                                            ? 'Entrada'
                                            : event.type === 'expense'
                                              ? 'Saída'
                                              : 'Início'}
                                        </div>
                                        <div
                                          className="text-sm font-semibold text-white leading-snug mt-1"
                                          style={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden'
                                          }}
                                        >
                                          {event.label}
                                        </div>
                                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                                          <span>{event.dateLabel || '—'}</span>
                                          {event.amount !== undefined && (
                                            <span
                                              className={
                                                event.type === 'income'
                                                  ? 'text-emerald-300'
                                                  : event.type === 'expense'
                                                    ? 'text-rose-300'
                                                    : 'text-slate-300'
                                              }
                                            >
                                              {formatCompactCurrency(event.amount)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div
                                  className="relative shrink-0"
                                  style={{ width: cardWidth }}
                                  data-map-node="true"
                                >
                                  <div
                                    className="absolute z-10"
                                    style={{
                                      left: -(lane.events.length === 0 ? laneGap : gap),
                                      top: '50%',
                                      width: lane.events.length === 0 ? laneGap : gap,
                                      height: 2,
                                      transform: 'translateY(-50%)',
                                      borderRadius: 999,
                                      ...lineStyle
                                    }}
                                  />
                                  <div
                                    className="rounded-xl border bg-slate-900/75 px-3 py-2 cursor-pointer"
                                    style={{
                                      height: cardHeight,
                                      borderColor: withAlpha(laneAccent, 0.6),
                                      boxShadow: `0 0 0 1px ${withAlpha(laneAccent, 0.2)} inset`,
                                      backgroundColor: withAlpha(laneAccent, 0.1)
                                    }}
                                    onClick={event => {
                                      event.stopPropagation();
                                      selectNode({ kind: 'summary', lane, stats: laneStats });
                                    }}
                                  >
                                    <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">
                                      Resumo
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white">
                                      Total {formatCompactCurrency(laneStats.volumeTotal)}
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-400">
                                      Clique para detalhes
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
              </div>
            </div>
            {!isMobile && !isFullscreen && (
              <div className="flex flex-col items-center gap-2 self-stretch rounded-2xl border border-white/10 bg-slate-950/40 px-2 py-3 min-w-[52px]">
                {mapControls}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventMap;
