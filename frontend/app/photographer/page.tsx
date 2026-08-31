'use client';

import { useEffect, useState } from 'react';
import { getPhotographers, getDisplayNames, type Photographer } from '@/lib/api';

export default function PhotographersPage() {
  const [items, setItems] = useState<Photographer[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const rows = await getPhotographers();
        if (!active) return;
        setItems(rows);
        const map = await getDisplayNames(rows.map((r) => r.user_id));
        if (active) setNames(map);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { active = false; };
  }, []);

  return (
    <>
      <h1>Photographers</h1>
      <p className="subtle">
        Directory from getPhotographers(), with names read from profiles.
      </p>

      {error && <div className="error">{error}</div>}
      {items === null && !error && <div className="empty">Loading…</div>}
      {items !== null && items.length === 0 && (
        <div className="empty">No photographers yet.</div>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid">
          {items.map((p) => (
            <article key={p.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{names[p.user_id] ?? 'Photographer'}</h3>
                <span className="badge level">{p.level}</span>
              </div>
              <p className="meta">{p.bio?.trim() ? p.bio : <em>No bio yet.</em>}</p>
              {p.verified_at && (
                <p className="meta">verified {new Date(p.verified_at).toLocaleDateString()}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
