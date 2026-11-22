import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(resolve(process.cwd(), 'api/.env.local'));
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const from = value('--from');
const to = value('--to');
if (!['supabase', 'b2'].includes(from) || !['supabase', 'b2'].includes(to) || from === to)
  throw new Error('Use --from supabase|b2 --to supabase|b2 with different providers.');

const supabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase migration environment is incomplete.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(process.env.STORAGE_BUCKET || 'audio');
};
const b2Config = () => {
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucketName = process.env.B2_BUCKET;
  if (!keyId || !applicationKey || !bucketName)
    throw new Error('B2 migration environment is incomplete.');
  return { keyId, applicationKey, bucketName };
};
async function b2Auth() {
  const { keyId, applicationKey, bucketName } = b2Config();
  const response = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString('base64')}`,
    },
  });
  if (!response.ok) throw new Error(`B2 authorization failed (${response.status}).`);
  return { ...(await response.json()), bucketName };
}
async function listSource() {
  const prefixes = ['incoming/', 'tracks/', 'covers/', 'promos/'];
  if (from === 'b2') {
    const auth = await b2Auth();
    const objects = [];
    for (const prefix of prefixes) {
      let startFileName;
      do {
        const response = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
          method: 'POST',
          headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketId: auth.allowed.bucketId,
            prefix,
            startFileName,
            maxFileCount: 1000,
          }),
        });
        if (!response.ok) throw new Error(`B2 list failed (${response.status}).`);
        const result = await response.json();
        objects.push(
          ...result.files.map((file) => ({
            key: file.fileName,
            size: file.contentLength,
            id: file.fileId,
            type: file.contentType,
          })),
        );
        startFileName = result.nextFileName;
      } while (startFileName);
    }
    return { objects, auth };
  }
  const bucket = supabase();
  const objects = [];
  async function walk(prefix) {
    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`Supabase list failed: ${error.message}`);
      if (!data.length) break;
      for (const entry of data) {
        const key = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) await walk(key);
        else
          objects.push({
            key,
            size: Number(entry.metadata?.size ?? 0),
            type: entry.metadata?.mimetype ?? 'application/octet-stream',
          });
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  for (const prefix of prefixes) await walk(prefix.replace(/\/$/, ''));
  return { objects };
}
async function readObject(object, auth) {
  if (from === 'supabase') {
    const { data, error } = await supabase().download(object.key);
    if (error) throw new Error(`Supabase download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  const response = await fetch(
    `${auth.downloadUrl}/file/${encodeURIComponent(auth.bucketName)}/${object.key.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { Authorization: auth.authorizationToken } },
  );
  if (!response.ok) throw new Error(`B2 download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
async function writeObject(object, bytes, auth) {
  if (to === 'supabase') {
    const { error } = await supabase().upload(object.key, bytes, {
      contentType: object.type,
      upsert: true,
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return;
  }
  const { apiUrl, authorizationToken, allowed } = auth;
  const response = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: allowed.bucketId }),
  });
  if (!response.ok) throw new Error(`B2 upload URL failed (${response.status}).`);
  const grant = await response.json();
  const digest = createHash('sha1').update(bytes).digest('hex');
  const upload = await fetch(grant.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: grant.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(object.key),
      'Content-Type': object.type || 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'X-Bz-Content-Sha1': digest,
    },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`B2 upload failed (${upload.status}).`);
}

const { objects, auth: sourceAuth } = await listSource();
const destinationAuth = to === 'b2' ? await b2Auth() : undefined;
let copied = 0;
let totalBytes = 0;
for (const object of objects) {
  const bytes = await readObject(object, sourceAuth);
  if (bytes.length !== object.size) throw new Error(`Size check failed for ${object.key}.`);
  await writeObject(object, bytes, destinationAuth);
  copied++;
  totalBytes += bytes.length;
}
console.log(
  `Copied ${copied} objects (${totalBytes} bytes) from ${from} to ${to}. Source objects were kept.`,
);
