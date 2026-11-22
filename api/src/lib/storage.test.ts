import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetStorageForTests, storage } from './storage';

afterEach(() => {
  resetStorageForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('B2 S3 storage adapter', () => {
  it('signs upload and download URLs and checks object size through fake S3 responses', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 'b2');
    vi.stubEnv('B2_ENDPOINT', 'https://s3.us-west-004.backblazeb2.com');
    vi.stubEnv('B2_BUCKET', 'geet-test');
    vi.stubEnv('B2_KEY_ID', 'test-key');
    vi.stubEnv('B2_APPLICATION_KEY', 'test-secret');
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200, headers: { 'content-length': '1234' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = storage();
    const upload = await adapter.signUpload('incoming/user/track', 'audio/mpeg');
    const download = await adapter.signDownload('tracks/track/full.m4a', 7200);
    const exists = await adapter.exists('incoming/user/track');

    expect(upload.method).toBe('PUT');
    expect(upload.url).toContain('X-Amz-Signature=');
    expect(upload.headers['Content-Type']).toBe('audio/mpeg');
    expect(download).toContain('X-Amz-Expires=7200');
    expect(exists).toEqual({ size: 1234 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
