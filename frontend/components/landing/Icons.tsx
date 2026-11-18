import type { ReactNode, SVGProps } from 'react';

function icon(children: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {children}
      </svg>
    );
  };
}

export const ArrowDownRight = icon(<><path d="m7 7 10 10M17 7v10H7" /></>);
export const ArrowLeft = icon(<><path d="m12 19-7-7 7-7M5 12h14" /></>);
export const ArrowRight = icon(<><path d="m12 5 7 7-7 7M5 12h14" /></>);
export const ArrowUpRight = icon(<><path d="M7 7h10v10M7 17 17 7" /></>);
export const Aperture = icon(<><circle cx="12" cy="12" r="10" /><path d="m14.31 8 5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16 3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94" /></>);
export const Bookmark = icon(<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />);
export const Check = icon(<path d="m20 6-11 11-5-5" />);
export const ChevronDown = icon(<path d="m6 9 6 6 6-6" />);
export const Compass = icon(<><circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" /></>);
export const Heart = icon(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />);
export const Image = icon(<><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4-4L7 21" /></>);
export const Leaf = icon(<><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 2 17 2c2 2 4 6 4 10 0 5.5-4.8 9-10 8ZM2 22c0-6 5-11 11-13" /></>);
export const MapPin = icon(<><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>);
export const Menu = icon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const Search = icon(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>);
export const Sparkles = icon(<><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM5 3v4M3 5h4M19 17v4M17 19h4" /></>);
export const X = icon(<path d="m18 6-12 12M6 6l12 12" />);
