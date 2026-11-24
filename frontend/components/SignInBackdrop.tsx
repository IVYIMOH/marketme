import Image from 'next/image';
import type { ReactNode } from 'react';
import { wildlifePhotos } from '@/lib/wildlifeSamples';

export default function SignInBackdrop({ children }: { children: ReactNode }) {
  const photo = wildlifePhotos.find((entry) => entry.id === 'cheetah');
  if (!photo) return <>{children}</>;

  return (
    <div className="auth-scene">
      <div className="auth-scene-visual" aria-hidden="true">
        <Image src={photo.src} alt="" fill priority sizes="(max-width: 720px) 100vw, 76vw" />
      </div>
      <div className="auth-scene-content">
        <div className="auth-scene-story">
          <span className="auth-scene-eyebrow">The NatuVara community</span>
          <p className="auth-scene-title">Wild places.<br /><span>Real stories.</span></p>
          <p className="auth-scene-description">A little closer to nature. A little closer to the people who capture it.</p>
        </div>
        <div className="auth-scene-form">{children}</div>
        <p className="auth-scene-credit">
          <strong>{photo.location}</strong>
          <span>
            Photo by <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.author}</a>
            {' · '}<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>
            {' · Cropped for display'}
          </span>
        </p>
      </div>
    </div>
  );
}
