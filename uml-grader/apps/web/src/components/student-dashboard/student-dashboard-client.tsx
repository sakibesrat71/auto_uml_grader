'use client';

import { useSyncExternalStore } from 'react';
import { StudentDashboardShell } from './student-dashboard-shell';

export function StudentDashboardClient() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  return <StudentDashboardShell />;
}
