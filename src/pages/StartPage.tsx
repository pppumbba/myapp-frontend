import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building07 } from '@untitledui/icons';
import { useAuth } from '../auth/AuthContext';
import { returnPath } from '../auth/routes';
import { ApiError } from '../lib/api';
import { customerApi, type OpenedCustomer } from '../lib/customerApi';
import { clearRenderCache } from '../render/definitions';
import { Alert } from '../components/ui';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { AuthLayout } from './AuthLayout';
import { t } from '@/i18n';

type Mode = 'new' | 'join';

/**
 * /start — after signing up or in without a customer to work in: pick one of the person's
 * customers, make a new (empty) one as its admin, or join one with an invite code an admin gave.
 * Also reached from the account menu and the profile, to make or join another.
 */
export default function StartPage() {
  const { user, customer, customers, openCustomer, logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(customers.length ? 'join' : 'new');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);

  async function open(key: string, load: () => Promise<OpenedCustomer>) {
    setError(null);
    setFieldError(undefined);
    setBusy(key);
    try {
      await openCustomer(await load());
      // Another customer's metas: nothing kept from the last one may show.
      clearRenderCache();
      navigate(customer ? '/' : returnPath(), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const first = err.errors && Object.values(err.errors)[0]?.[0];
        if (first) setFieldError(first);
        else setError(err.message);
      } else {
        setError(t('Something went wrong. Try again.'));
      }
      setBusy(null);
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    void open('new', () => customerApi.create(name.trim()));
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    void open('join', () => customerApi.join(code.trim()));
  }

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const others = customers.filter((c) => c.id !== customer?.id);

  return (
    <AuthLayout
      title={others.length && !customer ? t('Pick a customer') : t('Your customer')}
      subtitle={t('Each customer has its own apps, people and data. Make one for your company, or join one with the code its admin gave you.')}
    >
      <div className="flex flex-col gap-6">
        {error && <Alert>{error}</Alert>}

        {others.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('Your customers')}>
            {others.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => open(`c${c.id}`, () => customerApi.open(c.id))}
                  className="flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Building07 className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{c.name}</span>
                  {c.is_admin && (
                    <Badge type="pill-color" size="sm" color="brand">
                      {t('Admin')}
                    </Badge>
                  )}
                  <ArrowRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div role="tablist" aria-label={t('Make or join a customer')} className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {(['new', 'join'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setFieldError(undefined);
              }}
              className={`rounded-md px-3 py-2 text-sm font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 ${mode === m ? 'bg-primary text-primary shadow-xs' : 'text-tertiary hover:text-secondary'}`}
            >
              {m === 'new' ? t('New customer') : t('Join with a code')}
            </button>
          ))}
        </div>

        {mode === 'new' ? (
          <form onSubmit={onCreate} className="flex flex-col gap-5">
            <Input
              label={t('Company name')}
              isRequired
              hideRequiredIndicator
              autoComplete="organization"
              value={name}
              onChange={setName}
              isInvalid={!!fieldError}
              hint={fieldError ?? t('You become its admin. It starts empty: you make its apps, roles and invite codes.')}
            />
            <Button type="submit" size="lg" isLoading={busy === 'new'} isDisabled={!!busy && busy !== 'new'}>
              {t('Make the customer')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onJoin} className="flex flex-col gap-5">
            <Input
              label={t('Invite code')}
              isRequired
              hideRequiredIndicator
              autoComplete="off"
              value={code}
              onChange={setCode}
              placeholder="ABCD-2345"
              isInvalid={!!fieldError}
              hint={fieldError ?? t('Ask an admin of the customer for one. It gives you the roles they picked.')}
            />
            <Button type="submit" size="lg" isLoading={busy === 'join'} isDisabled={!!busy && busy !== 'join'}>
              {t('Join')}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-tertiary">
          {customer ? (
            <Button color="link-gray" size="sm" onPress={() => navigate(-1)}>
              {t('Back')}
            </Button>
          ) : (
            <>
              {t('Signed in as {email}.', { email: user?.email ?? '' })}{' '}
              <Button color="link-color" size="sm" onPress={onLogout}>
                {t('Log out')}
              </Button>
            </>
          )}
        </p>
      </div>
    </AuthLayout>
  );
}
