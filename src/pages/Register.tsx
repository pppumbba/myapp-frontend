import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { returnPath } from '../auth/routes';
import { ApiError } from '../lib/api';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { AuthLayout } from './AuthLayout';
import { GoogleSignIn } from './GoogleSignIn';
import { t } from '@/i18n';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (value: string) => setForm({ ...form, [field]: value });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register(form);
      navigate(returnPath(), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors ?? {});
      } else {
        setError(t("Something went wrong. Try again."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Laravel returns field errors as { email: ["..."] }; show the first message per field.
  const fe = (field: string) => fieldErrors[field]?.[0];

  return (
    <AuthLayout title={t("Create your account")} subtitle={t("Start building apps in minutes.")}>
      <GoogleSignIn />
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {error && !Object.keys(fieldErrors).length && <Alert>{error}</Alert>}
        <Input
          label={t("Name")}
          isRequired
          hideRequiredIndicator
          autoComplete="name"
          value={form.name}
          onChange={update('name')}
          isInvalid={!!fe('name')}
          hint={fe('name')}
        />
        <Input
          label={t("Email")}
          type="email"
          isRequired
          hideRequiredIndicator
          autoComplete="email"
          value={form.email}
          onChange={update('email')}
          isInvalid={!!fe('email')}
          hint={fe('email')}
          placeholder={t("you@company.com")}
        />
        <Input
          label={t("Password")}
          type="password"
          isRequired
          hideRequiredIndicator
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          isInvalid={!!fe('password')}
          hint={fe('password')}
        />
        <Input
          label={t("Confirm password")}
          type="password"
          isRequired
          hideRequiredIndicator
          autoComplete="new-password"
          value={form.password_confirmation}
          onChange={update('password_confirmation')}
        />
        <Button type="submit" size="lg" isLoading={submitting} showTextWhileLoading className="mt-1 w-full">
          {submitting ? t("Creating account…") : t("Create account")}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-tertiary">
        {t('Already have an account?')}{' '}
        <Link to="/login" className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
          {t("Log in")}
        </Link>
      </p>
    </AuthLayout>
  );
}
