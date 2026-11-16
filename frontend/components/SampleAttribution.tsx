import type { Media } from '@/lib/api';

function httpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export default function SampleAttribution({ media }: { media: Media }) {
  const source = httpsUrl(media.source_url);
  const license = httpsUrl(media.license_url);
  return (
    <p className="meta">
      Photo: {media.photographer_credit}.{' '}
      {source && <><a href={source} rel="noreferrer">Source</a> · </>}
      {license ? <a href={license} rel="noreferrer">{media.license_name}</a> : media.license_name}.
      {' '}Resized and metadata removed.
    </p>
  );
}
