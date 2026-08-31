'use client';

import { useEffect, useState } from 'react';
import { getSignedMediaUrl } from '@/lib/api';

/**
 * Renders a stored object from the private 'media' bucket via a signed URL.
 *
 * Falls back to showing the key when no signed URL can be issued, which is the
 * correct outcome for an object the viewer is not entitled to read rather than
 * an error worth surfacing.
 */
export default function MediaThumb({ storageKey, alt }: { storageKey: string; alt: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getSignedMediaUrl(storageKey)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [storageKey]);

  if (url === undefined) return <div className="thumb">Loading…</div>;
  if (url === null) return <div className="thumb">{storageKey}</div>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URLs are
    // short-lived and host-scoped; next/image would need remotePatterns for a
    // URL whose query string changes on every render.
    <img src={url} alt={alt} className="thumb-img" />
  );
}
