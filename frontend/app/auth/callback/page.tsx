'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getSignInDestination } from '@/lib/auth';
import { validateNext } from '@/lib/authRedirect';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState('/auth/login');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const next = validateNext(query.get('next'));
    const photographerIntent = query.get('photographer') === '1';
    const loginPath = photographerIntent ? '/photographer/login' : '/auth/login';
    setLoginHref(next ? `${loginPath}?${new URLSearchParams({ next })}` : loginPath);

    async function finishSignIn() {
      try {
        // The SDK reads both query and fragment errors during its automatic URL exchange.
        const { error: callbackError } = await supabase.auth.initialize();
        if (callbackError) throw new Error('Sign-in could not be completed. Try again in the browser where you started.');
        if (new URLSearchParams(window.location.search).has('code')) {
          throw new Error('Open the sign-in link in the browser where you started, or sign in again.');
        }
        const user = await getCurrentUser();
        if (!active) return;
        if (!user) throw new Error('Sign-in did not complete. Please try again.');
        const destination = await getSignInDestination(user, { next, photographerIntent });
        if (active) router.replace(destination);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void finishSignIn();

    return () => { active = false; };
  }, [router]);

  if (error) {
    return (
      <>
        <h1>Sign-in failed</h1>
        <div className="error" role="alert">{error}</div>
        <p className="subtle" style={{ marginTop: '1rem' }}>
          <Link href={loginHref}>Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Finishing sign-in…</h1>
      <div className="empty">Completing the redirect and reading your session.</div>
    </>
  );
}
