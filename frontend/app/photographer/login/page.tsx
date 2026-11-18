import { Suspense } from 'react';
import PhotographerSignIn from '@/components/PhotographerSignIn';

export default function PhotographerLoginPage() {
  return (
    <Suspense fallback={<div className="session-loading">Loading sign-in…</div>}>
      <PhotographerSignIn />
    </Suspense>
  );
}
