import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DashboardAlert } from '@/lib/student-dashboard';

interface AlertBannerProps {
  alert: DashboardAlert;
  onDismiss: (alertId: string) => void;
}

export function AlertBanner({ alert, onDismiss }: AlertBannerProps) {
  const href = alert.submissionId
    ? `/student/submissions/${alert.submissionId}`
    : `/student/assignments/${alert.assignmentId}`;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between',
        alert.type === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
        alert.type === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
        alert.type === 'info' && 'border-sky-200 bg-sky-50 text-sky-900',
      )}
    >
      <p>{alert.message}</p>
      <div className="flex items-center gap-3">
        <Link
          href={href}
          className="text-sm font-semibold underline underline-offset-4"
        >
          View
        </Link>
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          aria-label="Dismiss notification"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/25 text-sm font-semibold transition hover:bg-white/60"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
