import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';

export interface UploadGrant {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface Storage {
  signUpload(key: string, contentType: string, expiresSec?: number): Promise<UploadGrant>;
  signDownload(key: string, expiresSec: number): Promise<string>;
  remove(keys: string[]): Promise<void>;
  exists(key: string): Promise<{ size: number } | null>;
  copy?(fromKey: string, toKey: string): Promise<void>;
}

const encode = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

function s3Config() {
  const endpoint = process.env.B2_ENDPOINT;
  const bucket = process.env.B2_BUCKET;
  const access = process.env.B2_KEY_ID;
  const secret = process.env.B2_APPLICATION_KEY;
  if (!endpoint || !bucket || !access || !secret)
    throw new Error('B2 storage configuration is incomplete');
  const url = new URL(endpoint);
  const region = url.hostname.match(/s3[.-]([^.]+)/)?.[1] ?? 'us-east-1';
  return { url, bucket, access, secret, region };
}

function presign(key: string, method: 'GET' | 'PUT' | 'HEAD' | 'DELETE', expires: number): string {
  const { url: endpoint, bucket, access, secret, region } = s3Config();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const path = `/${encode(bucket)}/${key.split('/').map(encode).join('/')}`;
  const host = endpoint.host;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${access}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(Math.min(Math.max(expires, 1), 604800)),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQuery = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join('&');
  const canonical = `${method}\n${path}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const toSign = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonical)}`;
  const dateKey = hmac(`AWS4${secret}`, day);
  const signingKey = hmac(hmac(hmac(dateKey, region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  const signed = `${endpoint.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  return signed;
}

class B2Storage implements Storage {
  async signUpload(key: string, contentType: string, expiresSec = 900): Promise<UploadGrant> {
    return {
      url: presign(key, 'PUT', expiresSec),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    };
  }
  async signDownload(key: string, expiresSec: number): Promise<string> {
    return presign(key, 'GET', expiresSec);
  }
  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      const response = await fetch(presign(key, 'DELETE', 900), { method: 'DELETE' });
      if (!response.ok && response.status !== 404)
        throw new Error(`B2 delete failed (${response.status})`);
    }
  }
  async exists(key: string): Promise<{ size: number } | null> {
    const response = await fetch(presign(key, 'HEAD', 900), { method: 'HEAD' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`B2 object check failed (${response.status})`);
    return { size: Number(response.headers.get('content-length') ?? 0) };
  }
  async copy(fromKey: string, toKey: string): Promise<void> {
    const grant = await this.signUpload(toKey, 'application/octet-stream');
    const source = await fetch(presign(fromKey, 'GET', 900));
    if (!source.ok || !source.body) throw new Error('B2 source could not be read');
    const response = await fetch(grant.url, {
      method: 'PUT',
      headers: grant.headers,
      body: source.body,
      duplex: 'half',
    } as RequestInit);
    if (!response.ok) throw new Error(`B2 copy failed (${response.status})`);
  }
}

class SupabaseStorage implements Storage {
  private client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase storage configuration is incomplete');
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage.from(process.env.STORAGE_BUCKET || 'audio');
  }
  async signUpload(key: string, contentType: string, _expiresSec = 900): Promise<UploadGrant> {
    const { data, error } = await this.client().createSignedUploadUrl(key, { upsert: true });
    if (error) throw new Error(`Supabase upload signing failed: ${error.message}`);
    const uploadUrl = new URL(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
    return {
      url: uploadUrl.toString(),
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    };
  }
  async signDownload(key: string, expiresSec: number): Promise<string> {
    const { data, error } = await this.client().createSignedUrl(key, expiresSec);
    if (error) throw new Error(`Supabase download signing failed: ${error.message}`);
    return data.signedUrl;
  }
  async remove(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const { error } = await this.client().remove(keys);
    if (error) throw new Error(`Supabase object deletion failed: ${error.message}`);
  }
  async exists(key: string): Promise<{ size: number } | null> {
    const path = key.split('/');
    const name = path.pop();
    const { data, error } = await this.client().list(path.join('/'), { search: name, limit: 10 });
    if (error) throw new Error(`Supabase object check failed: ${error.message}`);
    const file = data.find((item) => item.name === name);
    return file ? { size: Number(file.metadata?.size ?? 0) } : null;
  }
  async copy(fromKey: string, toKey: string): Promise<void> {
    const { error } = await this.client().copy(fromKey, toKey);
    if (error) throw new Error(`Supabase object copy failed: ${error.message}`);
  }
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (instance) return instance;
  instance = process.env.STORAGE_PROVIDER === 'b2' ? new B2Storage() : new SupabaseStorage();
  return instance;
}

export function resetStorageForTests() {
  instance = null;
}
