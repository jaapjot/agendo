import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageSpinner } from '../components/ui/Spinner';
import type { Role } from '../lib/types';
import { useAuth } from './AuthContext';

/**
 * Route guard. This is a UX convenience only: real authorization happens on the server,
 * which checks the token and role on every request.
 */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'PROFESSIONAL' ? '/dashboard' : '/mis-turnos'} replace />;
  }
  return children;
}
