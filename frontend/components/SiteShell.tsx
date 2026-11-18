'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/') return <>{children}</>;

  return (
    <>
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
    </>
  );
}
