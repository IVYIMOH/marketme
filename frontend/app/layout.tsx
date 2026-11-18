import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'NatuVara',
  description: 'Photography marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
