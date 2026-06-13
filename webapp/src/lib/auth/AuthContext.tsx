'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, getMe } from '../api/auth';
import { ApiError, getAuthToken, setAuthToken } from '../api/client';
import type { AccountUser } from '../types';

const TOKEN_KEY = 'rm_token';

export interface AuthState {
  user: AccountUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage may be unavailable (private mode etc.); ignore.
  }
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Token state starts null on BOTH the server render and the hydration
  // render so the markup agrees; the stored token is picked up in the mount
  // effect below. Authed requests are all fired from effects gated on
  // `token`/`authed`, so nothing races the seed.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const applyToken = useCallback((next: string | null) => {
    setAuthToken(next);
    persistToken(next);
    setToken(next);
  }, []);

  const logout = useCallback(() => {
    applyToken(null);
    setUser(null);
    setError(null);
    setLoading(false);
  }, [applyToken]);

  const refreshMe = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const me = await getMe();
      setUser({
        id: me.id,
        email: me.email,
        premium: me.premium,
        admin: me.admin === true,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
      throw err;
    }
  }, [logout]);

  // On mount: pick up the stored token and hydrate the user from
  // /account/me. The `cancelled` cleanup below is the correct StrictMode-safe
  // pattern (a ref guard would survive the unmount/remount and wedge
  // hydration in dev).
  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    setAuthToken(stored);
    setToken(stored);

    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUser({
            id: me.id,
            email: me.email,
            premium: me.premium,
            admin: me.admin === true,
          });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // logout is stable for the lifetime of this provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiLogin(email, password);
        applyToken(res.token);
        setUser(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyToken],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiRegister(email, password);
        applyToken(res.token);
        setUser(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyToken],
  );

  const value: AuthState = {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    refreshMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
