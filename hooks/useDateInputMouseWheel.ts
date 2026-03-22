import { useEffect } from 'react';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseIsoDate = (value: string): Date | null => {
  if (!ISO_DATE_PATTERN.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const clampDate = (value: Date, minDate?: Date | null, maxDate?: Date | null) => {
  if (minDate && value.getTime() < minDate.getTime()) return new Date(minDate);
  if (maxDate && value.getTime() > maxDate.getTime()) return new Date(maxDate);
  return value;
};

const resolveStepDays = (input: HTMLInputElement) => {
  const rawStep = Number(input.step);
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  return Math.max(1, Math.round(rawStep));
};

const updateDateInputByWheel = (input: HTMLInputElement, direction: -1 | 1) => {
  const currentDate =
    parseIsoDate(input.value) ||
    parseIsoDate(input.min) ||
    parseIsoDate(input.max) ||
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12, 0, 0, 0);
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + direction * resolveStepDays(input));
  const clampedDate = clampDate(nextDate, parseIsoDate(input.min), parseIsoDate(input.max));
  const nextValue = formatIsoDate(clampedDate);
  if (nextValue === input.value) return;

  input.value = nextValue;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const useDateInputMouseWheel = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return;
      if (!Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 1) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const input = target.closest('input[type="date"]');
      if (!(input instanceof HTMLInputElement)) return;
      if (input.disabled || input.readOnly) return;

      event.preventDefault();
      const direction: -1 | 1 = event.deltaY > 0 ? 1 : -1;
      updateDateInputByWheel(input, direction);
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, []);
};

export default useDateInputMouseWheel;
