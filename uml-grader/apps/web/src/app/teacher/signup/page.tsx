'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

export default function TeacherSignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 text-white">
          Loading teacher signup...
        </main>
      }
    >
      <TeacherSignupContent />
    </Suspense>
  );
}

function TeacherSignupContent() {
  const params = useSearchParams();
  const initialToken = useMemo(() => params.get('token') ?? '', [params]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
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
      const res = await fetch(`${API_BASE_URL}/auth/teacher/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? 'Failed to create teacher account');
      }

      setMessage(data?.message ?? 'Teacher account created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-blue-900">Teacher Signup</h1>
        <p className="mt-1 text-sm text-blue-700">
          Set your password to activate your teacher account.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Invitation token"
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Teacher Account'}
          </button>
        </form>

        {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <p className="mt-5 text-sm text-blue-800">
          Go to{' '}
          <Link href="/login" className="font-semibold underline">
            login
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
