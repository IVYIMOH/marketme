'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function PrivacyRequests() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  async function request(kind: 'access' | 'deletion') {
    setPending(true);
    setMessage('');
    setNeedsLogin(false);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) { setNeedsLogin(true); return; }
      const { error } = await supabase.from('privacy_requests').insert({ kind });
      if (error && error.code !== '23505') throw error;
      setMessage(kind === 'access' ? 'Your request for a copy is on file.' : 'Your deletion request is on file.');
    } catch {
      setMessage('We could not file the request. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" disabled={pending} onClick={() => void request('access')}>Request a copy of my data</button>
        <button type="button" className="ghost" disabled={pending} onClick={() => void request('deletion')}>Request account deletion</button>
      </div>
      <div role="status">{needsLogin ? <Link href="/auth/login?next=%2Fprivacy">Sign in to file your request</Link> : message}</div>
    </div>
  );
}
