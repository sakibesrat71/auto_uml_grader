'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/student-dashboard/status-badge';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';
import type { SubmissionDetail } from '@/lib/student-dashboard';
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

export default function StudentSubmissionPage() {
  const router = useRouter();
  const params = useParams<{ submissionId: string }>();
  const submissionId = params.submissionId;
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');

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

      const detailRes = await fetch(`${API_BASE_URL}/student/submissions/${submissionId}`, {
        credentials: 'include',
      });
      if (!detailRes.ok) {
        const data = await detailRes.json().catch(() => null);
        throw new Error(data?.message ?? 'Failed to load submission.');
      }

      const detailData = await detailRes.json();
      setSubmission(detailData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submission.');
    } finally {
      setLoading(false);
    }
  }, [router, submissionId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fafaf9,_#f0fdf4)] px-5 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/student/dashboard"
          className="text-sm font-semibold text-stone-700 underline underline-offset-4"
        >
          Back to dashboard
        </Link>

        {loading ? (
          <section className="mt-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            Loading submission...
          </section>
        ) : null}

        {error ? (
          <section className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 shadow-sm">
            {error}
          </section>
        ) : null}

        {submission ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-emerald-700">Submission detail</p>
                  <h1 className="mt-2 text-3xl font-semibold text-stone-950">
                    {submission.assignment?.title ?? 'Submission'}
                  </h1>
                </div>
                <StatusBadge status={submission.status} />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MetricCard label="Submitted" value={formatDateTime(submission.submittedAt)} />
                <MetricCard
                  label="File"
                  value={submission.originalFileName}
                  subvalue={`${submission.mimeType} - ${formatFileSize(submission.fileSizeBytes)}`}
                />
                <MetricCard label="Status" value={formatStatusLabel(submission.status)} />
              </div>

              {submission.extractionError ? (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  {submission.extractionError}
                </div>
              ) : null}

              <div className="mt-6 rounded-3xl border border-stone-200 p-4">
                {submission.mimeType.startsWith('image/') ? (
                  <Image
                    src={submission.imageUrl}
                    alt="Uploaded UML diagram"
                    width={1400}
                    height={1000}
                    unoptimized
                    className="max-h-[32rem] w-full rounded-2xl object-contain"
                  />
                ) : (
                  <div className="rounded-2xl bg-stone-50 px-4 py-5 text-sm text-stone-700">
                    UXF/XML file submitted. Preview is not available, but the grader parsed this file for classes, members, and relationships.
                  </div>
                )}
              </div>

              {submission.status === 'failed' && submission.assignment ? (
                <Link
                  href={`/student/assignments/${submission.assignment.assignmentId}`}
                  className="mt-5 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  Resubmit UML
                </Link>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-stone-950">Grade and feedback</h2>

              {!submission.grade ? (
                <p className="mt-4 rounded-2xl bg-stone-50 px-4 py-5 text-sm text-stone-600">
                  Grade not available yet.
                </p>
              ) : (
                <div className="mt-4 space-y-5">
                  <div className="rounded-3xl bg-emerald-50 p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">
                      Score
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-emerald-900">
                      {submission.grade.teacherFinalScore ?? submission.grade.score}/
                      {submission.grade.maxScore}
                    </p>
                    <p className="mt-1 text-sm text-emerald-800">
                      {submission.grade.percentage}% - Updated {formatDateTime(submission.grade.updatedAt)}
                    </p>
                    {submission.grade.teacherFinalScore !== null ? (
                      <p className="mt-2 text-sm text-emerald-900">
                        Teacher-adjusted final score applied.
                      </p>
                    ) : null}
                    {submission.grade.chosenSolutionLabel ? (
                      <p className="mt-2 text-sm text-emerald-900">
                        Best matched reference: {submission.grade.chosenSolutionLabel}
                      </p>
                    ) : null}
                    {submission.grade.confidenceScore !== null ? (
                      <p className="mt-2 text-sm text-emerald-900">
                        Confidence: {submission.grade.confidenceScore}%
                      </p>
                    ) : null}
                  </div>

                  {submission.grade.teacherComment ? (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Teacher comment
                      </h3>
                      <p className="mt-3 rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-700">
                        {submission.grade.teacherComment}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Rubric breakdown
                    </h3>
                    <div className="mt-3 space-y-3">
                      {submission.grade.breakdown.length === 0 ? (
                        <p className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
                          No rubric breakdown available.
                        </p>
                      ) : (
                        submission.grade.breakdown.map((item) => (
                          <div
                            key={`${item.criterionKey}-${item.label}`}
                            className="rounded-2xl border border-stone-200 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-stone-950">{item.label}</p>
                              <p className="text-sm font-semibold text-stone-700">
                                {item.awardedMarks}/{item.maxMarks}
                              </p>
                            </div>
                            {item.reason ? (
                              <p className="mt-2 text-sm text-stone-600">{item.reason}</p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Discrepancies
                    </h3>
                    <div className="mt-3 space-y-3">
                      {submission.grade.discrepancies.length === 0 ? (
                        <p className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
                          No discrepancies recorded.
                        </p>
                      ) : (
                        submission.grade.discrepancies.map((item, index) => (
                          <div
                            key={`${item.category}-${index}`}
                            className="rounded-2xl border border-stone-200 p-4"
                          >
                            <p className="text-sm font-semibold text-stone-900">
                              {item.category} - {item.severity}
                            </p>
                            <p className="mt-2 text-sm text-stone-600">{item.message}</p>
                            {item.expected ? (
                              <p className="mt-2 text-xs text-stone-500">
                                Expected: {item.expected}
                              </p>
                            ) : null}
                            {item.actual ? (
                              <p className="mt-1 text-xs text-stone-500">Actual: {item.actual}</p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Flags
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submission.grade.flags.length === 0 ? (
                        <p className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
                          No flags raised.
                        </p>
                      ) : (
                        submission.grade.flags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full bg-amber-100 px-3 py-1.5 text-sm text-amber-900"
                          >
                            {flag}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
      {subvalue ? <p className="mt-1 text-xs text-stone-500">{subvalue}</p> : null}
    </div>
  );
}
