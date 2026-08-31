'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, onAuthStateChange, AppRole } from '@/lib/auth';

export default function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: AppRole;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;

    async function check() {
      const user = await getCurrentUser();
      if (!active) return;

      if (!user) {
        router.replace('/auth/login');
        return;
      }
      if (requiredRole && user.role !== requiredRole) {
        // Client-side UX gate only — real enforcement happens server-side
        // via is_admin() / RLS regardless of what this check does.
        router.replace('/gallery');
        return;
      }
      setAuthorized(true);
      setChecked(true);
    }

    check();

    const { data: subscription } = onAuthStateChange((user) => {
      if (!user) router.replace('/auth/login');
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router, requiredRole]);

  if (!checked) {
    return <div className="text-sm text-slate-500 py-16 text-center">Checking session…</div>;
  }

  return authorized ? <>{children}</> : null;
}