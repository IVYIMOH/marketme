import { redirect } from 'next/navigation';
import { validateNext } from '@/lib/authRedirect';

export default async function PhotographerRegisterPage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = validateNext((await searchParams).next);
  redirect(next ? `/photographer/login?${new URLSearchParams({ next })}` : '/photographer/login');
}
