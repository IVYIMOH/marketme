'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getSignInDestination } from '@/lib/auth';

/**
 * OAuth landing page. signInWithGoogle() sends the provider here.
 *
 * detectSessionInUrl defaults to true in the installed @supabase/supabase-js
 * (verified in dist/index.mjs:39), so the client exchanges the redirect for a
 * session on load without this page doing it explicitly. getCurrentUser()
 * therefore just waits for that exchange to land.
 *
 * The destination uses the JWT role and the authenticated photographer lookup.
 * getSignInDestination() validates a requested next path before using it.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const next = query.get('next');
    const photographerIntent = query.get('photographer') === '1';

    // The URL may carry an OAuth error instead of a grant.
    const params = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.search
    );
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      setError(oauthError);
      return;
    }

    // detectSessionInUrl runs asynchronously, so poll briefly rather than
    // assuming the session is present on first tick.
    let attempts = 0;
    const tick = async () => {
      if (!active) return;
      try {
        const user = await getCurrentUser();
        if (!active) return;
        if (user) {
          const destination = await getSignInDestination(user, { next, photographerIntent });
          if (active) router.replace(destination);
          return;
        }
        if (++attempts >= 20) {
          setError('Sign-in did not complete — no session was created from this redirect.');
          return;
        }
        setTimeout(tick, 250);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();

    return () => { active = false; };
  }, [router]);

  if (error) {
    return (
      <>
        <h1>Sign-in failed</h1>
        <div className="error">{error}</div>
        <p className="subtle" style={{ marginTop: '1rem' }}>
          <Link href="/auth/login">Back to sign in</Link>
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
