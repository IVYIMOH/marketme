'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthError, getSignInDestination, sendEmailCode, signInWithGoogle, verifyEmailCode, type AppUser } from '@/lib/auth';
import { validateNext } from '@/lib/authRedirect';
import GoogleSignInButton from './GoogleSignInButton';

type Action = 'send' | 'resend' | 'verify' | 'continue' | 'google';

function emailError(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code === 'otp_expired' || error.code === 'invalid_credentials') {
      return 'That code is incorrect or has expired. Check the latest email, or request a new code.';
    }
    if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
      return 'Too many requests. Wait a minute before requesting another code.';
    }
  }
  return error instanceof Error ? error.message : 'We could not complete this step. Please try again.';
}

export default function EmailCodeSignIn({ photographerIntent = false }: { photographerIntent?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = validateNext(params.get('next'));
  const options = { photographerIntent, next };
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifiedUser, setVerifiedUser] = useState<AppUser | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => setCooldown(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => { if (sentEmail) codeInput.current?.focus(); }, [sentEmail]);

  async function run(action: Action, operation: () => Promise<boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    let navigating = false;
    try {
      navigating = await operation();
    } catch (err) {
      setError(emailError(err));
    } finally {
      if (!navigating) {
        inFlight.current = false;
        setBusy(null);
      }
    }
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    await run('send', async () => {
      const recipient = email.trim();
      await sendEmailCode(recipient, options);
      setSentEmail(recipient);
      setCode('');
      setCooldownUntil(Date.now() + 60_000);
      setCooldown(60);
      setNotice('Code requested. Check your email for a six-digit verification code.');
      return false;
    });
  }

  async function resendCode() {
    if (!sentEmail || Date.now() < cooldownUntil) return;
    await run('resend', async () => {
      await sendEmailCode(sentEmail, options);
      setCode('');
      setCooldownUntil(Date.now() + 60_000);
      setCooldown(60);
      setNotice('A new code was requested. Use the code in the latest email.');
      codeInput.current?.focus();
      return false;
    });
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    await run('verify', async () => {
      const user = await verifyEmailCode(sentEmail, code);
      setVerifiedUser(user);
      router.replace(await getSignInDestination(user, options));
      return true;
    });
  }

  function continueWithGoogle() {
    void run('google', async () => {
      await signInWithGoogle(options);
      return true;
    });
  }

  function changeEmail() {
    if (inFlight.current) return;
    setSentEmail('');
    setCode('');
    setError(null);
    setNotice(null);
  }

  return (
    <div className="auth-code-flow" aria-busy={busy !== null}>
      <ol className="auth-steps" aria-label="Photographer sign-in steps">
        <li aria-current={!sentEmail ? 'step' : undefined}><span>1</span> Email</li>
        <li aria-current={sentEmail && !verifiedUser ? 'step' : undefined}><span>2</span> Verify</li>
        <li aria-current={verifiedUser ? 'step' : undefined}><span>3</span> {photographerIntent ? 'Photographer account' : 'Your account'}</li>
      </ol>
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="ok" role="status">{notice}</div>}

      {verifiedUser ? (
        <div className="auth-confirmation">
          <p>Your email is verified.</p>
          <button type="button" disabled={busy !== null} onClick={() => {
            void run('continue', async () => {
              router.replace(await getSignInDestination(verifiedUser, options));
              return true;
            });
          }}>{busy ? 'Opening your account…' : 'Continue to your account'}</button>
        </div>
      ) : sentEmail ? (
        <form className="stack" onSubmit={verifyCode}>
          <p className="auth-code-recipient">Enter the code sent to <strong>{sentEmail}</strong>.</p>
          <label htmlFor="email-verification-code">Six-digit verification code</label>
          <input id="email-verification-code" ref={codeInput} className="auth-code-input" value={code}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
            disabled={busy !== null} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          <button type="submit" disabled={busy !== null || code.length !== 6}>
            {busy === 'verify' && <span className="auth-spinner" aria-hidden="true" />}
            {busy === 'verify' ? 'Verifying…' : 'Verify and continue'}
          </button>
          <p className="subtle auth-code-help">Check your spam folder too. If the code has expired, request a new one.</p>
          <div className="row">
            <button type="button" className="ghost" disabled={busy !== null || cooldown > 0} onClick={() => { void resendCode(); }}>
              {busy === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <button type="button" className="ghost" disabled={busy !== null} onClick={changeEmail}>Change email</button>
          </div>
        </form>
      ) : (
        <form className="stack" onSubmit={requestCode}>
          <label>Email address
            <input type="email" value={email} required autoComplete="email" autoFocus disabled={busy !== null}
              onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === 'send' && <span className="auth-spinner" aria-hidden="true" />}
            {busy === 'send' ? 'Sending code…' : 'Send verification code'}
          </button>
          <p className="subtle auth-code-help">New to NatuVara? After signing in, you can complete your photographer profile.</p>
          <GoogleSignInButton busy={busy === 'google'} disabled={busy !== null}
            onClick={continueWithGoogle} />
        </form>
      )}
    </div>
  );
}
