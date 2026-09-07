'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function SignupPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (selectedRole === 'student') {
        const res = await fetch(`${API_BASE_URL}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          credentials: 'include',
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message ?? 'Signup failed');
        }

        setMessage(data.message ?? 'OTP sent.');
        router.push(`/signup/verify?email=${encodeURIComponent(email)}`);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/auth/teacher/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? 'Teacher signup failed');
      }

      setMessage(data?.message ?? 'Teacher account created.');
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(45,212,191,0.22),_transparent_26%),linear-gradient(135deg,_#0f172a,_#164e63_52%,_#083344)] px-6 py-12">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/12 bg-white/10 p-4 shadow-2xl backdrop-blur sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[1.75rem] bg-slate-950/55 p-8 text-white">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-teal-200">
              Create Access
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Set up your {selectedRole} account.
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Students sign up with OTP verification. Teachers activate access with an invite
              token and then head straight to login.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                Flow
              </p>
              <p className="mt-3 text-lg font-medium text-white">
                {selectedRole === 'student'
                  ? 'Student signup sends an OTP to the Adelaide student email.'
                  : 'Teacher signup activates an invited account with a token and password.'}
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
                    setMessage('');
                    setError('');
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

            <div className="mt-6 transition duration-300">
              <h2 className="text-2xl font-bold text-slate-950">
                {selectedRole === 'student' ? 'Student signup' : 'Teacher activation'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedRole === 'student'
                  ? 'Use any valid email address.'
                  : 'Paste the teacher invite token you received and set your password.'}
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {selectedRole === 'teacher' ? (
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Invitation token"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-teal-400"
                />
              ) : null}
          <input
            type="email"
            required={selectedRole === 'student'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={
              selectedRole === 'student'
                ? 'you@example.com'
                : 'Teacher email (optional display reference)'
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-teal-400"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-teal-400"
          />
              {selectedRole === 'teacher' ? (
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-teal-400"
                />
              ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading
              ? selectedRole === 'student'
                ? 'Sending OTP...'
                : 'Activating teacher account...'
              : selectedRole === 'student'
                ? 'Sign Up as Student'
                : 'Activate Teacher Account'}
          </button>
        </form>
            {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
            <p className="mt-6 text-sm text-slate-700">
              Already set up?{' '}
              <Link href="/login" className="font-semibold underline">
                Login
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
