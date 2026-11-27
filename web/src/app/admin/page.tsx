'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import PromoBanner, { type Promo } from '@/components/catalogue/PromoBanner';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';

type Tab = 'overview' | 'reports' | 'tracks' | 'promos' | 'emails' | 'usage';
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Reports' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'promos', label: 'Promos' },
  { id: 'emails', label: 'Emails' },
  { id: 'usage', label: 'Usage' },
];
type Report = {
  id: string;
  track_id: string | null;
  kind: string;
  reason: string;
  note: string | null;
  claimant: Record<string, unknown> | null;
  status: string;
  created_at: string;
  tracks: { id: string; title: string; artist: string; status: string } | null;
};
type AdminTrack = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  language: string | null;
  genre: string | null;
  status: string;
  plays: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  track_files: { kind: string; size_bytes: number | null }[];
};
type PromoRow = Promo & {
  image_path: string;
  imageUrl: string | null;
  active: boolean;
  sort: number;
  starts_at: string | null;
  ends_at: string | null;
};
type Overview = {
  songsReady: number;
  processing: number;
  failed: number;
  openReports: number;
  activeUsers7d: number;
  storage: { used: number; cap: number };
  egress: { used: number; cap: number; estimated: boolean };
  assistant: { today: number; limitPerUser: number };
  provider: string;
  bucket: string;
  needsAttention: { id: string; reason: string; created_at: string }[];
  audit: {
    id: string;
    action: string;
    target_type: string;
    target_id: string;
    created_at: string;
  }[];
};
type PromoDraft = {
  id: string;
  kicker: string;
  title: string;
  buttonLabel: string;
  link: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  sort: number;
  imagePath: string;
  imageUrl: string;
};
const fmt = (value: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
const size = (bytes: number) => `${fmt(bytes / 1024 ** 3)} GB`;
const dateInput = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : '';

export default function AdminPage() {
  const { status, me, api } = useMe();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<AdminTrack | null>(null);
  const [promoDraft, setPromoDraft] = useState<PromoDraft | null>(null);
  const [promoFile, setPromoFile] = useState<File | null>(null);
  const [promoSaving, setPromoSaving] = useState(false);

  useEffect(() => {
    if (status !== 'ready' || me?.role !== 'admin') return;
    let active = true;
    setBusy(true);
    setError('');
    void api<Record<string, unknown>>(`/api/admin/${tab}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load this admin page.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, me?.role, refresh, status, tab]);

  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  async function post(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
    await api(path, { method, body });
    setSelectedReport(null);
    setSelectedTrack(null);
    reload();
  }

  async function actOnReport(action: 'dismiss' | 'hide' | 'remove') {
    if (!selectedReport) return;
    if (
      action === 'remove' &&
      !window.confirm(
        `Remove â€œ${selectedReport.tracks?.title ?? 'this song'}â€? This deletes its audio and cover and hides it everywhere. This can't be undone.`,
      )
    )
      return;
    await post('/api/admin/reports', 'POST', { action, reportId: selectedReport.id });
  }

  async function actOnTrack(action: 'hide' | 'unhide' | 'remove' | 'retry') {
    if (!selectedTrack) return;
    if (
      action === 'remove' &&
      !window.confirm(
        `Remove â€œ${selectedTrack.title}â€? This deletes its audio and cover and hides it everywhere. This can't be undone.`,
      )
    )
      return;
    await post('/api/admin/tracks', action === 'hide' || action === 'unhide' ? 'PATCH' : 'POST', {
      action,
      trackId: selectedTrack.id,
    });
  }

  function newPromo() {
    setPromoFile(null);
    setPromoDraft({
      id: crypto.randomUUID(),
      kicker: '',
      title: '',
      buttonLabel: 'Listen',
      link: '/',
      startsAt: '',
      endsAt: '',
      active: true,
      sort: 0,
      imagePath: '',
      imageUrl: '',
    });
  }

  function editPromo(promo: PromoRow) {
    setPromoFile(null);
    setPromoDraft({
      id: promo.id,
      kicker: promo.kicker,
      title: promo.title,
      buttonLabel: promo.buttonLabel,
      link: promo.link,
      startsAt: dateInput(promo.starts_at),
      endsAt: dateInput(promo.ends_at),
      active: promo.active,
      sort: promo.sort,
      imagePath: promo.image_path,
      imageUrl: promo.imageUrl ?? '',
    });
  }

  async function savePromo(event: FormEvent) {
    event.preventDefault();
    if (!promoDraft) return;
    setPromoSaving(true);
    setError('');
    try {
      let imagePath = promoDraft.imagePath;
      if (promoFile) {
        const grant = await api<{
          imagePath: string;
          url: string;
          method: 'PUT';
          headers: Record<string, string>;
        }>('/api/admin/promos/image', {
          method: 'POST',
          body: { id: promoDraft.id, contentType: promoFile.type, size: promoFile.size },
        });
        const response = await fetch(grant.url, {
          method: grant.method,
          headers: grant.headers,
          body: promoFile,
        });
        if (!response.ok) throw new Error('Promo image upload failed. Try again.');
        imagePath = grant.imagePath;
      }
      const body = {
        ...promoDraft,
        imagePath,
        startsAt: promoDraft.startsAt ? new Date(promoDraft.startsAt).toISOString() : null,
        endsAt: promoDraft.endsAt ? new Date(promoDraft.endsAt).toISOString() : null,
      };
      const exists = (data?.items as PromoRow[] | undefined)?.some(
        (item) => item.id === promoDraft.id,
      );
      await api('/api/admin/promos', { method: exists ? 'PATCH' : 'POST', body });
      setPromoDraft(null);
      setPromoFile(null);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promo could not be saved.');
    } finally {
      setPromoSaving(false);
    }
  }

  async function deletePromo(promo: PromoRow) {
    if (!window.confirm(`Delete the promo â€œ${promo.title}â€?`)) return;
    await post('/api/admin/promos', 'DELETE', { id: promo.id });
  }

  if (status === 'guest')
    return (
      <main className="admin-page">
        <p>Sign in to continue.</p>
        <Link className="btn btn-primary" href="/sign-in">
          Sign in
        </Link>
      </main>
    );
  if (status !== 'ready')
    return (
      <main className="admin-page" aria-busy="true">
        <p>Loading your accountâ€¦</p>
      </main>
    );
  if (me?.role !== 'admin')
    return (
      <main className="admin-page">
        <h1>This is for admins.</h1>
        <Link href="/">Back to Geet</Link>
      </main>
    );

  const overview = data as Overview | null;
  const reports = (data?.items ?? []) as Report[];
  const tracks = (data?.items ?? []) as AdminTrack[];
  const promos = (data?.items ?? []) as PromoRow[];

  return (
    <main className="admin-page">
      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'admin-tab is-active' : 'admin-tab'}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => {
              setTab(item.id);
              setData(null);
              setError('');
              setPromoDraft(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {error ? (
        <div className="admin-alert" role="alert">
          {error}
          <button className="btn btn-secondary btn-sm" type="button" onClick={reload}>
            Try again
          </button>
        </div>
      ) : null}
      {busy && !data ? <p className="text-2">Loadingâ€¦</p> : null}

      {tab === 'overview' && overview ? (
        <section aria-labelledby="admin-title">
          <h1 id="admin-title">Overview</h1>
          <div className="admin-stats">
            <div>
              <strong>{fmt(overview.songsReady)}</strong>
              <span>Songs ready</span>
            </div>
            <div>
              <strong>
                {fmt(overview.processing)} / {fmt(overview.failed)}
              </strong>
              <span>Processing / failed</span>
            </div>
            <div>
              <strong>{fmt(overview.openReports)}</strong>
              <span>Open reports</span>
            </div>
            <div>
              <strong>{fmt(overview.activeUsers7d)}</strong>
              <span>Active users Â· 7 days</span>
            </div>
          </div>
          <div className="admin-meters">
            <Meter label="Storage" used={overview.storage.used} cap={overview.storage.cap} />
            <Meter
              label="Download egress this month"
              used={overview.egress.used}
              cap={overview.egress.cap}
              suffix="estimated, from file sizes"
            />
            <div>
              <strong>Ask Geet today</strong>
              <span>
                {fmt(overview.assistant.today)} messages Â· {overview.assistant.limitPerUser} per
                person
              </span>
            </div>
            <div>
              <strong>Storage provider</strong>
              <span>
                {overview.provider} Â· {overview.bucket}
              </span>
            </div>
          </div>
          <h2>Needs attention</h2>
          {overview.needsAttention.length ? (
            <ul className="admin-attention">
              {overview.needsAttention.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setTab('reports')}>
                    {item.reason} Â· {new Date(item.created_at).toLocaleDateString()}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-2">Nothing needs attention.</p>
          )}
          <h2>Recent admin actions</h2>
          <ul className="admin-log">
            {overview.audit.map((item) => (
              <li key={item.id}>
                <span>{item.action.replaceAll('_', ' ')}</span>
                <time>{new Date(item.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'reports' && data ? (
        <section className="admin-workspace">
          <div>
            <h1>Reports</h1>
            <div className="admin-filters">
              <select
                aria-label="Filter reports by status"
                onChange={(event) => {
                  void api<{ items: Report[] }>(`/api/admin/reports?status=${event.target.value}`)
                    .then(setData)
                    .catch((cause) => setError(String(cause)));
                }}
              >
                <option value="open">Open</option>
                <option value="dismissed">Dismissed</option>
                <option value="removed">Removed</option>
              </select>
              <select
                aria-label="Filter reports by kind"
                onChange={(event) => {
                  void api<{ items: Report[] }>(`/api/admin/reports?kind=${event.target.value}`)
                    .then(setData)
                    .catch((cause) => setError(String(cause)));
                }}
              >
                <option value="">All kinds</option>
                <option value="song">Song report</option>
                <option value="copyright">Copyright</option>
              </select>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Song</th>
                    <th>Reason</th>
                    <th>Kind</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <button
                          type="button"
                          className="admin-row-button"
                          onClick={() => setSelectedReport(report)}
                        >
                          {report.tracks?.title ?? 'Song unavailable'}
                          <small>{report.tracks?.artist ?? ''}</small>
                        </button>
                      </td>
                      <td>{report.reason}</td>
                      <td>{report.kind === 'copyright' ? 'Copyright' : 'Song'}</td>
                      <td>{new Date(report.created_at).toLocaleDateString()}</td>
                      <td>{report.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selectedReport ? (
            <aside className="admin-review" aria-label="Report review">
              <button className="admin-close" type="button" onClick={() => setSelectedReport(null)}>
                Close
              </button>
              <h2>{selectedReport.tracks?.title ?? 'Song unavailable'}</h2>
              <p>{selectedReport.tracks?.artist}</p>
              <dl>
                <dt>Reason</dt>
                <dd>{selectedReport.reason}</dd>
                <dt>Details</dt>
                <dd>{selectedReport.note || 'No additional note.'}</dd>
                <dt>Reported</dt>
                <dd>{new Date(selectedReport.created_at).toLocaleString()}</dd>
                {selectedReport.kind === 'copyright' ? (
                  <>
                    <dt>Claimant</dt>
                    <dd>{String(selectedReport.claimant?.name ?? 'Copyright claimant')}</dd>
                    <dt>Contact</dt>
                    <dd>{String(selectedReport.claimant?.email ?? '')}</dd>
                    <dt>Work</dt>
                    <dd>{String(selectedReport.claimant?.work ?? '')}</dd>
                    <dt>Location</dt>
                    <dd>{String(selectedReport.claimant?.location ?? '')}</dd>
                  </>
                ) : null}
              </dl>
              {selectedReport.track_id ? (
                <Link href={`/t/${selectedReport.track_id}`} target="_blank">
                  Open song page
                </Link>
              ) : null}
              <div className="admin-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void actOnReport('dismiss')}
                >
                  Dismiss report
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void actOnReport('hide')}
                >
                  Hide track
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => void actOnReport('remove')}
                >
                  Remove track
                </button>
              </div>
            </aside>
          ) : null}
        </section>
      ) : null}

      {tab === 'tracks' && data ? (
        <section className="admin-workspace">
          <div>
            <h1>Tracks</h1>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Song</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Plays</th>
                    <th>File size</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track) => (
                    <tr key={track.id}>
                      <td>
                        <button
                          type="button"
                          className="admin-row-button"
                          onClick={() => setSelectedTrack(track)}
                        >
                          {track.title}
                          <small>{track.artist}</small>
                        </button>
                      </td>
                      <td>{track.language ?? 'â€”'}</td>
                      <td>{track.status}</td>
                      <td>{fmt(track.plays)}</td>
                      <td>
                        {track.track_files?.reduce((n, item) => n + Number(item.size_bytes ?? 0), 0)
                          ? size(
                              track.track_files.reduce(
                                (n, item) => n + Number(item.size_bytes ?? 0),
                                0,
                              ),
                            )
                          : 'â€”'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selectedTrack ? (
            <aside className="admin-review" aria-label="Track details">
              <button className="admin-close" type="button" onClick={() => setSelectedTrack(null)}>
                Close
              </button>
              <h2>{selectedTrack.title}</h2>
              <p>
                {selectedTrack.artist} Â· {selectedTrack.status} Â· {fmt(selectedTrack.plays)} plays
              </p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  void player.playTrack(
                    {
                      id: selectedTrack.id,
                      title: selectedTrack.title,
                      artist: selectedTrack.artist,
                      durationMs: selectedTrack.duration_ms,
                    },
                    [],
                    'Admin',
                  )
                }
              >
                Play full song
              </button>
              <div className="admin-edit-fields">
                <label>
                  Title
                  <input id="edit-title" defaultValue={selectedTrack.title} />
                </label>
                <label>
                  Artist
                  <input id="edit-artist" defaultValue={selectedTrack.artist} />
                </label>
                <label>
                  Album
                  <input id="edit-album" defaultValue={selectedTrack.album ?? ''} />
                </label>
                <label>
                  Language
                  <input id="edit-language" defaultValue={selectedTrack.language ?? ''} />
                </label>
                <label>
                  Genre
                  <input id="edit-genre" defaultValue={selectedTrack.genre ?? ''} />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const value = (id: string) =>
                      (document.getElementById(id) as HTMLInputElement).value;
                    void post('/api/admin/tracks', 'PATCH', {
                      trackId: selectedTrack.id,
                      title: value('edit-title'),
                      artist: value('edit-artist'),
                      album: value('edit-album') || null,
                      language: value('edit-language') || null,
                      genre: value('edit-genre') || null,
                    });
                  }}
                >
                  Save changes
                </button>
              </div>
              <div className="admin-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    void actOnTrack(selectedTrack.status === 'hidden' ? 'unhide' : 'hide')
                  }
                >
                  {selectedTrack.status === 'hidden' ? 'Unhide' : 'Hide'}
                </button>
                {selectedTrack.status === 'failed' ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => void actOnTrack('retry')}
                  >
                    Retry processing
                  </button>
                ) : null}
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => void actOnTrack('remove')}
                >
                  Remove
                </button>
              </div>
              {selectedTrack.error ? <p className="admin-alert">{selectedTrack.error}</p> : null}
            </aside>
          ) : null}
        </section>
      ) : null}

      {tab === 'promos' && data ? (
        <section>
          <div className="admin-section-heading">
            <h1>Promos</h1>
            <button type="button" className="btn btn-primary" onClick={newPromo}>
              New promo
            </button>
          </div>
          {promoDraft ? (
            <div className="admin-promo-editor">
              <form onSubmit={(event) => void savePromo(event)}>
                <h2>
                  {promos.some((promo) => promo.id === promoDraft.id) ? 'Edit promo' : 'New promo'}
                </h2>
                <label>
                  Image Â· JPG, PNG or WebP, up to 2 MB
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPromoFile(file);
                      if (file)
                        setPromoDraft((current) =>
                          current ? { ...current, imageUrl: URL.createObjectURL(file) } : current,
                        );
                    }}
                  />
                </label>
                <label>
                  Kicker
                  <input
                    maxLength={24}
                    value={promoDraft.kicker}
                    onChange={(event) =>
                      setPromoDraft({ ...promoDraft, kicker: event.target.value })
                    }
                  />
                </label>
                <label>
                  Title
                  <input
                    required
                    maxLength={60}
                    value={promoDraft.title}
                    onChange={(event) =>
                      setPromoDraft({ ...promoDraft, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Button label
                  <input
                    maxLength={16}
                    value={promoDraft.buttonLabel}
                    onChange={(event) =>
                      setPromoDraft({ ...promoDraft, buttonLabel: event.target.value })
                    }
                  />
                </label>
                <label>
                  Link
                  <input
                    required
                    value={promoDraft.link}
                    onChange={(event) => setPromoDraft({ ...promoDraft, link: event.target.value })}
                    placeholder="/artist/name or https://â€¦"
                  />
                </label>
                <div className="admin-date-fields">
                  <label>
                    Starts
                    <input
                      type="datetime-local"
                      value={promoDraft.startsAt}
                      onChange={(event) =>
                        setPromoDraft({ ...promoDraft, startsAt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ends
                    <input
                      type="datetime-local"
                      value={promoDraft.endsAt}
                      onChange={(event) =>
                        setPromoDraft({ ...promoDraft, endsAt: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={promoDraft.active}
                    onChange={(event) =>
                      setPromoDraft({ ...promoDraft, active: event.target.checked })
                    }
                  />
                  Active
                </label>
                <div className="admin-actions">
                  <button className="btn btn-primary" type="submit" disabled={promoSaving}>
                    {promoSaving ? 'Savingâ€¦' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setPromoDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
              <div>
                <h2>Live preview</h2>
                {promoDraft.imageUrl ? (
                  <PromoBanner
                    promos={[
                      {
                        id: promoDraft.id,
                        kicker: promoDraft.kicker || 'FEATURED',
                        title: promoDraft.title || 'Promo title',
                        buttonLabel: promoDraft.buttonLabel,
                        imageUrl: promoDraft.imageUrl,
                        link: promoDraft.link || '/',
                      },
                    ]}
                  />
                ) : (
                  <div className="admin-promo-empty">Choose an image to preview the banner.</div>
                )}
              </div>
            </div>
          ) : null}
          <div className="admin-promo-list">
            {promos.map((promo) => (
              <article key={promo.id}>
                <Image
                  src={promo.imageUrl ?? '/illustrations/cover-fallback.svg'}
                  alt=""
                  width={120}
                  height={50}
                  unoptimized
                />
                <div>
                  <strong>{promo.title}</strong>
                  <small>
                    {promo.active ? 'Active' : 'Off'} Â·{' '}
                    {promo.starts_at
                      ? new Date(promo.starts_at).toLocaleDateString()
                      : 'No start date'}
                  </small>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => editPromo(promo)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  onClick={() => void deletePromo(promo)}
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'emails' && data ? <EmailAdmin data={data} api={api} reload={reload} /> : null}
      {tab === 'usage' && data ? <UsageAdmin data={data} /> : null}
    </main>
  );
}

function Meter({
  label,
  used,
  cap,
  suffix,
}: {
  label: string;
  used: number;
  cap: number;
  suffix?: string;
}) {
  const percent = Math.min(100, cap ? (used / cap) * 100 : 0);
  return (
    <div className="admin-meter">
      <div>
        <strong>{label}</strong>
        <span>
          {size(used)} / {size(cap)}
          {suffix ? ` Â· ${suffix}` : ''}
        </span>
      </div>
      <progress
        value={used}
        max={cap}
        aria-label={`${label}: ${Math.round(percent)} percent`}
        className={percent > 90 ? 'is-danger' : ''}
      />
    </div>
  );
}

function EmailAdmin({
  data,
  api,
  reload,
}: {
  data: Record<string, unknown>;
  api: ReturnType<typeof useMe>['api'];
  reload: () => void;
}) {
  const [template, setTemplate] = useState<'marketing-announcement' | 'marketing-weekly'>(
    'marketing-announcement',
  );
  const [language, setLanguage] = useState('en');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('https://listengeet.com');
  const [heroImage, setHeroImage] = useState('');
  const [heroAlt, setHeroAlt] = useState('');
  const [kicker, setKicker] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Listen');
  const [weeklyIds, setWeeklyIds] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const audience = Number(data.subscribers ?? 0);
  const days = Math.max(1, Math.ceil(audience / Math.max(1, Number(data.dailyCap ?? 50))));
  async function save(
    event: FormEvent,
    action: 'draft' | 'schedule' | 'test' = when ? 'schedule' : 'draft',
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/emails', {
        method: 'POST',
        body: {
          action,
          template,
          language,
          subject,
          preheader,
          scheduledFor: when ? new Date(when).toISOString() : null,
          trackIds: weeklyIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
          content: { headline, body, heroImage, heroAlt, kicker, ctaLabel, ctaUrl: link },
        },
      });
      if (action === 'test') setError('Test email sent to your verified admin address.');
      else {
        reload();
        setSubject('');
        setHeadline('');
        setBody('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email could not be scheduled.');
    } finally {
      setBusy(false);
    }
  }
  const campaigns = (data.campaigns ?? []) as {
    id: string;
    subject: string;
    status: string;
    scheduled_for: string | null;
    created_at: string;
  }[];
  const postalReady = data.postalReady === true;
  return (
    <section>
      <h1>Emails</h1>
      <div className="admin-email-strip">
        <div>
          <strong>
            {fmt(Number(data.sentToday ?? 0))} / {fmt(Number(data.totalDailyCap ?? 100))}
          </strong>
          <span>emails sent today</span>
        </div>
        <div>
          <strong>{fmt(audience)}</strong>
          <span>opted-in subscribers</span>
        </div>
        <div>
          <strong>{fmt(Number(data.dailyCap ?? 50))}</strong>
          <span>daily marketing cap</span>
        </div>
        <div>
          <strong>{fmt(Number(data.suppressed ?? 0))}</strong>
          <span>suppressed</span>
        </div>
      </div>
      <form className="admin-email-form" onSubmit={(event) => void save(event)}>
        <h2>New email</h2>
        <label>
          Type
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value as typeof template)}
          >
            <option value="marketing-announcement">Announcement</option>
            <option value="marketing-weekly">Weekly new songs</option>
          </select>
        </label>
        <label>
          Language
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="pa">Punjabi</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <label>
          Subject <span>{subject.length}/60</span>
          <input
            required
            maxLength={60}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label>
          Preheader <span>{preheader.length}/90</span>
          <input
            maxLength={90}
            value={preheader}
            onChange={(event) => setPreheader(event.target.value)}
          />
        </label>
        {template === 'marketing-weekly' ? (
          <label>
            Three ready track IDs, comma separated
            <input
              required
              value={weeklyIds}
              onChange={(event) => setWeeklyIds(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              Kicker
              <input
                maxLength={24}
                value={kicker}
                onChange={(event) => setKicker(event.target.value)}
              />
            </label>
            <label>
              Hero image HTTPS URL
              <input
                required
                type="url"
                value={heroImage}
                onChange={(event) => setHeroImage(event.target.value)}
              />
            </label>
            <label>
              Image description
              <input value={heroAlt} onChange={(event) => setHeroAlt(event.target.value)} />
            </label>
          </>
        )}
        <label>
          Headline
          <input required value={headline} onChange={(event) => setHeadline(event.target.value)} />
        </label>
        <label>
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} />
        </label>
        <label>
          Button label
          <input
            maxLength={16}
            value={ctaLabel}
            onChange={(event) => setCtaLabel(event.target.value)}
          />
        </label>
        <label>
          Button link
          <input
            required
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
        </label>
        <label>
          Schedule
          <input
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </label>
        <p>
          Will reach {fmt(audience)} people, about {days} days at the free tier.
        </p>
        {!postalReady ? (
          <p role="status" className="admin-alert">
            Add MARKETING_POSTAL_ADDRESS in the API environment before sending.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="admin-alert">
            {error}
          </p>
        ) : null}
        <div className="admin-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy || !postalReady}
            onClick={(event) => void save(event, 'test')}
          >
            Send test to me
          </button>
          <button className="btn btn-primary" disabled={busy || !postalReady}>
            {busy ? 'Savingâ€¦' : when ? 'Schedule' : 'Save draft'}
          </button>
        </div>
      </form>
      <h2>History</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.subject}</td>
                <td>{new Date(campaign.scheduled_for ?? campaign.created_at).toLocaleString()}</td>
                <td>{campaign.status}</td>
                <td>
                  {campaign.status === 'scheduled' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() =>
                        void api('/api/admin/emails', {
                          method: 'DELETE',
                          body: { id: campaign.id },
                        })
                          .then(reload)
                          .catch((cause) => setError(String(cause)))
                      }
                    >
                      Cancel send
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsageAdmin({ data }: { data: Record<string, unknown> }) {
  const usage = (data.usage ?? []) as {
    day: string;
    plays: number;
    uploads: number;
    ai_count: number;
  }[];
  const topTracks = (data.topTracks ?? []) as {
    id: string;
    title: string;
    artist: string;
    plays: number;
  }[];
  const max = Math.max(1, ...usage.map((row) => Number(row.plays ?? 0)));
  return (
    <section>
      <h1>Usage</h1>
      <h2>Plays per day</h2>
      <div className="admin-chart" role="img" aria-label="Plays per day for the last 30 days">
        {[...usage].reverse().map((row) => (
          <div key={row.day} title={`${row.day}: ${row.plays} plays`}>
            <span style={{ height: `${Math.max(2, (Number(row.plays ?? 0) / max) * 100)}%` }} />
            <small>{new Date(row.day).getDate()}</small>
          </div>
        ))}
      </div>
      <h2>Top tracks</h2>
      <ol className="admin-top-tracks">
        {topTracks.map((track) => (
          <li key={track.id}>
            <span>
              {track.title} Â· {track.artist}
            </span>
            <strong>{fmt(track.plays)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
