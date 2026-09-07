'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';
import type {
  ReferenceSolutionItem,
  SubmissionRow,
  TeacherAssignmentDetail,
} from '@/lib/teacher-assignment-detail';
import {
  formatTeacherAssignmentStatus,
  formatTeacherSubmissionStatus,
} from '@/lib/teacher-assignment-detail';
import { formatDateTime, formatFileSize } from '@/lib/student-dashboard';

interface MeResponse {
  user?: {
    role?: string;
  } | null;
}

export default function TeacherAssignmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const [data, setData] = useState<TeacherAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionRow | null>(null);
  const [selectedStructure, setSelectedStructure] = useState<ReferenceSolutionItem | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [publishingMarks, setPublishingMarks] = useState(false);
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideComment, setOverrideComment] = useState('');
  const [busySolutionId, setBusySolutionId] = useState('');
  const [regradingSubmissionId, setRegradingSubmissionId] = useState('');
  const [bulkRegrading, setBulkRegrading] = useState(false);

  useEffect(() => {
    void loadAssignment();
  }, [assignmentId, router]);

  useEffect(() => {
    if (!selectedSubmission) {
      setOverrideScore('');
      setOverrideComment('');
      return;
    }

    const nextScore =
      selectedSubmission.detail.override?.finalScore ??
      selectedSubmission.detail.teacherFinalMark;
    setOverrideScore(nextScore === null ? '' : String(nextScore));
    setOverrideComment(selectedSubmission.detail.teacherComment ?? '');
  }, [selectedSubmission]);

  async function loadAssignment(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setError('');
    }

    try {
      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
      });
      if (!meRes.ok) {
        throw new Error('Session invalid');
      }

      const meData: MeResponse = await meRes.json();
      const role = meData.user?.role;
      if (role !== 'teacher') {
        router.replace(getDashboardPathForRole(role));
        return;
      }

      const detailRes = await fetch(`${API_BASE_URL}/teacher/assignments/${assignmentId}`, {
        credentials: 'include',
      });
      const detailData = await detailRes.json().catch(() => null);

      if (!detailRes.ok) {
        throw new Error(detailData?.message ?? 'Failed to load assignment details.');
      }

      setData(detailData);
      return detailData as TeacherAssignmentDetail;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load assignment details.',
      );
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  const summaryCards = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: 'Total submissions', value: String(data.summary.totalSubmissions) },
      { label: 'Students graded', value: String(data.summary.studentsGraded) },
      { label: 'Pending grading', value: String(data.summary.pendingGrading) },
      { label: 'Average mark', value: formatMark(data.summary.averageMark) },
      { label: 'Highest mark', value: formatMark(data.summary.highestMark) },
      { label: 'Lowest mark', value: formatMark(data.summary.lowestMark) },
      { label: 'Late submissions', value: String(data.summary.lateSubmissionsCount) },
      {
        label: 'Reference solutions',
        value: String(data.summary.referenceSolutionsUploaded),
      },
    ];
  }, [data]);

  async function handleCloseAssignment() {
    if (!data) {
      return;
    }

    const confirmed = window.confirm(
      'Close this assignment now? Students will no longer be treated as on time after this point.',
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(
      `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/close`,
      {
        method: 'PATCH',
        credentials: 'include',
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.message ?? 'Failed to close assignment.');
      return;
    }

    setActionMessage('Assignment closed.');
    await loadAssignment();
  }

  async function handleDeleteAssignment() {
    if (!data) {
      return;
    }

    const confirmed = window.confirm(
      'Delete this assignment and all related submissions, grades, and solutions?',
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(
      `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.message ?? 'Failed to delete assignment.');
      return;
    }

    router.push('/teacher/dashboard');
  }

  async function handlePublishMarks() {
    if (!data) {
      return;
    }

    const confirmed = window.confirm(
      'Publish marks now? Students will be able to see their marks and invited students will receive an email notification.',
    );
    if (!confirmed) {
      return;
    }

    setPublishingMarks(true);
    setError('');
    setActionMessage('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/publish-marks`,
        {
          method: 'PATCH',
          credentials: 'include',
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? 'Failed to publish marks.');
      }

      const emailInfo = result?.emailNotifications;
      const suffix = emailInfo
        ? ` Emails sent: ${emailInfo.sentCount ?? 0}, failed: ${emailInfo.failedCount ?? 0}, skipped: ${emailInfo.skippedCount ?? 0}.`
        : '';
      setActionMessage(`Marks published.${suffix}`);
      await loadAssignment();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish marks.');
    } finally {
      setPublishingMarks(false);
    }
  }

  async function handleDeleteSolution(solutionId: string) {
    if (!data) {
      return;
    }

    const confirmed = window.confirm('Delete this reference solution?');
    if (!confirmed) {
      return;
    }

    setBusySolutionId(solutionId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/solutions/${solutionId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? 'Failed to delete solution.');
      }

      setActionMessage('Reference solution deleted.');
      await loadAssignment();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete solution.');
    } finally {
      setBusySolutionId('');
    }
  }

  async function handleReplaceSolution(
    solution: ReferenceSolutionItem,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (!data) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusySolutionId(solution.solutionId);
    try {
      const formData = new FormData();
      formData.append('label', solution.label);
      formData.append('file', file);

      const response = await fetch(
        `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/solutions/${solution.solutionId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          body: formData,
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? 'Failed to replace solution.');
      }

      setActionMessage(`${solution.slot} replaced.`);
      await loadAssignment();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace solution.');
    } finally {
      setBusySolutionId('');
      event.target.value = '';
    }
  }

  async function handleSaveOverride() {
    if (!data || !selectedSubmission) {
      return;
    }

    setSavingOverride(true);
    setError('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/submissions/${selectedSubmission.submissionId}/override`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            finalScore: Number(overrideScore),
            comment: overrideComment,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? 'Failed to save teacher override.');
      }

      setActionMessage('Teacher override saved.');
      await loadAssignment();
      setSelectedSubmission(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save teacher override.',
      );
    } finally {
      setSavingOverride(false);
    }
  }

  function exportMarksCsv() {
    if (!data) {
      return;
    }

    const header = [
      'Student Name',
      'Student ID',
      'Submitted At',
      'Status',
      'Auto Mark',
      'Max Score',
      'Percentage',
      'Matched Solution',
      'Confidence',
      'Late',
      'Needs Review',
    ];
    const rows = data.submissions.map((item) => [
      item.studentName,
      item.studentId,
      item.submittedAt,
      item.status,
      item.autoMark ?? '',
      item.maxScore,
      item.percentage ?? '',
      item.bestMatchedSolution?.label ?? '',
      item.confidenceScore ?? '',
      item.isLate ? 'Late' : 'On time',
      item.needsReview ? 'Yes' : 'No',
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n');

    downloadTextFile(
      csv,
      `${slugify(data.assignment.title)}-marks.csv`,
      'text/csv;charset=utf-8;',
    );
    setActionMessage('Marks CSV exported.');
  }

  function exportGradingReport() {
    if (!data) {
      return;
    }

    const header = [
      'Assignment',
      'Student Name',
      'Student Email',
      'Student ID',
      'Submitted At',
      'Status',
      'Auto Mark',
      'Max Score',
      'Final Teacher Mark',
      'Teacher Comment',
      'Matched Solution',
      'Confidence',
      'Flags',
      'Marking Criteria',
      'Missing Classes',
      'Extra Classes',
      'Relationship Mismatches',
      'Attribute Method Mismatches',
      'Naming Mismatches',
      'Synonym Matches',
      'Extraction Error',
    ];
    const rows = data.submissions.map((item) => [
      data.assignment.title,
      item.studentName,
      item.studentEmail,
      item.studentId,
      item.submittedAt,
      item.status,
      item.detail.autoGeneratedMark ?? '',
      item.detail.maxScore,
      item.detail.teacherFinalMark ?? '',
      item.detail.teacherComment,
      item.detail.bestMatchedReferenceSolution?.label ?? '',
      item.confidenceScore ?? '',
      item.flags.join(' | '),
      item.detail.markingCriteria
        .map((criterion) =>
          `${criterion.label}: ${criterion.awardedMarks}/${criterion.maxMarks}${criterion.reason ? ` - ${criterion.reason}` : ''}`,
        )
        .join(' | '),
      item.detail.missingClasses.map(formatDiscrepancy).join(' | '),
      item.detail.extraClasses.map(formatDiscrepancy).join(' | '),
      item.detail.relationshipMismatches.map(formatDiscrepancy).join(' | '),
      item.detail.attributeMethodMismatches.map(formatDiscrepancy).join(' | '),
      item.detail.namingMismatches.map(formatDiscrepancy).join(' | '),
      item.detail.synonymMatchesDetected.map(formatDiscrepancy).join(' | '),
      item.detail.extractionError ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n');

    downloadTextFile(
      csv,
      `${slugify(data.assignment.title)}-grading-report.csv`,
      'text/csv;charset=utf-8;',
    );
    setActionMessage('Grading report exported.');
  }

  function downloadAllSubmissions() {
    if (!data) {
      return;
    }

    if (data.submissions.length === 0) {
      setActionMessage('No submissions are available to download.');
      return;
    }

    data.submissions.forEach((submission, index) => {
      window.setTimeout(() => {
        downloadDataUrl(
          submission.detail.imageUrl,
          getSubmissionDownloadFileName(submission, data.assignment.title),
        );
      }, index * 250);
    });
    setActionMessage(
      `Started downloading ${data.submissions.length} submission${data.submissions.length === 1 ? '' : 's'}.`,
    );
  }

  function openSubmission(submission: SubmissionRow) {
    setSelectedSubmission(submission);
  }

  async function handleRegrade(submission: SubmissionRow) {
    if (!data) {
      return;
    }

    setRegradingSubmissionId(submission.submissionId);
    setError('');
    setActionMessage('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/submissions/${submission.submissionId}/regrade`,
        {
          method: 'PATCH',
          credentials: 'include',
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(result, 'Failed to regrade submission.'));
      }

      setActionMessage('Regrading started. This can take a little while for PNG submissions.');
      await loadAssignment({ silent: true });
      await pollRegradeStatus(submission.submissionId, submission.maxScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regrade submission.');
      await loadAssignment();
    } finally {
      setRegradingSubmissionId('');
    }
  }

  async function handleRegradeAllSubmissions() {
    if (!data || data.submissions.length === 0) {
      setActionMessage('No submissions are available to re-run.');
      return;
    }

    const confirmed = window.confirm(
      `Re-run grading for all ${data.submissions.length} submissions? Existing automatic marks will be replaced when grading finishes.`,
    );
    if (!confirmed) {
      return;
    }

    setBulkRegrading(true);
    setRegradingSubmissionId('all');
    setError('');
    setActionMessage('Starting regrade for all submissions...');

    try {
      const results = await Promise.all(
        data.submissions.map(async (submission) => {
          const response = await fetch(
            `${API_BASE_URL}/teacher/assignments/${data.assignment.assignmentId}/submissions/${submission.submissionId}/regrade`,
            {
              method: 'PATCH',
              credentials: 'include',
            },
          );
          const result = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              `${submission.studentName}: ${getApiErrorMessage(result, 'Failed to regrade submission.')}`,
            );
          }
          return submission.submissionId;
        }),
      );

      setActionMessage(
        `Regrading started for ${results.length} submission${results.length === 1 ? '' : 's'}.`,
      );
      await loadAssignment({ silent: true });
      await pollBulkRegradeStatus(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-run grading.');
      await loadAssignment({ silent: true });
    } finally {
      setBulkRegrading(false);
      setRegradingSubmissionId('');
    }
  }

  async function pollRegradeStatus(submissionId: string, fallbackMaxScore: number) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(3000);
      const nextData = await loadAssignment({ silent: true });
      const latestSubmission = nextData?.submissions.find(
        (item) => item.submissionId === submissionId,
      );

      if (!latestSubmission || latestSubmission.status === 'processing') {
        setActionMessage(getRegradeProgressMessage(attempt));
        continue;
      }

      if (latestSubmission.status === 'graded') {
        setActionMessage(
          `Submission regraded: ${formatMark(latestSubmission.autoMark)} / ${latestSubmission.maxScore ?? fallbackMaxScore}.`,
        );
        return;
      }

      if (latestSubmission.status === 'failed') {
        setError('Regrading failed. Open the submission details to review the grading error.');
        return;
      }
    }

    setActionMessage('Regrading is still running. The table will update when you refresh.');
  }

  async function pollBulkRegradeStatus(submissionIds: string[]) {
    const pending = new Set(submissionIds);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await wait(3000);
      const nextData = await loadAssignment({ silent: true });
      for (const submission of nextData?.submissions ?? []) {
        if (
          pending.has(submission.submissionId) &&
          submission.status !== 'processing'
        ) {
          pending.delete(submission.submissionId);
        }
      }

      const completedCount = submissionIds.length - pending.size;
      setActionMessage(
        `${getRegradeProgressMessage(attempt)} Completed ${completedCount}/${submissionIds.length}.`,
      );

      if (pending.size === 0) {
        const failedCount =
          nextData?.submissions.filter(
            (submission) =>
              submissionIds.includes(submission.submissionId) &&
              submission.status === 'failed',
          ).length ?? 0;
        setActionMessage(
          failedCount > 0
            ? `Bulk regrade finished with ${failedCount} failed submission${failedCount === 1 ? '' : 's'}.`
            : `Bulk regrade finished for ${submissionIds.length} submission${submissionIds.length === 1 ? '' : 's'}.`,
        );
        return;
      }
    }

    setActionMessage(
      'Bulk regrade is still running. The table will keep its processing status until grading finishes.',
    );
  }

  function showComingSoon(label: string) {
    setActionMessage(`${label} is not wired yet, but the page is ready for it.`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading assignment workspace...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/teacher/dashboard"
            className="text-sm font-semibold text-cyan-200 underline underline-offset-4"
          >
            Back to dashboard
          </Link>
          <section className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-red-100">
            {error || 'Assignment details are unavailable.'}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),linear-gradient(135deg,_#020617,_#0f172a_45%,_#082f49)] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/teacher/dashboard"
            className="text-sm font-semibold text-cyan-200 underline underline-offset-4"
          >
            Back to dashboard
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">
            Assignment details
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {actionMessage}
          </div>
        ) : null}

        <section className="mt-6 rounded-[2rem] border border-slate-700/80 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  {formatTeacherAssignmentStatus(data.assignment.status)}
                </span>
                <span className="rounded-full border border-slate-600 bg-slate-800/70 px-3 py-1 text-xs text-slate-200">
                  {data.referenceSolutions.activeCount} solutions active
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
                {data.assignment.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100/80">
                {data.assignment.description || 'No description has been added yet.'}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetaChip label="Total marks" value={String(data.assignment.totalMarks)} />
                <MetaChip
                  label="Due date"
                  value={data.assignment.dueAt ? formatDateTime(data.assignment.dueAt) : 'No due date'}
                />
                <MetaChip label="Created" value={formatDateTime(data.assignment.createdAt)} />
                <MetaChip label="Updated" value={formatDateTime(data.assignment.updatedAt)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionButton onClick={() => showComingSoon('Edit Assignment')}>
                Edit Assignment
              </ActionButton>
              <ActionButton
                onClick={handleCloseAssignment}
                disabled={!data.actions.canCloseAssignment}
              >
                Close Assignment
              </ActionButton>
              <ActionButton
                variant="danger"
                onClick={handleDeleteAssignment}
                disabled={!data.actions.canDeleteAssignment}
              >
                Delete Assignment
              </ActionButton>
              <ActionButton
                onClick={handlePublishMarks}
                disabled={!data.actions.canPublishMarks || publishingMarks}
              >
                {publishingMarks
                  ? 'Publishing...'
                  : data.assignment.marksPublishedAt
                    ? 'Marks Published'
                    : 'Publish Marks'}
              </ActionButton>
            </div>
          </div>
          {data.assignment.marksPublishedAt ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Marks published on {formatDateTime(data.assignment.marksPublishedAt)}
              {data.assignment.marksPublishedBy
                ? ` by ${data.assignment.marksPublishedBy}`
                : ''}
              .
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Marks are visible to teachers only until you publish them.
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-5"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Panel
              title="Reference Solutions"
              subtitle={`${data.referenceSolutions.activeCount} active - last extraction ${data.referenceSolutions.lastExtractionAt ? formatDateTime(data.referenceSolutions.lastExtractionAt) : 'not available'}`}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {data.referenceSolutions.items.map((solution) => (
                  <article
                    key={solution.solutionId}
                    className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">
                          {solution.slot}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          {solution.label}
                        </h3>
                        <p className="mt-1 text-xs text-blue-100/70">
                          {solution.originalFileName} - {formatFileSize(solution.fileSizeBytes)}
                        </p>
                      </div>
                      <StatusPill tone={solution.extractionStatus}>
                        {solution.extractionStatusLabel}
                      </StatusPill>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
                      {solution.mimeType.startsWith('image/') ? (
                        <img
                          src={solution.previewUrl}
                          alt={solution.label}
                          className="h-52 w-full object-contain bg-slate-950/80"
                        />
                      ) : (
                        <div className="flex h-52 items-center justify-center text-sm text-blue-100/70">
                          XML solution file
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-blue-100/80">
                      <p>Last extraction: {solution.lastExtractionAt ? formatDateTime(solution.lastExtractionAt) : 'Not extracted yet'}</p>
                      <p>Synonym map: {solution.hasSynonymMapConfigured ? 'Configured' : 'Not configured'}</p>
                    </div>

                    {solution.extractionError ? (
                      <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                        {solution.extractionError}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={() => setSelectedStructure(solution)}>
                        View extracted structure
                      </ActionButton>
                      <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-blue-50 hover:bg-slate-700">
                        Replace
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.xml,image/png,image/jpeg,application/xml,text/xml"
                          className="hidden"
                          onChange={(event) => handleReplaceSolution(solution, event)}
                        />
                      </label>
                      <ActionButton
                        variant="danger"
                        onClick={() => handleDeleteSolution(solution.solutionId)}
                        disabled={busySolutionId === solution.solutionId}
                      >
                        {busySolutionId === solution.solutionId ? 'Working...' : 'Delete solution'}
                      </ActionButton>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              title="Synonyms And Matching Configuration"
              subtitle={`${data.synonymsConfig.allowedEquivalentNamesCount} equivalent names configured`}
            >
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200/70">
                    Synonym map preview
                  </h3>
                  <div className="mt-4 space-y-3">
                    {data.synonymsConfig.preview.length === 0 ? (
                      <p className="text-sm text-blue-100/70">
                        No synonym aliases are configured for this assignment.
                      </p>
                    ) : (
                      data.synonymsConfig.preview.map((entry) => (
                        <div
                          key={entry.term}
                          className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3"
                        >
                          <p className="font-medium text-white">{entry.term}</p>
                          <p className="mt-1 text-sm text-blue-100/70">
                            {entry.aliases.join(', ')}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200/70">
                    Matching rules summary
                  </h3>
                  <div className="mt-4 space-y-3">
                    {data.synonymsConfig.matchingRulesSummary.map((rule) => (
                      <p
                        key={rule}
                        className="rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-3 text-sm text-blue-50"
                      >
                        {rule}
                      </p>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton onClick={() => showComingSoon('Edit Synonyms')}>
                      Edit Synonyms
                    </ActionButton>
                    <ActionButton onClick={() => showComingSoon('Recompute solution extraction')}>
                      Recompute Solution Extraction
                    </ActionButton>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Invited Students"
              subtitle={`${data.invitedStudents.totalInvited} invited - ${data.invitedStudents.registeredCount} registered - ${data.invitedStudents.pendingCount} pending`}
            >
              {data.invitedStudents.totalInvited === 0 ? (
                <p className="text-sm text-blue-100/70">
                  No invite list was uploaded. This assignment is visible to all students.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.invitedStudents.items.map((student) => (
                    <div
                      key={student.email}
                      className="rounded-2xl border border-slate-700/80 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">
                          {student.fullName ?? student.email}
                        </p>
                        <StatusPill
                          tone={student.status === 'Registered' ? 'ready' : 'processing'}
                        >
                          {student.status}
                        </StatusPill>
                      </div>
                      {student.fullName ? (
                        <p className="mt-1 text-sm text-blue-100/70">{student.email}</p>
                      ) : null}
                      {student.studentId ? (
                        <p className="mt-1 text-xs text-blue-200/60">
                          Student ID: {student.studentId}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Submission Management"
              subtitle={`${data.submissions.length} submissions tracked`}
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-blue-200/70">
                    <tr>
                      <th className="px-3 py-3">Student</th>
                      <th className="px-3 py-3">Submitted</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Auto mark</th>
                      <th className="px-3 py-3">Matched solution</th>
                      <th className="px-3 py-3">Confidence</th>
                      <th className="px-3 py-3">Timing</th>
                      <th className="px-3 py-3">Review</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-blue-50">
                    {data.submissions.map((submission) => (
                      <tr key={submission.submissionId} className="border-t border-slate-800/80">
                        <td className="px-3 py-3">
                          <p className="font-medium text-white">{submission.studentName}</p>
                          <p className="text-xs text-blue-100/60">
                            {submission.studentEmail || submission.studentId}
                          </p>
                        </td>
                        <td className="px-3 py-3">{formatDateTime(submission.submittedAt)}</td>
                        <td className="px-3 py-3">
                          <StatusPill tone={submission.status}>
                            {formatTeacherSubmissionStatus(submission.status)}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-3">
                          {submission.autoMark !== null
                            ? `${formatMark(submission.autoMark)} / ${submission.maxScore}`
                            : '-'}
                        </td>
                        <td className="px-3 py-3">
                          {submission.bestMatchedSolution?.label ?? 'Not matched yet'}
                        </td>
                        <td className="px-3 py-3">
                          {submission.confidenceScore !== null
                            ? `${submission.confidenceScore}%`
                            : '-'}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone={submission.isLate ? 'failed' : 'ready'}>
                            {submission.isLate ? 'Late' : 'On time'}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone={submission.needsReview ? 'failed' : 'ready'}>
                            {submission.needsReview ? 'Needs review' : 'Clear'}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <ActionButton onClick={() => openSubmission(submission)}>
                              View details
                            </ActionButton>
                            <ActionButton
                              onClick={() => handleRegrade(submission)}
                              disabled={
                                bulkRegrading ||
                                regradingSubmissionId === submission.submissionId
                              }
                            >
                              {bulkRegrading
                                ? 'Regrading...'
                                : regradingSubmissionId === submission.submissionId
                                ? 'Regrading...'
                                : 'Regrade'}
                            </ActionButton>
                            <ActionButton onClick={() => openSubmission(submission)}>
                              Override mark
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {data.submissions.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-blue-100/70" colSpan={9}>
                          No submissions yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Grading Analytics" subtitle="Teacher-friendly distribution and error signals">
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Mark distribution</h3>
                  <div className="mt-3 space-y-2">
                    {data.analytics.markDistribution.map((bucket) => (
                      <BarRow
                        key={bucket.range}
                        label={bucket.range}
                        value={bucket.count}
                        maxValue={Math.max(...data.analytics.markDistribution.map((item) => item.count), 1)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">Matches per solution</h3>
                  <div className="mt-3 space-y-2">
                    {data.analytics.matchedSolutions.length === 0 ? (
                      <p className="text-sm text-blue-100/70">No matched solutions yet.</p>
                    ) : (
                      data.analytics.matchedSolutions.map((item) => (
                        <BarRow
                          key={item.slot}
                          label={item.slot}
                          value={item.count}
                          maxValue={Math.max(...data.analytics.matchedSolutions.map((entry) => entry.count), 1)}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-3">
                  <AnalyticsStat
                    label="Most frequently missed class"
                    value={
                      data.analytics.mostFrequentlyMissedClass
                        ? `${data.analytics.mostFrequentlyMissedClass.label} (${data.analytics.mostFrequentlyMissedClass.count})`
                        : 'No signal yet'
                    }
                  />
                  <AnalyticsStat
                    label="Most common relationship error"
                    value={
                      data.analytics.mostCommonRelationshipError
                        ? `${data.analytics.mostCommonRelationshipError.label} (${data.analytics.mostCommonRelationshipError.count})`
                        : 'No signal yet'
                    }
                  />
                  <AnalyticsStat
                    label="Manual review count"
                    value={String(data.analytics.submissionsNeedingManualReview)}
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">Common mistakes summary</h3>
                  <div className="mt-3 space-y-2">
                    {data.analytics.commonMistakes.length === 0 ? (
                      <p className="text-sm text-blue-100/70">No discrepancy patterns yet.</p>
                    ) : (
                      data.analytics.commonMistakes.map((mistake) => (
                        <div
                          key={mistake.message}
                          className="rounded-2xl border border-slate-700/80 bg-slate-950/50 px-3 py-3 text-sm text-blue-50"
                        >
                          {mistake.message}
                          <span className="ml-2 text-blue-200/70">({mistake.count})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Assignment Actions" subtitle="Operational tools for this assignment">
              <div className="grid gap-2">
                <ActionButton
                  onClick={handleRegradeAllSubmissions}
                  disabled={bulkRegrading || data.submissions.length === 0}
                >
                  {bulkRegrading
                    ? 'Regrading all submissions...'
                    : 'Re-run grading for all submissions'}
                </ActionButton>
                <ActionButton
                  onClick={exportMarksCsv}
                  disabled={!data.actions.canExportMarksCsv}
                >
                  Export marks as CSV
                </ActionButton>
                <ActionButton
                  onClick={exportGradingReport}
                  disabled={data.submissions.length === 0}
                >
                  Export grading report
                </ActionButton>
                <ActionButton
                  onClick={downloadAllSubmissions}
                  disabled={data.submissions.length === 0}
                >
                  Download all submissions
                </ActionButton>
                <ActionButton
                  onClick={handlePublishMarks}
                  disabled={!data.actions.canPublishMarks || publishingMarks}
                >
                  {publishingMarks
                    ? 'Publishing...'
                    : data.assignment.marksPublishedAt
                      ? 'Marks already published'
                      : 'Publish marks to students'}
                </ActionButton>
                <ActionButton
                  onClick={handleCloseAssignment}
                  disabled={!data.actions.canCloseAssignment}
                >
                  {data.actions.canCloseAssignment
                    ? 'Lock assignment from further submissions'
                    : 'Assignment locked'}
                </ActionButton>
              </div>
            </Panel>

            <Panel title="Activity And Audit Log" subtitle="Recent derived events for this assignment">
              <div className="space-y-3">
                {data.activity.map((item) => (
                  <div
                    key={`${item.type}-${item.occurredAt}-${item.message}`}
                    className="rounded-2xl border border-slate-700/80 bg-slate-950/50 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-white">{item.message}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-blue-200/70">
                      {formatDateTime(item.occurredAt)}
                    </p>
                  </div>
                ))}
                {data.activity.length === 0 ? (
                  <p className="text-sm text-blue-100/70">No activity captured yet.</p>
                ) : null}
              </div>
            </Panel>
          </div>
        </section>
      </div>
      {selectedSubmission ? (
        <SubmissionOverrideModal
          submission={selectedSubmission}
          assignmentTitle={data.assignment.title}
          overrideScore={overrideScore}
          overrideComment={overrideComment}
          savingOverride={savingOverride}
          onClose={() => setSelectedSubmission(null)}
          onOverrideScoreChange={setOverrideScore}
          onOverrideCommentChange={setOverrideComment}
          onSaveOverride={handleSaveOverride}
        />
      ) : null}
      {selectedStructure ? (
        <JsonModal
          title={`${selectedStructure.slot} extracted structure`}
          payload={selectedStructure.extractedStructure}
          onClose={() => setSelectedStructure(null)}
        />
      ) : null}
    </main>
  );
}

function formatMark(value: number | null) {
  if (value === null) {
    return '-';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSubmissionDownloadFileName(
  submission: SubmissionRow,
  assignmentTitle: string,
) {
  const studentPart = safeFilePart(submission.studentEmail || submission.studentId);
  const assignmentPart = safeFilePart(assignmentTitle);
  const datePart = formatDateForFileName(submission.submittedAt);
  const extension = getFileExtension(submission.detail.originalFileName);

  return `${studentPart}-${assignmentPart}-${datePart}${extension}`;
}

function safeFilePart(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'submission'
  );
}

function formatDateForFileName(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown-date';
  }

  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '-');
}

function getFileExtension(fileName: string) {
  const match = fileName.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? '';
}

function isTextSubmissionFile(mimeType: string, fileName: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  return (
    ['application/uxf', 'application/xml', 'text/xml'].includes(
      normalizedMimeType,
    ) ||
    normalizedFileName.endsWith('.uxf') ||
    normalizedFileName.endsWith('.uxl') ||
    normalizedFileName.endsWith('.xml')
  );
}

function decodeDataUrlText(dataUrl: string) {
  const base64Match = dataUrl.match(/^data:[^;]*;base64,(.*)$/);
  if (base64Match?.[1]) {
    try {
      const binary = window.atob(base64Match[1]);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return window.atob(base64Match[1]);
    }
  }

  const plainMatch = dataUrl.match(/^data:[^,]*,(.*)$/);
  if (plainMatch?.[1]) {
    try {
      return decodeURIComponent(plainMatch[1]);
    } catch {
      return plainMatch[1];
    }
  }

  return '';
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-700/80 bg-slate-900/70 p-5 backdrop-blur">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-blue-100/70">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        variant === 'danger'
          ? 'rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60'
          : 'rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-blue-50 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {children}
    </button>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'ready' | 'processing' | 'failed' | 'submitted' | 'graded' | boolean;
  children: ReactNode;
}) {
  const className =
    tone === 'ready' || tone === 'graded' || tone === true
      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
      : tone === 'processing'
        ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
        : 'border-red-400/20 bg-red-500/10 text-red-100';

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function AnalyticsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 8 : 0) : 0;

  return (
    <div className="grid grid-cols-[88px_1fr_36px] items-center gap-3">
      <span className="text-sm text-blue-100/80">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

function SubmissionOverrideModal({
  submission,
  assignmentTitle,
  overrideScore,
  overrideComment,
  savingOverride,
  onClose,
  onOverrideScoreChange,
  onOverrideCommentChange,
  onSaveOverride,
}: {
  submission: SubmissionRow;
  assignmentTitle: string;
  overrideScore: string;
  overrideComment: string;
  savingOverride: boolean;
  onClose: () => void;
  onOverrideScoreChange: (value: string) => void;
  onOverrideCommentChange: (value: string) => void;
  onSaveOverride: () => void;
}) {
  const isTextSubmission = isTextSubmissionFile(
    submission.detail.mimeType,
    submission.detail.originalFileName,
  );
  const isImageSubmission = submission.detail.mimeType.startsWith('image/');
  const downloadFileName = getSubmissionDownloadFileName(
    submission,
    assignmentTitle,
  );
  const submissionText = isTextSubmission
    ? decodeDataUrlText(submission.detail.imageUrl)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-blue-200/70">
              Override marks
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {submission.studentName}
            </h2>
            <p className="mt-1 text-sm text-blue-100/70">
              {submission.studentEmail || submission.studentId} - {formatDateTime(submission.submittedAt)}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Student submission</h3>
                <p className="mt-1 text-sm text-blue-100/70">
                  {submission.detail.originalFileName} - {formatFileSize(submission.detail.fileSizeBytes)}
                </p>
              </div>
              <ActionButton
                onClick={() =>
                  downloadDataUrl(submission.detail.imageUrl, downloadFileName)
                }
              >
                Download submission
              </ActionButton>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
              {isImageSubmission ? (
                <img
                  src={submission.detail.imageUrl}
                  alt={`${submission.studentName} UML submission`}
                  className="max-h-[28rem] w-full object-contain bg-slate-950"
                />
              ) : isTextSubmission ? (
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-blue-100">
                  {submissionText || 'Submission text is unavailable.'}
                </pre>
              ) : (
                <div className="p-4 text-sm text-blue-100/70">
                  Preview is not available for this file type. Use download to inspect the submission.
                </div>
              )}
            </div>
          </div>

          {submission.detail.extractionError ? (
            <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              <h3 className="font-semibold text-red-50">Automatic grading failed</h3>
              <p className="mt-2 leading-6">{submission.detail.extractionError}</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <MetaChip
              label="Auto-generated mark"
              value={
                submission.detail.autoGeneratedMark !== null
                  ? `${formatMark(submission.detail.autoGeneratedMark)} / ${submission.detail.maxScore}`
                  : '-'
              }
            />
            <MetaChip
              label="Best matched reference"
              value={submission.detail.bestMatchedReferenceSolution?.label ?? 'Not matched yet'}
            />
          </div>

          <DetailList title="Marking criteria" items={submission.detail.markingCriteria.map((item) => `${item.label}: ${item.awardedMarks}/${item.maxMarks}${item.reason ? ` - ${item.reason}` : ''}`)} />
          <DetailList title="Missing classes" items={submission.detail.missingClasses.map(formatDiscrepancy)} />
          <DetailList title="Extra classes" items={submission.detail.extraClasses.map(formatDiscrepancy)} />
          <DetailList title="Relationship mismatches" items={submission.detail.relationshipMismatches.map(formatDiscrepancy)} />
          <DetailList title="Attribute / method mismatches" items={submission.detail.attributeMethodMismatches.map(formatDiscrepancy)} />
          <DetailList title="Naming mismatches" items={submission.detail.namingMismatches.map(formatDiscrepancy)} />
          <DetailList title="Synonym matches detected" items={submission.detail.synonymMatchesDetected.map(formatDiscrepancy)} />

          <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="text-lg font-semibold text-white">Teacher moderation</h3>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm text-blue-100">
                <span>Teacher final mark</span>
                <input
                  type="number"
                  min={0}
                  max={submission.maxScore}
                  value={overrideScore}
                  onChange={(event) => onOverrideScoreChange(event.target.value)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <label className="grid gap-2 text-sm text-blue-100">
                <span>Feedback / comments</span>
                <textarea
                  rows={4}
                  value={overrideComment}
                  onChange={(event) => onOverrideCommentChange(event.target.value)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <ActionButton onClick={onSaveOverride} disabled={savingOverride || !overrideScore}>
                  {savingOverride ? 'Saving...' : 'Save override'}
                </ActionButton>
                {submission.detail.override?.isOverridden ? (
                  <p className="text-sm text-blue-100/70">
                    Overridden by {submission.detail.override.overriddenBy ?? 'teacher'} on{' '}
                    {submission.detail.override.overriddenAt
                      ? formatDateTime(submission.detail.override.overriddenAt)
                      : 'unknown date'}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-950/60 p-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-blue-100/70">No items recorded.</p>
        ) : (
          items.map((item) => (
            <p
              key={item}
              className="rounded-2xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-blue-50"
            >
              {item}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function JsonModal({
  title,
  payload,
  onClose,
}: {
  title: string;
  payload: unknown;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[2rem] border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        <pre className="mt-5 max-h-[70vh] overflow-auto rounded-3xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-blue-100">
          {JSON.stringify(payload ?? { message: 'No extracted structure available.' }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function formatDiscrepancy(item: {
  message: string;
  expected?: string;
  actual?: string;
  entityRef?: string;
}) {
  const parts = [item.message];
  if (item.entityRef) {
    parts.push(`Entity: ${item.entityRef}`);
  }
  if (item.expected) {
    parts.push(`Expected: ${item.expected}`);
  }
  if (item.actual) {
    parts.push(`Actual: ${item.actual}`);
  }
  return parts.join(' - ');
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getRegradeProgressMessage(attempt: number) {
  const messages = [
    'Regrading started. Preparing the submission.',
    'The vision grader is analysing the diagram.',
    'Matching the submission with the reference solution.',
    'Calculating rubric marks.',
    'Still regrading. PNG submissions can take a little longer.',
  ];

  return messages[Math.min(attempt, messages.length - 1)];
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload
  ) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(message)) {
      const firstMessage = message.find(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      );
      if (firstMessage) {
        return firstMessage;
      }
    }
  }

  return fallback;
}
