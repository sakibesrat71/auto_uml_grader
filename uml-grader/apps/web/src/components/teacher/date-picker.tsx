'use client';

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TeacherDatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TeacherDatePicker({
  value,
  onChange,
}: TeacherDatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parsedValue = value ? parseDateOnly(value) : null;
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(
    parsedValue ?? startOfMonth(new Date()),
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handlePointerDown);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [visibleMonth],
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth, parsedValue),
    [visibleMonth, parsedValue],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setVisibleMonth(startOfMonth(parsedValue ?? new Date()));
          setIsOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-left text-white outline-none transition hover:border-blue-500 focus:border-blue-400"
      >
        <span className={cn(!value && 'text-slate-400')}>
          {value
            ? formatDateLabel(value)
            : 'Select due date'}
        </span>
        <CalendarDays className="h-4 w-4 text-blue-200" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 w-[21rem] rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="rounded-full border border-slate-700 p-2 text-slate-200 transition hover:bg-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-blue-100">{monthLabel}</p>
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="rounded-full border border-slate-700 p-2 text-slate-200 transition hover:bg-slate-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-2">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => (
              <button
                key={day.key}
                type="button"
                disabled={!day.inCurrentMonth}
                onClick={() => {
                  onChange(day.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex h-10 items-center justify-center rounded-xl text-sm transition',
                  day.inCurrentMonth
                    ? 'text-slate-100 hover:bg-slate-800'
                    : 'cursor-default text-slate-700',
                  day.isSelected &&
                    'bg-blue-600 font-semibold text-white hover:bg-blue-600',
                  day.isToday &&
                    !day.isSelected &&
                    'border border-blue-500/40 bg-blue-500/10 text-blue-100',
                )}
              >
                {day.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-xs font-semibold text-slate-400 transition hover:text-slate-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = toDateInputValue(new Date());
                onChange(today);
                setVisibleMonth(startOfMonth(new Date()));
                setIsOpen(false);
              }}
              className="text-xs font-semibold text-blue-200 transition hover:text-blue-100"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildCalendarDays(visibleMonth: Date, selectedDate: Date | null) {
  const monthStart = startOfMonth(visibleMonth);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);

    return {
      key: day.toISOString(),
      label: day.getDate(),
      value: toDateInputValue(day),
      inCurrentMonth: day.getMonth() === visibleMonth.getMonth(),
      isSelected: Boolean(
        selectedDate &&
          day.getFullYear() === selectedDate.getFullYear() &&
          day.getMonth() === selectedDate.getMonth() &&
          day.getDate() === selectedDate.getDate(),
      ),
      isToday: isSameDay(day, new Date()),
    };
  });
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatDateLabel(value: string) {
  return parseDateOnly(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
