import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let activeSubscribers = 0;

/**
 * Manages Supabase Realtime lazily:
 * The WebSocket connection stays closed until chat or a jam is opened.
 * docs/07, docs/13.
 */
export function getRealtimeClient(getToken: () => Promise<string | null>): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key';
  if (!url) return null;

  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      accessToken: async () => {
        try {
          const token = await getToken();
          return token ?? '';
        } catch {
          return '';
        }
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return client;
}

export function retainRealtime(): void {
  activeSubscribers++;
}

export function releaseRealtime(): void {
  activeSubscribers = Math.max(0, activeSubscribers - 1);
  if (activeSubscribers === 0 && client) {
    try {
      client.realtime.disconnect();
    } catch {
      // ignore
    }
    client = null;
  }
}
