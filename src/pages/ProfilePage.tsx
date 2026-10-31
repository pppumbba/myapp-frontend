import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle, Monitor01, Moon01, Sun } from '@untitledui/icons';
import { useAuth, type User } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { initials } from '../lib/initials';
import { languageApi, type Language } from '../lib/languageApi';
import { clearRenderCache } from '../render/definitions';
import { NativeSelect } from '@/components/base/select/select-native';
import { PageHeader } from '../components/AppShell';
import { Alert } from '../components/ui';
import { Avatar } from '@/components/base/avatar/avatar';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Toggle } from '@/components/base/toggle/toggle';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import { useTheme } from '../components/ThemeProvider';
import type { UiSize } from '../lib/theme';
import { ThemeSwatch } from '../components/ThemeSwatch';
import { t } from '@/i18n';

/** The signed-in user's own account: name and email, appearance, language, and password. */
export default function ProfilePage() {
  const { user } = useAuth();
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <>
      <PageHeader title={t("Profile")} subtitle={t("Your name, email and password.")} />

      <div className="mb-5 flex items-center gap-3">
        <Avatar size="lg" initials={initials(user?.name)} alt={user?.name} />
        <div className="min-w-0">
          <p className="truncate text-md font-semibold text-primary">{user?.name}</p>
          <p className="truncate text-sm text-tertiary">
            {user?.email}
            {since && ` · ${t('Member since {date}', { date: since })}`}
          </p>
        </div>
      </div>

      <div className="max-w-3xl space-y-5">
        <DetailsCard />
        <AppearanceCard />
        <FormsCard />
        <LanguageCard />
        <PasswordCard />
      </div>
    </>
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
      else setError(err instanceof ApiError ? err.message : t("This could not be saved. Check that the API is running."));
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
    <Card title={t("Personal info")} description={t("How you appear in the app, and the email you log in with.")}>
      <form onSubmit={onSubmit} className="space-y-4">
        {save.error && <Alert>{save.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("Name")}
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
            label={t("Email")}
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
          {save.done && <Saved>{t("Saved")}</Saved>}
          <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading isDisabled={!changed}>
            {t("Save changes")}
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
    <Card title={t("Password")} description={t("Changing it signs you out everywhere else; you stay signed in here.")}>
      <form onSubmit={onSubmit} className="space-y-4">
        {save.error && <Alert>{save.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
            <Input
              label={t("Current password")}
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
            label={t("New password")}
            type="password"
            isRequired
            value={next}
            onChange={setNext}
            isInvalid={!!save.fe('password')}
            hint={save.fe('password') ?? t("At least 8 characters.")}
            autoComplete="new-password"
          />
          <Input
            label={t("Confirm new password")}
            type="password"
            isRequired
            value={confirm}
            onChange={setConfirm}
            isInvalid={mismatch}
            hint={mismatch ? t("The passwords don't match.") : undefined}
            autoComplete="new-password"
          />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-secondary pt-4">
          {save.done && <Saved>{t("Password changed")}</Saved>}
          <Button size="sm" type="submit" isLoading={save.busy} showTextWhileLoading isDisabled={!current || !next || !confirm || mismatch}>
            {t("Change password")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Light, dark or as the system is, the size and the theme: each saved as soon as it is picked. */
function AppearanceCard() {
  const { list, mode, themeId, size, choose, dark } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = themeId ?? list?.default_id ?? null;
  const forced = list?.themes.find((item) => item.id === picked)?.theme.mode;

  async function pick(nextMode: 'light' | 'dark' | null, nextTheme: number | null, nextSize: UiSize = size) {
    setBusy(true);
    setError(null);
    try {
      await choose(nextMode, nextTheme, nextSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("This could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("Appearance")} description={t("How the app looks for you. Some apps have their own theme, used while they are open.")}>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div>
          <p className="mb-1.5 text-sm font-medium text-secondary">{t("Light or dark")}</p>
          <ButtonGroup
            size="sm"
            aria-label={t("Light or dark")}
            selectionMode="single"
            disallowEmptySelection
            isDisabled={busy}
            selectedKeys={[mode ?? 'system']}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              void pick(k === 'light' || k === 'dark' ? k : null, themeId);
            }}
          >
            <ButtonGroupItem id="system" iconLeading={Monitor01}>{t("System")}</ButtonGroupItem>
            <ButtonGroupItem id="light" iconLeading={Sun}>{t("Light")}</ButtonGroupItem>
            <ButtonGroupItem id="dark" iconLeading={Moon01}>{t("Dark")}</ButtonGroupItem>
          </ButtonGroup>
          {forced && forced !== 'any' && <p className="mt-1.5 text-sm text-tertiary">{t('Your theme is always {mode}.', { mode: t(forced) })}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-secondary">{t("Text size")}</p>
          <ButtonGroup
            size="sm"
            aria-label={t("Text size")}
            selectionMode="single"
            disallowEmptySelection
            isDisabled={busy}
            selectedKeys={[size]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'sm' || k === 'md' || k === 'lg') void pick(mode, themeId, k);
            }}
          >
            <ButtonGroupItem id="sm">{t("Small")}</ButtonGroupItem>
            <ButtonGroupItem id="md">{t("Medium")}</ButtonGroupItem>
            <ButtonGroupItem id="lg">{t("Large")}</ButtonGroupItem>
          </ButtonGroup>
          <p className="mt-1.5 text-sm text-tertiary">{t("Text, buttons and spacing grow or shrink together.")}</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-secondary">{t("Theme")}</p>
          {!list ? (
            <div className="h-24 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
          ) : list.themes.length === 0 ? (
            <p className="text-sm text-tertiary">{t("There are no themes yet. An admin can add them as Theme metas.")}</p>
          ) : (
            <div role="radiogroup" aria-label={t("Theme")} className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
              {list.themes.map((item) => {
                const on = picked === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => !on && pick(mode, item.id === list.default_id ? null : item.id)}
                    className={cx(
                      'rounded-xl p-1.5 text-left ring-1 outline-focus-ring focus-visible:outline-2 disabled:opacity-60',
                      on ? 'ring-2 ring-brand' : 'ring-secondary hover:bg-primary_hover',
                    )}
                  >
                    <ThemeSwatch theme={item.theme} dark={dark} />
                    <span className="flex items-center gap-1 px-1 pt-1.5 text-sm font-medium text-primary">
                      <span className="flex-1 truncate">{item.name}</span>
                      {on && <CheckCircle className="size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />}
                    </span>
                    <span className="block px-1 pb-0.5 text-xs text-tertiary">
                      {item.id === list.default_id ? t("Default") : item.theme.mode === 'dark' ? t("Always dark") : item.theme.mode === 'light' ? t("Always light") : ' '}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** How forms behave for this user (users.preferences), saved as soon as it is switched. */
function FormsCard() {
  const { user, updateUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function set(formSavedNotice: boolean) {
    setBusy(true);
    setError(null);
    try {
      updateUser(await api<User>('/user/preferences', { method: 'PUT', body: JSON.stringify({ form_saved_notice: formSavedNotice }) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("This could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("Forms")} description={t("What a form shows after it is saved.")}>
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Toggle
          label={t("Show a saved message in the form")}
          hint={t("A green note stays at the top of the form after each save. A short notice in the corner appears either way.")}
          isSelected={!!user?.preferences?.form_saved_notice}
          isDisabled={busy}
          onChange={(v) => void set(v)}
        />
      </div>
    </Card>
  );
}

/** The language screens show names and labels in; saved as soon as it is picked. */
function LanguageCard() {
  const { user, updateUser } = useAuth();
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    languageApi.list().then(
      (r) => {
        setLanguages(r.languages.filter((l) => l.is_active));
        setCurrent(r.current);
      },
      () => setLanguages([]),
    );
  }, []);

  async function pick(value: string) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const saved = await languageApi.mine(value || null);
      updateUser({ ...user, locale: saved.locale });
      const now = await languageApi.list();
      setCurrent(now.current);
      document.documentElement.lang = now.current;
      // Screens load their definitions again, in the new language.
      clearRenderCache();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("This could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  const browser = languages?.find((l) => l.code === current)?.name;
  return (
    <Card title={t("Language")} description={t("The language of screen names, field labels, buttons and statuses, where they have been translated.")}>
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {!languages ? (
          <div className="h-10 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-72">
              <NativeSelect
                aria-label={t("Language")}
                size="sm"
                disabled={busy}
                value={user?.locale ?? ''}
                onChange={(e) => void pick(e.target.value)}
                options={[
                  { value: '', label: !user?.locale && browser ? t('As my browser is ({language})', { language: browser }) : t('As my browser is') },
                  ...languages.map((l) => ({ value: l.code, label: l.name })),
                ]}
              />
            </div>
            {done && <Saved>{t("Saved")}</Saved>}
          </div>
        )}
        <p className="text-sm text-tertiary">{t("The app's own menus and buttons follow it too.")}</p>
      </div>
    </Card>
  );
}
