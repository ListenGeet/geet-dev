'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from './MeProvider';

/** Sends a signed-in person who has not finished onboarding to /onboarding. Once finished it never repeats. */
export function OnboardingGuard() {
  const { me, status } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status !== 'ready' || !me || me.onboarded) return;
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/sign-')) return;
    router.replace('/onboarding');
  }, [status, me, pathname, router]);
  return null;
}
