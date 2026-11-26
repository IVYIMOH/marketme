import type { Metadata } from 'next';
import localFont from 'next/font/local';
import SiteShell from '@/components/SiteShell';
import './globals.css';

const bodyFont = localFont({
  src: [
    { path: '../public/fonts/marketme/dm-sans-400.ttf', weight: '400' },
    { path: '../public/fonts/marketme/dm-sans-500.ttf', weight: '500' },
    { path: '../public/fonts/marketme/dm-sans-600.ttf', weight: '600' },
    { path: '../public/fonts/marketme/dm-sans-700.ttf', weight: '700' },
  ],
  variable: '--font-landing-body',
  display: 'swap',
});

const displayFont = localFont({
  src: [
    { path: '../public/fonts/marketme/space-grotesk-400.ttf', weight: '400' },
    { path: '../public/fonts/marketme/space-grotesk-500.ttf', weight: '500' },
    { path: '../public/fonts/marketme/space-grotesk-600.ttf', weight: '600' },
    { path: '../public/fonts/marketme/space-grotesk-700.ttf', weight: '700' },
  ],
  variable: '--font-landing-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NatuVara',
  description: 'Photography marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
