'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import MediaThumb from '@/components/MediaThumb';
import PhotoBanner from '@/components/PhotoBanner';
import { MapPin } from '@/components/landing/Icons';
import SampleAttribution from '@/components/SampleAttribution';
import { getMediaById, getPhotographers, getDisplayNames, type Media } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import {
  createInvoice,
  getMyPaymentForMedia,
  getDownloadUrl,
  checkPayment,
  type Invoice,
  type PaymentRow,
} from '@/lib/lightning';

const POLL_MS = 3000;

export default function ImageDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [media, setMedia] = useState<Media | null>(null);
  const [photographerName, setPhotographerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setMedia(null);
    setPhotographerName(null);
    setError(null);
    setPayment(null);
    setInvoice(null);
    setDownloadUrl(null);
    setPayError(null);

    (async () => {
      try {
        const m = await getMediaById(id);
        if (!active) return;
        setMedia(m);

        if (m.is_sample) return;

        const photographers = await getPhotographers();
        if (!active) return;
        const ph = photographers.find((p) => p.id === m.photographer_id);
        if (ph) {
          const names = await getDisplayNames([ph.user_id]);
          if (active) setPhotographerName(names[ph.user_id] ?? null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }

      const user = await getCurrentUser();
      if (!active) return;
      setSignedIn(!!user);
      if (user) {
        try {
          const row = await getMyPaymentForMedia(id);
          if (active) setPayment(row);
        } catch { /* a missing payment row is not an error */ }
      }
    })();

    return () => { active = false; stopPolling(); };
  }, [id, stopPolling]);

  // Once paid, fetch the gated download URL.
  useEffect(() => {
    if (!id || !media || media.is_sample || payment?.status !== 'paid') return;
    let active = true;
    getDownloadUrl(id)
      .then((u) => { if (active) setDownloadUrl(u); })
      .catch(() => {});
    return () => { active = false; };
  }, [id, media, payment?.status]);

  // Poll while an invoice is outstanding.
  //
  // This calls check-payment rather than just re-reading the payments row: the
  // row only changes when something server-side verifies with the provider, and
  // the webhook cannot be relied on to be that something (single-attempt
  // delivery, cold starts). check-payment verifies on demand, so a buyer who
  // genuinely paid is never left stuck on 'pending'.
  const startPolling = useCallback(() => {
    if (!id || !media || media.is_sample || pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const result = await checkPayment({ mediaId: id });
        if (result.status === 'unknown') return; // provider unreachable; keep waiting
        const row = await getMyPaymentForMedia(id);
        if (row) setPayment(row);
        if (result.status !== 'pending') stopPolling();
      } catch {
        // Fall back to a plain row read so a transient function error does not
        // stall a settlement that already landed via the webhook.
        try {
          const row = await getMyPaymentForMedia(id);
          if (row) {
            setPayment(row);
            if (row.status !== 'pending') stopPolling();
          }
        } catch { /* keep polling */ }
      }
    }, POLL_MS);
  }, [id, media, stopPolling]);

  // Reconcile whenever a pending row exists — not only right after creating an
  // invoice. A buyer returning to the page after paying (with the webhook lost)
  // has a pending row and no invoice in state, and must still get settled.
  useEffect(() => {
    if (payment?.status === 'pending') startPolling();
    return stopPolling;
  }, [payment?.status, startPolling, stopPolling]);

  async function onPay() {
    if (!id || !media || media.is_sample) return;
    setPayError(null);
    setBusy(true);
    try {
      const result = await createInvoice(id);
      if ('alreadyPaid' in result) {
        const row = await getMyPaymentForMedia(id);
        setPayment(row);
        return;
      }
      setInvoice(result);
      const row = await getMyPaymentForMedia(id);
      setPayment(row);
      startPolling();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyInvoice() {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.paymentRequest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  if (error) {
    return (
      <>
        <PhotoBanner photoId="zebra"><h1>Photograph unavailable</h1></PhotoBanner>
        <div className="error">{error}</div>
        <p className="subtle" style={{ marginTop: '1rem' }}>
          <Link href="/gallery">Back to gallery</Link>
        </p>
      </>
    );
  }

  if (!media) return <div className="empty">Loading…</div>;

  const paid = payment?.status === 'paid';

  return (
    <>
      <p className="subtle" style={{ marginBottom: '0.75rem' }}>
        <Link href="/gallery">← Gallery</Link>
      </p>

      <div className="detail">
        <div className="detail-image">
          <MediaThumb storageKey={media.preview_key} alt={media.title} />
        </div>

        <div className="detail-copy">
          <p className="gallery-card-category">{media.category}</p>
          <h1>{media.title}</h1>
          <p className="gallery-card-location"><MapPin aria-hidden="true" />{media.location}</p>
          {media.lens && <p className="meta">Lens: {media.lens}</p>}
          {media.is_sample ? <SampleAttribution media={media} /> : <p className="meta">
            Photographer: {photographerName ?? <span className="subtle">unknown</span>}
          </p>}
          <p className="price" style={{ fontSize: '1.15rem' }}>
            {media.is_sample ? 'Sample — not for sale' : `${media.price_sats.toLocaleString()} sats`}
          </p>

          {!media.is_sample && <>
          {payError && <div className="error" style={{ marginTop: '0.75rem' }}>{payError}</div>}

          {/* ---------- paid: download unlocked ---------- */}
          {paid && (
            <div className="ok" style={{ marginTop: '0.75rem' }}>
              <strong>Purchased.</strong>{' '}
              {payment?.paid_at && <>Paid {new Date(payment.paid_at).toLocaleString()}. </>}
              {downloadUrl ? (
                <a href={downloadUrl}>Download the full-resolution original</a>
              ) : (
                <span className="subtle">Preparing your download link…</span>
              )}
            </div>
          )}

          {/* ---------- not signed in ---------- */}
          {!paid && signedIn === false && (
            <p className="subtle" style={{ marginTop: '0.75rem' }}>
              <Link href="/auth/login">Sign in</Link> to buy this.
            </p>
          )}

          {/* ---------- signed in, nothing pending ---------- */}
          {!paid && signedIn && !invoice && payment?.status !== 'pending' && (
            <button onClick={onPay} disabled={busy} style={{ marginTop: '0.75rem' }}>
              {busy ? 'Creating invoice…' : `Pay ${media.price_sats.toLocaleString()} sats`}
            </button>
          )}

          {/* ---------- awaiting payment ---------- */}
          {!paid && (invoice || payment?.status === 'pending') && (
            <div className="invoice-box">
              <p className="meta" style={{ margin: '0 0 0.4rem' }}>
                <strong>Awaiting payment</strong> — pay this Lightning invoice with any
                wallet. This page updates itself once the network confirms it.
              </p>

              <label style={{ marginBottom: '0.4rem' }}>
                BOLT11 invoice
                <textarea
                  readOnly
                  rows={4}
                  value={invoice?.paymentRequest ?? payment?.payment_request ?? ''}
                  onFocus={(e) => e.currentTarget.select()}
                  className="invoice-text"
                />
              </label>

              <div className="row">
                <button className="ghost" onClick={copyInvoice} disabled={!invoice}>
                  {copied ? 'Copied' : 'Copy invoice'}
                </button>
                <span className="subtle">
                  {(invoice?.expiresAt ?? payment?.expires_at) &&
                    `Expires ${new Date(
                      (invoice?.expiresAt ?? payment?.expires_at) as string
                    ).toLocaleTimeString()}`}
                </span>
              </div>


            </div>
          )}

          {!paid && payment?.status === 'expired' && (
            <p className="subtle" style={{ marginTop: '0.5rem' }}>
              That invoice expired. Use the pay button to create a new one.
            </p>
          )}
          </>}
        </div>
      </div>
    </>
  );
}
