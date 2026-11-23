'use client';

import { useAuth } from '@clerk/nextjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SignInGate, type GateReason } from '@/components/auth/SignInGate';
import { callApi } from '@/lib/api';
import type { Lyrics, Track } from './types';

type RepeatMode = 'off' | 'all' | 'one';
type PlaybackSource = 'Home' | 'Search' | string;

interface PlayerState {
  track: Track | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  isPreview: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  gateOpen: boolean;
  isSignedIn: boolean;
  fullOpen: boolean;
  queueOpen: boolean;
  lyricsOpen: boolean;
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
  loadLyrics: () => Promise<Lyrics | null>;
  source: PlaybackSource;
  playTrack: (track: Track, list?: Track[], source?: PlaybackSource) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  setShuffle: () => void;
  cycleRepeat: () => void;
  showFull: (show?: boolean) => void;
  showQueue: (show?: boolean) => void;
  showLyrics: () => Promise<void>;
  closeGate: () => void;
  openGate: (reason: GateReason) => void;
  hideLyrics: () => void;
}

const Context = createContext<PlayerState | null>(null);

interface PlayGrant {
  url: string;
  expiresAt: string;
  preview: boolean;
}

export function isPreviewLimitReached(seconds: number): boolean {
  return seconds >= 40;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const promptRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const originalQueueRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const shuffleRef = useRef(false);
  const previewRef = useRef(false);
  const gateRef = useRef(false);
  const previewEndedRef = useRef(false);
  const repeatRef = useRef<RepeatMode>('off');
  const retryRef = useRef(false);
  const playedAtRef = useRef(0);
  const autoplaySimilarRef = useRef(true);
  const resumePositionRef = useRef(0);
  const [track, setTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [isLoading, setLoading] = useState(false);
  const [isPreview, setPreview] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [gateOpen, setGateOpen] = useState(false);
  const [gateReason, setGateReason] = useState<GateReason>('preview');
  const [fullOpen, setFullOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const lyricsLoadedFor = useRef<string | null>(null);
  const [source, setSource] = useState<PlaybackSource>('Home');

  useEffect(() => {
    try {
      autoplaySimilarRef.current = localStorage.getItem('lg-autoplay-similar') !== 'false';
    } catch {
      /* storage may be unavailable */
    }
    const update = (event: Event) => {
      autoplaySimilarRef.current = (event as CustomEvent<boolean>).detail;
    };
    window.addEventListener('geet:autoplay-similar', update);
    return () => window.removeEventListener('geet:autoplay-similar', update);
  }, []);

  const token = useCallback(
    () => (isSignedIn ? getToken() : Promise.resolve(null)),
    [getToken, isSignedIn],
  );
  const logPlay = useCallback(
    async (outcome: 'completed' | 'skipped' | 'partial') => {
      const active = currentRef.current;
      if (!active || !isSignedIn || !playedAtRef.current) return;
      const listenedMs = Math.max(0, Math.round((audioRef.current?.currentTime ?? 0) * 1000));
      playedAtRef.current = 0;
      if (listenedMs < 30_000 && outcome === 'partial') return;
      try {
        if (!navigator.onLine) {
          const queue = JSON.parse(localStorage.getItem('lg_history_queue') ?? '[]') as {
            trackId: string;
            listenedMs: number;
            outcome: string;
          }[];
          queue.push({ trackId: active.id, listenedMs, outcome });
          localStorage.setItem('lg_history_queue', JSON.stringify(queue.slice(-100)));
          return;
        }
        await callApi('/api/history', {
          method: 'POST',
          token,
          body: { trackId: active.id, listenedMs, outcome },
        });
      } catch {
        // Play logging is a best-effort signal; playback must continue if it is unavailable.
      }
    },
    [isSignedIn, token],
  );

  useEffect(() => {
    if (!isSignedIn || !navigator.onLine) return;
    const flush = async () => {
      let queued: {
        trackId: string;
        listenedMs: number;
        outcome: 'completed' | 'skipped' | 'partial';
      }[];
      try {
        queued = JSON.parse(localStorage.getItem('lg_history_queue') ?? '[]');
      } catch {
        queued = [];
      }
      while (queued.length) {
        try {
          await callApi('/api/history', { method: 'POST', token, body: queued[0] });
          queued.shift();
          localStorage.setItem('lg_history_queue', JSON.stringify(queued));
        } catch {
          return;
        }
      }
    };
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [isSignedIn, token]);

  const playTrack = useCallback(
    async (nextTrack: Track, list: Track[] = [nextTrack], nextSource: PlaybackSource = source) => {
      const audio = audioRef.current;
      if (!audio) return;
      const resumeAt =
        currentRef.current?.id === nextTrack.id && !audio.src ? resumePositionRef.current : 0;
      setLoading(true);
      setGateOpen(false);
      gateRef.current = false;
      previewEndedRef.current = false;
      retryRef.current = false;
      currentRef.current = nextTrack;
      queueRef.current = list.length ? list : [nextTrack];
      if (!shuffleRef.current) originalQueueRef.current = queueRef.current;
      const found = queueRef.current.findIndex((item) => item.id === nextTrack.id);
      indexRef.current = Math.max(0, found);
      setTrack(nextTrack);
      setQueue(queueRef.current);
      setIndex(indexRef.current);
      setSource(nextSource);
      setCurrentTime(resumeAt);
      setDuration((nextTrack.durationMs ?? 0) / 1000);
      setLyrics(null);
      lyricsLoadedFor.current = null;
      setLyricsLoading(false);
      setLyricsOpen(false);
      try {
        const preloaded = preloadRef.current;
        const hasPreload = Boolean(preloaded?.src && preloaded.dataset.trackId === nextTrack.id);
        const grant = nextTrack.audioUrl?.startsWith('/offline-audio/')
          ? { url: nextTrack.audioUrl, preview: false }
          : hasPreload
            ? { url: preloaded!.src, preview: !isSignedIn }
            : await callApi<PlayGrant>(`/api/tracks/${nextTrack.id}/play`, { token });
        if (hasPreload) {
          preloaded!.pause();
          preloadRef.current = null;
        }
        previewRef.current = grant.preview;
        setPreview(grant.preview);
        audio.src = grant.url;
        audio.load();
        if (resumeAt > 0) audio.currentTime = resumeAt;
        await audio.play();
        resumePositionRef.current = 0;
        playedAtRef.current = Date.now();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setLoading(false);
      }
    },
    [isSignedIn, source, token],
  );

  const next = useCallback(async () => {
    const list = queueRef.current;
    if (list.length < 2) return;
    await logPlay('skipped');
    let nextIndex = indexRef.current + 1;
    if (nextIndex >= list.length) {
      if (repeatRef.current !== 'all') return;
      nextIndex = 0;
    }
    await playTrack(list[nextIndex]!, list, source);
  }, [logPlay, playTrack, source]);

  const previous = useCallback(async () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const list = queueRef.current;
    if (list.length < 2 || indexRef.current === 0) return;
    await logPlay('skipped');
    await playTrack(list[indexRef.current - 1]!, list, source);
  }, [logPlay, playTrack, source]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewEndedRef.current && currentRef.current && previewRef.current) {
      await playTrack(currentRef.current, queueRef.current, source);
      return;
    }
    if (audio.paused && currentRef.current) {
      if (!audio.src) {
        await playTrack(currentRef.current, queueRef.current, source);
        return;
      }
      try {
        await audio.play();
        if (!playedAtRef.current) playedAtRef.current = Date.now();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      void logPlay('partial');
      setPlaying(false);
    }
  }, [logPlay, playTrack, source]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const limit = previewRef.current
      ? 40
      : Number.isFinite(audio.duration)
        ? audio.duration
        : seconds;
    audio.currentTime = Math.max(0, Math.min(seconds, limit));
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    const nextVolume = Math.max(0, Math.min(value, 1));
    setVolumeState(nextVolume);
    setMuted(nextVolume === 0);
    if (audio) {
      audio.volume = nextVolume;
      audio.muted = nextVolume === 0;
    }
  }, []);

  const setShuffle = useCallback(() => {
    const enabling = !shuffleRef.current;
    if (enabling) {
      originalQueueRef.current = queueRef.current.slice();
      const current = queueRef.current[indexRef.current];
      const remaining = queueRef.current.slice(indexRef.current + 1);
      for (let i = remaining.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
      }
      const shuffled = [
        ...queueRef.current.slice(0, indexRef.current),
        ...(current ? [current] : []),
        ...remaining,
      ];
      queueRef.current = shuffled;
      setQueue(shuffled);
    } else {
      const currentId = currentRef.current?.id;
      const restored = originalQueueRef.current;
      const restoredIndex = Math.max(
        0,
        restored.findIndex((item) => item.id === currentId),
      );
      queueRef.current = restored;
      indexRef.current = restoredIndex;
      setQueue(restored);
      setIndex(restoredIndex);
    }
    shuffleRef.current = enabling;
    setShuffleState(enabling);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((mode) => {
      const nextMode = mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
      repeatRef.current = nextMode;
      return nextMode;
    });
  }, []);

  const loadLyrics = useCallback(async () => {
    const active = currentRef.current;
    if (!active) return null;
    if (lyricsLoadedFor.current === active.id) return lyrics;
    if (lyricsLoading) return null;
    setLyricsLoading(true);
    try {
      const result = await callApi<{ lyrics: Lyrics | null }>(`/api/lyrics/${active.id}`);
      if (currentRef.current?.id !== active.id) return null;
      lyricsLoadedFor.current = active.id;
      setLyrics(result.lyrics);
      return result.lyrics;
    } catch {
      return null;
    } finally {
      if (currentRef.current?.id === active.id) setLyricsLoading(false);
    }
  }, [lyrics, lyricsLoading]);

  const showLyrics = useCallback(async () => {
    if (!currentRef.current) return;
    const result = lyricsLoadedFor.current === currentRef.current.id ? lyrics : await loadLyrics();
    if (!result) return;
    setLyricsOpen(true);
    setFullOpen(true);
  }, [lyrics, loadLyrics]);

  const closeGate = useCallback(() => {
    setGateOpen(false);
    gateRef.current = false;
  }, []);
  const openGate = useCallback((reason: GateReason) => {
    setGateReason(reason);
    setGateOpen(true);
  }, []);
  const hideLyrics = useCallback(() => setLyricsOpen(false), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const finishPreview = () => {
      if (gateRef.current) return;
      gateRef.current = true;
      previewEndedRef.current = true;
      audio.pause();
      setPlaying(false);
      setGateReason('preview');
      setGateOpen(true);
      void logPlay('partial');
      try {
        const alreadyPlayed = sessionStorage.getItem('geet-preview-prompt') === '1';
        if (!alreadyPlayed) {
          sessionStorage.setItem('geet-preview-prompt', '1');
          promptRef.current ??= new Audio('/audio/signin-prompt.mp3');
          promptRef.current.currentTime = 0;
          void promptRef.current.play().catch(() => undefined);
        }
      } catch {
        // Storage may be disabled; the in-memory gate still works.
      }
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (previewRef.current && isPreviewLimitReached(audio.currentTime) && !gateRef.current) {
        audio.currentTime = 40;
        setCurrentTime(40);
        finishPreview();
        return;
      }
      if (!previewRef.current && audio.duration - audio.currentTime <= 20) {
        const upcoming = queueRef.current[indexRef.current + 1];
        if (upcoming && !preloadRef.current?.src) {
          preloadRef.current = new Audio();
          void callApi<PlayGrant>(`/api/tracks/${upcoming.id}/play`, { token })
            .then((grant) => {
              if (preloadRef.current) {
                preloadRef.current.preload = 'auto';
                preloadRef.current.src = grant.url;
                preloadRef.current.dataset.trackId = upcoming.id;
              }
            })
            .catch(() => undefined);
        }
      }
    };
    const onMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      setLoading(false);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onEnded = () => {
      if (previewRef.current) {
        finishPreview();
        return;
      }
      void logPlay('completed');
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => setPlaying(false));
      } else {
        if (queueRef.current.length > 1) void next();
        else if (
          autoplaySimilarRef.current &&
          isSignedIn &&
          currentRef.current &&
          navigator.onLine
        ) {
          const previous = currentRef.current;
          void callApi<{ songs: Track[] }>(
            `/api/search?q=${encodeURIComponent(previous.artist)}&type=songs`,
            { token },
          )
            .then(({ songs }) => {
              const candidate = songs.find((item) => item.id !== previous.id);
              if (candidate) void playTrack(candidate, [candidate], 'Autoplay');
            })
            .catch(() => undefined);
        }
      }
    };
    const onError = () => {
      if (retryRef.current || !currentRef.current) {
        setLoading(false);
        setPlaying(false);
        window.dispatchEvent(
          new CustomEvent('geet:toast', {
            detail: `Couldn't play ${currentRef.current?.title ?? 'this song'}. Skipped.`,
          }),
        );
        if (queueRef.current.length > 1) void next();
        return;
      }
      retryRef.current = true;
      const retryTrack = currentRef.current;
      void callApi<PlayGrant>(`/api/tracks/${retryTrack.id}/play`, { token })
        .then((grant) => {
          previewRef.current = grant.preview;
          setPreview(grant.preview);
          audio.src = grant.url;
          audio.load();
          return audio.play();
        })
        .then(() => {
          playedAtRef.current = Date.now();
          setPlaying(true);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
          setPlaying(false);
          window.dispatchEvent(
            new CustomEvent('geet:toast', {
              detail: `Couldn't play ${retryTrack.title}. Skipped.`,
            }),
          );
          if (queueRef.current.length > 1) void next();
        });
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [isSignedIn, logPlay, next, playTrack, source, token]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('geet-player-queue');
      if (!saved) return;
      const value = JSON.parse(saved) as {
        queue?: Track[];
        index?: number;
        source?: string;
        time?: number;
      };
      if (!Array.isArray(value.queue) || !value.queue.length) return;
      const restoredIndex = Math.max(0, Math.min(value.index ?? 0, value.queue.length - 1));
      queueRef.current = value.queue;
      indexRef.current = restoredIndex;
      currentRef.current = value.queue[restoredIndex] ?? null;
      setQueue(value.queue);
      setIndex(restoredIndex);
      setTrack(currentRef.current);
      setSource(value.source ?? 'Home');
      setCurrentTime(Math.max(0, value.time ?? 0));
      resumePositionRef.current = Math.max(0, value.time ?? 0);
    } catch {
      localStorage.removeItem('geet-player-queue');
    }
  }, []);

  useEffect(() => {
    if (!track || typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        'geet-player-queue',
        JSON.stringify({ queue, index, source, time: currentTime }),
      );
    } catch {
      // A full or disabled storage quota must not interrupt playback.
    }
  }, [track, queue, index, source, currentTime]);

  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album ?? 'Geet',
          artwork: track.coverUrl
            ? [{ src: track.coverUrl, sizes: '600x600', type: 'image/jpeg' }]
            : [],
        });
      }
      navigator.mediaSession.setActionHandler('play', () => void toggle());
      navigator.mediaSession.setActionHandler('pause', () => void toggle());
      navigator.mediaSession.setActionHandler('nexttrack', () => void next());
      navigator.mediaSession.setActionHandler('previoustrack', () => void previous());
      navigator.mediaSession.setActionHandler('seekto', (event) => {
        if (typeof event.seekTime === 'number') seek(event.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (event) =>
        seek(Math.max(0, (audioRef.current?.currentTime ?? 0) - (event.seekOffset ?? 5))),
      );
      navigator.mediaSession.setActionHandler('seekforward', (event) =>
        seek((audioRef.current?.currentTime ?? 0) + (event.seekOffset ?? 5)),
      );
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      if (duration > 0 && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(currentTime, duration),
        });
      }
    } catch {
      // Unsupported or rejected media-session actions must not interrupt playback.
    }
  }, [currentTime, duration, isPlaying, next, previous, seek, toggle, track]);

  const value = useMemo<PlayerState>(
    () => ({
      track,
      queue,
      index,
      isPlaying,
      isLoading,
      isPreview,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      gateOpen,
      isSignedIn: Boolean(isSignedIn),
      fullOpen,
      queueOpen,
      lyricsOpen,
      lyrics,
      lyricsLoading,
      loadLyrics,
      source,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      setShuffle,
      cycleRepeat,
      showFull: (show) => setFullOpen(show ?? !fullOpen),
      showQueue: (show) => setQueueOpen(show ?? !queueOpen),
      showLyrics,
      closeGate,
      openGate,
      hideLyrics,
    }),
    [
      track,
      queue,
      index,
      isPlaying,
      isLoading,
      isPreview,
      currentTime,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      gateOpen,
      isSignedIn,
      fullOpen,
      queueOpen,
      lyricsOpen,
      lyrics,
      lyricsLoading,
      source,
      playTrack,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      setShuffle,
      cycleRepeat,
      showLyrics,
      loadLyrics,
      closeGate,
      openGate,
      hideLyrics,
    ],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" hidden />
      <SignInGate open={gateOpen} reason={gateReason} onClose={closeGate} />
    </Context.Provider>
  );
}

export function usePlayer() {
  const value = useContext(Context);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}
