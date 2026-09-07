'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirectToRoleDashboard() {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
        });

        if (!res.ok) {
          router.replace('/login');
          return;
        }

        const data = await res.json();
        router.replace(getDashboardPathForRole(data?.user?.role));
      } catch {
        router.replace('/login');
      }
    }

    void redirectToRoleDashboard();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 text-white">
      Redirecting to your dashboard...
    </main>
  );
}
