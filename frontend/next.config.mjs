import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// Reject a privileged key before Next can inline it into a browser bundle.
const browserKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (browserKey) {
  let role;
  try { role = JSON.parse(Buffer.from(browserKey.split('.')[1], 'base64url').toString()).role; } catch {}
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(browserKey) && role !== 'anon') {
    throw new Error('The frontend requires a Supabase publishable key or anon JWT.');
  }
}

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (apiUrl) {
  let url;
  try { url = new URL(apiUrl); } catch { throw new Error('Invalid Supabase URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Use a credential-free HTTPS Supabase URL or an HTTP loopback address.');
  }
}

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  logging: { incomingRequests: false },
  // Production builds must not replace a running development server's files.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});

export default nextConfig;
