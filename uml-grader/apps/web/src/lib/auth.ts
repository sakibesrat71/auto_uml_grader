export type AppUserRole = 'student' | 'teacher' | 'superadmin';

export function getDashboardPathForRole(role?: string | null) {
  if (role === 'teacher') {
    return '/teacher/dashboard';
  }

  if (role === 'student') {
    return '/student/dashboard';
  }

  return '/login';
}

export function getDefaultProtectedPath() {
  return '/student/dashboard';
}
