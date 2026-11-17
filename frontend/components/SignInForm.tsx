'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthError, getSignInDestination, login, resendConfirmation, signInWithGoogle } from '@/lib/auth';
import { validateNext } from '@/lib/authRedirect';

type Action = 'email' | 'google' | 'resend';

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export default function SignInForm({ photographerIntent = false }: { photographerIntent?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = validateNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const options = { next, photographerIntent };
  const registerPath = photographerIntent ? '/photographer/register' : '/auth/register';
  const registerHref = next ? `${registerPath}?${new URLSearchParams({ next })}` : registerPath;
  const rateLimited = error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit';

  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => setCooldown(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    const timer = window.setInterval(() => {
      update();
      if (Date.now() >= cooldownUntil) window.clearInterval(timer);
    }, 1000);
    update();
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  async function run(action: Action, operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    let navigating = false;
    try {
      await operation();
      navigating = action !== 'resend';
    } catch (err) {
      const code = err instanceof AuthError ? err.code : undefined;
      setError({ message: err instanceof Error ? err.message : String(err), code });
      if (action === 'email' && code === 'email_not_confirmed') setUnconfirmedEmail(email.trim());
    } finally {
      if (!navigating) {
        inFlight.current = false;
        setBusy(null);
      }
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setUnconfirmedEmail(null);
    await run('email', async () => {
      const user = await login(email.trim(), password);
      router.replace(await getSignInDestination(user, options));
    });
  }

  async function onResend() {
    if (!unconfirmedEmail || Date.now() < cooldownUntil) return;
    await run('resend', async () => {
      setCooldownUntil(Date.now() + 60_000);
      setCooldown(60);
      await resendConfirmation(unconfirmedEmail, options);
      setNotice('If your account needs confirmation, check your email for a new link.');
    });
  }

  return (
    <form className="stack" onSubmit={onSubmit} aria-busy={busy !== null}>
      {error && <div className="error" role="alert">{error.message}</div>}
      {rateLimited && <p className="subtle">Too many requests. Wait a few minutes before trying again.</p>}
      {notice && <div className="ok" role="status">{notice}</div>}
      <label>
        Email
        <input type="email" value={email} required autoComplete="email" disabled={busy !== null}
          onChange={(event) => { setEmail(event.target.value); setUnconfirmedEmail(null); }} />
      </label>
      <label>
        Password
        <input type="password" value={password} required autoComplete="current-password" disabled={busy !== null}
          onChange={(event) => setPassword(event.target.value)} />
      </label>
      <div className="row">
        <button type="submit" disabled={busy !== null} aria-busy={busy === 'email'}>
          {busy === 'email' && <Spinner />}{busy === 'email' ? 'Signing in…' : 'Sign in'}
        </button>
        <Link href={registerHref}>Create an account</Link>
      </div>
      {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true' && (
        <button type="button" className="ghost" disabled={busy !== null} aria-busy={busy === 'google'}
          onClick={() => { void run('google', () => signInWithGoogle(options)); }}>
          {busy === 'google' && <Spinner />}{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
      )}
      <Link href="/auth/forgot-password">Forgot your password?</Link>
      {unconfirmedEmail && (
        <div className="auth-confirmation">
          <p className="subtle">Confirm your email before signing in. Use the link in your inbox or request a new one.</p>
          <button type="button" className="ghost" onClick={() => { void onResend(); }}
            disabled={busy !== null || cooldown > 0} aria-busy={busy === 'resend'}>
            {busy === 'resend' && <Spinner />}
            {busy === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend confirmation'}
          </button>
        </div>
      )}
    </form>
  );
}
