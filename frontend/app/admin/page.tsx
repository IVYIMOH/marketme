'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser, type AppUser } from '@/lib/auth';
import MediaThumb from '@/components/MediaThumb';
import { getModerationQueue, approveMedia, rejectMedia, type Media } from '@/lib/api';

export default function AdminPage() {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [queue, setQueue] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setError(null);
    try {
      setQueue(await getModerationQueue());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentUser().then((u) => {
      if (!active) return;
      setUser(u);
      // Client-side gate only. get_moderation_queue() raises 42501 for a
      // non-admin regardless of what this check decides.
      if (u?.role === 'admin') void loadQueue();
    });
    return () => { active = false; };
  }, [loadQueue]);

  async function act(kind: 'approve' | 'reject', id: string) {
    setBusyId(id);
    setError(null);
    try {
      if (kind === 'approve') {
        await approveMedia(id);
      } else {
        const reason = window.prompt('Reason for rejection?') ?? '';
        await rejectMedia(id, reason);
      }
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (user === undefined) return <div className="empty">Checking session…</div>;
  if (user === null) return <div className="empty">Not signed in.</div>;
  if (user.role !== 'admin') {
    return (
      <div className="empty">
        Admins only. Signed in as {user.email} with role <strong>{user.role}</strong>.
      </div>
    );
  }

  return (
    <>
      <h1>Moderation queue</h1>
      <p className="subtle">
        Pending submissions, via get_moderation_queue(). Signed in as {user.email}.
      </p>

      {error && <div className="error">{error}</div>}

      {queue === null && !error && <div className="empty">Loading…</div>}
      {queue !== null && queue.length === 0 && <div className="empty">Queue is empty.</div>}

      {queue !== null && queue.length > 0 && (
        <div className="grid">
          {queue.map((m) => (
            <article key={m.id} className="card">
              <MediaThumb storageKey={m.preview_key} alt={m.title} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{m.title}</h3>
                <span className={`badge ${m.status}`}>{m.status}</span>
              </div>
              <p className="meta">{m.category} · {m.location}</p>
              {m.lens && <p className="meta">{m.lens}</p>}
              <p className="price">{m.price_sats.toLocaleString()} sats</p>
              {m.storage_key && <p className="meta">key: {m.storage_key}</p>}
              <div className="row" style={{ marginTop: '0.6rem' }}>
                <button disabled={busyId === m.id} onClick={() => act('approve', m.id)}>
                  {busyId === m.id ? '…' : 'Approve'}
                </button>
                <button className="danger" disabled={busyId === m.id}
                        onClick={() => act('reject', m.id)}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
