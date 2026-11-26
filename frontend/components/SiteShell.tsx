'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountLink from './AccountLink';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/') return <>{children}</>;

  const isSignInPage = pathname === '/auth/login' || pathname === '/photographer/login';
  const mainClass = isSignInPage ? 'site-main site-main-sign-in'
    : pathname === '/gallery' ? 'site-main site-main-gallery' : 'site-main';
  const shell = (
    <>
      <header className="site-header">
        <Link href="/" className="brand">NatuVara</Link>
        <nav>
          <Link href="/gallery">Gallery</Link>
          <Link href="/photographer">Photographers</Link>
          <Link href="/photographer/dashboard">Dashboard</Link>
          <Link href="/photographer/submit">Submit</Link>
          <Link href="/admin">Admin</Link>
          <AccountLink />
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>
      <main className={mainClass}>
        {children}
      </main>
    </>
  );

  return isSignInPage ? <div className="sign-in-shell">{shell}</div> : shell;
}
