'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const recoveryUser = useRef<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (step === 'email') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error && error.status !== 429) throw error;
        setStep('code');
      } else if (step === 'code') {
        const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
        if (error || !data.session) throw new Error('Invalid code');
        recoveryUser.current = data.session.user.id;
        setCode('');
        setStep('password');
      } else if (step === 'password') {
        const { data } = await supabase.auth.getUser();
        if (!data.user || data.user.id !== recoveryUser.current) throw new Error('Session changed');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword('');
        setStep('done');
      }
    } catch {
      setMessage(step === 'code' ? 'The code is incorrect or has expired. Request a new code to try again.'
        : step === 'password' ? 'Could not change your password. Try a new password or start recovery again.'
        : 'Could not request a code. Please try again later.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="auth-panel">
    <h1>Reset your password</h1>
    {step === 'done' ? <p role="status">Your password has been changed. <Link href="/gallery">Continue to the gallery</Link></p> :
      <form className="stack" onSubmit={submit} aria-busy={busy}>
        {step === 'email' && <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {step === 'code' && <>
          <p>If there is an account for that address, check your email for a six-digit code.</p>
          <label>Recovery code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
        </>}
        {step === 'password' && <label>New password (at least 12 characters)<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
        {message && <p role="alert" className="error">{message}</p>}
        <button disabled={busy}>{step === 'email' ? 'Send recovery code' : step === 'code' ? 'Verify code' : 'Save new password'}</button>
        {step !== 'email' && <button className="ghost" type="button" disabled={busy} onClick={() => { setStep('email'); setCode(''); setPassword(''); setMessage(''); }}>Start again</button>}
        <Link href="/auth/login">Back to sign in</Link>
      </form>}
  </section>;
}
