import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  onSessionExpired,
  refreshSession,
  setAccessToken,
  type SessionResponse,
} from '../lib/api';
import { queryClient } from '../lib/query-client';
import type { Role, User } from '../lib/types';

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: Role;
  businessName?: string;
}

interface AuthContextValue {
  user: User | null;
  /** True until we know whether there is a session (avoids flashing the login page). */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
  /** Re-reads the user (e.g. after renaming the business). */
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      queryClient.clear();
    });
    refreshSession()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  const startSession = useCallback((session: SessionResponse) => {
    setAccessToken(session.accessToken);
    queryClient.clear(); // never show cached data from a previous account
    setUser(session.user);
    return session.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      startSession(await api.post<SessionResponse>('/auth/login', { email, password })),
    [startSession],
  );

  const register = useCallback(
    async (data: RegisterData) =>
      startSession(await api.post<SessionResponse>('/auth/register', data)),
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      queryClient.clear();
      setUser(null);
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const data = await api.get<{ user: User }>('/auth/me');
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, reloadUser }),
    [user, isLoading, login, register, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
