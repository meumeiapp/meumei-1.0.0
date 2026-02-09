import React, { useMemo, useState } from 'react';
import { CalendarDays, Home, Trash2, Pencil } from 'lucide-react';
import type { AgendaItem } from '../types';

interface AgendaViewProps {
  items: AgendaItem[];
  onSave: (item: AgendaItem) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onBack: () => void;
  viewDate?: Date;
}

const buildTodayKey = () => new Date().toLocaleDateString('sv-SE');

const createId = () =>
  `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const AgendaView: React.FC<AgendaViewProps> = ({ items, onSave, onDelete, onBack, viewDate }) => {
  const [activeSheet, setActiveSheet] = useState<'form' | 'details' | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(buildTodayKey());
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

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

  const resetForm = () => {
    setTitle('');
    setDate(defaultDateKey);
    setTime('');
    setNotes('');
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
      notes: notes.trim() || undefined
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

  const selectedItems = selectedDayKey ? itemsByDate.get(selectedDayKey) || [] : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090b] text-zinc-900 dark:text-white font-inter transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 relative z-10">
        <div className="mm-subheader rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/85 dark:bg-[#151517]/85 backdrop-blur-xl shadow-sm px-4 py-4">
          <div className="space-y-2">
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
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Agenda</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                  {items.length} agendamentos
                </p>
              </div>
              <div className="min-w-[32px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Hoje</p>
                <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{todayCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Próximos 7 dias</p>
                <p className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">{weekCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#101014] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</p>
                <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{items.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  openFormForDate(defaultDateKey);
                }}
                className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm shadow-lg shadow-emerald-900/20 transition active:scale-[0.98]"
              >
                Novo agendamento
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="w-full mt-[var(--mm-content-gap)] pb-12 space-y-4">
        <div className="px-4 sm:px-6">
          <div className="mx-auto w-full md:w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] md:max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] rounded-3xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 flex flex-col md:min-h-[calc(100vh-var(--mm-header-height,120px)-var(--mm-desktop-dock-height,84px)-var(--mm-subheader-height,176px)-96px)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">Calendário • {monthLabel}</div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Todos os dias</div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center font-semibold">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 auto-rows-[minmax(0,1fr)] flex-1">
            {calendarDays.map((day, index) => {
              if (!day.inMonth || !day.dateKey) {
                return <div key={`empty-${index}`} className="min-h-[52px] h-full rounded-xl bg-transparent" />;
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
                  className={`min-h-[52px] h-full rounded-xl px-2 py-1.5 flex flex-col items-start text-left gap-1 transition ${
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
        </div>
      </main>

      {activeSheet && (
        <div className="fixed inset-0 z-[1300]">
          <button
            type="button"
            onClick={() => {
              setActiveSheet(null);
              resetForm();
            }}
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar agenda"
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4 max-h-[calc(100dvh-24px)] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+88px)] md:left-1/2 md:right-auto md:bottom-[var(--mm-desktop-dock-bar-offset,var(--mm-desktop-dock-height,84px))] md:w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] md:max-w-[var(--mm-desktop-dock-width,calc(100%_-_48px))] md:-translate-x-1/2 md:rounded-[26px] md:border md:border-black/10 md:dark:border-white/20 md:bg-white/80 md:dark:bg-white/5 md:backdrop-blur-2xl md:shadow-[0_10px_24px_rgba(0,0,0,0.35)] md:p-5 md:max-h-[80vh] md:pb-6">
            {activeSheet === 'details' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <CalendarDays size={16} />
                    {selectedDayKey || ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedDayKey && openFormForDate(selectedDayKey)}
                    className="rounded-full border border-emerald-300 dark:border-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300"
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <CalendarDays size={16} />
                    {editingId ? 'Editar agendamento' : 'Novo agendamento'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1.2fr,0.6fr,0.5fr] gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500 dark:text-zinc-400">Serviço / atividade</label>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Captação de conteúdo"
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500 dark:text-zinc-400">Data</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500 dark:text-zinc-400">Horário</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wide font-bold text-zinc-500 dark:text-zinc-400">Observações</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Detalhes do serviço, cliente, local..."
                    rows={2}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#151517] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSheet(null);
                      resetForm();
                    }}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="rounded-xl bg-emerald-600 text-white py-2 text-xs font-semibold hover:bg-emerald-500 transition"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendaView;
