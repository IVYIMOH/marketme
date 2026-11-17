import { Suspense } from 'react';
import SignInForm from '@/components/SignInForm';

export default function PhotographerLoginPage() {
  return (
    <>
      <h1>Photographer sign in</h1>
      <p className="subtle">Sign in to manage your photography.</p>
      <Suspense fallback={<div className="session-loading">Loading sign-in…</div>}>
        <SignInForm photographerIntent />
      </Suspense>
    </>
  );
}
