interface MiniStatCardProps {
  label: string;
  value: number;
  tone?: 'default' | 'accent' | 'warning';
}

export function MiniStatCard({
  label,
  value,
  tone = 'default',
}: MiniStatCardProps) {
  const toneClasses =
    tone === 'accent'
      ? 'border-teal-200 bg-teal-50 text-teal-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-stone-200 bg-white text-stone-900';

  return (
    <article className={`rounded-3xl border p-4 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </article>
  );
}
