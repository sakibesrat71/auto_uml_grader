'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getDashboardPathForRole } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: selectedRole }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? 'Login failed');
      }
      if (data?.user?.role !== selectedRole) {
        throw new Error(
          `This account is not a ${selectedRole}. Please switch to the ${data?.user?.role ?? 'correct'} login.`,
        );
      }
      setMessage(`Welcome ${data?.user?.fullName ?? 'user'}!`);
      router.push(getDashboardPathForRole(data?.user?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_25%),linear-gradient(135deg,_#0f172a,_#082f49_48%,_#164e63)] px-6 py-12">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/12 bg-white/10 p-4 shadow-2xl backdrop-blur sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[1.75rem] bg-slate-950/55 p-8 text-white">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-200">
              Welcome Back
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Sign in to your {selectedRole} workspace.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Choose a role to tailor the login flow. The backend still verifies the actual
              account role and sends you to the correct protected dashboard.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Current mode
              </p>
              <p className="mt-3 text-lg font-medium text-white">
                {selectedRole === 'student'
                  ? 'Student login for coursework and submissions'
                  : 'Teacher login for review queues and grading activity'}
              </p>
            </div>
          </section>

          <section className="rounded-[1.75rem] bg-white p-8 shadow-xl">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
              {(['student', 'teacher'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setSelectedRole(role);
                    setError('');
                    setMessage('');
                  }}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold capitalize transition',
                    selectedRole === role
                      ? 'bg-slate-950 text-white shadow'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {role}
                </button>
              ))}
            </div>

            <div
              className={cn(
                'mt-6 transition duration-300',
                selectedRole === 'student'
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-100',
              )}
            >
              <h2 className="text-2xl font-bold text-slate-950">Login</h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedRole === 'student'
                  ? 'Use your student account to view assignments, submissions, and grades.'
                  : 'Use your teacher account to access the review queue and dashboard.'}
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={
              selectedRole === 'student'
                ? 'you@example.com'
                : 'you@school.edu.au'
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-cyan-400"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading
              ? 'Logging in...'
              : `Login as ${selectedRole.charAt(0).toUpperCase()}${selectedRole.slice(1)}`}
          </button>
        </form>
            {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
            <p className="mt-6 text-sm text-slate-700">
              Need an account?{' '}
              <Link href="/signup" className="font-semibold underline">
                Sign up
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
