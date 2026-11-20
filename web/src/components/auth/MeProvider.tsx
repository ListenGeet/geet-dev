'use client';

import { useAuth } from '@clerk/nextjs';
import type { MeDto } from '@geet/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { callApi } from '@/lib/api';

type Status = 'loading' | 'guest' | 'ready' | 'error';

interface MeState {
  me: MeDto | null;
  status: Status;
  setMe: (me: MeDto) => void;
  refresh: () => Promise<void>;
  /** Calls the API as the signed-in person. */
  api: <T>(
    path: string,
    options?: { method?: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE'; body?: unknown },
  ) => Promise<T>;
}

const Ctx = createContext<MeState | null>(null);

/** Loads GET /api/me once Clerk says someone is signed in. The first call also creates their profile. */
export function MeProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [me, setMe] = useState<MeDto | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const api = useCallback<MeState['api']>(
    (path, options = {}) => callApi(path, { ...options, token: () => getToken() }),
    [getToken],
  );

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeDto>('/api/me'));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [api]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMe(null);
      setStatus('guest');
      return;
    }
    void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  const value = useMemo(() => ({ me, status, setMe, refresh, api }), [me, status, refresh, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMe must be used inside MeProvider');
  return ctx;
}
