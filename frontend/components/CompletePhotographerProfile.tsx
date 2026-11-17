'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser, getSignInDestination, type AppUser } from '@/lib/auth';
import { completeMyPhotographerProfile, getMyPhotographerProfile } from '@/lib/api';
import { validateNext } from '@/lib/authRedirect';

export default function CompletePhotographerProfile() {
  const router = useRouter();
  const params = useSearchParams();
  const next = validateNext(params.get('next'));
  const [user, setUser] = useState<AppUser | null>(null);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const current = await getCurrentUser();
        if (!active) return;
        if (!current) { router.replace('/photographer/login'); return; }
        const existing = await getMyPhotographerProfile();
        if (!active) return;
        if (current.role === 'admin' || existing) {
          const destination = await getSignInDestination(current, { next });
          if (active) router.replace(destination);
          return;
        }
        setUser(current);
        setName(current.displayName);
        setCompany(current.company ?? '');
        setLoading(false);
      } catch (err) {
        if (active) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); }
      }
    }
    void load();
    return () => { active = false; };
  }, [router, next]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      await completeMyPhotographerProfile({ displayName: name, company });
      router.replace(await getSignInDestination(user, { next }));
      navigating = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!navigating) { inFlight.current = false; setBusy(false); }
    }
  }

  if (loading) return <div className="session-loading">Loading your profile…</div>;
  return (
    <form className="stack" onSubmit={onSubmit} aria-busy={busy}>
      {error && <div className="error" role="alert">{error}</div>}
      <label>Name<input value={name} required maxLength={120} autoComplete="name" disabled={!user || busy}
        onChange={(event) => setName(event.target.value)} /></label>
      <label>Company<input value={company} required maxLength={200} autoComplete="organization" disabled={!user || busy}
        onChange={(event) => setCompany(event.target.value)} /></label>
      <button type="submit" disabled={!user || busy}>
        {busy && <span className="auth-spinner" aria-hidden="true" />}{busy ? 'Saving…' : 'Complete profile'}
      </button>
    </form>
  );
}
