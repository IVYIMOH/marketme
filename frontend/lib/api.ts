import { supabase } from './supabaseClient';

export interface Media {
  id: string;
  photographer_id: string | null;
  is_sample: boolean;
  photographer_credit: string | null;
  source_url: string | null;
  license_name: string | null;
  license_url: string | null;
  title: string;
  category: string;
  location: string;
  lens: string | null;
  price_sats: number;
  preview_key: string;
  storage_key?: string; // only present when returned by an accessor function
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string | null;
  moderated_by?: string | null;
  moderated_at?: string | null;
  created_at: string;
}

export interface Photographer {
  id: string;
  user_id: string;
  bio: string;
  level: 'field' | 'verified' | 'master';
  verified_at: string | null;
  created_at: string;
  company?: string | null; // Returned by the private profile accessor.
}

const PUBLIC_PHOTOGRAPHER_COLUMNS = 'id, user_id, bio, level, verified_at, created_at';

const PUBLIC_MEDIA_COLUMNS = 'id, photographer_id, title, category, location, lens, price_sats, preview_key, status, created_at, is_sample, photographer_credit, source_url, license_name, license_url';

export const GALLERY_PAGE_SIZE = 6;

export interface MediaPage {
  items: Media[];
  total: number;
}

/** Public gallery page. Only returns publicly-granted columns, never storage_key. */
export async function getMediaPage(page = 1): Promise<MediaPage> {
  const first = (page - 1) * GALLERY_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from('media')
    .select(PUBLIC_MEDIA_COLUMNS, { count: 'exact' })
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(first, first + GALLERY_PAGE_SIZE - 1);
  if (error) throw error;
  return { items: data as Media[], total: count ?? 0 };
}

export async function getMediaById(id: string): Promise<Media> {
  const { data, error } = await supabase
    .from('media')
    .select(PUBLIC_MEDIA_COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Media;
}

export async function getPhotographers(): Promise<Photographer[]> {
  const { data, error } = await supabase.from('photographers').select(PUBLIC_PHOTOGRAPHER_COLUMNS);
  if (error) throw error;
  return data as Photographer[];
}

export async function getMyPhotographerProfile(): Promise<Photographer | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (!userData.user) {
    if (userError && userError.name !== 'AuthSessionMissingError') throw new Error(userError.message);
    return null;
  }
  if (userError) throw new Error(userError.message);
  const { data, error } = await supabase.rpc('get_my_photographer_profile').maybeSingle();
  if (error) throw new Error(error.message);
  const profile = data as Photographer | null;
  if (profile && profile.user_id !== userData.user.id) {
    throw new Error('Your session changed. Please sign in again.');
  }
  return profile;
}

export async function completeMyPhotographerProfile(input: {
  displayName: string;
  company: string;
}): Promise<void> {
  const displayName = input.displayName.trim();
  const company = input.company.trim();
  if (!displayName || !company) throw new Error('Name and company are required.');
  const { error } = await supabase.rpc('complete_photographer_profile', {
    profile_name: displayName,
    company_name: company,
  });
  if (error) throw new Error(error.message);
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { display_name: displayName },
  });
  if (metadataError) throw new Error(metadataError.message);
}

export async function submitMedia(input: {
  photographerId: string;
  title: string;
  category: string;
  location: string;
  lens?: string;
  priceSats: number;
  storageKey: string;
  mimeType?: string;
}): Promise<Media> {
  const { data, error } = await supabase
    .from('media')
    .insert({
      photographer_id: input.photographerId,
      title: input.title,
      category: input.category,
      location: input.location,
      lens: input.lens,
      price_sats: input.priceSats,
      storage_key: input.storageKey,
      mime_type: input.mimeType,
    })
    // Must name the granted columns explicitly. A bare .select() means
    // RETURNING *, which needs SELECT on storage_key — deliberately withheld
    // from `authenticated`, so the whole insert failed with 42501.
    .select(PUBLIC_MEDIA_COLUMNS)
    .single();
  if (error) {
    // A rejected database write leaves both newly uploaded files unreferenced.
    // A network error is ambiguous: the insert may have committed.
    if (/^(23|42501)/.test(error.code) && input.storageKey.startsWith(input.photographerId + '/originals/')) {
      const previewKey = input.storageKey.replace('/originals/', '/previews/') + '.jpg';
      await supabase.storage.from(MEDIA_BUCKET).remove([input.storageKey, previewKey]);
    }
    throw error;
  }
  return data as Media;
}

/** Photographer's own submissions, including storage_key and moderation
 * fields — routed through the accessor function, never a direct table
 * read (storage_key/reject_reason/moderated_* are not client-grantable
 * at the table level). */
export async function getMySubmissions(): Promise<Media[]> {
  const { data, error } = await supabase.rpc('get_my_submissions');
  if (error) throw error;
  return data as Media[];
}

/** Admin-only. Raises a permission error via Postgres if called by a
 * non-admin — surfaced here as a thrown error, not a silent empty list. */
export async function getModerationQueue(): Promise<Media[]> {
  const { data, error } = await supabase.rpc('get_moderation_queue');
  if (error) throw error;
  return data as Media[];
}

export async function approveMedia(mediaId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_media', { target_id: mediaId });
  if (error) throw error;
}

export async function rejectMedia(mediaId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('reject_media', { target_id: mediaId, reason: reason ?? null });
  if (error) throw error;
}

export async function setPhotographerLevel(
  photographerId: string,
  level: 'field' | 'verified' | 'master'
): Promise<void> {
  const { error } = await supabase.rpc('set_photographer_level', {
    target_id: photographerId,
    new_level: level,
  });
  if (error) throw error;
}

export const MEDIA_BUCKET = 'media';

/** Upload a re-encoded preview and a separate private original. */
export async function uploadMediaFile(photographerId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG or WebP image up to 10 MiB.');
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the preview.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  const preview = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!preview) throw new Error('Could not prepare the preview.');

  const id = crypto.randomUUID();
  const previewKey = `${photographerId}/previews/${id}.jpg`;
  const originalKey = `${photographerId}/originals/${id}`;
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const { error: previewError } = await bucket.upload(previewKey, preview, { contentType: 'image/jpeg' });
  if (previewError) throw previewError;
  const { error } = await bucket.upload(originalKey, file, { contentType: file.type });
  if (error) {
    await bucket.remove([previewKey]);
    throw error;
  }
  return originalKey;
}

/**
 * Signed URL for displaying a stored object. The bucket is private, so this is
 * the only way to render one.
 *
 * Returns null rather than throwing when the object is not readable: an
 * unapproved row is legitimately unreadable to the public, and a card should
 * degrade to a placeholder instead of taking the whole page down.
 *
 * Signature verified against the installed typings: createSignedUrl(path,
 * expiresIn, options?) -> { data: { signedUrl }, error }.
 */
export async function getSignedMediaUrl(key: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(key, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Display names for a set of auth user ids, read from profiles.
 *
 * Done as a separate query rather than a PostgREST embed: photographers.user_id
 * and profiles.id both reference auth.users(id), but there is no FK directly
 * between the two tables, so PostgREST has no relationship to traverse.
 * only directory entries and the caller’s own profile are visible.
 */
export async function getDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (error) throw error;
  return Object.fromEntries(
    (data as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name])
  );
}
