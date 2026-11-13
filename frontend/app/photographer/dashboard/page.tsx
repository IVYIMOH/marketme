'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import MediaThumb from '@/components/MediaThumb';
import { getMySubmissions, type Media } from '@/lib/api';

function Submissions() {
  const [items, setItems] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMySubmissions()
      .then((rows) => { if (active) setItems(rows); })
      .catch((e) => { if (active) setError(e.message ?? String(e)); });
    return () => { active = false; };
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (items === null) return <div className="empty">Loading…</div>;
  if (items.length === 0) {
    return (
      <div className="empty">
        No submissions yet. <Link href="/photographer/submit">Submit your first photo</Link>.
      </div>
    );
  }

  return (
    <div className="grid">
      {items.map((m) => (
        <article key={m.id} className="card">
          <MediaThumb storageKey={m.preview_key} alt={m.title} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{m.title}</h3>
            <span className={`badge ${m.status}`}>{m.status}</span>
          </div>
          <p className="meta">{m.category} · {m.location}</p>
          {m.lens && <p className="meta">{m.lens}</p>}
          <p className="price">{m.price_sats.toLocaleString()} sats</p>
          {/* storage_key and the moderation fields arrive only through
              get_my_submissions(), never from a base-table read. */}
          {m.storage_key && <p className="meta">key: {m.storage_key}</p>}
          {m.status === 'rejected' && m.reject_reason && (
            <p className="meta rejection-reason">Reason: {m.reject_reason}</p>
          )}
          {m.moderated_at && (
            <p className="meta">moderated {new Date(m.moderated_at).toLocaleString()}</p>
          )}
        </article>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute requiredRole="photographer">
      <h1>My submissions</h1>
      <p className="subtle">
        All statuses, via the get_my_submissions() accessor.
      </p>
      <Submissions />
    </ProtectedRoute>
  );
}
