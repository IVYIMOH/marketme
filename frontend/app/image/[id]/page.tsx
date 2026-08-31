'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import MediaThumb from '@/components/MediaThumb';
import { getMediaById, getPhotographers, getDisplayNames, type Media } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import {
  createInvoice,
  getMyPaymentForMedia,
  getDownloadUrl,
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

    (async () => {
      try {
        const m = await getMediaById(id);
        if (!active) return;
        setMedia(m);

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
    if (!id || payment?.status !== 'paid') return;
    let active = true;
    getDownloadUrl(id)
      .then((u) => { if (active) setDownloadUrl(u); })
      .catch(() => {});
    return () => { active = false; };
  }, [id, payment?.status]);

  // Poll the buyer's own payments row. Settlement is written server-side by
  // the webhook, so this is just observing a server-verified fact.
  const startPolling = useCallback(() => {
    if (!id || pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const row = await getMyPaymentForMedia(id);
        if (!row) return;
        setPayment(row);
        if (row.status !== 'pending') stopPolling();
      } catch { /* keep polling through transient errors */ }
    }, POLL_MS);
  }, [id, stopPolling]);

  useEffect(() => {
    if (payment?.status === 'pending' && invoice) startPolling();
    return stopPolling;
  }, [payment?.status, invoice, startPolling, stopPolling]);

  async function onPay() {
    if (!id) return;
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
        <h1>Not available</h1>
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

        <div>
          <h1>{media.title}</h1>
          <p className="meta">{media.category} · {media.location}</p>
          {media.lens && <p className="meta">Lens: {media.lens}</p>}
          <p className="meta">
            Photographer: {photographerName ?? <span className="subtle">unknown</span>}
          </p>
          <p className="price" style={{ fontSize: '1.15rem' }}>
            {media.price_sats.toLocaleString()} sats
          </p>

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

              {/* No QR: qrcode.react is not a dependency of this project. */}
              <p className="subtle" style={{ margin: '0.5rem 0 0' }}>
                No QR code yet — qrcode.react is not installed. Copy the invoice
                string into your wallet instead.
              </p>
            </div>
          )}

          {!paid && payment?.status === 'expired' && (
            <p className="subtle" style={{ marginTop: '0.5rem' }}>
              That invoice expired. Use the pay button to create a new one.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
