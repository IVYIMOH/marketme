import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'NatuVara',
  description: 'Photography marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">NatuVara</Link>
          <nav>
            <Link href="/gallery">Gallery</Link>
            <Link href="/photographer">Photographers</Link>
            <Link href="/photographer/dashboard">Dashboard</Link>
            <Link href="/photographer/submit">Submit</Link>
            <Link href="/admin">Admin</Link>
            <Link href="/auth/login">Sign in</Link>
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
