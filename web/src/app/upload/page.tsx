'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { useMe } from '@/components/auth/MeProvider';

type Created = {
  trackId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
};

export default function UploadPage() {
  const { api, me, status } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [message, setMessage] = useState('Choose a song to upload.');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage('Choose an audio file first.');
      return;
    }
    setBusy(true);
    try {
      const created = await api<Created>('/api/uploads', {
        method: 'POST',
        body: {
          fileName: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          title,
          artist,
        },
      });
      setMessage('Uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(created.method, created.uploadUrl);
        for (const [name, value] of Object.entries(created.headers))
          xhr.setRequestHeader(name, value);
        xhr.upload.onprogress = (progress) => {
          if (progress.lengthComputable)
            setMessage(`Uploading · ${Math.round((progress.loaded / progress.total) * 100)}%`);
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error('The file could not be uploaded.'));
        xhr.onerror = () => reject(new Error('The upload connection was interrupted.'));
        xhr.send(file);
      });
      await api(`/api/uploads/${created.trackId}/complete`, { method: 'POST' });
      setMessage('Queued');
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const result = await api<{ status: string; error?: string }>(
          `/api/uploads/${created.trackId}`,
        );
        setMessage(
          result.status === 'processing'
            ? 'Processing'
            : result.status === 'ready'
              ? 'Ready'
              : result.status === 'failed'
                ? `Failed · ${result.error ?? 'Try again.'}`
                : result.status === 'queued'
                  ? 'Queued'
                  : 'Uploading',
        );
        if (result.status === 'ready' || result.status === 'failed') break;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The upload could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading')
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  if (!me || me.role !== 'admin')
    return (
      <main className="page">
        <h1>Uploads are limited right now</h1>
        <p>Sign in as a Geet admin to upload music.</p>
      </main>
    );
  return (
    <main className="upload-page">
      <h1>Upload a song</h1>
      <p>Audio files up to 50 MB. Your upload will be checked before it becomes playable.</p>
      <form className="upload-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Song title</span>
          <input
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Artist</span>
          <input
            required
            maxLength={120}
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Audio file</span>
          <input
            required
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" loading={busy}>
          Upload song
        </Button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
