import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  // Production builds must not replace a running development server's files.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});

export default nextConfig;
