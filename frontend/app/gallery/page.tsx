'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PhotoBanner from '@/components/PhotoBanner';
import { MapPin } from '@/components/landing/Icons';
import MediaThumb from '@/components/MediaThumb';
import SampleAttribution from '@/components/SampleAttribution';
import { GALLERY_PAGE_SIZE, getMediaPage, type Media } from '@/lib/api';

export default function GalleryPage() {
  const [items, setItems] = useState<Media[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageCount = Math.max(1, Math.ceil(total / GALLERY_PAGE_SIZE));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getMediaPage(page)
      .then((result) => {
        if (!active) return;
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / GALLERY_PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setItems(result.items);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load the gallery. Please try again.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [page, retry]);

  function changePage(nextPage: number) {
    if (loading || nextPage < 1 || nextPage > pageCount) return;
    setLoading(true);
    setPage(nextPage);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <section className="gallery-page" aria-labelledby="gallery-heading">
      <PhotoBanner photoId="elephant">
        <h1 id="gallery-heading" ref={heading} tabIndex={-1}>Gallery</h1>
        <p>Discover wildlife, wild places, and the people who capture them.</p>
      </PhotoBanner>
      <div className="gallery-header">
        <p className="gallery-count" role="status" aria-live="polite" aria-atomic="true">
          {loading ? 'Loading photographs…' : error ? 'Gallery unavailable' : total > 0
            ? `${(page - 1) * GALLERY_PAGE_SIZE + 1}–${Math.min(page * GALLERY_PAGE_SIZE, total)} of ${total} photos`
            : '0 photos'}
        </p>
      </div>

      <div id="gallery-results" aria-busy={loading}>
        {error && (
          <div className="gallery-error">
            <div className="error" role="alert">{error}</div>
            <button type="button" className="ghost" onClick={() => { setRetry((value) => value + 1); }}>Try again</button>
          </div>
        )}

        {loading && (
          <div className="gallery-grid" aria-label="Loading photographs" aria-busy="true">
            {Array.from({ length: GALLERY_PAGE_SIZE }, (_, index) => (
              <div key={index} className="gallery-skeleton" aria-hidden="true">
                <div className="gallery-skeleton-image" />
                <div className="gallery-skeleton-copy"><span /><span /></div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && items?.length === 0 && (
          <div className="empty">No photographs yet. Check back soon for new work.</div>
        )}

        {!loading && !error && items !== null && items.length > 0 && (
          <div className="gallery-grid">
            {items.map((m) => (
              <article key={m.id} className="gallery-card">
                <Link href={`/image/${m.id}`} className="gallery-card-link">
                  <div className="gallery-card-image">
                    <MediaThumb storageKey={m.preview_key} alt={m.title} />
                    <div className="gallery-card-heading">
                      <p className="gallery-card-category">{m.category}</p>
                      <h2>{m.title}</h2>
                    </div>
                  </div>
                </Link>
                <div className="gallery-card-details">
                  <p className="gallery-card-location"><MapPin aria-hidden="true" />{m.location}</p>
                  {m.lens && <p className="meta">{m.lens}</p>}
                  <p className="price">{m.is_sample ? 'Sample — not for sale' : `${m.price_sats.toLocaleString()} sats`}</p>
                  {m.is_sample && <SampleAttribution media={m} />}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {total > 0 && (
        <nav className="gallery-pagination" aria-label="Gallery pages">
          <button type="button" className="ghost" disabled={loading || page === 1}
            aria-controls="gallery-results" onClick={() => { changePage(page - 1); }}>← Previous</button>
          <span>Page <strong>{page}</strong> of {pageCount}</span>
          <button type="button" className="ghost" disabled={loading || page === pageCount}
            aria-controls="gallery-results" onClick={() => { changePage(page + 1); }}>Next →</button>
        </nav>
      )}
    </section>
  );
}
