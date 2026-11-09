import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building07 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { returnPath } from '../auth/routes';
import { LogoMark } from '../components/AppShell';
import { Alert } from '../components/ui';
import { ApiError } from '../lib/api';
import { customerApi } from '../lib/customerApi';
import { mobileApi, mobileCustomerCode, type MobileApp } from '../lib/mobileApi';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { t } from '@/i18n';

/** The phone app's name and colour, for the screens before signing in; null while it loads or if it can't. */
function useMobileApp(appId: number): MobileApp | null {
  const [app, setApp] = useState<MobileApp | null>(null);
  useEffect(() => {
    mobileApi.show(appId).then(setApp, () => setApp(null));
  }, [appId]);
  return app;
}

/** The frame of the signed-out screens: the app's name over its own colour, the content below. */
function SignInFrame({ app, children }: { app: MobileApp | null; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-primary">
      <header
        className="flex flex-col gap-3 bg-brand-solid px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-8 text-white"
        style={app?.color ? { backgroundColor: app.color } : undefined}
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-white">
          <LogoMark size={28} />
        </span>
        <h1 className="text-display-xs font-semibold">{app?.name ?? t('Wand Studio')}</h1>
        {app?.description && <p className="text-sm text-white/80">{app.description}</p>}
      </header>
      <main className="flex-1 px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+2rem)]">{children}</main>
    </div>
  );
}

/** Email and password; Google sign-in needs the system browser and comes with the Android build. */
export function MobileLogin({ appId }: { appId: number }) {
  const app = useMobileApp(appId);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(returnPath(), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SignInFrame app={app}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold text-primary">{t('Log in')}</h2>
        {error && <Alert>{error}</Alert>}
        <Input label={t('Email')} type="email" autoComplete="email" isRequired hideRequiredIndicator value={email} onChange={setEmail} placeholder={t('you@company.com')} />
        <Input label={t('Password')} type="password" autoComplete="current-password" isRequired hideRequiredIndicator value={password} onChange={setPassword} placeholder="••••••••" />
        <Button type="submit" size="lg" isLoading={submitting} showTextWhileLoading className="mt-1 w-full">
          {submitting ? t('Logging in…') : t('Log in')}
        </Button>
      </form>
    </SignInFrame>
  );
}

/**
 * After signing in without a customer open: a built phone app opens its own customer by itself;
 * otherwise (several customers, a browser preview) the person picks. Making or joining one is the web app's.
 */
export function MobilePick({ appId }: { appId: number }) {
  const app = useMobileApp(appId);
  const { customer, customers, openCustomer, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wanted = mobileCustomerCode();
  const own = wanted ? customers.find((c) => c.code === wanted) : undefined;

  async function open(id: number) {
    setBusy(id);
    setError(null);
    try {
      await openCustomer(await customerApi.open(id));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
      setBusy(null);
    }
  }

  // Signing in may open another of the person's customers: a built app moves to its own.
  const settled = !!customer && (!wanted || customer.code === wanted);
  useEffect(() => {
    if (settled) navigate('/', { replace: true });
    else if (own) void open(own.id);
  }, [settled, own?.id]);

  const outsider = !!wanted && !own;
  return (
    <SignInFrame app={app}>
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {outsider ? (
          <p className="text-sm text-tertiary">{t('Your account is not in {name} yet. Ask its admin for an invite, then log in again.', { name: app?.customer?.name ?? t('this company') })}</p>
        ) : own ? (
          <p className="text-sm text-tertiary">{t('Opening…')}</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-primary">{t('Pick a company')}</h2>
            <ul className="flex flex-col gap-2">
              {customers.map((c) => (
                <li key={c.id}>
                  <Button color="secondary" size="lg" iconLeading={Building07} isLoading={busy === c.id} isDisabled={busy !== null} onClick={() => open(c.id)} className="w-full justify-start">
                    {c.name}
                  </Button>
                </li>
              ))}
            </ul>
            {!customers.length && <p className="text-sm text-tertiary">{t('Your account is not in any company yet. Ask an admin for an invite.')}</p>}
          </>
        )}
        <Button color="link-gray" onClick={() => void logout().then(() => navigate('/login', { replace: true }))} className="self-start">
          {t('Log out')}
        </Button>
      </div>
    </SignInFrame>
  );
}
