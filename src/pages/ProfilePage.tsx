import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle } from '@untitledui/icons';
import { useAuth, type User } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { initials } from '../lib/initials';
import { AppShell, PageHeader } from '../components/AppShell';
import { Alert } from '../components/ui';
import { Avatar } from '@/components/base/avatar/avatar';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';

/** The signed-in user's own account: name and email, and password. */
export default function ProfilePage() {
  const { user } = useAuth();
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <AppShell>
      <PageHeader title="Profile" subtitle="Your name, email and password." />

      <div className="mb-5 flex items-center gap-3">
        <Avatar size="lg" initials={initials(user?.name)} alt={user?.name} />
        <div className="min-w-0">
          <p className="truncate text-md font-semibold text-primary">{user?.name}</p>
          <p className="truncate text-sm text-tertiary">
            {user?.email}
            {since && ` · Member since ${since}`}
          </p>
        </div>
      </div>

      <div className="max-w-3xl space-y-5">
        <DetailsCard />
        <PasswordCard />
      </div>
    </AppShell>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary" aria-label={title}>
      <div className="border-b border-secondary px-4 py-3.5 sm:px-5">
        <h2 className="text-md font-semibold text-primary">{title}</h2>
        <p className="text-sm text-tertiary">{description}</p>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function Saved({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
      <CheckCircle className="size-4" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Runs a save, sorting the API's answer into field errors, a general error, or done. */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);

  async function run(save: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setDone(false);
    try {
      await save();
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
      else setError(err instanceof ApiError ? err.message : 'This could not be saved. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, run, fe: (field: string) => fieldErrors[field]?.[0], reset: () => setDone(false) };
}

function DetailsCard() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const save = useSave();
  const changed = name !== user?.name || email !== user?.email;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.run(async () => {
      updateUser(await api<User>('/user', { method: 'PUT', body: JSON.stringify({ name, email }) }));
    });
  }

  return (
    <Card title="Personal info" description="How you appear in the app, and the email you log in with.">
      <form onSubmit={onSubmit} className="space-y-4">
        {save.error && <Alert>{save.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            isRequired
            value={name}
            onChange={(v) => {
              setName(v);
              save.reset();
            }}
            isInvalid={!!save.fe('name')}
            hint={save.fe('name')}
            autoComplete="name"
          />
          <Input
            label="Email"
            type="email"
            isRequired
            value={email}
            onChange={(v) => {
              setEmail(v);
              save.reset();
            }}
            isInvalid={!!save.fe('email')}
            hint={save.fe('email')}
            autoComplete="email"
          />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-secondary pt-4">
          {save.done && <Saved>Saved</Saved>}
          <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading isDisabled={!changed}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const save = useSave();
  const mismatch = confirm !== '' && next !== confirm;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    save.run(async () => {
      await api('/user/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: current, password: next, password_confirmation: confirm }),
      });
      setCurrent('');
      setNext('');
      setConfirm('');
    });
  }

  return (
    <Card title="Password" description="Changing it signs you out everywhere else; you stay signed in here.">
      <form onSubmit={onSubmit} className="space-y-4">
        {save.error && <Alert>{save.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
            <Input
              label="Current password"
              type="password"
              isRequired
              value={current}
              onChange={setCurrent}
              isInvalid={!!save.fe('current_password')}
              hint={save.fe('current_password')}
              autoComplete="current-password"
            />
          </div>
          <Input
            label="New password"
            type="password"
            isRequired
            value={next}
            onChange={setNext}
            isInvalid={!!save.fe('password')}
            hint={save.fe('password') ?? 'At least 8 characters.'}
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            isRequired
            value={confirm}
            onChange={setConfirm}
            isInvalid={mismatch}
            hint={mismatch ? "The passwords don't match." : undefined}
            autoComplete="new-password"
          />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-secondary pt-4">
          {save.done && <Saved>Password changed</Saved>}
          <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading isDisabled={!current || !next || !confirm || mismatch}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
