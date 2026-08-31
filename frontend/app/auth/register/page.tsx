'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register, homeForRole } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const user = await register(email, password, displayName);
      router.replace(homeForRole(user.role));
    } catch (err) {
      // register() throws AuthError for the confirmation-required case too,
      // which is a normal outcome rather than a failure — config.toml has
      // enable_confirmations = true, so this is the expected path locally.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Account created')) setNotice(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Create an account</h1>
      <p className="subtle">
        New accounts start as buyer. display_name is carried into profiles by the
        handle_new_user trigger.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        {error && <div className="error">{error}</div>}
        {notice && <div className="ok">{notice}</div>}
        <label>
          Display name
          <input value={displayName} required onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} required autoComplete="email"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} required minLength={6} autoComplete="new-password"
                 onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <Link href="/auth/login">I already have an account</Link>
        </div>
      </form>
    </>
  );
}
