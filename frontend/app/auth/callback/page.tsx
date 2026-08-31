'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, homeForRole } from '@/lib/auth';

/**
 * OAuth landing page. signInWithGoogle() sends the provider here.
 *
 * detectSessionInUrl defaults to true in the installed @supabase/supabase-js
 * (verified in dist/index.mjs:39), so the client exchanges the redirect for a
 * session on load without this page doing it explicitly. getCurrentUser()
 * therefore just waits for that exchange to land.
 *
 * Role comes from getCurrentUser(), which reads it out of the decoded JWT via
 * extractRole() — the same corrected path the rest of the app uses.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

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
      const user = await getCurrentUser();
      if (!active) return;
      if (user) {
        router.replace(homeForRole(user.role));
        return;
      }
      if (++attempts >= 20) {
        setError('Sign-in did not complete — no session was created from this redirect.');
        return;
      }
      setTimeout(tick, 250);
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
