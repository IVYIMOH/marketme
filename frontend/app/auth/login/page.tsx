import { Suspense } from 'react';
import SignInForm from '@/components/SignInForm';

export default function LoginPage() {
  return (
    <>
      <h1>Sign in</h1>
      <p className="subtle">Sign in to your account.</p>
      <Suspense fallback={<div className="session-loading">Loading sign-in…</div>}>
        <SignInForm />
      </Suspense>
    </>
  );
}
