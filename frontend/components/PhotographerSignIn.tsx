'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import EmailCodeSignIn from '@/components/EmailCodeSignIn';
import SignInForm from '@/components/SignInForm';
import { validateNext } from '@/lib/authRedirect';

export default function PhotographerSignIn() {
  const params = useSearchParams();
  const usePassword = params.get('method') === 'password';
  const next = validateNext(params.get('next'));
  const alternate = new URLSearchParams();
  if (!usePassword) alternate.set('method', 'password');
  if (next) alternate.set('next', next);
  const alternateHref = '/photographer/login' + (alternate.size ? `?${alternate}` : '');

  return (
    <section className="auth-panel" aria-label="Photographer sign in">
      <h1>Photographer sign in</h1>
      <p className="subtle">{usePassword
        ? 'Sign in with your existing email and password.'
        : 'Enter your email to receive a six-digit sign-in code. No password needed.'}</p>
      {usePassword ? <SignInForm photographerIntent /> : <EmailCodeSignIn photographerIntent />}
      <p className="auth-alternate"><Link href={alternateHref}>{usePassword ? 'Use an email code instead' : 'Use a password instead'}</Link></p>
    </section>
  );
}
