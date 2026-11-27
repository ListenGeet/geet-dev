'use client';

import { useAuth } from '@clerk/nextjs';
import { ArrowUp, Plus, X } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';
import { Icon } from '@/components/Icon';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';

type Card = {
  tracks?: Track[];
  play?: Track[];
  proposal?: {
    action: 'create' | 'add';
    name?: string;
    playlistId?: string;
    playlistName?: string;
    tracks: Track[];
  };
};
type Message = { role: 'user' | 'assistant'; content: string; cards?: Card[] };
type Playlist = { id: string; name: string };
const HISTORY_KEY = 'geet-assistant-history';
const starters = [
  'Punjabi songs for a long drive',
  'Make a playlist from my favourites',
  "What's new this week?",
];

function apiBase() {
  if (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
  )
    return '';
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

function AskGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="ask-glyph"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d="M3 3.5h14v10H9l-4 3v-3H3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6 9.5V8m4 1.5V6m4 3.5V7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AssistantScreen() {
  const { status, api, me } = useMe();
  const { getToken } = useAuth();
  const player = usePlayer();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [picker, setPicker] = useState<{ tracks: Track[]; selected: string } | null>(null);
  const [notice, setNotice] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const historyKey = me ? `${HISTORY_KEY}:${me.id}` : null;

  useEffect(() => {
    if (status !== 'ready' || !historyKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) ?? '[]') as Message[];
      if (Array.isArray(saved))
        setMessages(
          saved
            .filter(
              (item) =>
                item &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string',
            )
            .slice(-20),
        );
    } catch {
      try {
        localStorage.removeItem(historyKey);
      } catch {
        /* storage may be unavailable */
      }
    }
  }, [historyKey, status]);
  useEffect(() => {
    if (status === 'ready' && historyKey) {
      try {
        localStorage.setItem(historyKey, JSON.stringify(messages.slice(-20)));
      } catch {
        /* storage may be unavailable */
      }
    }
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [busy, historyKey, messages, status]);

  const send = useCallback(
    async (text: string, history: Message[] = messages) => {
      const content = text.trim();
      if (!content || busy || remaining === 0) return;
      const next: Message[] = [...history, { role: 'user' as const, content }].slice(-20);
      setMessages(next);
      setInput('');
      setError('');
      setNotice('');
      setBusy(true);
      const thisRequest = ++requestId.current;
      try {
        const token = await getToken();
        const response = await fetch(`${apiBase()}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: next.map(({ role, content: message }) => ({ role, content: message })),
          }),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(result?.error?.message ?? 'Ask Geet is busy. Try again in a minute.');
        }
        if (!response.body) throw new Error('Ask Geet is busy. Try again in a minute.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let answer = '';
        let cards: Card[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split = buffer.indexOf('\n\n');
          while (split >= 0) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const data = /^data: (.+)$/m.exec(frame)?.[1];
            if (event && data) {
              const value = JSON.parse(data) as unknown;
              if (event === 'text') answer += value as string;
              if (event === 'cards') cards = value as Card[];
              if (event === 'done') setRemaining((value as { remaining: number }).remaining);
            }
            split = buffer.indexOf('\n\n');
          }
        }
        if (thisRequest === requestId.current)
          setMessages([...next, { role: 'assistant' as const, content: answer, cards }].slice(-20));
      } catch (cause) {
        if (thisRequest === requestId.current)
          setError(
            cause instanceof Error ? cause.message : 'Ask Geet is busy. Try again in a minute.',
          );
      } finally {
        if (thisRequest === requestId.current) setBusy(false);
      }
    },
    [busy, getToken, messages, remaining],
  );

  async function openPicker(tracks: Track[]) {
    try {
      const result = await api<{ items: Playlist[] }>('/api/playlists');
      setPlaylists(result.items.filter((item) => item.id));
      setPicker({ tracks: tracks.slice(0, 50), selected: result.items[0]?.id ?? '' });
    } catch {
      setError('Could not load your playlists. Try again.');
    }
  }

  async function confirmAdd() {
    if (!picker?.selected) return;
    try {
      await api('/api/ai/confirm', {
        method: 'POST',
        body: {
          action: 'add',
          playlistId: picker.selected,
          trackIds: picker.tracks.map((track) => track.id),
        },
      });
      setNotice('Songs added to playlist.');
      setPicker(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update that playlist.');
    }
  }

  async function confirmProposal(proposal: NonNullable<Card['proposal']>) {
    try {
      const result = await api<{ playlist: { id: string; name: string; count: number } }>(
        '/api/ai/confirm',
        {
          method: 'POST',
          body: {
            action: proposal.action,
            name: proposal.name,
            playlistId: proposal.playlistId,
            trackIds: proposal.tracks.map((track) => track.id),
          },
        },
      );
      setNotice(`Created ${result.playlist.name}.`);
      setMessages((current) =>
        [
          ...current,
          {
            role: 'assistant' as const,
            content: `Playlist created: ${result.playlist.name}.`,
            cards: [],
          },
        ].slice(-20),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that playlist.');
    }
  }

  function newChat() {
    requestId.current++;
    setMessages([]);
    setInput('');
    setError('');
    setNotice('');
    setBusy(false);
    if (historyKey)
      try {
        localStorage.removeItem(historyKey);
      } catch {
        /* storage may be unavailable */
      }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  if (status === 'guest')
    return (
      <main className="guest-page">
        <EmptyState
          title="Ask Geet"
          sentence="Sign in to ask about songs on Geet."
          image="/illustrations/no-results.svg"
          action={
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );
  if (status !== 'ready')
    return (
      <main className="assistant-page" aria-busy="true">
        <h1>Ask Geet</h1>
        <p className="text-2">Loading your account…</p>
      </main>
    );

  return (
    <main className="assistant-page">
      <header className="assistant-heading">
        <div>
          <h1>Ask Geet</h1>
          <p>Only knows songs on Geet.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={newChat}>
          New chat
        </button>
      </header>
      <section
        className="assistant-conversation"
        aria-label="Conversation with Ask Geet"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="assistant-starters">
            {starters.map((starter) => (
              <button
                type="button"
                className="assistant-starter"
                key={starter}
                onClick={() => void send(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message, index) => (
            <article
              className={`assistant-message assistant-${message.role}`}
              key={`${index}-${message.role}`}
            >
              {message.role === 'user' ? (
                <p className="assistant-user-text">{message.content}</p>
              ) : (
                <div className="assistant-answer">
                  <AskGlyph />
                  <div>
                    <p>{message.content}</p>
                    {message.cards?.map((card, cardIndex) => (
                      <div className="assistant-result" key={cardIndex}>
                        {card.tracks?.length ? (
                          <>
                            <div className="assistant-track-list">
                              {card.tracks.slice(0, 8).map((track) => (
                                <div className="assistant-track" key={track.id}>
                                  <Image
                                    src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
                                    alt=""
                                    width={48}
                                    height={48}
                                    unoptimized
                                  />
                                  <div className="assistant-track-title">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void player.playTrack(
                                          track,
                                          card.tracks ?? [track],
                                          'Ask Geet',
                                        )
                                      }
                                    >
                                      {track.title}
                                    </button>
                                    <Link href={`/artist/${encodeURIComponent(track.artist)}`}>
                                      {track.artist}
                                    </Link>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    aria-label={`Add ${track.title} to a playlist`}
                                    onClick={() => void openPicker([track])}
                                  >
                                    <Icon icon={Plus} size={20} />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="assistant-result-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() =>
                                  void player.playTrack(card.tracks![0]!, card.tracks!, 'Ask Geet')
                                }
                              >
                                Play all
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void openPicker(card.tracks!)}
                              >
                                Add all to playlist
                              </button>
                            </div>
                          </>
                        ) : null}
                        {card.play?.length ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              void player.playTrack(card.play![0]!, card.play!, 'Ask Geet')
                            }
                          >
                            Play songs
                          </button>
                        ) : null}
                        {card.proposal ? (
                          <div className="assistant-proposal">
                            <strong>
                              {card.proposal.action === 'create'
                                ? card.proposal.name
                                : card.proposal.playlistName}
                            </strong>
                            <span>{card.proposal.tracks.length} songs</span>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => void confirmProposal(card.proposal!)}
                            >
                              {card.proposal.action === 'create' ? 'Create playlist' : 'Add songs'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
        {busy ? (
          <div className="assistant-thinking" role="status">
            <AskGlyph />
            <span className="assistant-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>Looking through Geet…</span>
          </div>
        ) : null}
        <div ref={bottom} />
      </section>
      {remaining !== null && remaining <= 5 && remaining > 0 ? (
        <p className="assistant-limit">{remaining} questions left today.</p>
      ) : null}
      {remaining === 0 ? (
        <p className="assistant-limit">You've used today's questions. Back tomorrow.</p>
      ) : null}
      {notice ? (
        <p className="assistant-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="assistant-error" role="alert">
          <span>{error}</span>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              const lastIndex = messages.map((item) => item.role).lastIndexOf('user');
              const last = messages[lastIndex];
              if (last) void send(last.content, messages.slice(0, lastIndex));
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {picker ? (
        <div className="assistant-picker">
          <label htmlFor="assistant-playlist">Add to playlist</label>
          <select
            id="assistant-playlist"
            value={picker.selected}
            onChange={(event) => setPicker({ ...picker, selected: event.target.value })}
          >
            <option value="">Choose a playlist</option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!picker.selected}
            onClick={() => void confirmAdd()}
          >
            Add
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="Close playlist picker"
            onClick={() => setPicker(null)}
          >
            <Icon icon={X} />
          </button>
        </div>
      ) : null}
      <form className="assistant-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-input">
          Ask for a song, mood or playlist
        </label>
        <input
          id="assistant-input"
          value={input}
          maxLength={500}
          placeholder="Ask for a song, mood or playlist"
          onChange={(event) => setInput(event.target.value)}
          disabled={busy || remaining === 0}
        />
        <span className="assistant-char-count">{input.length}/500</span>
        <button
          type="submit"
          className="assistant-send"
          aria-label="Send question"
          disabled={!input.trim() || busy || remaining === 0}
        >
          <Icon icon={ArrowUp} size={21} />
        </button>
      </form>
      <p className="assistant-disclosure">
        Ask Geet can make mistakes. Songs shown are always real Geet tracks.
      </p>
    </main>
  );
}
