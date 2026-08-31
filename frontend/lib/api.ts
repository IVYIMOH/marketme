import { supabase } from './supabaseClient';

export interface Media {
  id: string;
  photographer_id: string;
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
}

/** Public gallery. Only ever returns the already-safe, publicly-granted
 * columns — never storage_key. Uses preview_key for the image source. */
export async function getMedia(): Promise<Media[]> {
  const { data, error } = await supabase
    .from('media')
    .select('id, photographer_id, title, category, location, lens, price_sats, preview_key, status, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Media[];
}

export async function getMediaById(id: string): Promise<Media> {
  const { data, error } = await supabase
    .from('media')
    .select('id, photographer_id, title, category, location, lens, price_sats, preview_key, status, created_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Media;
}

export async function getPhotographers(): Promise<Photographer[]> {
  const { data, error } = await supabase.from('photographers').select('*');
  if (error) throw error;
  return data as Photographer[];
}

export async function getMyPhotographerProfile(): Promise<Photographer | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from('photographers')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as Photographer | null;
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
    .select('id, photographer_id, title, category, location, lens, price_sats, preview_key, status, created_at')
    .single();
  if (error) throw error;
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

/**
 * Uploads the chosen file into the private 'media' bucket and returns the
 * storage path to pass to submitMedia() as storageKey.
 *
 * The path's first segment is the photographer id, which is what the
 * media_objects_insert_own policy checks — a photographer cannot write
 * outside their own folder even by crafting the path.
 *
 * Signature verified against the installed @supabase/supabase-js 2.112.4
 * typings: upload(path, fileBody, fileOptions?) -> { data: { id, path,
 * fullPath }, error }.
 */
export async function uploadMediaFile(photographerId: string, file: File): Promise<string> {
  const path = `${photographerId}/${crypto.randomUUID()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return data.path;
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
 * profiles is world-readable under profiles_select_public, so this needs no
 * new grant.
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