import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';
import { accessApi, type Ability, type Access } from '../lib/accessApi';
import { sessionApi, setSession, type SessionValues } from '../lib/sessionApi';

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
  /** The user's custom session values (e.g. sessionemployeeid), worked out at login. */
  session: SessionValues;
  /** Works them out again on the server, e.g. after an admin changed their definitions. */
  refreshSession: () => Promise<void>;
}

/** The user's session values; a failure leaves none rather than blocking sign-in. */
const loadSession = () => sessionApi.mine().catch(() => ({}) as SessionValues);

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSessionState] = useState<SessionValues>({});

  // Kept in step for code outside React (default values, presets, form scripts).
  const keepSession = useCallback((u: User | null, values: SessionValues) => {
    setSession(u, values);
    setSessionState(values);
  }, []);

  // On page load, if a token is stored, ask the API who it belongs to and what they may do.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    Promise.all([api<User>('/user'), accessApi.mine(), loadSession()])
      .then(([u, a, values]) => {
        keepSession(u, values);
        setUser(u);
        setAccess(a);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (res: AuthResponse) => {
    tokenStore.set(res.token);
    const [a, values] = await Promise.all([accessApi.mine(), loadSession()]);
    setAccess(a);
    keepSession(res.user, values);
    setUser(res.user);
  }, [keepSession]);

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
      keepSession(null, {});
      setUser(null);
      setAccess(null);
    }
  }, [keepSession]);

  const refreshSession = useCallback(async () => {
    keepSession(user, await sessionApi.refresh());
  }, [keepSession, user]);

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
    <AuthContext.Provider value={{ user, access, loading, login, register, logout, updateUser: setUser, refreshAccess, isAdmin, can, session, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
