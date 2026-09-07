'use client';

import { Clock3 } from 'lucide-react';

interface TeacherTimeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? '00' : '30';
  const value = `${`${hours}`.padStart(2, '0')}:${minutes}`;

  return {
    value,
    label: formatTimeLabel(value),
  };
});

export function TeacherTimeSelect({
  value,
  onChange,
}: TeacherTimeSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-11 text-white outline-none transition focus:border-blue-400"
      >
        <option value="">Select due time</option>
        {TIME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Clock3 className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200" />
    </div>
  );
}

function formatTimeLabel(value: string) {
  const [rawHours, rawMinutes] = value.split(':').map(Number);
  const suffix = rawHours >= 12 ? 'PM' : 'AM';
  const normalizedHours = rawHours % 12 || 12;
  return `${normalizedHours}:${`${rawMinutes}`.padStart(2, '0')} ${suffix}`;
}
