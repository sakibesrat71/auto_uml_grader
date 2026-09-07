import Link from 'next/link';
import type { StudentSummary } from '@/lib/student-dashboard';
import { formatStatusLabel } from '@/lib/student-dashboard';
import { StatusBadge } from './status-badge';

interface NextDueCardProps {
  assignment: StudentSummary['nextDueAssignment'];
}

export function NextDueCard({ assignment }: NextDueCardProps) {
  const actionHref = assignment?.submissionId
    ? `/student/submissions/${assignment.submissionId}`
    : assignment
      ? `/student/assignments/${assignment.assignmentId}`
      : '/student/dashboard';

  const actionLabel = !assignment
    ? 'Browse assignments'
    : assignment.status === 'graded'
      ? 'View grade'
      : assignment.status === 'none'
        ? 'Submit UML'
        : assignment.status === 'failed'
          ? 'Resubmit UML'
          : 'View submission';

  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            Next Due
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-950">
            {assignment?.title ?? 'No upcoming assignments'}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {assignment
              ? `${assignment.dueRelativeLabel} · ${assignment.dueLabel}`
              : 'Nothing is currently scheduled.'}
          </p>
        </div>
        {assignment ? <StatusBadge status={assignment.status} /> : null}
      </div>

      {assignment ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
            {formatStatusLabel(assignment.status)}
          </span>
          {assignment.grade &&
          assignment.grade.score !== null &&
          assignment.grade.maxScore !== null ? (
            <span className="rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-800">
              {assignment.grade.score}/{assignment.grade.maxScore}
            </span>
          ) : null}
        </div>
      ) : null}

      <Link
        href={actionHref}
        className="mt-6 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
      >
        {actionLabel}
      </Link>
    </section>
  );
}
