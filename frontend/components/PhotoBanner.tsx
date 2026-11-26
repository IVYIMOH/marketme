import Image from 'next/image';
import type { ReactNode } from 'react';
import { wildlifePhotos, type WildlifePhoto } from '@/lib/wildlifeSamples';

type Photo = Pick<WildlifePhoto, 'src' | 'alt' | 'author' | 'sourceUrl' | 'license' | 'licenseUrl'>;

export const serengeti: Photo = {
  src: '/wildlife/serengeti.webp',
  alt: 'An acacia tree rising from the golden grass of the Serengeti.',
  author: 'Bjørn Christian Tørrissen',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Serengeti-Landscape-2012.JPG',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
};

export function PhotoCredit({ photo }: { photo: Photo }) {
  return <small className="photo-credit">
    <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.author}</a>
    {' · '}<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>{' · crop'}
  </small>;
}

export default function PhotoBanner({ photoId, children }: { photoId: string; children: ReactNode }) {
  const photo = wildlifePhotos.find(entry => entry.id === photoId) ?? wildlifePhotos[0];
  return (
    <header className="photo-banner">
      <div className="photo-banner-image">
        <Image src={photo.src} alt={photo.alt} fill priority sizes="(max-width: 640px) 100vw, 60vw"
          style={{ objectPosition: photo.position }} />
      </div>
      <div className="photo-banner-copy">{children}</div>
      <PhotoCredit photo={photo} />
    </header>
  );
}
