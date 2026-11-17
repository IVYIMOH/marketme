import { Suspense } from 'react';
import CompletePhotographerProfile from '@/components/CompletePhotographerProfile';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function CompleteProfilePage() {
  return (
    <ProtectedRoute>
      <h1>Complete your photographer profile</h1>
      <p className="subtle">Add your name and company to get started. Your company is private.</p>
      <Suspense fallback={<div className="session-loading">Loading your profile…</div>}>
        <CompletePhotographerProfile />
      </Suspense>
    </ProtectedRoute>
  );
}
