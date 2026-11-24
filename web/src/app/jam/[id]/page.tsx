'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CaretDown,
  DotsThreeVertical,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Lock,
  UserPlus,
  Plus,
  Crown,
} from '@phosphor-icons/react';
import { useAuth } from '@clerk/nextjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { Icon } from '@/components/Icon';
import { JamSyncEngine } from '@/lib/jam-sync';
import { getRealtimeClient, retainRealtime, releaseRealtime } from '@/lib/realtime';
import type { JamSnapshot, FriendItem } from '@geet/shared';
import type { Track } from '@/components/player/types';

function formatJamTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export default function JamRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = use(params);
  const { me, api, status } = useMe();
  const { getToken } = useAuth();
  const player = usePlayer();
  const router = useRouter();

  const [jam, setJam] = useState<JamSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [jamEnded, setJamEnded] = useState(false);
  const [clockCalibrated, setClockCalibrated] = useState(false);

  // Sheets and menus
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersSheetOpen, setMembersSheetOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [addSongSheetOpen, setAddSongSheetOpen] = useState(false);

  // Invite sheet
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);

  // Add song sheet
  const [searchSongQuery, setSearchSongQuery] = useState('');
  const [searchSongResults, setSearchSongResults] = useState<Track[]>([]);

  const syncEngineRef = useRef<JamSyncEngine | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const syncingTrackRef = useRef<string | null>(null);
  const recoveringJamQueueRef = useRef<string | null>(null);

  const isHost = jam?.hostId === me?.id;
  const canControl = isHost || jam?.controls === 'everyone';
  const jamNeedsQueueRecovery = Boolean(jam?.isPlaying && !jam.trackId && jam.queue.length > 0);
  const localNeedsPlayback = Boolean(
    jam?.isPlaying && jam.trackId && (player.track?.id !== jam.trackId || !player.isPlaying),
  );

  const loadJam = async () => {
    if (status !== 'ready') return;
    try {
      const snapshot = await api<JamSnapshot>(`/api/jams/${jamId}`);
      setJam(snapshot);
      if (snapshot.endedAt) setJamEnded(true);
      return snapshot;
    } catch {
      setJamEnded(true);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'ready') {
      void loadJam();
    }
  }, [jamId, status]);

  // Sync engine setup
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    setClockCalibrated(false);

    const engine = new JamSyncEngine(
      async () => {
        const res = await api<{ now: number }>('/api/time');
        return res.now;
      },
      () => {
        // Find main HTMLAudioElement in document
        return document.querySelector('audio') as HTMLAudioElement | null;
      },
      (targetSec) => {
        player.seek(targetSec);
      },
    );

    syncEngineRef.current = engine;
    void engine.start().then(() => {
      if (!cancelled) setClockCalibrated(true);
    });

    return () => {
      cancelled = true;
      engine.stop();
      syncEngineRef.current = null;
    };
  }, [jamId, status, api, player.seek]);

  useEffect(() => {
    const engine = syncEngineRef.current;
    if (!clockCalibrated || !engine || !jam) return;
    engine.startDriftCorrection(
      () => engine.computeTargetPositionMs(jam.positionMs, jam.isPlaying, jam.updatedAt) / 1000,
      () => jam.isPlaying,
    );
  }, [clockCalibrated, jam]);

  useEffect(() => {
    if (status !== 'ready' || !jam?.trackId || player.track?.id === jam.trackId) return;
    if (syncingTrackRef.current === jam.trackId) return;

    const trackId = jam.trackId;
    syncingTrackRef.current = trackId;
    const trackRequest =
      jam.currentTrack?.id === trackId
        ? Promise.resolve(jam.currentTrack)
        : api<Track>(`/api/tracks/${trackId}`);
    void trackRequest
      .then((track) => player.playTrack(track))
      .then(() => {
        if (syncingTrackRef.current !== trackId) return;
        syncingTrackRef.current = null;
        setJam((current) => (current ? { ...current } : current));
      })
      .catch(() => {
        if (syncingTrackRef.current === trackId) syncingTrackRef.current = null;
      });
  }, [status, jam, player.track?.id, player.playTrack, api]);

  useEffect(() => {
    if (
      !clockCalibrated ||
      !jam?.trackId ||
      player.track?.id !== jam.trackId ||
      syncingTrackRef.current
    )
      return;
    const engine = syncEngineRef.current;
    if (!engine) return;
    const target =
      engine.computeTargetPositionMs(jam.positionMs, jam.isPlaying, jam.updatedAt) / 1000;
    player.seek(target);
    if (player.isPlaying !== jam.isPlaying) void player.toggle();
  }, [clockCalibrated, jam, player.track?.id, player.isPlaying, player.seek, player.toggle]);

  // Lazy Realtime connection for jam row and queue updates
  useEffect(() => {
    if (status !== 'ready') return;

    retainRealtime();
    const rt = getRealtimeClient(getToken);

    if (rt) {
      const channel = rt
        .channel(`jam:${jamId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'jams', filter: `id=eq.${jamId}` },
          (payload) => {
            const updated = payload.new as {
              ended_at?: string | null;
              track_id: string | null;
              position_ms: number;
              is_playing: boolean;
              version: number;
              controls: 'host' | 'everyone';
              host_id: string;
              updated_at: string;
            };
            if (updated.ended_at) {
              setJamEnded(true);
            } else {
              setJam((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  trackId: updated.track_id,
                  positionMs: updated.position_ms,
                  isPlaying: updated.is_playing,
                  version: updated.version,
                  controls: updated.controls,
                  hostId: updated.host_id,
                  updatedAt: updated.updated_at,
                };
              });
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'jam_queue', filter: `jam_id=eq.${jamId}` },
          () => {
            void loadJam();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'jam_members', filter: `jam_id=eq.${jamId}` },
          () => {
            void loadJam();
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setReconnecting(false);
          else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') setReconnecting(true);
        });

      realtimeChannelRef.current = channel;
    }

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
      releaseRealtime();
    };
  }, [jamId, status]);

  const copyCode = () => {
    if (!jam?.code) return;
    void navigator.clipboard.writeText(jam.code);
    window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Code copied.' }));
  };

  const handleTogglePlay = async () => {
    if (!jam) return;

    const queuedSong = jam.queue[0];
    const isRecoveringQueuedTrack = jam.isPlaying && !jam.trackId && Boolean(queuedSong);
    const isResumingLocally = jam.isPlaying && localNeedsPlayback;

    if (!canControl && !isResumingLocally) {
      window.dispatchEvent(
        new CustomEvent('geet:toast', {
          detail: 'Only the host can change songs. Leave the jam to play your own.',
        }),
      );
      return;
    }

    const trackId = jam.trackId ?? queuedSong?.trackId ?? undefined;
    const track =
      jam.currentTrack?.id === trackId
        ? jam.currentTrack
        : queuedSong && queuedSong.trackId === trackId
          ? queuedSong.track
          : null;

    if (isResumingLocally) {
      if (track && !player.isLoading) startJamTrackLocally(track);
      return;
    }

    const nextIsPlaying = isRecoveringQueuedTrack || !jam.isPlaying;
    if (nextIsPlaying && !trackId) {
      window.dispatchEvent(
        new CustomEvent('geet:toast', { detail: 'Add a song to the jam before pressing play.' }),
      );
      return;
    }

    if (nextIsPlaying && !jam.trackId && queuedSong) {
      await handleSkipNext();
      return;
    }

    if (nextIsPlaying && track) {
      startJamTrackLocally(track);
    } else if (!nextIsPlaying && player.track?.id === jam.trackId && player.isPlaying) {
      void player.toggle();
    }

    try {
      const res = await api<JamSnapshot>(`/api/jams/${jamId}/state`, {
        method: 'POST',
        body: {
          trackId,
          positionMs: trackId === jam.trackId ? Math.round(player.currentTime * 1000) : 0,
          isPlaying: nextIsPlaying,
          expectedVersion: jam.version,
        },
      });
      setJam(res);
    } catch {
      // re-sync snapshot
      void loadJam();
    }
  };

  const startJamTrackLocally = (track: Track) => {
    if (player.track?.id === track.id) {
      if (!player.isPlaying) void player.toggle();
      return;
    }

    syncingTrackRef.current = track.id;
    void player.playTrack(track).finally(() => {
      if (syncingTrackRef.current === track.id) {
        syncingTrackRef.current = null;
        setJam((current) => (current ? { ...current } : current));
      }
    });
  };

  useEffect(() => {
    const queuedSong = jam?.queue[0];
    if (!isHost || !jam?.isPlaying || jam.trackId || !queuedSong) return;

    const recoveryKey = `${jam.version}:${queuedSong.id}`;
    if (recoveringJamQueueRef.current === recoveryKey) return;
    recoveringJamQueueRef.current = recoveryKey;

    startJamTrackLocally(queuedSong.track);
    void (async () => {
      try {
        await api(`/api/jams/${jam.id}/queue/${queuedSong.id}`, { method: 'DELETE' });
        const snapshot = await api<JamSnapshot>(`/api/jams/${jam.id}/state`, {
          method: 'POST',
          body: {
            trackId: queuedSong.trackId,
            positionMs: 0,
            isPlaying: true,
            expectedVersion: jam.version,
          },
        });
        setJam(snapshot);
      } catch {
        try {
          const snapshot = await api<JamSnapshot>(`/api/jams/${jam.id}`);
          setJam(snapshot);
        } catch {
          // Keep the recovery action available if the room cannot be refreshed.
          recoveringJamQueueRef.current = null;
        }
      }
    })();
  }, [isHost, jam, api, startJamTrackLocally]);

  const handleSeek = async (seconds: number) => {
    if (!canControl || !jam) return;
    player.seek(seconds);

    try {
      const res = await api<JamSnapshot>(`/api/jams/${jamId}/state`, {
        method: 'POST',
        body: {
          trackId: jam.trackId ?? undefined,
          positionMs: Math.round(seconds * 1000),
          isPlaying: jam.isPlaying,
          expectedVersion: jam.version,
        },
      });
      setJam(res);
    } catch {
      void loadJam();
    }
  };

  const handleSkipNext = async () => {
    if (!canControl || !jam) return;
    if (jam.queue.length > 0) {
      const nextSong = jam.queue[0];
      if (!nextSong) return;
      startJamTrackLocally(nextSong.track);
      try {
        await api(`/api/jams/${jamId}/queue/${nextSong.id}`, { method: 'DELETE' });
        const res = await api<JamSnapshot>(`/api/jams/${jamId}/state`, {
          method: 'POST',
          body: {
            trackId: nextSong.trackId,
            positionMs: 0,
            isPlaying: true,
            expectedVersion: jam.version,
          },
        });
        setJam(res);
      } catch {
        void loadJam();
      }
    }
  };

  const handleLeaveJam = async () => {
    try {
      await api(`/api/jams/${jamId}/leave`, { method: 'POST' });
      router.push('/');
    } catch {
      // ignore
    }
  };

  const handleEndJam = async () => {
    if (!window.confirm('End this jam for everyone?')) return;
    try {
      await api(`/api/jams/${jamId}/end`, { method: 'POST' });
      router.push('/');
    } catch {
      // ignore
    }
  };

  const handleToggleControls = async () => {
    if (!isHost || !jam) return;
    const nextMode = jam.controls === 'host' ? 'everyone' : 'host';
    try {
      const res = await api<JamSnapshot>(`/api/jams/${jamId}`, {
        method: 'PATCH',
        body: { controls: nextMode },
      });
      setJam(res);
      window.dispatchEvent(
        new CustomEvent('geet:toast', {
          detail: nextMode === 'everyone' ? 'Everyone controls playback' : 'Host controls playback',
        }),
      );
    } catch {
      // ignore
    }
  };

  // Add song to jam queue
  useEffect(() => {
    if (!addSongSheetOpen || !searchSongQuery.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ songs: Track[] }>(
          `/api/search?q=${encodeURIComponent(searchSongQuery)}`,
        );
        setSearchSongResults(res.songs ?? []);
      } catch {
        setSearchSongResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchSongQuery, addSongSheetOpen, api]);

  const handleAddSongToQueue = async (track: Track) => {
    try {
      await api(`/api/jams/${jamId}/queue`, {
        method: 'POST',
        body: { trackId: track.id },
      });
      window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Added to the jam.' }));
      setAddSongSheetOpen(false);
      void loadJam();
    } catch {
      // ignore
    }
  };

  // Friends for invite sheet
  useEffect(() => {
    if (inviteSheetOpen && status === 'ready') {
      void api<{ friends: FriendItem[] }>('/api/friends')
        .then((d) => setFriends(d.friends ?? []))
        .catch(() => setFriends([]));
    }
  }, [inviteSheetOpen, status, api]);

  const handleInviteFriend = async (friendId: string) => {
    try {
      await api(`/api/jams/${jamId}/invite`, {
        method: 'POST',
        body: { toIds: [friendId] },
      });
      setInvitedIds((prev) => [...prev, friendId]);
      window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Invitation sent.' }));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <main className="jam-room-page midnight-theme flex-center" style={{ minHeight: '100vh' }}>
        <p className="hint-text">Connecting to jam…</p>
      </main>
    );
  }

  if (jamEnded || !jam) {
    return (
      <main
        className="jam-room-page midnight-theme flex-center"
        style={{ minHeight: '100vh', textAlign: 'center' }}
      >
        <div>
          <h2>This jam has ended</h2>
          <p className="hint-text">The host or members have left this listening session.</p>
          <div className="action-row" style={{ marginTop: 24 }}>
            <Link href="/jam" className="btn btn-primary">
              Start your own
            </Link>
            <Link href="/" className="btn btn-secondary">
              Back
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currentSong = jam.currentTrack;
  const currentSec = player.currentTime;
  const totalSec = currentSong ? currentSong.durationMs / 1000 : 0;
  const progressRatio = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;
  const waveform = currentSong?.waveform?.length === 64 ? currentSong.waveform : Array(64).fill(16);

  return (
    <main className="jam-room-page midnight-theme">
      {/* Reconnecting Coral Strip */}
      {reconnecting && (
        <div className="reconnecting-strip" role="status">
          Reconnecting…
        </div>
      )}

      {/* Room header */}
      <header className="jam-top-row">
        <div className="jam-top-leading">
          <button
            type="button"
            className="btn-icon jam-collapse-button"
            aria-label="Minimize jam"
            onClick={() => router.push('/')}
          >
            <Icon icon={CaretDown} size={22} />
          </button>
          <div className="jam-room-heading">
            <span className="jam-caption">LISTEN TOGETHER</span>
            <strong>Jam room</strong>
          </div>
        </div>

        <div className="jam-header-actions">
          <span className={`jam-status-pill ${jam.isPlaying ? 'is-playing' : ''}`}>
            <span aria-hidden="true" />
            {jamNeedsQueueRecovery ? 'Starting' : jam.isPlaying ? 'Playing' : 'Paused'}
          </span>
          <button type="button" className="jam-code-badge" onClick={copyCode}>
            <span className="jam-caption">INVITE CODE</span>
            <span className="jam-code">{jam.code}</span>
            <span className="jam-copy-label">Copy</span>
          </button>
          <div className="jam-menu-wrap">
            <button
              type="button"
              className="btn-icon"
              aria-label="Jam options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon icon={DotsThreeVertical} size={22} />
            </button>
            {menuOpen && (
              <div className="jam-menu-popover" onClick={() => setMenuOpen(false)}>
                {isHost && (
                  <button type="button" className="menu-item" onClick={handleToggleControls}>
                    Control mode: {jam.controls === 'host' ? 'Host only' : 'Everyone'}
                  </button>
                )}
                <button type="button" className="menu-item" onClick={handleLeaveJam}>
                  Leave jam
                </button>
                {isHost && (
                  <button type="button" className="menu-item danger" onClick={handleEndJam}>
                    End jam
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="jam-room-layout">
        {/* 2. Members row */}
        <button
          type="button"
          className="jam-members-strip"
          aria-expanded={membersSheetOpen}
          onClick={() => setMembersSheetOpen(true)}
        >
          <span className="overlapping-avatars" aria-hidden="true">
            {jam.members.slice(0, 5).map((m) => (
              <span key={m.profileId} className="member-avatar-wrap">
                {m.user.avatarUrl ? (
                  <img
                    src={m.user.avatarUrl}
                    alt=""
                    className="avatar-40-border"
                    width={40}
                    height={40}
                  />
                ) : (
                  <span className="avatar-fallback-40-border">
                    {(m.user.displayName ?? m.user.username ?? 'M')[0]?.toUpperCase()}
                  </span>
                )}
                {m.isHost && (
                  <span className="crown-badge" aria-label="Host">
                    <Icon icon={Crown} size={12} on />
                  </span>
                )}
              </span>
            ))}
            {jam.members.length > 5 && (
              <span className="avatar-extra-count">+{jam.members.length - 5}</span>
            )}
          </span>
          <span className="members-count-label">
            <strong>{jam.members.length} listening</strong>
            <span>View members</span>
          </span>
        </button>

        {/* 3. Cover and Meta */}
        <div className="jam-cover-container">
          <div className="jam-artwork-wrap">
            <img
              src={currentSong?.coverUrl ?? '/illustrations/cover-fallback.svg'}
              alt=""
              className="jam-cover-320"
              width={320}
              height={320}
            />
            {jam.isPlaying && currentSong && (
              <span className="jam-cover-playing-label">
                <span aria-hidden="true" />
                PLAYING TOGETHER
              </span>
            )}
          </div>
          <div className="jam-track-meta">
            <span className="jam-now-playing-label">NOW PLAYING</span>
            <h2>{currentSong?.title ?? 'Choose a song for the room'}</h2>
            <p>{currentSong?.artist ?? 'Add a song to the queue to get started.'}</p>
          </div>
        </div>

        {/* 4. Bar scrubber */}
        <div className="jam-scrubber-section">
          <div
            className={`bar-scrubber ${!canControl ? 'scrubber-locked' : ''}`}
            role="slider"
            aria-label="Song progress"
            aria-disabled={!canControl || totalSec <= 0}
            aria-valuemin={0}
            aria-valuemax={Math.floor(totalSec)}
            aria-valuenow={Math.min(Math.floor(currentSec), Math.floor(totalSec))}
            aria-valuetext={`${formatJamTime(currentSec)} of ${formatJamTime(totalSec)}`}
            tabIndex={canControl && totalSec > 0 ? 0 : -1}
            onClick={(event) => {
              if (!canControl || totalSec <= 0) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width <= 0) return;
              const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
              void handleSeek(ratio * totalSec);
            }}
            onKeyDown={(event) => {
              if (!canControl || totalSec <= 0) return;
              const step = event.shiftKey ? 10 : 5;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                event.preventDefault();
                void handleSeek(Math.max(0, currentSec - step));
              } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                event.preventDefault();
                void handleSeek(Math.min(totalSec, currentSec + step));
              } else if (event.key === 'Home') {
                event.preventDefault();
                void handleSeek(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                void handleSeek(totalSec);
              }
            }}
          >
            {waveform.map((height, i) => {
              const barRatio = i / 64;
              const isPlayed = barRatio <= progressRatio;
              return (
                <span
                  key={i}
                  className={`scrubber-bar ${isPlayed ? 'bar-played' : 'bar-unplayed'}`}
                  style={{ height: `${Math.max(4, height)}px` }}
                />
              );
            })}
          </div>

          <div className="jam-time-row" aria-hidden="true">
            <span>{formatJamTime(currentSec)}</span>
            <span>{formatJamTime(totalSec)}</span>
          </div>

          {!canControl && (
            <div className="lock-indicator">
              <Icon icon={Lock} size={14} />
              <span>Playback controlled by the host</span>
            </div>
          )}
        </div>

        {/* 5. Transport Controls */}
        <div className="jam-transport-row">
          <button
            type="button"
            className="jam-secondary-control"
            aria-label="Restart song"
            disabled={!canControl || totalSec <= 0}
            onClick={() => handleSeek(0)}
          >
            <Icon icon={SkipBack} size={22} />
          </button>

          <button
            type="button"
            className="btn-play-jam-72"
            aria-label={
              localNeedsPlayback
                ? 'Play jam audio on this device'
                : jamNeedsQueueRecovery
                  ? 'Start the next queued song'
                  : jam.isPlaying
                    ? 'Pause'
                    : 'Play'
            }
            disabled={!canControl && !localNeedsPlayback}
            style={{ opacity: canControl || localNeedsPlayback ? 1 : 0.4 }}
            onClick={handleTogglePlay}
          >
            <Icon
              icon={jam.isPlaying && !localNeedsPlayback && !jamNeedsQueueRecovery ? Pause : Play}
              size={32}
              on
            />
          </button>

          <button
            type="button"
            className="jam-secondary-control"
            aria-label="Play next song"
            disabled={!canControl || jam.queue.length === 0}
            onClick={handleSkipNext}
          >
            <Icon icon={SkipForward} size={22} />
          </button>
        </div>

        {localNeedsPlayback && (
          <p className="jam-local-playback-hint" role="status">
            Tap play to hear the jam on this device.
          </p>
        )}

        {/* 6. Invite Button */}
        <div className="jam-invite-strip">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => setInviteSheetOpen(true)}
          >
            <Icon icon={UserPlus} size={18} />
            <span>Invite friends</span>
          </button>
        </div>

        {/* 7. Up Next Queue */}
        <section className="jam-queue-section jam-room-sidebar" aria-label="Jam queue">
          <div className="queue-header">
            <div>
              <span className="jam-sidebar-kicker">THE ROOM QUEUE</span>
              <h3>Up next</h3>
            </div>
            <span className="jam-queue-count">{jam.queue.length}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary jam-add-songs-button"
            onClick={() => setAddSongSheetOpen(true)}
          >
            <Icon icon={Plus} size={17} />
            <span>Add songs</span>
          </button>

          <div className="jam-queue-list">
            {jam.queue.length === 0 ? (
              <div className="jam-queue-empty">
                <p>The queue is clear.</p>
                <span>Add a song and everyone can listen together.</span>
              </div>
            ) : (
              jam.queue.map((item, index) => (
                <div key={item.id} className="jam-queue-row">
                  <span className="jam-queue-index">{String(index + 1).padStart(2, '0')}</span>
                  <img
                    src={item.track.coverUrl}
                    alt=""
                    className="queue-cover"
                    width={44}
                    height={44}
                  />
                  <div className="queue-item-info">
                    <strong>{item.track.title}</strong>
                    <p>{item.track.artist}</p>
                    <span>
                      Added by {item.addedBy?.displayName ?? item.addedBy?.username ?? 'a member'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Members List Sheet */}
      {membersSheetOpen && (
        <div className="dialog-backdrop" onClick={() => setMembersSheetOpen(false)}>
          <aside
            className="suggest-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Jam members"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>Jam members ({jam.members.length}/8)</h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setMembersSheetOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="members-modal-list">
              {jam.members.map((m) => {
                const name = m.user.displayName ?? m.user.username ?? 'Member';
                return (
                  <div key={m.profileId} className="member-modal-row">
                    {m.user.avatarUrl ? (
                      <img
                        src={m.user.avatarUrl}
                        alt=""
                        className="avatar-40"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="avatar-fallback-40">{name[0]?.toUpperCase()}</div>
                    )}
                    <div className="member-modal-info">
                      <strong>{name}</strong>
                      {m.isHost && <span className="host-tag">Host</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Invite Friends Sheet */}
      {inviteSheetOpen && (
        <div className="dialog-backdrop" onClick={() => setInviteSheetOpen(false)}>
          <aside
            className="suggest-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Invite friends"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>Invite friends</h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setInviteSheetOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="action-row" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  const shareUrl = `${window.location.origin}/j/${jam.code}`;
                  if (navigator.share) {
                    void navigator.share({
                      title: 'Geet Jam',
                      text: `Listen with me on Geet: code ${jam.code}`,
                      url: shareUrl,
                    });
                  } else {
                    void navigator.clipboard.writeText(shareUrl);
                    window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Link copied.' }));
                  }
                }}
              >
                Copy link / Share
              </button>
            </div>

            <div className="invite-friends-list">
              {friends.length === 0 ? (
                <p className="empty-sub">No friends found.</p>
              ) : (
                friends.map((f) => {
                  const isInvited = invitedIds.includes(f.id);
                  const name = f.displayName ?? f.username ?? 'Friend';
                  return (
                    <div key={f.id} className="invite-friend-row">
                      {f.avatarUrl ? (
                        <img
                          src={f.avatarUrl}
                          alt=""
                          className="avatar-40"
                          width={40}
                          height={40}
                        />
                      ) : (
                        <div className="avatar-fallback-40">{name[0]?.toUpperCase()}</div>
                      )}
                      <div>
                        <strong>{name}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        disabled={isInvited}
                        onClick={() => handleInviteFriend(f.id)}
                      >
                        {isInvited ? 'Invited' : 'Invite'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Add Song Search Sheet */}
      {addSongSheetOpen && (
        <div className="dialog-backdrop" onClick={() => setAddSongSheetOpen(false)}>
          <aside
            className="suggest-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Add songs to jam"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>Add songs</h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setAddSongSheetOpen(false)}
              >
                ×
              </button>
            </div>

            <input
              type="text"
              className="field-input"
              placeholder="Search songs"
              value={searchSongQuery}
              onChange={(e) => setSearchSongQuery(e.target.value)}
            />

            <div className="track-picker-content">
              {searchSongResults.map((t) => (
                <div
                  key={t.id}
                  className="picker-track-row"
                  onClick={() => handleAddSongToQueue(t)}
                >
                  <img src={t.coverUrl ?? `/api/cover/${t.id}`} alt="" width={44} height={44} />
                  <div>
                    <strong>{t.title}</strong>
                    <p>{t.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
