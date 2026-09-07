'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChangeEvent, DragEvent, FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, GRADER_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';
import type { AssignmentDetail } from '@/lib/student-dashboard';
import {
  formatDateTime,
  formatFileSize,
  formatStatusLabel,
} from '@/lib/student-dashboard';

interface MeResponse {
  user?: {
    role?: string;
  } | null;
}

interface UploadState {
  file: File | null;
  previewUrl: string;
  error: string;
  dragActive: boolean;
}

interface GradingProgressState {
  active: boolean;
  submissionId: string;
  message: string;
  percent: number;
}

type GraderEngineStatus = 'checking' | 'available' | 'unavailable';

export default function StudentAssignmentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'review' | 'submit' | null>(
    null,
  );
  const [error, setError] = useState('');
  const [graderEngineStatus, setGraderEngineStatus] =
    useState<GraderEngineStatus>('checking');
  const [gradingProgress, setGradingProgress] =
    useState<GradingProgressState | null>(null);
  const [upload, setUpload] = useState<UploadState>({
    file: null,
    previewUrl: '',
    error: '',
    dragActive: false,
  });

  const loadPage = useCallback(async (options?: { silent?: boolean }) => {
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
      if (role !== 'student') {
        router.replace(getDashboardPathForRole(role));
        return;
      }

      const detailRes = await fetch(`${API_BASE_URL}/student/assignments/${assignmentId}`, {
        credentials: 'include',
      });

      if (!detailRes.ok) {
        const data = await detailRes.json().catch(() => null);
        throw new Error(data?.message ?? 'Failed to load assignment.');
      }

      const detailData = await detailRes.json();
      setAssignment(detailData);
      return detailData as AssignmentDetail;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignment.');
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [assignmentId, router]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const checkGraderEngine = useCallback(async () => {
    setGraderEngineStatus('checking');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(`${GRADER_BASE_URL}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        status?: unknown;
      } | null;

      setGraderEngineStatus(
        response.ok && payload?.status === 'ok' ? 'available' : 'unavailable',
      );
    } catch {
      setGraderEngineStatus('unavailable');
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void checkGraderEngine();
  }, [checkGraderEngine]);

  useEffect(() => {
    return () => {
      if (upload.previewUrl) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    };
  }, [upload.previewUrl]);

  const currentSubmissionId = assignment?.submission?.submissionId ?? '';
  const currentSubmissionStatus = assignment?.submission?.status ?? 'none';

  useEffect(() => {
    if (!currentSubmissionId || currentSubmissionStatus !== 'processing') {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    setGradingProgress({
      active: true,
      submissionId: currentSubmissionId,
      message: getProgressMessage(0),
      percent: 35,
    });

    const poll = async () => {
      attempt += 1;
      const nextAssignment = await loadPage({ silent: true });
      if (cancelled || !nextAssignment?.submission) {
        return;
      }

      const latest = nextAssignment.submission;
      if (latest.submissionId !== currentSubmissionId) {
        return;
      }

      if (latest.status === 'graded' || latest.status === 'failed') {
        setGradingProgress({
          active: false,
          submissionId: latest.submissionId,
          message:
            latest.status === 'graded'
              ? 'Grading complete.'
              : 'Grading failed. You can review the error and resubmit.',
          percent: 100,
        });
        window.setTimeout(() => {
          if (!cancelled) {
            setGradingProgress(null);
          }
        }, 4000);
        return;
      }

      setGradingProgress({
        active: true,
        submissionId: latest.submissionId,
        message: getProgressMessage(attempt),
        percent: Math.min(90, 35 + attempt * 8),
      });
      window.setTimeout(poll, 3000);
    };

    const timer = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentSubmissionId, currentSubmissionStatus, loadPage]);

  const submissionTimePreview = new Date().toISOString();

  function setSelectedFile(file: File | null) {
    if (!file) {
      setUpload((current) => {
        if (current.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return { file: null, previewUrl: '', error: '', dragActive: false };
      });
      return;
    }

    if (!isFileAllowedForAssignment(file, assignment?.submissionMode ?? 'unknown')) {
      setUpload((current) => ({
        ...current,
        file: null,
        previewUrl: '',
        error: getAcceptedUploadError(assignment?.submissionMode ?? 'unknown'),
        dragActive: false,
      }));
      return;
    }

    const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : '';
    setUpload((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        file,
        previewUrl,
        error: '',
        dragActive: false,
      };
    });
    setConfirmMode(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setSelectedFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (graderEngineStatus !== 'available') {
      setUpload((current) => ({
        ...current,
        error: 'Grader Engine Unavailable, avoid submitting work',
      }));
      return;
    }
    if (!upload.file) {
      setUpload((current) => ({ ...current, error: 'Select a UML file first.' }));
      return;
    }
    setConfirmMode('review');
  }

  function onDirectSubmit() {
    if (graderEngineStatus !== 'available') {
      setUpload((current) => ({
        ...current,
        error: 'Grader Engine Unavailable, avoid submitting work',
      }));
      return;
    }
    if (!upload.file) {
      setUpload((current) => ({ ...current, error: 'Select a UML file first.' }));
      return;
    }
    setConfirmMode('submit');
  }

  async function confirmSubmission() {
    if (!upload.file) {
      return;
    }
    if (graderEngineStatus !== 'available') {
      setError('Grader Engine Unavailable, avoid submitting work');
      setConfirmMode(null);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const imageDataUrl = await fileToDataUrl(upload.file);
      const res = await fetch(`${API_BASE_URL}/student/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          originalFileName: upload.file.name,
          mimeType: upload.file.type,
          fileSizeBytes: upload.file.size,
          imageDataUrl,
        }),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'Failed to upload submission.'));
      }

      setConfirmMode(null);
      setSelectedFile(null);
      setGradingProgress({
        active: true,
        submissionId: String(data?.submissionId ?? ''),
        message: 'Submission received. Grading has started.',
        percent: 30,
      });
      await loadPage({ silent: true });
      router.replace(`/student/assignments/${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload submission.');
      setConfirmMode(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#fafaf9,_#ecfeff)] text-stone-900">
        Loading assignment...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fafaf9,_#ecfeff)] px-5 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/student/dashboard"
          className="text-sm font-semibold text-stone-700 underline underline-offset-4"
        >
          Back to dashboard
        </Link>

        {error ? (
          <section className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
            {error}
          </section>
        ) : null}

        {assignment ? (
          <div className="mt-6 space-y-6">
            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-sm font-medium text-teal-700">Student assignment</p>
                  <h1 className="mt-2 text-3xl font-semibold text-stone-950">{assignment.title}</h1>
                  <p className="mt-2 text-sm text-stone-600">{assignment.courseName}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryTile label="Total marks" value={String(assignment.totalMarks)} />
                    <SummaryTile label="Due date" value={assignment.dueLabel} />
                    <SummaryTile label="Time remaining" value={assignment.timeRemainingLabel} />
                    <SummaryTile
                      label="Submission status"
                      value={formatStatusLabel(assignment.submission?.status ?? 'none')}
                    />
                  </div>
                  {gradingProgress ? (
                    <GradingProgressCard progress={gradingProgress} />
                  ) : null}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <SummaryTile label="Attempt rule" value={assignment.attemptRule} />
                    <SummaryTile
                      label="Assignment state"
                      value={assignment.isClosed ? 'Closed' : 'Open'}
                    />
                  </div>
                </div>

                <aside className="w-full max-w-sm rounded-[1.75rem] border border-stone-200 bg-stone-50 p-5">
                  <h2 className="text-lg font-semibold text-stone-950">Submission summary</h2>
                  <div className="mt-4 space-y-3 text-sm text-stone-700">
                    <SummaryRow label="Current status" value={assignment.summary.currentStatus} />
                    <SummaryRow label="Attempts used" value={String(assignment.attemptsUsed)} />
                    <SummaryRow label="Attempts remaining" value={String(assignment.attemptsRemaining)} />
                    <SummaryRow
                      label="Last submission"
                      value={assignment.summary.lastSubmissionTime ? formatDateTime(assignment.summary.lastSubmissionTime) : 'None'}
                    />
                    <SummaryRow label="Best mark" value={formatMaybeMark(assignment.summary.bestMark)} />
                    <SummaryRow label="Latest mark" value={formatMaybeMark(assignment.summary.latestMark)} />
                    <SummaryRow
                      label="Final mark"
                      value={assignment.summary.finalMarkShown ? formatMaybeMark(assignment.summary.finalMark) : 'Hidden'}
                    />
                    <SummaryRow label="Late status" value={assignment.summary.lateStatus} />
                  </div>
                </aside>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <Card title="Assignment description">
                  <p className="text-sm leading-7 text-stone-700">
                    {assignment.description || 'No description provided yet.'}
                  </p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <DetailBlock title="UML task instructions" items={assignment.instructions} />
                    <DetailBlock
                      title="Submission requirements"
                      items={[
                        `Required diagram type: ${assignment.requiredDiagramType}`,
                        ...assignment.submissionFormatRules,
                        assignment.namingGuidance,
                        assignment.markingNote,
                      ]}
                    />
                  </div>
                </Card>

                <Card title="Upload submission">
                  {graderEngineStatus !== 'available' ? (
                    <GraderEngineUnavailableBanner
                      checking={graderEngineStatus === 'checking'}
                      onRetry={checkGraderEngine}
                    />
                  ) : null}
                  {!assignment.canSubmit && !assignment.canResubmit ? (
                    <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-700">
                      This assignment can no longer accept submissions. Current state: {assignment.isClosed ? 'closed' : 'not available'}.
                    </div>
                  ) : (
                    <form onSubmit={onSubmit} className="space-y-4">
                      <div
                        onDragOver={(event) => {
                          event.preventDefault();
                          setUpload((current) => ({ ...current, dragActive: true }));
                        }}
                        onDragLeave={() => setUpload((current) => ({ ...current, dragActive: false }))}
                        onDrop={onDrop}
                        className={`rounded-3xl border border-dashed p-6 text-center transition ${upload.dragActive ? 'border-teal-500 bg-teal-50' : 'border-stone-300 bg-stone-50'}`}
                      >
                        <p className="text-base font-semibold text-stone-950">Drag and drop your submission here</p>
                        <p className="mt-2 text-sm text-stone-600">{assignment.uploadPrompt}</p>
                        <label
                          className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white ${
                            graderEngineStatus === 'available'
                              ? 'cursor-pointer bg-stone-950 hover:bg-stone-800'
                              : 'cursor-not-allowed bg-stone-400'
                          }`}
                        >
                          Browse file
                          <input
                            type="file"
                            accept={assignment.acceptedFileTypes}
                            onChange={onFileChange}
                            disabled={graderEngineStatus !== 'available'}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {upload.file ? (
                        <div className="rounded-3xl border border-stone-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-stone-950">{upload.file.name}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {upload.file.type} - {formatFileSize(upload.file.size)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedFile(null)}
                                className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          {upload.previewUrl ? (
                            <Image
                              src={upload.previewUrl}
                              alt="UML preview"
                              width={1200}
                              height={900}
                              unoptimized
                              className="mt-4 max-h-80 w-full rounded-2xl border border-stone-200 object-contain"
                            />
                          ) : (
                            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-700">
                              UXF/XML file selected. The grader will parse classes, attributes, methods, and relationships from this file.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {upload.error ? <p className="text-sm text-rose-700">{upload.error}</p> : null}

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="submit"
                          disabled={submitting || !upload.file || graderEngineStatus !== 'available'}
                          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-60"
                        >
                          {assignment.canResubmit ? 'Review resubmission' : 'Review submission'}
                        </button>
                        <button
                          type="button"
                          onClick={onDirectSubmit}
                          disabled={submitting || !upload.file || graderEngineStatus !== 'available'}
                          className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
                        >
                          {assignment.canResubmit ? 'Submit resubmission' : 'Submit'}
                        </button>
                      </div>
                    </form>
                  )}
                </Card>

                <Card title="Attempts history">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.18em] text-stone-500">
                        <tr>
                          <th className="px-3 py-3">Attempt</th>
                          <th className="px-3 py-3">Submitted at</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Auto mark</th>
                          <th className="px-3 py-3">Final mark</th>
                          <th className="px-3 py-3">Feedback</th>
                          <th className="px-3 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignment.attemptsHistory.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-stone-500">No attempts yet.</td>
                          </tr>
                        ) : (
                          assignment.attemptsHistory.map((attempt) => (
                            <tr key={attempt.submissionId} className="border-t border-stone-200">
                              <td className="px-3 py-3">#{attempt.attemptNumber}</td>
                              <td className="px-3 py-3">{formatDateTime(attempt.submittedAt)}</td>
                              <td className="px-3 py-3">{formatStatusLabel(attempt.status)}</td>
                              <td className="px-3 py-3">{formatMaybeMark(attempt.autoMark)}</td>
                              <td className="px-3 py-3">{formatMaybeMark(attempt.finalMark)}</td>
                              <td className="px-3 py-3">{attempt.feedbackAvailable ? 'Available' : 'Pending'}</td>
                              <td className="px-3 py-3">
                                <Link
                                  href={`/student/submissions/${attempt.submissionId}`}
                                  className="inline-flex rounded-full border border-stone-300 px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100"
                                >
                                  View details
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card title="Latest grading result">
                  <div className="space-y-3 text-sm text-stone-700">
                    <SummaryRow label="Grading status" value={assignment.latestResult.gradingStatus} />
                    <SummaryRow label="Automated mark" value={formatMaybeMark(assignment.latestResult.automatedMark)} />
                    <SummaryRow label="Final teacher mark" value={formatMaybeMark(assignment.latestResult.finalTeacherMark)} />
                    <SummaryRow label="Matched solution" value={assignment.latestResult.bestMatchedSolutionLabel} />
                    <SummaryRow
                      label="Confidence"
                      value={assignment.latestResult.confidenceScore !== null ? `${assignment.latestResult.confidenceScore}%` : 'Not available'}
                    />
                    <p className="rounded-2xl bg-stone-50 px-4 py-3 text-stone-700">
                      {assignment.latestResult.shortFeedbackSummary}
                    </p>
                  </div>
                </Card>

                <Card title="Feedback">
                  <div className="space-y-5">
                    {assignment.feedback.teacherFeedback ? (
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900">Teacher feedback</h3>
                        <p className="mt-2 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
                          {assignment.feedback.teacherFeedback}
                        </p>
                      </div>
                    ) : null}

                    <div>
                      <h3 className="text-sm font-semibold text-stone-900">Auto-generated summary</h3>
                      <p className="mt-2 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
                        {assignment.feedback.autoGeneratedFeedbackSummary}
                      </p>
                    </div>

                    <DetailBlock title="Strengths detected" items={assignment.feedback.strengthsDetected} emptyLabel="No strengths recorded yet." />
                    <DetailBlock title="Missing components" items={assignment.feedback.missingComponents} emptyLabel="No missing components reported." />
                    <DetailBlock title="Incorrect relationships" items={assignment.feedback.incorrectRelationships} emptyLabel="No relationship issues reported." />
                    <DetailBlock title="Naming issues" items={assignment.feedback.namingIssues} emptyLabel="No naming issues reported." />
                    <DetailBlock title="Suggestions for improvement" items={assignment.feedback.suggestions} />
                  </div>
                </Card>
              </div>
            </section>
          </div>
        ) : null}
      </div>
      {confirmMode && assignment && upload.file ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[2rem] border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-teal-700">Submission confirmation</p>
                <h2 className="mt-1 text-2xl font-semibold text-stone-950">
                  {confirmMode === 'submit'
                    ? 'Confirm final submission'
                    : 'Review your upload'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmMode(null)}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              {upload.previewUrl ? (
                <Image
                  src={upload.previewUrl}
                  alt="Submission preview"
                  width={1200}
                  height={900}
                  unoptimized
                  className="max-h-80 w-full rounded-2xl border border-stone-200 object-contain"
                />
              ) : (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-700">
                  {upload.file.name}
                </div>
              )}
              <div className="space-y-3 text-sm text-stone-700">
                <SummaryRow label="Assignment" value={assignment.title} />
                <SummaryRow label="File" value={upload.file.name} />
                <SummaryRow
                  label="Recorded time"
                  value={formatDateTime(submissionTimePreview)}
                />
                <SummaryRow
                  label="Due status"
                  value={assignment.isClosed ? 'Late / closed' : 'On time'}
                />
                {assignment.isClosed ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
                    This assignment is overdue or closed, so a new submission is not allowed.
                  </p>
                ) : null}
                {confirmMode === 'submit' ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                    Please confirm once more before sending this file as your official submission.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={confirmSubmission}
                    disabled={submitting || assignment.isClosed || graderEngineStatus !== 'available'}
                    className="rounded-full bg-teal-700 px-5 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    {submitting
                      ? 'Submitting...'
                      : confirmMode === 'submit'
                        ? 'Yes, submit now'
                        : 'Confirm submission'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmMode(null)}
                    className="rounded-full border border-stone-300 px-5 py-2.5 font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function GraderEngineUnavailableBanner({
  checking,
  onRetry,
}: {
  checking: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            {checking
              ? 'Checking grader engine availability...'
              : 'Grader Engine Unavailable, avoid submitting work'}
          </p>
          <p className="mt-1 text-amber-900">
            Assignment details are still available, but submission controls are paused until the grader responds.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-950 hover:bg-amber-100"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-stone-500">{label}</span>
      <span className="text-right font-medium text-stone-900">{value}</span>
    </div>
  );
}

