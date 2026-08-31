'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MediaThumb from '@/components/MediaThumb';
import { getMedia, type Media } from '@/lib/api';

export default function GalleryPage() {
  const [items, setItems] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMedia()
      .then((rows) => { if (active) setItems(rows); })
      .catch((e) => { if (active) setError(e.message ?? String(e)); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <h1>Gallery</h1>
      <p className="subtle">
        Approved work only. Served by getMedia(), which selects the publicly
        granted columns and filters status=&apos;approved&apos;.
      </p>

      {error && <div className="error">{error}</div>}

      {items === null && !error && <div className="empty">Loading…</div>}

      {items !== null && items.length === 0 && (
        <div className="empty">
          Nothing approved yet. Submissions stay invisible here until an admin
          approves them.
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid">
          {items.map((m) => (
            <article key={m.id} className="card">
              <Link href={`/image/${m.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <MediaThumb storageKey={m.preview_key} alt={m.title} />
                <h3>{m.title}</h3>
              </Link>
              <p className="meta">{m.category} · {m.location}</p>
              {m.lens && <p className="meta">{m.lens}</p>}
              <p className="price">{m.price_sats.toLocaleString()} sats</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
