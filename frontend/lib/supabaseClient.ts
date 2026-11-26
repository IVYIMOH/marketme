import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than firing requests at `undefined` —
  // same pattern already proven correct in the marketme project.
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Check your .env.local file against .env.example.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: 'pkce' } });

const settingsUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`;
const settingsHeaders = { apikey: supabaseAnonKey };

export async function isGoogleSignInEnabled(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(settingsUrl, { headers: settingsHeaders, signal });
  if (!response.ok) return false;
  const settings = await response.json();
  return settings?.external?.google === true;
}
