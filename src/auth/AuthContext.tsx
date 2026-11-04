import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore, whenCustomerLost } from '../lib/api';
import type { Customer, MyCustomer, OpenedCustomer } from '../lib/customerApi';
import { accessApi, type Ability, type Access, type Feature } from '../lib/accessApi';
import { sessionApi, setSession, type SessionValues } from '../lib/sessionApi';

export interface User {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  /** light or dark; null follows the system. */
  theme_mode?: "light" | "dark" | null;
  /** The theme meta picked; null is the default theme. */
  theme_meta_id?: number | null;
  /** How big the app is: sm, md or lg; null is md. */
  ui_size?: "sm" | "md" | "lg" | null;
  /** Small choices; a missing key takes its default. form_saved_notice: "Saved" shows inside a form after saving (off by default; a toast says it anyway). */
  preferences?: { form_saved_notice?: boolean; chat_sound?: boolean } | null;
  /** The language picked; null follows the browser. */
  locale?: string | null;
  /** Sees every customer on the platform. */
  is_platform_owner?: boolean;
}

/** GET /user: the person, the customer this login works in (null: none picked yet) and all their customers. */
interface Me extends User {
  customer: Customer | null;
  customers: MyCustomer[];
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
  /** The user's roles and what they may do; for a guest, the public metas only. */
  access: Access | null;
  loading: boolean;
  /** The customer this login works in; null until one is picked (or made, or joined). */
  customer: Customer | null;
  /** All the person's customers. */
  customers: MyCustomer[];
  /** Works in the customer just made, joined or picked, with the token that came with it. */
  openCustomer: (opened: OpenedCustomer) => Promise<void>;
  /** Replaces the list, e.g. after leaving one. */
  setCustomers: (customers: MyCustomer[]) => void;
  login: (email: string, password: string) => Promise<void>;
  /** Signs in with the one-time code the backend hands back after Google sign-in. */
  loginWithGoogle: (code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Replaces the signed-in user after the profile is saved. */
  updateUser: (user: User) => void;
  /** Reloads access, e.g. after an admin changes their own roles. */
  refreshAccess: () => Promise<void>;
  isAdmin: boolean;
  /** Whether one of the user's roles gives this builder feature; an admin has them all. */
  hasFeature: (feature: Feature) => boolean;
  /** Whether the user may make metas: an admin or a builder. */
  isBuilder: boolean;
  /** Whether the user may change this meta: an admin, or the builder who made it. */
  designs: (meta: { created_by?: number | null } | null | undefined) => boolean;
  /** Whether the user (or guest) may do this with the meta. Metas without permission rows are for admins only, unless public. */
  can: (metaId: number | null | undefined, ability: Ability) => boolean;
  /** The user's custom session values (e.g. sessionemployeeid), worked out at login. */
  session: SessionValues;
  /** Works them out again on the server, e.g. after an admin changed their definitions. */
  refreshSession: () => Promise<void>;
}

/** The user's session values; a failure leaves none rather than blocking sign-in. */
const loadSession = () => sessionApi.mine().catch(() => ({}) as SessionValues);

/** A guest's access: the public metas only; a failure leaves none. */
const loadGuestAccess = () => accessApi.mine().catch(() => null);

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSessionState] = useState<SessionValues>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<MyCustomer[]>([]);

  // Kept in step for code outside React (default values, presets, form scripts).
  const keepSession = useCallback((u: User | null, values: SessionValues) => {
    setSession(u, values);
    setSessionState(values);
  }, []);

  // Who the token belongs to and which customer it works in; what they may do is that customer's,
  // so it is only asked for once there is one.
  const loadMe = useCallback(async () => {
    const { customer: current, customers: all, ...u } = await api<Me>('/user');
    const [a, values] = current ? await Promise.all([accessApi.mine(), loadSession()]) : [null, {} as SessionValues];
    keepSession(u, values);
    setCustomer(current);
    setCustomers(all);
    setAccess(a);
    setUser(u);
  }, [keepSession]);

  // On page load, if a token is stored, ask the API who it belongs to and what they may do.
  // Without one (or with a stale one) the visitor is a guest, who may use the public metas.
  useEffect(() => {
    const asGuest = () => loadGuestAccess().then(setAccess);
    if (!tokenStore.get()) {
      asGuest().finally(() => setLoading(false));
      return;
    }
    loadMe()
      .catch(() => {
        tokenStore.clear();
        return asGuest();
      })
      .finally(() => setLoading(false));
  }, []);

  // The login lost its customer on the way (taken out of it, or none picked): pick another.
  useEffect(() => {
    whenCustomerLost((all) => {
      setCustomer(null);
      setCustomers(all);
      setAccess(null);
    });
    return () => whenCustomerLost(null);
  }, []);

  // With one customer the token comes bound to it; with several, the person picks one next.
  const signIn = useCallback(async (res: AuthResponse) => {
    tokenStore.set(res.token);
    await loadMe();
  }, [loadMe]);

  const openCustomer = useCallback(async (opened: OpenedCustomer) => {
    tokenStore.set(opened.token);
    await loadMe();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      await signIn(await api<AuthResponse>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
    },
    [signIn],
  );

  const loginWithGoogle = useCallback(
    async (code: string) => {
      await signIn(await api<AuthResponse>('/auth/google/exchange', { method: 'POST', body: JSON.stringify({ code }) }));
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
      setCustomer(null);
      setCustomers([]);
      setAccess(await loadGuestAccess());
    }
  }, [keepSession]);

  const refreshSession = useCallback(async () => {
    keepSession(user, await sessionApi.refresh());
  }, [keepSession, user]);

  const refreshAccess = useCallback(async () => {
    setAccess(await accessApi.mine());
  }, []);

  const isAdmin = !!access?.is_admin;
  const hasFeature = useCallback((feature: Feature) => isAdmin || !!access?.features?.includes(feature), [access, isAdmin]);
  const isBuilder = isAdmin || !!access?.features?.length;
  const designs = useCallback(
    (meta: { created_by?: number | null } | null | undefined) => isAdmin || (isBuilder && !!meta && meta.created_by === user?.id),
    [isAdmin, isBuilder, user],
  );
  const can = useCallback(
    (metaId: number | null | undefined, ability: Ability) => {
      if (isAdmin || !metaId) return true;
      return !!access?.metas[String(metaId)]?.[ability];
    },
    [access, isAdmin],
  );

  return (
    <AuthContext.Provider value={{ user, access, loading, customer, customers, openCustomer, setCustomers, login, loginWithGoogle, register, logout, updateUser: setUser, refreshAccess, isAdmin, hasFeature, isBuilder, designs, can, session, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
