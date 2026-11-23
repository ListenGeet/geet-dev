'use client';

import { parseBlob } from 'music-metadata';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { useMe } from '@/components/auth/MeProvider';

type Created = {
  trackId: string;
  duplicate?: boolean;
  status?: string;
  title?: string;
  artist?: string;
  uploadUrl?: string;
  method?: 'PUT';
  headers?: Record<string, string>;
};

type UploadedTrack = {
  trackId: string;
  title: string;
  artist: string;
};

type UploadRow = {
  id: string;
  title: string;
  artist: string;
  status: string;
  error: string | null;
  created_at: string;
};

export default function UploadPage() {
  const { api, me, status } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [message, setMessage] = useState('Choose a song to upload.');
  const [busy, setBusy] = useState(false);
  const [readingTags, setReadingTags] = useState(false);
  const [uploadedTrack, setUploadedTrack] = useState<UploadedTrack | null>(null);
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploadAllowed, setUploadAllowed] = useState<boolean | null>(null);
  const metadataRequest = useRef(0);

  const refreshUploads = async () => {
    try {
      const result = await api<{ items: UploadRow[]; canUpload: boolean }>('/api/uploads');
      setUploads(result.items);
      setUploadAllowed(result.canUpload);
    } catch {
      /* the upload form remains usable */
    }
  };
  useEffect(() => {
    if (status === 'ready') void refreshUploads();
  }, [status]);

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
    setFiles(selected ? [selected] : []);
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

  async function uploadOne(
    selected: File,
    details: { title: string; artist: string; album: string },
  ) {
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', await selected.arrayBuffer()),
    );
    const sourceSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const created = await api<Created>('/api/uploads', {
      method: 'POST',
      body: {
        fileName: selected.name,
        size: selected.size,
        sourceSha256,
        contentType: selected.type || 'application/octet-stream',
        title: details.title,
        artist: details.artist,
        ...(details.album ? { album: details.album } : {}),
      },
    });
    if (created.duplicate) {
      setMessage(
        `Duplicate file · “${created.title ?? details.title}” is already ${created.status === 'ready' ? 'uploaded' : 'processing'}. Skipped.`,
      );
      setUploadedTrack({
        trackId: created.trackId,
        title: created.title ?? details.title,
        artist: created.artist ?? details.artist,
      });
      await refreshUploads();
      return;
    }
    if (!created.uploadUrl || !created.method || !created.headers)
      throw new Error('The upload could not be started.');
    setMessage(`Uploading ${selected.name}`);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(created.method!, created.uploadUrl!);
      for (const [name, value] of Object.entries(created.headers!))
        xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (progress) => {
        if (progress.lengthComputable)
          setMessage(
            `Uploading ${selected.name} · ${Math.round((progress.loaded / progress.total) * 100)}%`,
          );
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('The file could not be uploaded.'));
      xhr.onerror = () => reject(new Error('The upload connection was interrupted.'));
      xhr.send(selected);
    });
    const completion = await api<{ dispatched?: boolean }>(
      `/api/uploads/${created.trackId}/complete`,
      { method: 'POST' },
    );
    setMessage(
      completion.dispatched === false
        ? 'Queued, but the worker could not be started. Check the API GitHub dispatch settings.'
        : `Queued ${selected.name}`,
    );
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await api<{ status: string; error?: string }>(
        `/api/uploads/${created.trackId}`,
      );
      if (result.status === 'ready') {
        setUploadedTrack({
          trackId: created.trackId,
          title: details.title,
          artist: details.artist,
        });
        setCoverUnavailable(false);
        setMessage(`Song uploaded and ready · ${selected.name}`);
        break;
      }
      setMessage(
        result.status === 'failed'
          ? `Failed · ${result.error ?? 'Try again.'}`
          : `${result.status} · ${selected.name}`,
      );
      if (result.status === 'failed') break;
    }
    await refreshUploads();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingTags) {
      setMessage('Wait for song tags to finish loading.');
      return;
    }
    const batch = files.length ? files : file ? [file] : [];
    if (!batch.length) {
      setMessage('Choose an audio file first.');
      return;
    }
    setUploadedTrack(null);
    setBusy(true);
    try {
      for (let index = 0; index < batch.length; index++) {
        const selected = batch[index]!;
        let details = { title: title.trim(), artist: artist.trim(), album: album.trim() };
        if (selected !== file) {
          try {
            const metadata = await parseBlob(selected, { skipCovers: true });
            details = {
              title: limitField(metadata.common.title ?? '') || titleFromFilename(selected.name),
              artist: limitField(
                metadata.common.artist || metadata.common.artists?.join(', ') || '',
              ),
              album: limitField(metadata.common.album ?? ''),
            };
          } catch {
            details = { title: titleFromFilename(selected.name), artist: '', album: '' };
          }
        }
        if (!details.title || !details.artist) {
          setMessage(`Skipped ${selected.name} · add a title and artist before uploading.`);
          continue;
        }
        try {
          await uploadOne(selected, details);
        } catch (error) {
          setMessage(
            `${selected.name} failed · ${error instanceof Error ? error.message : 'Try again.'}`,
          );
        }
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
  if (!me || uploadAllowed === false)
    return (
      <main className="page">
        <h1>Uploads are limited right now</h1>
        <p>Sign in as a Geet admin to upload music.</p>
      </main>
    );
  return (
    <main className="upload-page">
      <h1>Upload a song</h1>
      <p>
        Audio files up to 50 MB. Select one or more songs. Your uploads will be checked before they
        become playable.
      </p>
      <form className="upload-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Audio file</span>
          <input
            required
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
            disabled={busy || readingTags}
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? []);
              void selectFile(selected[0] ?? null);
              setFiles(selected);
            }}
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
      <section className="upload-list">
        <h2>Your uploads</h2>
        {uploads.length ? (
          <div className="track-list">
            {uploads.map((item) => (
              <div className="track-row" key={item.id}>
                <span className="track-row-main">
                  <strong>{item.title}</strong>
                  <small>{item.artist}</small>
                </span>
                <span>
                  {item.status === 'failed'
                    ? `Failed · ${item.error ?? 'Try again.'}`
                    : item.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>No uploads yet.</p>
        )}
      </section>
    </main>
  );
}
