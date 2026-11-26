'use client';

import { useEffect, useState } from 'react';
import { isGoogleSignInEnabled } from '@/lib/supabaseClient';

export default function GoogleSignInButton({ busy, disabled, onClick }: {
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    isGoogleSignInEnabled(controller.signal).then(setEnabled).catch(() => {
      // Email sign-in remains available if Auth settings cannot be loaded.
    });
    return () => controller.abort();
  }, []);

  if (!enabled) return null;
  return (
    <button type="button" className="ghost" disabled={disabled} aria-busy={busy} onClick={onClick}>
      {busy && <span className="auth-spinner" aria-hidden="true" />}
      {busy ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );
}
