import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Alert } from '../components/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { AuthLayout } from './AuthLayout';
import { GoogleSignIn } from './GoogleSignIn';
import { t } from '@/i18n';

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('google_error'));
  const [submitting, setSubmitting] = useState(!!params.get('google_code'));

  // Back from Google: the one-time code becomes a sign-in; the query is cleared either way.
  useEffect(() => {
    const code = params.get('google_code');
    if (!code && !params.has('google_error')) return;
    setParams({}, { replace: true });
    if (!code) return;
    loginWithGoogle(code)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
        setSubmitting(false);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Something went wrong. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("Welcome back")} subtitle={t("Log in to continue to your apps.")}>
      <GoogleSignIn />
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <Input
          label={t("Email")}
          type="email"
          autoComplete="email"
          isRequired
          hideRequiredIndicator
          value={email}
          onChange={setEmail}
          placeholder={t("you@company.com")}
        />
        <Input
          label={t("Password")}
          type="password"
          autoComplete="current-password"
          isRequired
          hideRequiredIndicator
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
        />
        <Button type="submit" size="lg" isLoading={submitting} showTextWhileLoading className="mt-1 w-full">
          {submitting ? t("Logging in…") : t("Log in")}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-tertiary">
        {t('No account?')}{' '}
        <Link to="/register" className="font-semibold text-brand-secondary hover:text-brand-secondary_hover">
          {t("Sign up")}
        </Link>
      </p>
    </AuthLayout>
  );
}
