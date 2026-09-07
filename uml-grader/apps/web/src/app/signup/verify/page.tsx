'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';

export default function VerifySignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-900 via-blue-700 to-blue-500 text-white">
          Loading verification...
        </main>
      }
    >
      <VerifySignupContent />
    </Suspense>
  );
}

function VerifySignupContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialEmail = useMemo(() => params.get('email') ?? '', [params]);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? 'Verification failed');
      }
      setMessage(data.message ?? 'Signup completed.');
      router.push(getDashboardPathForRole(data?.user?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-900 via-blue-700 to-blue-500 px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-blue-900">Verify Signup</h1>
        <p className="mt-1 text-sm text-blue-700">Enter the OTP sent to your email.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6-digit OTP"
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>
        {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        <p className="mt-5 text-sm text-blue-800">
          Done verifying?{' '}
          <Link href="/login" className="font-semibold underline">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
