import type { AppRole } from './auth';

export interface SignInOptions {
  next?: string | null;
  photographerIntent?: boolean;
}

interface DestinationFacts extends SignInOptions {
  role: AppRole;
  hasPhotographerProfile: boolean;
}

const parsingOrigin = 'https://redirect.invalid';
const authPaths = [
  '/auth',
  '/photographer/login',
  '/photographer/register',
  '/photographer/complete-profile',
];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route + '/');
}

function parseNext(next: string | null | undefined): { value: string; pathname: string } | null {
  if (typeof next !== 'string' || !next) return null;

  try {
    let candidate = next;
    while (true) {
      if (
        !candidate.startsWith('/') ||
        candidate.includes('//') ||
        candidate.includes('\\') ||
        /[\u0000-\u0020\u007f]/.test(candidate)
      ) return null;

      const parsed = new URL(candidate, parsingOrigin);
      const pathname = parsed.pathname.toLowerCase();
      if (
        parsed.origin !== parsingOrigin ||
        authPaths.some((route) => matchesRoute(pathname, route))
      ) return null;

      // Validate decoded forms too, including encoded separators and auth paths.
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return { value: next, pathname };
      candidate = decoded;
    }
  } catch {
    return null;
  }
}

export function validateNext(next: string | null | undefined): string | null {
  return parseNext(next)?.value ?? null;
}

export function chooseSignInDestination({
  role,
  hasPhotographerProfile,
  photographerIntent = false,
  next,
}: DestinationFacts): string {
  if (role === 'admin') return '/admin';
  if (photographerIntent && !hasPhotographerProfile) {
    return '/photographer/complete-profile';
  }

  const requested = parseNext(next);
  const needsPhotographer = requested && ['/photographer/dashboard', '/photographer/submit']
    .some((route) => matchesRoute(requested.pathname, route));

  if (
    requested &&
    !matchesRoute(requested.pathname, '/admin') &&
    (!needsPhotographer || hasPhotographerProfile)
  ) return requested.value;

  return hasPhotographerProfile ? '/photographer/dashboard' : '/gallery';
}
