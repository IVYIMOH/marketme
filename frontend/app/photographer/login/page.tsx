import { Suspense } from 'react';
import PhotographerSignIn from '@/components/PhotographerSignIn';
import SignInBackdrop from '@/components/SignInBackdrop';

export default function PhotographerLoginPage() {
  return (
    <SignInBackdrop>
      <Suspense fallback={<div className="session-loading">Loading sign-in…</div>}>
        <PhotographerSignIn />
      </Suspense>
    </SignInBackdrop>
  );
}