function GradingProgressCard({
  progress,
}: {
  progress: GradingProgressState;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-950">
            {progress.active ? 'Grading in progress' : 'Grading update'}
          </p>
          <p className="mt-1 text-sm text-teal-800">{progress.message}</p>
        </div>
        <span className="text-sm font-semibold text-teal-900">
          {progress.percent}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-teal-700 transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  items,
  emptyLabel = 'No details available.',
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <p key={item} className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
              {item}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function getProgressMessage(attempt: number) {
  const messages = [
    'Submission received. Preparing the file for grading.',
    'Reading the diagram and matching it with the reference solution.',
    'The vision grader is analysing UML classes and relationships.',
    'Checking rubric criteria and calculating marks.',
    'Still grading. Large PNG submissions can take a little longer.',
  ];

  return messages[Math.min(attempt, messages.length - 1)];
}

function formatMaybeMark(value: number | null) {
  if (value === null) {
    return '-';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isFileAllowedForAssignment(
  file: File,
  mode: AssignmentDetail['submissionMode'],
) {
  if (mode === 'image') {
    return isImageFile(file);
  }

  if (mode === 'uxf') {
    return isUxfFile(file);
  }

  return isImageFile(file) || isUxfFile(file);
}

function isImageFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  );
}

function isUxfFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type === 'application/uxf' ||
    file.type === 'application/xml' ||
    file.type === 'text/xml' ||
    lowerName.endsWith('.uxf') ||
    lowerName.endsWith('.xml')
  );
}

function getAcceptedUploadError(mode: AssignmentDetail['submissionMode']) {
  if (mode === 'image') {
    return 'This assignment only accepts PNG or JPEG screenshots because the teacher reference solution is an image.';
  }

  if (mode === 'uxf') {
    return 'This assignment only accepts UMLet UXF/XML files because the teacher reference solution is UXF/XML.';
  }

  return 'Only UMLet UXF/XML, PNG, or JPEG files are supported.';
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read file.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

async function parseApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
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
