import Link from 'next/link';
import {
  formatCompactDate,
  formatDateTime,
  formatStatusLabel,
  type StudentAssignmentSummary,
} from '@/lib/student-dashboard';
import { StatusBadge } from './status-badge';

interface AssignmentRowProps {
  assignment: StudentAssignmentSummary;
}

export function AssignmentRow({ assignment }: AssignmentRowProps) {
  const actionHref = `/student/assignments/${assignment.assignmentId}`;
  const actionLabel = assignment.canResubmit ? 'Resubmit' : 'Submit';
  const closedLabel = assignment.isClosed ? 'Closed' : 'Deadline passed';

  return (
    <tr className="border-t border-stone-200 align-top">
      <td className="px-4 py-4">
        <div>
          <p className="font-medium text-stone-950">{assignment.title}</p>
          <p className="mt-1 text-xs text-stone-500">{assignment.totalMarks} marks</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="font-medium text-stone-800">{formatCompactDate(assignment.dueAt)}</p>
        <p className="mt-1 text-xs text-stone-500" title={formatDateTime(assignment.dueAt)}>
          {assignment.dueRelativeLabel}
        </p>
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={assignment.submission.status} />
        {assignment.submission.submittedAt ? (
          <p className="mt-2 text-xs text-stone-500">
            {formatDateTime(assignment.submission.submittedAt)}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-4">
        {assignment.grade &&
        assignment.grade.score !== null &&
        assignment.grade.maxScore !== null ? (
          <div>
            <p className="font-medium text-stone-900">
              {assignment.grade.score}/{assignment.grade.maxScore}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {assignment.grade.percentage}% released
            </p>
          </div>
        ) : (
          <span className="text-sm text-stone-500">-</span>
        )}
      </td>
      <td className="px-4 py-4">
        {assignment.canSubmit ? (
          <Link
            href={actionHref}
            className="inline-flex rounded-full border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-100"
          >
            {actionLabel}
          </Link>
        ) : (
          <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-600">
            {assignment.submission.status === 'graded' ||
            assignment.submission.status === 'submitted' ||
            assignment.submission.status === 'processing'
              ? formatStatusLabel(assignment.submission.status)
              : closedLabel}
          </span>
        )}
      </td>
    </tr>
  );
}
