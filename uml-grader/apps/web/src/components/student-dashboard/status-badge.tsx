import { cn } from '@/lib/utils';
import {
  formatStatusLabel,
  type StudentAssignmentSummary,
} from '@/lib/student-dashboard';

interface StatusBadgeProps {
  status: StudentAssignmentSummary['submission']['status'];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
        status === 'graded' && 'border-emerald-300 bg-emerald-50 text-emerald-800',
        status === 'submitted' && 'border-sky-300 bg-sky-50 text-sky-800',
        status === 'processing' && 'border-amber-300 bg-amber-50 text-amber-800',
        status === 'failed' && 'border-rose-300 bg-rose-50 text-rose-800',
        status === 'none' && 'border-stone-300 bg-stone-50 text-stone-700',
      )}
    >
      {formatStatusLabel(status)}
    </span>
  );
}
