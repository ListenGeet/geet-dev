'use client';

import {
  ArrowsOut,
  CaretDown,
  DownloadSimple,
  DotsThree,
  Heart,
  MicrophoneStage,
  Pause,
  Play,
  PlusCircle,
  Queue,
  Repeat,
  RepeatOnce,
  Shuffle,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerX,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Equalizer } from '@/components/Equalizer';
import { usePlayer } from './PlayerProvider';
import type { Track } from './types';

function timeLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function ProgressBar({
  currentTime,
  duration,
  isPreview,
  seek,
}: {
  currentTime: number;
  duration: number;
  isPreview: boolean;
  seek: (s: number) => void;
}) {
  const max = isPreview ? 40 : duration || 40;
  const ratio = Math.max(0, Math.min((currentTime / max) * 100, 100));
  return (
    <div className="fullplayer-progress">
      <input
        type="range"
        aria-label="Seek through song"
        min="0"
        max={max}
        step="0.1"
        value={Math.min(currentTime, max)}
        style={{ background: `linear-gradient(to right, #fff ${ratio}%, #4a4a4a ${ratio}%)` }}
        onChange={(event) => seek(Number(event.target.value))}
      />
      <div className="fullplayer-progress-times">
        <span>{timeLabel(currentTime)}</span>
        <span>{timeLabel(max)}</span>
      </div>
    </div>
  );
}

function Cover({ track, size = 48 }: { track: Track; size?: number }) {
  return (
    <Image
      src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
      alt=""
      width={size}
      height={size}
      className="player-cover"
      unoptimized
      onError={(event) => {
        event.currentTarget.src = '/illustrations/cover-fallback.svg';
      }}
    />
  );
}

