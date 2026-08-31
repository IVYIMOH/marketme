'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, homeForRole } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      router.replace(homeForRole(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="subtle">Routed by role via homeForRole() once the session exists.</p>

      <form className="stack" onSubmit={onSubmit}>
        {error && <div className="error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} required autoComplete="email"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} required autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link href="/auth/register">Create an account</Link>
        </div>
      </form>
    </>
  );
}
