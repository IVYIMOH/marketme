'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, onAuthStateChange, type AppRole } from '@/lib/auth';
import { getMyPhotographerProfile } from '@/lib/api';
import { validateNext } from '@/lib/authRedirect';

export default function ProtectedRoute({ children, requiredRole }: {
  children: React.ReactNode;
  requiredRole?: AppRole;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginPath = requiredRole === 'photographer' ? '/photographer/login' : '/auth/login';

  useEffect(() => {
    let active = true;
    let version = 0;
    async function check() {
      const request = ++version;
      setChecked(false);
      setAuthorized(false);
      setError(null);
      try {
        const user = await getCurrentUser();
        if (!active || request !== version) return;
        if (!user) {
          const next = validateNext(window.location.pathname + window.location.search);
          router.replace(next ? `${loginPath}?${new URLSearchParams({ next })}` : loginPath);
          return;
        }
        let allowed = !requiredRole || user.role === requiredRole;
        if (requiredRole === 'photographer') {
          const photographer = await getMyPhotographerProfile();
          if (!active || request !== version) return;
          allowed = photographer?.user_id === user.id;
        }
        if (!allowed) {
          router.replace('/gallery');
          return;
        }
        setAuthorized(true);
        setChecked(true);
      } catch (err) {
        if (active && request === version) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void check();
    const onPageShow = () => { void check(); };
    window.addEventListener('pageshow', onPageShow);
    const { data: subscription } = onAuthStateChange(() => { void check(); });
    return () => {
      active = false;
      version++;
      window.removeEventListener('pageshow', onPageShow);
      subscription.subscription.unsubscribe();
    };
  }, [router, requiredRole, loginPath]);

  if (error) return <div className="stack"><div className="error" role="alert">{error}</div><Link href={loginPath}>Back to sign in</Link></div>;
  if (!checked) return <div className="session-loading">Checking session…</div>;
  return authorized ? <>{children}</> : null;
}
