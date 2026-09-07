'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';

interface MeResponse {
  user?: {
    id?: string;
    email?: string;
    role?: string;
    fullName?: string;
  } | null;
}

interface QuickStatsResponse {
  totalAssignments: number;
  totalSubmissions: number;
  needsReview: number;
  ungradedOrProcessing: number;
}

interface AssignmentRow {
  assignmentId: string;
  title: string;
  dueDateLabel: string;
  solutionsUploaded: string;
  submissionsTotal: number;
  gradedCount: number;
  needsReviewCount: number;
  status: string;
  actions: string[];
}

interface ShortcutItem {
  key: string;
  label: string;
}

interface NeedsReviewItem {
  submissionId: string;
  studentName: string;
  assignmentName: string;
  flagReason: string;
  submittedAt: string;
  action: string;
}

interface ActivityItem {
  type: string;
  occurredAt: string;
  message: string;
}

export function TeacherDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse['user']>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');
  const [quickStats, setQuickStats] = useState<QuickStatsResponse | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);
  const [needsReviewQueue, setNeedsReviewQueue] = useState<NeedsReviewItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!meRes.ok) {
          throw new Error('Session invalid');
        }
        const meData: MeResponse = await meRes.json();
        const meUser = meData.user ?? null;
        setUser(meUser);

        if (!meUser?.role) {
          throw new Error('Session invalid');
        }

        if (meUser.role !== 'teacher') {
          router.replace(getDashboardPathForRole(meUser.role));
          return;
        }

        const [statsRes, assignmentsRes, shortcutsRes, queueRes, activityRes] =
          await Promise.all([
            fetch(`${API_BASE_URL}/teacher/dashboard/quick-stats`, {
              credentials: 'include',
            }),
            fetch(`${API_BASE_URL}/teacher/dashboard/assignments`, {
              credentials: 'include',
            }),
            fetch(`${API_BASE_URL}/teacher/dashboard/action-shortcuts`, {
              credentials: 'include',
            }),
            fetch(`${API_BASE_URL}/teacher/dashboard/needs-review-queue?limit=10`, {
              credentials: 'include',
            }),
            fetch(`${API_BASE_URL}/teacher/dashboard/recent-activity?limit=10`, {
              credentials: 'include',
            }),
          ]);

        const responses = [
          statsRes,
          assignmentsRes,
          shortcutsRes,
          queueRes,
          activityRes,
        ];
        if (responses.some((res) => !res.ok)) {
          throw new Error('Failed to load dashboard data');
        }

        const [statsData, assignmentsData, shortcutsData, queueData, activityData] =
          await Promise.all([
            statsRes.json(),
            assignmentsRes.json(),
            shortcutsRes.json(),
            queueRes.json(),
            activityRes.json(),
          ]);

        setQuickStats(statsData);
        setAssignments(assignmentsData);
        setShortcuts(shortcutsData);
        setNeedsReviewQueue(queueData);
        setRecentActivity(activityData);
      } catch {
        router.push('/login');
      } finally {
        setSessionLoading(false);
        setDataLoading(false);
      }
    }

    void loadDashboard();
  }, [router]);

  async function logout() {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Logout failed');
      }
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    }
  }

  function formatDateTime(dateInput?: string) {
    if (!dateInput) {
      return '-';
    }
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString();
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading your session...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-blue-900/30 bg-slate-900/70 p-6 backdrop-blur sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-blue-50">Teacher Dashboard</h1>
            <p className="mt-1 text-sm text-blue-200/90">
              {user?.fullName ?? 'Teacher'} ({user?.email ?? 'unknown'})
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/teacher/assignments/new"
              className="rounded-lg border border-cyan-300/20 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25"
            >
              Create Assignment
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-blue-300/30 bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Logout
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-blue-300">Total assignments</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {quickStats?.totalAssignments ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-blue-300">Total submissions</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {quickStats?.totalSubmissions ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-blue-300">Needs review</p>
            <p className="mt-3 text-3xl font-semibold text-amber-300">
              {quickStats?.needsReview ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-blue-300">Ungraded / processing</p>
            <p className="mt-3 text-3xl font-semibold text-cyan-300">
              {quickStats?.ungradedOrProcessing ?? 0}
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
              <div className="border-b border-slate-700 px-4 py-3">
                <h2 className="text-sm font-semibold text-blue-100">Assignments</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-blue-200">
                    <tr>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Due date</th>
                      <th className="px-4 py-3">Solutions</th>
                      <th className="px-4 py-3">Submissions</th>
                      <th className="px-4 py-3">Graded</th>
                      <th className="px-4 py-3">Needs review</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-blue-50">
                    {assignments.map((row) => (
                      <tr key={row.assignmentId} className="border-t border-slate-800">
                        <td className="px-4 py-3">
                          <Link
                            href={`/teacher/assignments/${row.assignmentId}`}
                            className="font-medium text-cyan-200 underline decoration-cyan-400/60 underline-offset-4 transition hover:text-cyan-100"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{row.dueDateLabel}</td>
                        <td className="px-4 py-3">{row.solutionsUploaded}</td>
                        <td className="px-4 py-3">{row.submissionsTotal}</td>
                        <td className="px-4 py-3">{row.gradedCount}</td>
                        <td className="px-4 py-3">{row.needsReviewCount}</td>
                        <td className="px-4 py-3">{row.status}</td>
                      </tr>
                    ))}
                    {!dataLoading && assignments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-blue-200" colSpan={7}>
                          No assignments yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <button
                type="button"
                onClick={() => setShowShortcuts((prev) => !prev)}
                className="w-full rounded-lg border border-blue-400/30 bg-blue-600/20 px-3 py-2 text-left text-sm font-semibold text-blue-100 hover:bg-blue-600/30"
              >
                Action Shortcuts
              </button>
              {showShortcuts ? (
                <div className="mt-3 grid gap-2">
                  {shortcuts.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === 'create-assignment') {
                          router.push('/teacher/assignments/new');
                        }
                      }}
                      className="rounded-lg border border-blue-400/20 bg-blue-600/20 px-3 py-2 text-left text-sm text-blue-100 hover:bg-blue-600/30"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-semibold text-blue-100">Needs Review Queue</h2>
              <div className="space-y-3">
                {needsReviewQueue.map((item) => (
                  <div
                    key={item.submissionId}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <p className="text-sm font-medium text-blue-50">{item.studentName}</p>
                    <p className="text-xs text-blue-200">{item.assignmentName}</p>
                    <p className="mt-1 text-xs text-amber-300">{item.flagReason}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      {formatDateTime(item.submittedAt)}
                    </p>
                  </div>
                ))}
                {!dataLoading && needsReviewQueue.length === 0 ? (
                  <p className="text-sm text-blue-200">No flagged submissions.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-blue-100">Recent Activity</h2>
          <div className="space-y-2">
            {recentActivity.map((item, index) => (
              <div
                key={`${item.type}-${index}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2"
              >
                <p className="text-sm text-blue-50">{item.message}</p>
                <p className="text-xs text-slate-300">{formatDateTime(item.occurredAt)}</p>
              </div>
            ))}
            {!dataLoading && recentActivity.length === 0 ? (
              <p className="text-sm text-blue-200">No recent activity yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
