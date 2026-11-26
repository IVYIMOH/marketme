'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountLink from './AccountLink';
import SignInBackdrop from './SignInBackdrop';
import { Aperture } from './landing/Icons';

const pages = [
  ['/gallery', 'Gallery'], ['/photographer', 'Photographers'], ['/photographer/dashboard', 'Dashboard'],
  ['/photographer/submit', 'Submit'], ['/admin', 'Admin'],
];

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') return <>{children}</>;

  const accountPage = pathname.startsWith('/auth/') || ['/photographer/login', '/photographer/complete-profile'].includes(pathname);
  const mainClass = accountPage ? 'site-main site-main-sign-in' : pathname === '/gallery'
    ? 'site-main site-main-gallery' : pathname === '/photographer/submit' ? 'site-main site-main-submit' : 'site-main';
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="NatuVara home"><span className="brand-mark"><Aperture aria-hidden="true" /></span>Natu<span className="brand-accent">Vara</span></Link>
        <nav aria-label="Main navigation">{pages.map(([href, label]) =>
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>
        )}</nav>
        <div className="site-account"><AccountLink /></div>
      </header>
      <main className={mainClass}>
        {accountPage ? <SignInBackdrop>{children}</SignInBackdrop> : children}
      </main>
      <footer className="site-footer"><Link href="/">NatuVara</Link><Link href="/privacy">Privacy policy</Link></footer>
    </div>
  );
}
