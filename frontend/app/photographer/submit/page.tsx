'use client';

import { useEffect, useState } from 'react';
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
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setOk(`Submitted "${row.title}" — status ${row.status}. Uploaded to ${storageKey}. It stays out of the gallery until an admin approves it.`);
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
        No photographer profile is linked to this account. An admin must set your
        role to photographer — the photographers row is then created automatically.
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {error && <div className="error">{error}</div>}
      {ok && <div className="ok">{ok}</div>}

      <p className="subtle" style={{ margin: 0 }}>
        Submitting as photographer <code>{photographer.id}</code> · level {photographer.level}
      </p>

      <label>
        Image file
        <input
          key={fileInputKey}
          id="media-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <label>
        Title
        <input value={title} required onChange={(e) => setTitle(e.target.value)} />
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
        <input value={location} required onChange={(e) => setLocation(e.target.value)} />
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

      <div className="row">
        <button type="submit" disabled={busy || !file}>
          {busy ? 'Uploading…' : 'Submit for review'}
        </button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        The file is uploaded to the private &apos;media&apos; bucket under your
        photographer id, and that storage path becomes storage_key. JPEG, PNG or
        WebP, up to 10 MiB.
      </p>
    </form>
  );
}

export default function SubmitPage() {
  return (
    <ProtectedRoute requiredRole="photographer">
      <h1>Submit work</h1>
      <p className="subtle">Every submission enters as pending.</p>
      <SubmitForm />
    </ProtectedRoute>
  );
}
