import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { LandingPage } from '@/components/landing/LandingPage';
import '@/components/landing/landing.css';

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
  title: 'NatuVara — Wild places. Real stories.',
  description: 'Discover African wildlife photography, meet independent photographers, and collect their work on NatuVara.',
  openGraph: {
    title: 'NatuVara — Wild places. Real stories.',
    description: 'Wild places. Real stories. Discover the photographs and people that bring the natural world closer.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NatuVara — Wild places. Real stories.',
    description: 'Wild places. Real stories. Discover the photographs and people that bring the natural world closer.',
  },
};

export default function Home() {
  return (
    <div className={`${bodyFont.variable} ${displayFont.variable}`}>
      <LandingPage />
    </div>
  );
}
