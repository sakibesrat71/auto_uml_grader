'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';
import type {
  RecentGradeItem,
  StudentAssignmentSummary,
  StudentSummary,
} from '@/lib/student-dashboard';
import { formatDateTime } from '@/lib/student-dashboard';
import { AlertBanner } from './alert-banner';
import { AssignmentRow } from './assignment-row';
import { MiniStatCard } from './mini-stat-card';
import { NextDueCard } from './next-due-card';

const DISMISSED_ALERTS_STORAGE_KEY = 'uml-grader-dismissed-student-alerts';

interface MeResponse {
  user?: {
    id?: string;
    email?: string;
    role?: string;
    fullName?: string;
  } | null;
}

export function StudentDashboardShell() {
  const router = useRouter();
  const [userName, setUserName] = useState('Student');
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[]>([]);
  const [recentGrades, setRecentGrades] = useState<RecentGradeItem[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
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
      if (!role) {
        throw new Error('Session invalid');
      }

      if (role !== 'student') {
        router.replace(getDashboardPathForRole(role));
        return;
      }

      setUserName(meData.user?.fullName ?? 'Student');

      const [summaryRes, assignmentsRes, recentGradesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/student/dashboard/summary`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/student/assignments`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/student/grades/recent?limit=5`, {
          credentials: 'include',
        }),
      ]);

      if (!summaryRes.ok || !assignmentsRes.ok || !recentGradesRes.ok) {
        throw new Error('Failed to load the student dashboard.');
      }

      const [summaryData, assignmentsData, recentGradesData] = await Promise.all([
        summaryRes.json(),
        assignmentsRes.json(),
        recentGradesRes.json(),
      ]);

      setSummary(summaryData);
      setAssignments(assignmentsData);
      setRecentGrades(recentGradesData);
    } catch {
      setError('We could not load the student dashboard right now.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(
      DISMISSED_ALERTS_STORAGE_KEY,
    );
    if (!storedValue) {
      return;
    }

    try {
      const parsedValue = JSON.parse(storedValue);
      if (
        Array.isArray(parsedValue) &&
        parsedValue.every((item) => typeof item === 'string')
      ) {
        setDismissedAlertIds(parsedValue);
      }
    } catch {
      window.localStorage.removeItem(DISMISSED_ALERTS_STORAGE_KEY);
    }
  }, []);

  const visibleAlerts =
    summary?.alerts.filter((alert) => !dismissedAlertIds.includes(alert.id)) ??
    [];

  async function logout() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/login');
  }

  function dismissAlert(alertId: string) {
    setDismissedAlertIds((current) => {
      const next = [...new Set([...current, alertId])];
      window.localStorage.setItem(
        DISMISSED_ALERTS_STORAGE_KEY,
        JSON.stringify(next),
      );
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_32%),linear-gradient(180deg,_#fffaf0,_#f5f5f4_52%,_#f0fdfa)] px-5 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-stone-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Student workspace</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950">
                Dashboard
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                Welcome back, {userName}. Here&apos;s what needs attention next.
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100"
            >
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <section className="mt-6 rounded-[2rem] border border-rose-200 bg-rose-50 p-6 shadow-sm">
            <p className="text-sm text-rose-900">{error}</p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-4 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
            >
              Retry
            </button>
          </section>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <NextDueCard assignment={summary?.nextDueAssignment ?? null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MiniStatCard label="Assignments available" value={summary?.assignmentCount ?? 0} />
            <MiniStatCard label="Submitted" value={summary?.submittedCount ?? 0} tone="accent" />
            <MiniStatCard label="Graded" value={summary?.gradedCount ?? 0} />
            <MiniStatCard
              label="Needs action"
              value={summary?.needsActionCount ?? 0}
              tone="warning"
            />
          </div>
        </section>

        <section className="mt-6">
          <div className="space-y-3">
            {visibleAlerts.map((alert) => (
              <AlertBanner
                key={alert.id}
                alert={alert}
                onDismiss={dismissAlert}
              />
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <article className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-stone-950">Assignments</h2>
              <p className="mt-1 text-sm text-stone-600">
                Prioritized by due date and assignments that need action.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Assignment</th>
                    <th className="px-4 py-3">Due date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && assignments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                        No assignments yet.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((assignment) => (
                      <AssignmentRow
                        key={assignment.assignmentId}
                        assignment={assignment}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-950">Recent Grades</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Your latest released grading results.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!loading && recentGrades.length === 0 ? (
                <p className="rounded-2xl bg-stone-50 px-4 py-6 text-sm text-stone-500">
                  No grades released yet.
                </p>
              ) : (
                recentGrades.map((grade) => (
                  <Link
                    key={grade.gradeId}
                    href={`/student/submissions/${grade.submissionId}`}
                    className="block rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 transition hover:bg-stone-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-950">{grade.title}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          Updated {formatDateTime(grade.updatedAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
                        {grade.score}/{grade.maxScore}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-stone-800">
                      View feedback
                    </p>
                  </Link>
                ))
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
