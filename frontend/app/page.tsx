import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import '@/components/landing/landing.css';

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
  return <LandingPage />;
}
