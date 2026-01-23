import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
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

interface EventMapProps {
  periodLabel: string;
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

const EventMap: React.FC<EventMapProps> = ({
  periodLabel,
  transactions,
  accounts,
  creditCards,
  isMobile
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

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

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;
    const element = containerRef.current;
    if (!element) return;
    if (!document.fullscreenEnabled || !element.requestFullscreen) {
      setIsFullscreen(prev => !prev);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await element.requestFullscreen();
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const step = direction === 'in' ? 0.12 : -0.12;
    setZoom(prev => clamp(prev + step, MIN_ZOOM, MAX_ZOOM));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
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

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Activity size={18} className="text-cyan-300" />
              Mapa de Eventos
            </h2>
            <p className="text-sm text-slate-300">{periodLabel}</p>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>Eventos mapeados</div>
            <div className="text-white text-lg font-semibold">{totalEvents}</div>
          </div>
        </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        Veja como entradas e gastos se conectam nas contas e cartões dentro do período selecionado.
      </div>

      {lanes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-300">
          Nenhum evento registrado neste período.
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`relative border border-white/10 overflow-hidden ${
            isFullscreen
              ? 'rounded-none h-full w-full box-border'
              : 'rounded-3xl'
          }`}
        >
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/20 transition"
              aria-label={isFullscreen ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
            >
              {isFullscreen ? (
                <Minimize2 size={16} className="mx-auto" />
              ) : (
                <Maximize2 size={16} className="mx-auto" />
              )}
            </button>
            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={() => handleZoom('in')}
                  className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/20 transition"
                  aria-label="Aumentar zoom"
                >
                  <Plus size={16} className="mx-auto" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom('out')}
                  className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/20 transition"
                  aria-label="Diminuir zoom"
                >
                  <Minus size={16} className="mx-auto" />
                </button>
              </>
            )}
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 10% 20%, rgba(56,189,248,0.12), rgba(15,23,42,0.8) 45%), radial-gradient(circle at 80% 10%, rgba(99,102,241,0.14), rgba(15,23,42,0.7) 60%)'
            }}
          />
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`relative overflow-auto scrollbar-hide select-none ${
              isFullscreen ? 'h-full' : 'max-h-[70vh]'
            } ${isMobile ? '' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            {(() => {
              const baseCardWidth = isMobile ? 180 : 210;
              const accountWidth = baseCardWidth;
              const baseCardHeight = 72;
              const baseGap = 14;
              const baseLaneGap = 20;
              const laneSpacing = 24;
              const padding = 24;
              const laneWidths = lanes.map(lane => {
                const eventCount = lane.events.length;
                return (
                  accountWidth +
                  baseLaneGap +
                  eventCount * baseCardWidth +
                  Math.max(eventCount - 1, 0) * baseGap
                );
              });
              const contentWidth = laneWidths.length ? Math.max(...laneWidths) : accountWidth;
              const contentHeight =
                lanes.length * baseCardHeight + Math.max(lanes.length - 1, 0) * laneSpacing;
              const baseWidth = contentWidth + padding * 2;
              const baseHeight = contentHeight + padding * 2;
              const scaledWidth = baseWidth * zoom;
              const scaledHeight = baseHeight * zoom;

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
                      width: baseWidth,
                      height: baseHeight,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left'
                    }}
                  >
                    <div className="space-y-6 p-6">
                      {lanes.map(lane => {
                        const cardWidth = baseCardWidth;
                        const cardHeight = baseCardHeight;
                        const gap = baseGap;
                        const laneGap = baseLaneGap;
                        const laneAccent = lane.color || EVENT_COLORS.start;
                        const lineStyle = buildNeonGradient(
                          lane.kind === 'account' ? lane.balance : undefined
                        );
                        return (
                          <div key={lane.id} className="flex items-start" style={{ gap: laneGap }}>
                            <div
                              className="shrink-0 rounded-2xl border bg-white/5 px-4 py-3"
                              style={{
                                width: accountWidth,
                                height: cardHeight,
                                borderColor: withAlpha(laneAccent, 0.6),
                                backgroundColor: withAlpha(laneAccent, 0.08)
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
                              <div
                                className="absolute h-[2px]"
                                style={{
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  left: -laneGap,
                                  right: 0,
                                  ...lineStyle
                                }}
                              />
                              <div className="relative flex items-start" style={{ gap }}>
                                {lane.events.map(event => {
                                  const eventColor = EVENT_COLORS[event.type];
                                  return (
                                    <div
                                      key={event.id}
                                      className="relative shrink-0"
                                      style={{ width: cardWidth }}
                                    >
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
      )}
    </div>
  );
};

export default EventMap;
