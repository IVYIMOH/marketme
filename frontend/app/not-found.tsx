import Link from 'next/link';
import PhotoBanner from '@/components/PhotoBanner';

export default function NotFound() {
  return <>
    <PhotoBanner photoId="zebra"><h1>Page not found</h1></PhotoBanner>
    <Link href="/gallery">Back to the gallery</Link>
  </>;
}
