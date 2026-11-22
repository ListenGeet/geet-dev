import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(resolve(process.cwd(), 'api/.env.local'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase test environment is missing required variable names.');

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: dbError } = await supabase
  .from('rate_limits')
  .select('key', { head: true, count: 'exact' })
  .limit(1);
if (dbError)
  throw new Error(
    `Supabase database check failed (${dbError.status ?? 'no-status'}, ${
      /fetch|network|socket|dns|timeout/i.test(String(dbError.message ?? ''))
        ? 'network failure'
        : 'request failure'
    }).`,
  );
console.log('Supabase database: reachable.');

const bucket = supabase.storage.from(process.env.STORAGE_BUCKET || 'audio');
const { data, error } = await bucket.createSignedUploadUrl(
  `incoming/smoke-test/${crypto.randomUUID()}`,
  { upsert: true },
);
if (error || !data?.signedUrl) {
  throw new Error(`Supabase Storage signing failed (${error?.statusCode ?? 'unknown'}).`);
}
console.log('Supabase Storage: signed upload URL issued; no object was uploaded.');
