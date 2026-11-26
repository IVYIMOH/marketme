'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PhotoCredit, serengeti } from '@/components/PhotoBanner';
import { ArrowRight, Image as ImageIcon, MapPin } from '@/components/landing/Icons';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  getMyPhotographerProfile,
  submitMedia,
  uploadMediaFile,
  type Photographer,
} from '@/lib/api';

function SubmitForm() {
  const [photographer, setPhotographer] = useState<Photographer | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('landscape');
  const [location, setLocation] = useState('');
  const [lens, setLens] = useState('');
  const [priceSats, setPriceSats] = useState('10000');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFilePreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // photographer_id is resolved from the server, never guessed client-side.
  // The insert policy re-checks ownership regardless.
  useEffect(() => {
    let active = true;
    getMyPhotographerProfile()
      .then((p) => { if (active) setPhotographer(p); })
      .catch((e) => { if (active) { setPhotographer(null); setError(e.message ?? String(e)); } });
    return () => { active = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photographer || !file) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      // Upload first: if the object never lands there is no point creating a
      // media row that points at nothing.
      const storageKey = await uploadMediaFile(photographer.id, file);
      const row = await submitMedia({
        photographerId: photographer.id,
        title,
        category,
        location,
        lens: lens || undefined,
        priceSats: Number(priceSats),
        storageKey,
        mimeType: file.type,
      });
      setOk(`Submitted "${row.title}" — status ${row.status}. It stays out of the gallery until an admin approves it.`);
      setTitle(''); setLocation(''); setLens(''); setFile(null);
      // Remount the file input so the previous filename is cleared; a file
      // input's value cannot be set programmatically to anything but ''.
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (photographer === undefined) return <div className="empty">Loading your photographer profile…</div>;

  if (photographer === null) {
    return (
      <div className="empty">
        {error || <>To submit a photograph, <Link href="/photographer/complete-profile">complete your photographer profile</Link>.</>}
      </div>
    );
  }

  return (
    <form className="submit-form" aria-busy={busy} onSubmit={onSubmit}>
      {error && <div className="error" role="alert">{error}</div>}
      {ok && <div className="ok" role="status">{ok}</div>}

      <label className="upload-picker">
        {filePreview ? <img src={filePreview} alt="" className="upload-preview" /> : <span className="upload-icon"><ImageIcon aria-hidden="true" /></span>}
        <span className="upload-copy"><strong>{file ? file.name : 'Choose a photograph'}</strong>
          <small>{file ? 'Choose another file' : 'JPEG, PNG or WebP · Up to 10 MiB'}</small>
        </span>
        <input key={fileInputKey} id="media-file" type="file" aria-label="Image file"
          accept="image/jpeg,image/png,image/webp" required disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="submit-fields">
        <label>
          Title
          <input placeholder="Photograph title" value={title} required onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="landscape">landscape</option>
            <option value="cityscape">cityscape</option>
            <option value="portrait">portrait</option>
            <option value="wildlife">wildlife</option>
          </select>
        </label>
        <label>
          Location
          <input placeholder="Where was it taken?" value={location} required onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Lens (optional)
          <input value={lens} onChange={(e) => setLens(e.target.value)} placeholder="35mm f/1.4" />
        </label>
        <label>
          Price (sats)
          <input type="number" min={0} value={priceSats} required
                 onChange={(e) => setPriceSats(e.target.value)} />
        </label>
      </div>
      <p className="submit-note">Buyers receive your original file, including any embedded location information.</p>
      <button className="submit-action" type="submit" disabled={busy || !file}>
        {busy ? 'Uploading…' : 'Submit for review'}<ArrowRight aria-hidden="true" />
      </button>
    </form>
  );
}

export default function SubmitPage() {
  return (
    <article className="submit-card">
      <figure className="submit-landscape">
        <Image src={serengeti.src} alt={serengeti.alt} fill priority sizes="(max-width: 760px) 100vw, 38vw" />
        <figcaption>
          <span className="landscape-place"><MapPin aria-hidden="true" /> Tanzania</span>
          <strong>Serengeti</strong>
          <PhotoCredit photo={serengeti} />
        </figcaption>
      </figure>
      <section className="submit-panel">
        <header><h1>Submit a photograph</h1>
          <p className="subtle">Add your image and the details you’d like to share. We review each submission before it appears in the gallery.</p>
        </header>
        <ProtectedRoute requiredRole="photographer"><SubmitForm /></ProtectedRoute>
      </section>
    </article>
  );
}
