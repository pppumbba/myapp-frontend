import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';
import { accessApi, type Ability, type Access } from '../lib/accessApi';

export interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

interface AuthState {
  user: User | null;
  /** The user's roles and what they may do; null until signed in. */
  access: Access | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Replaces the signed-in user after the profile is saved. */
  updateUser: (user: User) => void;
  /** Reloads access, e.g. after an admin changes their own roles. */
  refreshAccess: () => Promise<void>;
  isAdmin: boolean;
  /** Whether the user may do this with the meta. Metas without permission rows are open. */
  can: (metaId: number | null | undefined, ability: Ability) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);

  // On page load, if a token is stored, ask the API who it belongs to and what they may do.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    Promise.all([api<User>('/user'), accessApi.mine()])
      .then(([u, a]) => {
        setUser(u);
        setAccess(a);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (res: AuthResponse) => {
    tokenStore.set(res.token);
    setAccess(await accessApi.mine());
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      await signIn(await api<AuthResponse>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
    },
    [signIn],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await signIn(await api<AuthResponse>('/register', { method: 'POST', body: JSON.stringify(input) }));
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      tokenStore.clear();
      setUser(null);
      setAccess(null);
    }
  }, []);

  const refreshAccess = useCallback(async () => {
    setAccess(await accessApi.mine());
  }, []);

  const isAdmin = !!access?.is_admin;
  const can = useCallback(
    (metaId: number | null | undefined, ability: Ability) => {
      if (isAdmin || !metaId) return true;
      const rules = access?.metas[String(metaId)];
      return !rules || rules[ability];
    },
    [access, isAdmin],
  );

  return (
    <AuthContext.Provider value={{ user, access, loading, login, register, logout, updateUser: setUser, refreshAccess, isAdmin, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
