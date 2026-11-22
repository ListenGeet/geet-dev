'use client';

import { parseBlob } from 'music-metadata';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { useMe } from '@/components/auth/MeProvider';

type Created = {
  trackId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
};

type UploadedTrack = {
  trackId: string;
  title: string;
  artist: string;
};

export default function UploadPage() {
  const { api, me, status } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [message, setMessage] = useState('Choose a song to upload.');
  const [busy, setBusy] = useState(false);
  const [readingTags, setReadingTags] = useState(false);
  const [uploadedTrack, setUploadedTrack] = useState<UploadedTrack | null>(null);
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const metadataRequest = useRef(0);

  function limitField(value: string) {
    return value.trim().slice(0, 120);
  }

  function titleFromFilename(fileName: string) {
    return limitField(
      fileName
        .replace(/\.[^.]+$/, '')
        .replace(/^\s*(?:\d{1,3}[\s._-]+|[[(]\d{1,3}[\])][\s._-]*)/, '')
        .replace(/[\s._-]+\d{1,3}\s*$/, '')
        .replace(/[._]+/g, ' ')
        .replace(/\s+/g, ' '),
    );
  }

  async function selectFile(selected: File | null) {
    const request = ++metadataRequest.current;
    setFile(selected);
    setUploadedTrack(null);
    setCoverUnavailable(false);
    setArtist('');
    setAlbum('');
    setReadingTags(Boolean(selected));
    if (!selected) {
      setTitle('');
      setMessage('Choose a song to upload.');
      return;
    }

    setTitle(titleFromFilename(selected.name));
    setMessage('Reading song tags…');
    try {
      const metadata = await parseBlob(selected, { skipCovers: true });
      if (request !== metadataRequest.current) return;
      setTitle(limitField(metadata.common.title ?? '') || titleFromFilename(selected.name));
      setArtist(
        limitField(
          metadata.common.artist ||
            metadata.common.artists
              ?.map((name) => name.trim())
              .filter(Boolean)
              .join(', ') ||
            '',
        ),
      );
      setAlbum(limitField(metadata.common.album ?? ''));
      setMessage('Song details loaded where available. Review them before uploading.');
    } catch {
      if (request !== metadataRequest.current) return;
      setMessage('Could not read embedded tags. Check the title and enter the artist manually.');
    } finally {
      if (request === metadataRequest.current) setReadingTags(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingTags) {
      setMessage('Wait for song tags to finish loading.');
      return;
    }
    if (!file) {
      setMessage('Choose an audio file first.');
      return;
    }
    const submittedTrack = { title: title.trim(), artist: artist.trim() };
    setUploadedTrack(null);
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
          ...(album.trim() ? { album: album.trim() } : {}),
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
      const completion = await api<{ dispatched?: boolean }>(
        `/api/uploads/${created.trackId}/complete`,
        { method: 'POST' },
      );
      setMessage(
        completion.dispatched === false
          ? 'Queued, but the worker could not be started. Check the API GitHub dispatch settings.'
          : 'Queued',
      );
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const result = await api<{ status: string; error?: string }>(
          `/api/uploads/${created.trackId}`,
        );
        if (result.status === 'ready') {
          setUploadedTrack({ trackId: created.trackId, ...submittedTrack });
          setCoverUnavailable(false);
          setMessage('Song uploaded and ready.');
          break;
        }
        setMessage(
          result.status === 'processing'
            ? 'Processing'
            : result.status === 'ready'
              ? 'Ready'
              : result.status === 'failed'
                ? `Failed · ${result.error ?? 'Try again.'}`
                : result.status === 'queued'
                  ? completion.dispatched === false
                    ? 'Queued · worker dispatch failed; check GitHub Actions settings'
                    : 'Queued'
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
          <span className="field-label">Audio file</span>
          <input
            required
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
            disabled={busy || readingTags}
            onChange={(event) => void selectFile(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        <label className="field">
          <span className="field-label">Song title</span>
          <input
            required
            maxLength={120}
            disabled={busy || readingTags}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Artist</span>
          <input
            required
            maxLength={120}
            disabled={busy || readingTags}
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Album (optional)</span>
          <input
            maxLength={120}
            disabled={busy || readingTags}
            value={album}
            onChange={(event) => setAlbum(event.target.value)}
          />
        </label>
        <Button type="submit" loading={busy} disabled={readingTags}>
          Upload song
        </Button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {uploadedTrack && (
        <section className="upload-confirmation" aria-labelledby="upload-confirmation-title">
          <Image
            className="upload-confirmation-artwork"
            src={
              coverUnavailable
                ? '/illustrations/cover-fallback.svg'
                : `/api/cover/${uploadedTrack.trackId}`
            }
            alt={`Cover art for ${uploadedTrack.title}`}
            width={112}
            height={112}
            unoptimized
            onError={() => setCoverUnavailable(true)}
          />
          <div className="upload-confirmation-copy">
            <p className="upload-confirmation-label">Upload complete</p>
            <h2 id="upload-confirmation-title">{uploadedTrack.title}</h2>
            <p>{uploadedTrack.artist}</p>
          </div>
        </section>
      )}
    </main>
  );
}
