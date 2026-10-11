'use client';

import type { components } from '@genvr/api-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from './api';

type Paths = import('@genvr/api-client').paths;
export type Me = Paths['/v1/me']['get']['responses'][200]['content']['application/json'];
export type { components };

/**
 * Loads the current user. With `require: 'session'` it sends guests to /login;
 * with `require: 'onboarded'` it also sends new accounts to /onboarding.
 */
export function useMe(require: 'none' | 'session' | 'onboarded' = 'none') {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .GET('/v1/me')
      .then(({ data }) => {
        if (!active) return;
        setMe(data ?? null);
        setLoading(false);
        if (!data && require !== 'none') router.replace('/login');
        else if (data && require === 'onboarded' && !data.profile.onboarded) router.replace('/onboarding');
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        if (require !== 'none') router.replace('/login');
      });
    return () => {
      active = false;
    };
  }, [require, router]);

  return { me, loading };
}
