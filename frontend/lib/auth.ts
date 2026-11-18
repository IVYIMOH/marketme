import { supabase } from './supabaseClient';
import { getMyPhotographerProfile } from './api';
import { chooseSignInDestination, validateNext, type SignInOptions } from './authRedirect';

export type AppRole = 'buyer' | 'photographer' | 'admin';

export interface AppUser {
  id: string;
  email: string | null;
  displayName: string;
  company: string | null;
  role: AppRole;
}

export class AuthError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * The custom_access_token_hook (see the migration) writes our app role
 * into app_metadata.app_role on every issued JWT — decode it from the
 * current session rather than querying `profiles.role` directly.
 * profiles.role is NOT client-readable at all (see migration comments);
 * this is the only correct way to read your own role client-side.
 *
 * Known tradeoff, stated explicitly rather than hidden: if an admin is
 * demoted, their existing token keeps app_role: 'admin' until it
 * refreshes (default ~1h). This only affects client-side UI/UX gating —
 * every real server-side check (approve_media, is_admin(), etc.) reads
 * the table directly and is correct immediately regardless of token age.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The hook writes app_role into the JWT CLAIMS. It does not touch the stored
 * auth.users.raw_app_meta_data, and session.user.app_metadata is serialised
 * from that stored record — so reading session.user.app_metadata.app_role
 * always yields undefined and silently degrades every user to 'buyer'.
 * The claim only exists in the access token, so decode it.
 */
function extractRole(session: { access_token?: string } | null): AppRole {
  const claims = session?.access_token ? decodeJwtPayload(session.access_token) : null;
  const appMeta = claims?.app_metadata as Record<string, unknown> | undefined;
  const role = appMeta?.app_role;
  return (role === 'photographer' || role === 'admin') ? role : 'buyer';
}

function toAppUser(session: {
  access_token?: string;
  user: { id: string; email?: string | null; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
}): AppUser {
  const metadata = session.user.user_metadata ?? {};
  const displayName = [metadata.display_name, metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    displayName: displayName?.trim() ?? 'User',
    company: typeof metadata.company === 'string' ? metadata.company.trim() || null : null,
    role: extractRole(session),
  };
}

function authCallbackUrl(options: SignInOptions): string {
  const url = new URL('/auth/callback', window.location.origin);
  const next = validateNext(options.next);
  if (next) url.searchParams.set('next', next);
  if (options.photographerIntent) url.searchParams.set('photographer', '1');
  return url.toString();
}

export async function register(
  email: string,
  password: string,
  displayName: string,
  options: SignInOptions = {},
): Promise<AppUser> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: authCallbackUrl(options),
    },
  });
  if (error) throw new AuthError(error.message, error.code);
  if (!data.session) {
    // Email confirmation required — no session yet. Caller must show a
    // "check your email" state, same real behavior proven in marketme.
    throw new AuthError('Account created. Check your email to confirm before signing in.');
  }
  return toAppUser(data.session);
}

export async function login(email: string, password: string): Promise<AppUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AuthError(error.message, error.code);
  return toAppUser(data.session!);
}

export async function sendEmailCode(email: string, options: SignInOptions = {}): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: authCallbackUrl(options),
    },
  });
  if (error) throw new AuthError(error.message, error.code);
}

export async function verifyEmailCode(email: string, code: string): Promise<AppUser> {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) throw new AuthError('Enter the six-digit code from your email.');
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
  if (error) throw new AuthError(error.message, error.code);
  if (!data.session) throw new AuthError('Verification did not create a session. Request a new code and try again.');
  return toAppUser(data.session);
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(error.message);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AuthError(error.message, error.code);
  if (!data.session) return null;
  const { data: userData, error: userError } = await supabase.auth.getUser(data.session.access_token);
  if (userError) throw new AuthError(userError.message, userError.code);
  if (!userData.user || userData.user.id !== data.session.user.id) return null;
  return toAppUser({ ...data.session, user: userData.user });
}

/**
 * Real Supabase gotcha, proven the hard way in the marketme project:
 * do not await another Supabase call directly inside this callback —
 * supabase-js holds an internal auth lock while it runs, and awaiting
 * a second Supabase call inside it can deadlock. Defer with
 * setTimeout(fn, 0) if the callback needs to do more Supabase work.
 */
export function onAuthStateChange(callback: (user: AppUser | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      callback(session ? toAppUser(session) : null);
    }, 0);
  });
}

export async function signInWithGoogle(options: SignInOptions = {}): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authCallbackUrl(options) },
  });
  if (error) throw new AuthError(error.message, error.code);
}

export async function resendConfirmation(
  email: string,
  options: SignInOptions = {},
): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl(options) },
  });
  if (error) throw new AuthError(error.message, error.code);
}

export async function getSignInDestination(
  user: AppUser,
  options: SignInOptions = {},
): Promise<string> {
  if (user.role === 'admin') return '/admin';

  const photographer = await getMyPhotographerProfile();
  return chooseSignInDestination({
    role: user.role,
    hasPhotographerProfile: photographer?.user_id === user.id,
    next: options.next,
    photographerIntent: options.photographerIntent,
  });
}

export function homeForRole(role: AppRole): string {
  if (role === 'photographer') return '/photographer/dashboard';
  if (role === 'admin') return '/admin';
  return '/gallery';
}
