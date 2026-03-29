import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authApi, type AuthUser } from '../api/authApi';
import { setAccessToken, setUnauthorizedHandler } from '../api/httpClient';

export type AuthView = 'loading' | 'login' | 'register' | 'app';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  view: AuthView;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  showRegister: () => void;
  showLogin: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<AuthView>('loading');
  const bootstrapped = useRef(false);

  const signOut = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setView('login');
  }, []);

  // Bootstrap: try to restore session via httpOnly cookie refresh
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    setUnauthorizedHandler(signOut);

    async function bootstrap() {
      try {
        const refreshData = await authApi.refresh();
        setAccessToken(refreshData.accessToken);
        const meData = await authApi.me(refreshData.accessToken);
        setUser({ id: meData.id, email: meData.email, fullName: meData.fullName, role: meData.role });
        setView('app');
      } catch {
        // No valid session — show login
        setView('login');
      } finally {
        setIsLoading(false);
      }
    }

    bootstrap();
  }, [signOut]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setView('app');
  }, []);

  const register = useCallback(async (email: string, password: string, fullName?: string) => {
    await authApi.register({ email, password, fullName });
    // After register, log the user in automatically
    const data = await authApi.login({ email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setView('app');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      signOut();
    }
  }, [signOut]);

  const showRegister = useCallback(() => setView('register'), []);
  const showLogin = useCallback(() => setView('login'), []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    view,
    login,
    register,
    logout,
    showRegister,
    showLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
