'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { logout, onAuthStateChange } from '@/lib/auth';

export default function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const { data } = onAuthStateChange(user => setSignedIn(Boolean(user)));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!signedIn) return <Link href="/auth/login">Sign in</Link>;
  return <button type="button" className="ghost" onClick={async () => {
    try {
      await logout();
      window.location.replace('/');
    } catch { setFailed(true); }
  }}>{failed ? 'Retry sign out' : 'Sign out'}</button>;
}