function Transport({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const player = usePlayer();
  return (
    <div className={`transport ${size === 'large' ? 'transport-large' : ''}`}>
      <button
        className={`btn-icon ${player.shuffle ? 'is-on' : ''}`}
        aria-label="Shuffle"
        aria-pressed={player.shuffle}
        onClick={player.setShuffle}
      >
        <Icon icon={Shuffle} />
      </button>
      <button className="btn-icon" aria-label="Previous" onClick={() => void player.previous()}>
        <Icon icon={SkipBack} />
      </button>
      <button
        className={`play-control ${size === 'large' ? 'play-control-large' : ''}`}
        aria-label={player.isPlaying ? 'Pause' : 'Play'}
        onClick={() => void player.toggle()}
      >
        {player.isLoading ? (
          <Equalizer size={24} />
        ) : (
          <Icon icon={player.isPlaying ? Pause : Play} size={size === 'large' ? 30 : 22} />
        )}
      </button>
      <button className="btn-icon" aria-label="Next" onClick={() => void player.next()}>
        <Icon icon={SkipForward} />
      </button>
      <button
        className={`btn-icon ${player.repeat !== 'off' ? 'is-on' : ''}`}
        aria-label={`Repeat ${player.repeat}`}
        aria-pressed={player.repeat !== 'off'}
        onClick={player.cycleRepeat}
      >
        <Icon icon={player.repeat === 'one' ? RepeatOnce : Repeat} />
      </button>
    </div>
  );
}

function DisabledAction({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      className="btn-icon"
      type="button"
      aria-label={label}
      title={`${label} is coming later in Geet.`}
      disabled
    >
      {children}
    </button>
  );
}

export function PlayerChrome() {
  const player = usePlayer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (sleepMinutes === null || !player.isPlaying) return;
    if (sleepMinutes === -1) {
      const end = player.isPreview ? 40 : player.duration;
      const remaining = end - player.currentTime;
      if (remaining <= 0) {
        void player.toggle();
        setSleepMinutes(null);
        return;
      }
      const timer = window.setTimeout(() => {
        void player.toggle();
        setSleepMinutes(null);
      }, remaining * 1000);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => void player.toggle(), sleepMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [sleepMinutes, player.isPlaying, player.toggle]);

  useEffect(() => {
    if (sleepMinutes !== -1 || !player.isPlaying) return;
    const end = player.isPreview ? 40 : player.duration;
    if (end <= 0 || player.currentTime < end - 0.25) return;
    void player.toggle();
    setSleepMinutes(null);
  }, [
    sleepMinutes,
    player.isPlaying,
    player.currentTime,
    player.duration,
    player.isPreview,
    player.toggle,
  ]);

  useEffect(() => {
    if (!player.fullOpen && !player.queueOpen) return;
    const close = (event: KeyboardEvent) =>
      event.key === 'Escape' && (player.showFull(false), player.showQueue(false));
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [player]);

  if (!player.track) return null;
  const track = player.track;
  const max = player.isPreview ? 40 : player.duration || (track.durationMs ?? 0) / 1000;

  return (
    <>
      <div className="mini-player" aria-label="Mini player">
        <div
          className="mini-progress"
          style={{ width: `${max ? Math.min(100, (player.currentTime / max) * 100) : 0}%` }}
        />
        <button
          className="mini-main"
          onClick={() => player.showFull(true)}
          aria-label={`Open ${track.title} in full player`}
        >
          <Cover track={track} />
          <span className="mini-copy">
            <strong>{track.title}</strong>
            <span>
              {track.artist}
              {player.isPreview ? ' · Preview' : ''}
            </span>
          </span>
        </button>
        <button
          className="btn-icon player-gated"
          aria-label="Favourite"
          disabled={player.isSignedIn}
          onClick={() => player.openGate('favourite')}
        >
          <Icon icon={Heart} />
        </button>
        <button
          className="play-control mini-play"
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          onClick={() => void player.toggle()}
        >
          {player.isPlaying ? <Icon icon={Pause} /> : <Icon icon={Play} />}
        </button>
      </div>
      <div className="desktop-player">
        <div className="desktop-track">
          <button className="desktop-track-open" onClick={() => player.showFull(true)}>
            <Cover track={track} size={56} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </button>
          <button
            className="btn-icon player-gated"
            aria-label="Favourite"
            disabled={player.isSignedIn}
            onClick={() => player.openGate('favourite')}
          >
            <Icon icon={Heart} />
          </button>
          <DisabledAction label="Add to playlist">
            <Icon icon={PlusCircle} />
          </DisabledAction>
        </div>
        <div className="desktop-controls">
          <Transport />
          <div className="desktop-scrub">
            <span>{timeLabel(player.currentTime)}</span>
            <input
              aria-label="Seek"
              type="range"
              min={0}
              max={max || 40}
              step={0.1}
              value={Math.min(player.currentTime, max || 40)}
              onChange={(event) => player.seek(Number(event.target.value))}
            />
            <span>{player.isPreview ? '0:40' : timeLabel(max)}</span>
          </div>
        </div>
        <div className="desktop-actions">
          <button className="btn-icon" aria-label="Lyrics" onClick={() => void player.showLyrics()}>
            <Icon icon={MicrophoneStage} />
          </button>
          <button className="btn-icon" aria-label="Queue" onClick={() => player.showQueue(true)}>
            <Icon icon={Queue} />
          </button>
          <DisabledAction label="Jam">
            <Icon icon={UsersThree} />
          </DisabledAction>
          <DisabledAction label="Download">
            <Icon icon={DownloadSimple} />
          </DisabledAction>
          <button
            className="btn-icon"
            aria-label={player.muted ? 'Unmute' : 'Mute'}
            onClick={() => player.setVolume(player.muted ? 1 : 0)}
          >
            <Icon icon={player.muted ? SpeakerX : SpeakerHigh} />
          </button>
          <input
            className="volume-range"
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.volume}
            onChange={(event) => player.setVolume(Number(event.target.value))}
          />
          <button
            className="btn-icon"
            aria-label="Expand player"
            onClick={() => player.showFull(true)}
          >
            <Icon icon={ArrowsOut} />
          </button>
        </div>
      </div>

      {player.fullOpen && (
        <div
          className="fullplayer-backdrop"
          style={
            {
              '--player-artwork': track.coverUrl
                ? `url(${JSON.stringify(track.coverUrl)})`
                : 'none',
            } as React.CSSProperties
          }
          role="presentation"
          onClick={() => player.showFull(false)}
        >
          <section
            className="fullplayer"
            role="dialog"
            aria-modal="true"
            aria-label={`Now playing ${track.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="fullplayer-top">
              <button
                className="btn-icon"
                aria-label="Close player"
                onClick={() => player.showFull(false)}
              >
                <Icon icon={CaretDown} />
              </button>
              <div>
                <small>Playing from</small>
                <strong>{player.source}</strong>
              </div>
              <div className="player-menu-wrap">
                <button
                  className="btn-icon"
                  aria-label="Player menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <Icon icon={DotsThree} />
                </button>
                {menuOpen && (
                  <div className="menu player-menu">
                    <strong>Sleep timer</strong>
                    {[15, 30, 45, 60].map((minutes) => (
                      <button
                        className="menu-item"
                        key={minutes}
                        onClick={() => {
                          setSleepMinutes(minutes);
                          setMenuOpen(false);
                        }}
                      >
                        {minutes} min
                      </button>
                    ))}
                    <button
                      className="menu-item"
                      onClick={() => {
                        setSleepMinutes(null);
                        setMenuOpen(false);
                      }}
                    >
                      Off
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setSleepMinutes(-1);
                        setMenuOpen(false);
                      }}
                    >
                      End of this song
                    </button>
                  </div>
                )}
              </div>
            </header>
            {player.lyricsOpen && player.lyrics ? (
              <LyricsView />
            ) : (
              <div className="fullplayer-body">
                <div className="fullplayer-art">
                  <Cover track={track} size={420} />
                </div>
                <div className="fullplayer-info">
                  <div className="fullplayer-title">
                    <div>
                      <h2>{track.title}</h2>
                      <Link href={`/artist/${encodeURIComponent(track.artist)}`}>
                        {track.artist}
                      </Link>
                    </div>
                    <button
                      className="btn-icon player-gated"
                      aria-label="Favourite"
                      onClick={() => player.openGate('favourite')}
                    >
                      <Icon icon={Heart} />
                    </button>
                  </div>
                  <ProgressBar
                    currentTime={player.currentTime}
                    duration={max}
                    isPreview={player.isPreview}
                    seek={player.seek}
                  />
                  <Transport size="large" />
                  <div className="fullplayer-volume">
                    <button
                      className="btn-icon"
                      aria-label={player.muted ? 'Unmute' : 'Mute'}
                      onClick={() => player.setVolume(player.muted ? 1 : 0)}
                    >
                      <Icon icon={player.muted ? SpeakerX : SpeakerHigh} />
                    </button>
                    <input
                      aria-label="Volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={player.volume}
                      onChange={(event) => player.setVolume(Number(event.target.value))}
                    />
                    <span>{Math.round(player.volume * 100)}%</span>
                  </div>
                  <div className="fullplayer-discovery">
                    <LyricsPreview />
                    <UpNext />
                  </div>
                  {sleepMinutes !== null && sleepMinutes >= 0 && (
                    <p className="sleep-note">Sleep timer · {sleepMinutes} min</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {player.queueOpen && (
        <div className="sheet-backdrop" role="presentation" onClick={() => player.showQueue(false)}>
          <section
            className="queue-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Queue"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Queue</h2>
              <button
                className="btn-icon"
                aria-label="Close queue"
                onClick={() => player.showQueue(false)}
              >
                <Icon icon={X} />
              </button>
            </header>
            <p className="queue-section-label">Now playing</p>
            <QueueTrack track={track} active />
            <p className="queue-section-label">Next in queue</p>
            {player.queue.slice(player.index + 1).map((item) => (
              <QueueTrack
                track={item}
                key={item.id}
                onClick={() => void player.playTrack(item, player.queue, player.source)}
              />
            ))}
            {player.queue.length <= player.index + 1 && (
              <p className="queue-empty">The queue is empty</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function QueueTrack({
  track,
  active = false,
  onClick,
}: {
  track: Track;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`queue-track ${active ? 'queue-track-active' : ''}`} onClick={onClick}>
      <Cover track={track} />
      <span>
        <strong>{track.title}</strong>
        <small>{track.artist}</small>
      </span>
      {active ? <Equalizer size={14} /> : null}
    </button>
  );
}

function LyricsPreview() {
  const player = usePlayer();
  const lines = player.lyrics?.synced?.length
    ? player.lyrics.synced.slice(0, 3).map(({ line }) => line)
    : (player.lyrics?.plain?.split('\n').filter(Boolean).slice(0, 3) ?? []);
  return (
    <button className="lyrics-preview" onClick={() => void player.showLyrics()}>
      <span className="discovery-label">Lyrics</span>
      <span className="lyrics-preview-lines">
        {lines.length ? lines.map((line, index) => <span key={index}>{line}</span>) : 'Find lyrics'}
      </span>
      <span className="lyrics-preview-link">Tap to open full lyrics</span>
    </button>
  );
}

function UpNext() {
  const player = usePlayer();
  const next = player.queue.slice(player.index + 1, player.index + 2);
  return (
    <section className="fullplayer-upnext" aria-label="Up next">
      <span className="discovery-label">Up next</span>
      {next.length ? (
        next.map((track) => (
          <button
            className="upnext-track"
            key={track.id}
            onClick={() => void player.playTrack(track, player.queue, player.source)}
          >
            <Cover track={track} size={40} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </button>
        ))
      ) : (
        <p className="upnext-empty">No more songs in the queue.</p>
      )}
    </section>
  );
}

function LyricsView() {
  const player = usePlayer();
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const activeLine =
    player.lyrics?.synced?.reduce(
      (active, item, index) => (item.t_ms <= player.currentTime * 1000 ? index : active),
      -1,
    ) ?? -1;
  const track = player.track;
  const seekMax = player.isPreview ? 40 : player.duration || (track?.durationMs ?? 0) / 1000;

  useEffect(() => {
    activeLineRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [activeLine]);

  return (
    <div className="lyrics-view">
      <header className="lyrics-topbar">
        <button className="btn-icon" aria-label="Back to player" onClick={player.hideLyrics}>
          <CaretDown size={24} />
        </button>
        {track ? (
          <>
            <Cover track={track} size={40} />
            <span className="lyrics-track-meta">
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </>
        ) : null}
        <span className="lyrics-topbar-label">Lyrics</span>
      </header>
      <div className="lyrics-scroll">
        {player.lyrics?.synced?.length ? (
          player.lyrics.synced.map((line, index) => (
            <button
              ref={index === activeLine ? activeLineRef : null}
              className={`lyric-line ${index === activeLine ? 'lyric-active' : ''}`}
              aria-current={index === activeLine ? 'true' : undefined}
              key={`${line.t_ms}-${index}`}
              onClick={() => player.seek(line.t_ms / 1000)}
            >
              {line.line}
            </button>
          ))
        ) : (
          <p className="plain-lyrics">{player.lyrics?.plain}</p>
        )}
      </div>
      <footer className="lyrics-footer">
        <button
          className="lyrics-play"
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          onClick={() => void player.toggle()}
        >
          <Icon icon={player.isPlaying ? Pause : Play} size={20} />
        </button>
        <div className="lyrics-scrub">
          <span>{timeLabel(player.currentTime)}</span>
          <input
            type="range"
            aria-label="Seek through song"
            min="0"
            max={seekMax || 40}
            step="0.1"
            value={Math.min(player.currentTime, seekMax || 40)}
            onChange={(event) => player.seek(Number(event.target.value))}
          />
          <span>{timeLabel(seekMax || 40)}</span>
        </div>
        <small>
          {player.lyrics?.source === 'lrclib'
            ? 'Lyrics from LRCLIB via LyricsLIB.'
            : player.lyrics?.source === 'lyrics_ovh'
              ? 'Lyrics from Lyrics.ovh.'
              : 'Lyrics added by the uploader.'}
        </small>
      </footer>
    </div>
  );
}
