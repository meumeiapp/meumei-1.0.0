import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Trash2, Pencil } from 'lucide-react';
import type { AgendaItem } from '../types';
import useIsMobile from '../hooks/useIsMobile';
import MobileFullWidthSection from './mobile/MobileFullWidthSection';
import { modalPrimaryButtonClass, modalSecondaryButtonClass } from './ui/PremiumModal';

interface AgendaViewProps {
  items: AgendaItem[];
  onSave: (item: AgendaItem) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onBack: () => void;
  viewDate?: Date;
}

const buildTodayKey = () => new Date().toLocaleDateString('sv-SE');
const DEFAULT_NOTIFY_MINUTES = 10;
const NOTIFY_OPTIONS = [
  { label: 'Sem aviso', value: '' },
  { label: 'Na hora', value: '0' },
  { label: '10 minutos', value: '10' },
  { label: '30 minutos', value: '30' },
  { label: '1 hora', value: '60' },
  { label: '2 horas', value: '120' }
];
const NOTIFY_ALLOWED = [0, 10, 30, 60, 120];

const createId = () =>
  `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const AgendaView: React.FC<AgendaViewProps> = ({ items, onSave, onDelete, onBack, viewDate }) => {
  const isMobile = useIsMobile();
  const [activeSheet, setActiveSheet] = useState<'form' | 'details' | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(buildTodayKey());
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState<number | null>(DEFAULT_NOTIFY_MINUTES);
  const subHeaderRef = useRef<HTMLDivElement | null>(null);
  const firstSectionRef = useRef<HTMLDivElement | null>(null);
  const [subHeaderHeight, setSubHeaderHeight] = useState(0);
  const [headerFill, setHeaderFill] = useState({ top: 0, height: 0 });
  const [topAdjust, setTopAdjust] = useState(0);

  const todayKey = buildTodayKey();
  const baseDate = viewDate ? new Date(viewDate) : new Date();
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  const firstWeekday = monthStart.getDay();
  const startOffset = (firstWeekday + 6) % 7; // semana começa na segunda
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const defaultDateKey = useMemo(() => {
    const today = new Date();
    const isSameMonth =
      today.getFullYear() === baseDate.getFullYear() && today.getMonth() === baseDate.getMonth();
    if (isSameMonth) return todayKey;
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).toLocaleDateString('sv-SE');
  }, [baseDate, todayKey]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.time || '').localeCompare(b.time || '');
    });
  }, [items]);

  const todayCount = useMemo(
    () => sortedItems.filter(item => item.date === todayKey).length,
    [sortedItems, todayKey]
  );

  const weekCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return sortedItems.filter(item => {
      const dt = new Date(item.date + 'T00:00:00');
      return dt >= start && dt < end;
    }).length;
  }, [sortedItems]);

  useLayoutEffect(() => {
    const headerNode = subHeaderRef.current;
    const sectionNode = firstSectionRef.current;
    if (!headerNode || !sectionNode) return;

    const measureGap = () => {
      const headerBottom = headerNode.getBoundingClientRect().bottom;
      const sectionTop = sectionNode.getBoundingClientRect().top;
      const gap = Math.round(sectionTop - headerBottom);
      const desired = 0;
      setTopAdjust((prev) => {
        const nextAdjust = Math.max(0, gap - desired + prev);
        return prev === nextAdjust ? prev : nextAdjust;
      });
    };

    measureGap();
    window.addEventListener('resize', measureGap);
    return () => window.removeEventListener('resize', measureGap);
  }, [subHeaderHeight, topAdjust]);

  useEffect(() => {
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

  const resolveEventMs = (dateValue?: string, timeValue?: string) => {
    if (!dateValue) return undefined;
    const safeTimeRaw = typeof timeValue === 'string' && timeValue.trim()
      ? timeValue.trim()
      : '08:00';
    const [rawHours, rawMinutes] = safeTimeRaw.split(':');
    const hours = String(rawHours || '00').padStart(2, '0');
    const minutes = String(rawMinutes || '00').padStart(2, '0');
    const iso = `${dateValue}T${hours}:${minutes}`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.getTime();
  };

  const resetForm = () => {
    setTitle('');
    setDate(defaultDateKey);
    setTime('');
    setNotes('');
    setNotifyBeforeMinutes(DEFAULT_NOTIFY_MINUTES);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !date) return;
    const id = editingId || createId();
    await onSave({
      id,
      title: title.trim(),
      date,
      time: time || undefined,
      notes: notes.trim() || undefined,
      notifyBeforeMinutes
    });
    resetForm();
    setActiveSheet(null);
  };

  const handleEdit = (item: AgendaItem) => {
    setEditingId(item.id);
    setTitle(item.title || '');
    setDate(item.date || buildTodayKey());
    setTime(item.time || '');
    setNotes(item.notes || '');
    const fallbackMs = resolveEventMs(item.date, item.time);
    const diffMinutes =
      typeof item.notifyAtMs === 'number' && typeof fallbackMs === 'number'
        ? Math.round((fallbackMs - item.notifyAtMs) / 60000)
        : null;
    if (typeof item.notifyBeforeMinutes === 'number') {
      setNotifyBeforeMinutes(item.notifyBeforeMinutes);
    } else if (diffMinutes !== null && NOTIFY_ALLOWED.includes(diffMinutes)) {
      setNotifyBeforeMinutes(diffMinutes);
    } else {
      setNotifyBeforeMinutes(DEFAULT_NOTIFY_MINUTES);
    }
    setActiveSheet('form');
  };

  const itemsByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    items.forEach(item => {
      if (!item.date) return;
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    });
    return map;
  }, [items]);

  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
  const calendarDays = Array.from({ length: totalCells }, (_, idx) => {
    const dayNumber = idx - startOffset + 1;
    const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    const dateKey = inMonth
      ? new Date(baseDate.getFullYear(), baseDate.getMonth(), dayNumber).toLocaleDateString('sv-SE')
      : null;
    return { dayNumber, inMonth, dateKey };
  });

  const openFormForDate = (targetDate: string) => {
    resetForm();
    setDate(targetDate);
    setSelectedDayKey(targetDate);
    setActiveSheet('form');
  };

  const openDetailsForDate = (targetDate: string) => {
    setSelectedDayKey(targetDate);
    setActiveSheet('details');
  };
  const closeActiveSheet = () => {
    setActiveSheet(null);
    resetForm();
  };

  useEffect(() => {
    if (!activeSheet) return;

    const handleDockClick = () => {
      closeActiveSheet();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeActiveSheet();
    };

    window.addEventListener('mm:dock-click', handleDockClick as EventListener);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('mm:dock-click', handleDockClick as EventListener);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [activeSheet]);

  const selectedItems = selectedDayKey ? itemsByDate.get(selectedDayKey) || [] : [];
  const headerCardRadius = isMobile ? 'rounded-xl' : 'rounded-xl';
  const headerActionRadius = 'rounded-xl';
  const dayCellRadius = isMobile ? 'rounded-xl' : 'rounded-xl';
  const dockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const dockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const dockMaxHeight =
    'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';

  const headerContent = (
      <div className="space-y-2 mm-mobile-header-stack mm-mobile-header-stable mm-mobile-header-stable-tight">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2">
        <div className="h-8 w-8" aria-hidden="true" />
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Agenda</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
            {items.length} agendamentos
          </p>
        </div>
        <div className="min-w-[32px]" />
      </div>

      <div className="grid grid-cols-3 gap-[5px]">
        <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card`}>
          <p className="mm-subheader-metric-label">Hoje</p>
          <p className="mm-subheader-metric-value text-emerald-600 dark:text-emerald-400">{todayCount}</p>
        </div>
        <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card`}>
          <p className="mm-subheader-metric-label">Próximos 7 dias</p>
          <p className="mm-subheader-metric-value text-indigo-600 dark:text-indigo-400">{weekCount}</p>
        </div>
        <div className={`${headerCardRadius} mm-subheader-metric-card mm-mobile-header-card`}>
          <p className="mm-subheader-metric-label">Total</p>
          <p className="mm-subheader-metric-value">{items.length}</p>
        </div>
      </div>

      <div className={isMobile ? 'grid grid-cols-1 gap-[5px]' : 'mm-header-actions'}>
        <button
          type="button"
          onClick={() => {
            openFormForDate(defaultDateKey);
          }}
          data-tour-anchor="agenda-new"
          className={`w-full mm-mobile-primary-cta mm-btn-base mm-btn-primary mm-btn-primary-emerald ${headerActionRadius}`}
        >
          Novo agendamento
        </button>
      </div>
    </div>
  );

  const calendarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-white">Calendário • {monthLabel}</div>
        <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Todos os dias</div>
      </div>
      <div className="grid grid-cols-7 gap-[5px] text-[10px] text-zinc-500 dark:text-zinc-400 mb-[5px]">
        {weekDays.map(day => (
          <div key={day} className="text-center font-semibold">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[5px] auto-rows-[minmax(var(--mm-agenda-day-cell-min-height,52px),1fr)] flex-1 min-h-0">
        {calendarDays.map((day, index) => {
          if (!day.inMonth || !day.dateKey) {
            return <div key={`empty-${index}`} className={`min-h-[var(--mm-agenda-day-cell-min-height,52px)] h-full ${dayCellRadius} bg-transparent`} />;
          }
          const dayItems = itemsByDate.get(day.dateKey) || [];
          const hasEvents = dayItems.length > 0;
          const showOverflowHint = dayItems.length > 2;
          const visibleItems = dayItems.slice(0, showOverflowHint ? 2 : 3);
          const isToday = day.dateKey === todayKey;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => openDetailsForDate(day.dateKey!)}
              className={`min-h-[var(--mm-agenda-day-cell-min-height,52px)] h-full ${dayCellRadius} px-2 py-1.5 flex flex-col items-start text-left gap-1 transition ${
                hasEvents
                  ? 'bg-rose-200/70 dark:bg-rose-500/20 border border-rose-400/40 text-rose-900 dark:text-rose-200'
                  : 'bg-emerald-100/80 dark:bg-emerald-500/10 border border-emerald-300/40 text-emerald-900 dark:text-emerald-200'
              } ${isToday ? 'ring-2 ring-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.35)]' : ''}`}
              aria-label={`Dia ${day.dayNumber}`}
            >
              <div className="w-full flex items-center justify-between gap-2">
                <span
                  className={`text-xs font-bold ${
                    isToday
                      ? 'rounded-full bg-emerald-500 px-2 py-0.5 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.5)]'
                      : ''
                  }`}
                >
                  {day.dayNumber}
                </span>
                {hasEvents && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-rose-700/80 dark:text-rose-200/80">
                    {dayItems.length} ag.
                  </span>
                )}
              </div>
              {hasEvents ? (
                <div className="w-full flex-1 space-y-1 overflow-hidden">
                  {visibleItems.map((item) => (
                    <div
                      key={item.id}
                      className="text-[10px] font-semibold leading-tight text-rose-900/90 dark:text-rose-100 truncate"
                    >
                      {item.time ? `${item.time} · ` : ''}
                      {item.title}
                    </div>
                  ))}
                  {showOverflowHint && (
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-rose-700/80 dark:text-rose-200/70">
                      Toque para saber mais
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-[10px] font-semibold text-emerald-900/80 dark:text-emerald-200/80">
                  Livre
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <div className="fixed inset-0 mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter overflow-hidden">
          <div className="relative h-[calc(var(--app-height,100vh)-var(--mm-mobile-top,0px))]">
            {headerFill.height > 0 && (
              <div
                className="fixed left-0 right-0 z-20 bg-white dark:bg-[#151517] backdrop-blur-xl"
                style={{ top: headerFill.top, height: headerFill.height }}
              />
            )}
            <div
              className="fixed left-0 right-0 z-30"
              style={{ top: 'var(--mm-mobile-top, 0px)' }}
            >
              <div
                ref={subHeaderRef}
                className="w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#151517] backdrop-blur-xl shadow-sm"
              >
                <div className="mm-mobile-subheader-pad mm-mobile-subheader-pad-tight">
                  {headerContent}
                </div>
              </div>
            </div>
            <div
              className="h-full overflow-y-auto px-0 pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px))]"
              style={{
                paddingTop: subHeaderHeight
                  ? `calc(var(--mm-mobile-top, 0px) + ${subHeaderHeight}px - ${topAdjust}px)`
                  : 'calc(var(--mm-mobile-top, 0px))'
              }}
            >
              <div className="space-y-0">
                <div ref={firstSectionRef}>
                  <MobileFullWidthSection
                    contentClassName="mm-mobile-section-pad mm-mobile-section-pad-tight-top pb-3"
                    withDivider={false}
                    backgroundClassName="bg-emerald-50/60 dark:bg-emerald-500/10"
                  >
                    <div className="flex flex-col" data-mm-measure-target="agenda-calendario">
                      {calendarContent}
                    </div>
                  </MobileFullWidthSection>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mm-mobile-shell bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300 h-full min-h-0 flex flex-col">
          <div className="w-full px-4 sm:px-6 pt-6 relative z-10">
            <div className="mm-subheader mm-subheader-panel w-full">
              {headerContent}
            </div>
          </div>
          <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 mt-[var(--mm-content-gap)] flex-1 min-h-0">
            <div className="h-full min-h-0">
              <div
                className="w-full h-full min-h-0 rounded-3xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 flex flex-col"
                data-mm-measure-target="agenda-calendario"
              >
                {calendarContent}
              </div>
            </div>
          </main>
        </div>
      )}

      {activeSheet && (
        <div className="fixed inset-0 z-[1300] pointer-events-none" data-modal-root="true">
          <button
            type="button"
            onClick={closeActiveSheet}
            className={isMobile ? 'absolute inset-0 bg-black/40 pointer-events-auto' : 'absolute left-0 right-0 bg-black/70 backdrop-blur-sm pointer-events-auto'}
            style={isMobile ? undefined : { top: dockTopOffset, bottom: dockBottomOffset }}
            aria-label="Fechar agenda"
          />
          <div
            className={
              isMobile
                ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-none border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] overflow-y-auto pointer-events-auto'
                : 'absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 shadow-2xl overflow-y-auto pointer-events-auto'
            }
            style={
              isMobile
                ? undefined
                : {
                    bottom: dockBottomOffset,
                    maxHeight: `max(320px, ${dockMaxHeight})`
                  }
            }
          >
            {activeSheet === 'details' && (
              <div className={isMobile ? 'space-y-4 pb-[calc(env(safe-area-inset-bottom)+88px)]' : 'space-y-4 pb-2'}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <CalendarDays size={16} />
                    {selectedDayKey || ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedDayKey && openFormForDate(selectedDayKey)}
                    className="mm-btn-chip mm-btn-chip-success"
                  >
                    Novo agendamento
                  </button>
                </div>
                {selectedItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                    Nenhum agendamento neste dia.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedItems.map(item => (
                      <div key={item.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#151517] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.title}</p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {item.time ? `• ${item.time}` : 'Horário livre'}
                            </p>
                            {item.notes && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{item.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center"
                              aria-label="Editar agenda"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item.id)}
                              className="h-8 w-8 rounded-full border border-rose-200 dark:border-rose-900/40 text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200 flex items-center justify-center"
                              aria-label="Excluir agenda"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSheet === 'form' && (
              <div className={isMobile ? 'space-y-2 pb-[calc(env(safe-area-inset-bottom)+var(--mm-mobile-dock-height,68px)+72px)]' : 'space-y-2 pb-2'}>
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <CalendarDays size={16} />
                    {editingId ? 'Editar agendamento' : 'Novo agendamento'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1.2fr,0.6fr,0.5fr] gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">Serviço / atividade</label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Captação de conteúdo"
                      className="w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">Data</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">Horário</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                      className="w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">Me avise</label>
                  <select
                    value={notifyBeforeMinutes === null ? '' : String(notifyBeforeMinutes)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setNotifyBeforeMinutes(raw === '' ? null : Number(raw));
                    }}
                    className="w-full min-h-[38px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30"
                  >
                    {NOTIFY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-[0.12em] font-semibold text-zinc-500 dark:text-zinc-400">Observações</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Detalhes do serviço, cliente, local..."
                    rows={2}
                    className="w-full min-h-[84px] rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/60 px-3 py-2 text-[13px] font-medium leading-5 text-zinc-900 dark:text-zinc-100 outline-none transition-all focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30 placeholder:text-[11px] placeholder:font-normal placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-none"
                  />
                </div>
                {!isMobile && (
                  <div className="pt-3">
                    <div className="grid grid-cols-2 gap-3 w-full">
                      <button
                        type="button"
                        onClick={closeActiveSheet}
                        className={modalSecondaryButtonClass}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        className="h-9 sm:h-11 px-4 sm:px-6 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm sm:text-base text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {activeSheet === 'form' && isMobile && (
        <div
          className="fixed left-0 right-0 z-[1350]"
          style={{ bottom: 'var(--mm-mobile-dock-height, 68px)' }}
        >
          <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-[#111114]/95 backdrop-blur px-3 pt-1.5 pb-0">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeActiveSheet}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-xl border border-emerald-500/40 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AgendaView;
