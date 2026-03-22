import React, { useEffect, useMemo, useState } from 'react';
import Picker from 'react-mobile-picker';
import { X } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';

type DateFieldValue = { day: string; month: string; year: string };

interface WheelDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  defaultDate?: Date;
  disabled?: boolean;
  buttonClassName?: string;
  emptyText?: string;
  ariaLabel?: string;
  sheetTitle?: string;
  sheetSubtitle?: string;
  desktopMode?: 'native' | 'modal';
}

const pad2 = (value: number | string) => String(value).padStart(2, '0');

const parseDateParts = (value: string) => {
  const [year, month, day] = value?.split('-') || [];
  if (!year || !month || !day) return null;
  return { year, month: pad2(month), day: pad2(day) };
};

const formatDateDisplay = (value: string) => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return `${parts.day}/${parts.month}/${parts.year}`;
};

const buildDateString = (parts: DateFieldValue) =>
  `${parts.year}-${parts.month}-${parts.day}`;

const clampToMinDate = (value: string, minDate?: string) => {
  if (!minDate) return value;
  const dateValue = new Date(`${value}T12:00:00`);
  const minValue = new Date(`${minDate}T12:00:00`);
  return dateValue < minValue ? minDate : value;
};

const WheelDatePicker: React.FC<WheelDatePickerProps> = ({
  value,
  onChange,
  minDate,
  defaultDate,
  buttonClassName = '',
  disabled = false,
  emptyText = 'SELECIONE',
  ariaLabel = 'Selecionar data',
  sheetTitle = 'Selecionar Data',
  sheetSubtitle = 'Role para ajustar.',
  desktopMode = 'native'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<DateFieldValue>({
    day: '01',
    month: '01',
    year: String(new Date().getFullYear())
  });
  const isMobile = useIsMobile();

  const displayValue = formatDateDisplay(value);
  const minYear = useMemo(() => {
    const minParts = minDate ? parseDateParts(minDate) : null;
    if (minParts?.year) return Number(minParts.year);
    return new Date().getFullYear() - 1;
  }, [minDate]);
  const maxYear = new Date().getFullYear() + 2;

  const yearOptions = useMemo(
    () => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(minYear + i)),
    [minYear, maxYear]
  );
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => pad2(i + 1)), []);
  const daysInMonth = useMemo(() => {
    const year = Number(pickerValue.year);
    const month = Number(pickerValue.month);
    return new Date(year, month, 0).getDate();
  }, [pickerValue.month, pickerValue.year]);
  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => pad2(i + 1)),
    [daysInMonth]
  );

  useEffect(() => {
    const maxDay = new Date(Number(pickerValue.year), Number(pickerValue.month), 0).getDate();
    if (Number(pickerValue.day) > maxDay) {
      setPickerValue((prev) => ({ ...prev, day: pad2(maxDay) }));
    }
  }, [pickerValue.month, pickerValue.year]);

  const openPicker = () => {
    const fallback = defaultDate ? defaultDate.toISOString().slice(0, 10) : minDate || '';
    const parts =
      parseDateParts(value) ||
      parseDateParts(fallback) || {
        year: String(new Date().getFullYear()),
        month: pad2(new Date().getMonth() + 1),
        day: pad2(new Date().getDate())
      };
    setPickerValue(parts);
    setIsOpen(true);
  };

  const handleConfirm = () => {
    const nextValue = clampToMinDate(buildDateString(pickerValue), minDate);
    onChange(nextValue);
    setIsOpen(false);
  };

  if (!isMobile && desktopMode === 'native') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(event) => {
          const nextValue = clampToMinDate(event.target.value, minDate);
          onChange(nextValue);
        }}
        min={minDate}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`${buttonClassName} text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
    );
  }

  const dockBottomOffset = 'calc(var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) + 12px)';
  const dockTopOffset = 'calc(var(--mm-header-height, 120px) + var(--mm-content-gap, 16px))';
  const dockMaxHeight =
    'calc(100dvh - var(--mm-header-height, 120px) - var(--mm-content-gap, 16px) - var(--mm-dock-height, var(--mm-desktop-dock-height, 84px)) - 24px)';

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={`${buttonClassName} text-left ${displayValue ? '' : 'text-zinc-500 text-[10px] font-light uppercase'} disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label={ariaLabel}
      >
        {displayValue || emptyText}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[1300]">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className={isMobile ? 'absolute inset-0 bg-black/40' : 'absolute left-0 right-0 bg-black/70 backdrop-blur-sm'}
            style={isMobile ? undefined : { top: dockTopOffset, bottom: dockBottomOffset }}
            aria-label="Fechar seletor de data"
          />
          <div
            className={
              isMobile
                ? 'absolute left-0 right-0 bottom-0 bg-white dark:bg-[#111114] text-zinc-900 dark:text-white rounded-t-3xl border-t border-zinc-200 dark:border-zinc-800 shadow-2xl p-4'
                : 'absolute left-0 right-0 bg-white dark:bg-[#0d0d10] text-zinc-900 dark:text-white px-5 py-5 flex flex-col overflow-hidden shadow-2xl'
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
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{sheetTitle}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{sheetSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 flex items-center justify-center"
                aria-label="Fechar seletor de data"
              >
                <X size={16} />
              </button>
            </div>
            <div className={`py-4 ${isMobile ? '' : 'flex-1 overflow-y-auto overscroll-contain'}`}>
              <Picker
                value={pickerValue}
                onChange={setPickerValue}
                className="flex justify-center gap-6"
                wheelMode="natural"
              >
                <Picker.Column name="day">
                  {dayOptions.map((day) => (
                    <Picker.Item key={day} value={day}>
                      <div className="text-sm font-semibold px-2 py-1">{day}</div>
                    </Picker.Item>
                  ))}
                </Picker.Column>
                <Picker.Column name="month">
                  {monthOptions.map((month) => (
                    <Picker.Item key={month} value={month}>
                      <div className="text-sm font-semibold px-2 py-1">{month}</div>
                    </Picker.Item>
                  ))}
                </Picker.Column>
                <Picker.Column name="year">
                  {yearOptions.map((year) => (
                    <Picker.Item key={year} value={year}>
                      <div className="text-sm font-semibold px-2 py-1">{year}</div>
                    </Picker.Item>
                  ))}
                </Picker.Column>
              </Picker>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl border border-emerald-500/40 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WheelDatePicker;
