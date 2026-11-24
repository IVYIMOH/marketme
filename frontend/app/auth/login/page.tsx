import { Suspense } from 'react';
import SignInForm from '@/components/SignInForm';
import SignInBackdrop from '@/components/SignInBackdrop';

export default function LoginPage() {
  return (
    <SignInBackdrop>
      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <h1 id="sign-in-heading">Sign in</h1>
        <p className="subtle">Sign in to your account.</p>
        <Suspense fallback={<div className="session-loading">Loading sign-in…</div>}>
          <SignInForm />
        </Suspense>
      </section>
    </SignInBackdrop>
  );
}
