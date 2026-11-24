'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  UsersThree,
  DotsThreeVertical,
  MusicNote,
  ArrowUp,
  Play,
} from '@phosphor-icons/react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@clerk/nextjs';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { Icon } from '@/components/Icon';
import { Equalizer } from '@/components/Equalizer';
import { getRealtimeClient, retainRealtime, releaseRealtime } from '@/lib/realtime';
import type { ChatMessageItem, ConversationItem } from '@geet/shared';
import type { Track } from '@/components/player/types';

export default function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = use(params);
  const { me, api, status } = useMe();
  const { getToken } = useAuth();
  const player = usePlayer();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversation, setConversation] = useState<ConversationItem | null>(null);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Composer
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isTypingRemote, setIsTypingRemote] = useState(false);

  // Sheets and menus
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Track picker tabs
  const [pickerTab, setPickerTab] = useState<'now' | 'favorites' | 'search'>('now');
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const loadThread = async () => {
    if (status !== 'ready') return;
    try {
      const [msgData, convsData] = await Promise.all([
        api<{ items: ChatMessageItem[]; otherReadAt: string | null }>(
          `/api/conversations/${conversationId}/messages`,
        ),
        api<{ items: ConversationItem[] }>('/api/conversations'),
      ]);

      setMessages(msgData.items ?? []);
      setOtherReadAt(msgData.otherReadAt);

      const conv = convsData.items?.find((c) => c.id === conversationId) ?? null;
      setConversation(conv);

      // Mark conversation read
      void api(`/api/conversations/${conversationId}/read`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom('auto'), 50);
    }
  };

  useEffect(() => {
    if (status === 'ready') {
      void loadThread();
    }
  }, [conversationId, status]);

  // Lazy Realtime Subscription
  useEffect(() => {
    if (status !== 'ready') return;

    retainRealtime();
    const rt = getRealtimeClient(getToken);

    if (rt) {
      const channel = rt
        .channel(`chat:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newMsg = payload.new as ChatMessageItem;
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              // Mark read if not sent by me
              if (newMsg.senderId !== me?.id) {
                void api(`/api/conversations/${conversationId}/read`, { method: 'POST' });
              }
              setTimeout(() => scrollToBottom(), 50);
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as ChatMessageItem;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === updated.id
                    ? {
                        ...m,
                        deletedAt: updated.deletedAt ?? m.deletedAt,
                        body: updated.deletedAt ? 'Message deleted' : m.body,
                      }
                    : m,
                ),
              );
            }
          },
        )
        .on('broadcast', { event: 'typing' }, (payload) => {
          if (payload.payload?.senderId !== me?.id) {
            setIsTypingRemote(true);
            if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = window.setTimeout(() => setIsTypingRemote(false), 2500);
          }
        })
        .subscribe();

      realtimeChannelRef.current = channel;
    }

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
      releaseRealtime();
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId, status, me?.id]);

  const handleBroadcastTyping = () => {
    if (realtimeChannelRef.current) {
      void realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: me?.id },
      });
    }
  };

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const msg = await api<ChatMessageItem>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { kind: 'text', body: trimmed },
      });

      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setText('');
      setTimeout(() => scrollToBottom(), 50);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleSendTrack = async (track: { id: string; title: string; artist: string }) => {
    try {
      const msg = await api<ChatMessageItem>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { kind: 'track', trackId: track.id },
      });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTrackPickerOpen(false);
      setTimeout(() => scrollToBottom(), 50);
    } catch {
      // ignore
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('Delete message for everyone?')) return;
    try {
      await api(`/api/messages/${messageId}`, { method: 'DELETE' });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, deletedAt: new Date().toISOString(), body: 'Message deleted' }
            : m,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleStartJam = async () => {
    try {
      const jam = await api<{ id: string; code: string }>('/api/jams', {
        method: 'POST',
        body: { trackId: player.track?.id },
      });

      // Send jam card message in thread
      await api(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { kind: 'jam', jamId: jam.id },
      });

      router.push(`/jam/${jam.id}`);
    } catch {
      // ignore
    }
  };

  const handleBlockFriend = async () => {
    if (!conversation?.participant) return;
    const name =
      conversation.participant.displayName ?? conversation.participant.username ?? 'user';
    if (!window.confirm(`Block ${name}? They won't be able to find or message you.`)) return;

    try {
      await api(`/api/blocks/${conversation.participant.id}`, { method: 'POST' });
      router.push('/friends');
    } catch {
      // ignore
    }
  };

  const handleRemoveFriend = async () => {
    if (!conversation?.participant) return;
    const name =
      conversation.participant.displayName ?? conversation.participant.username ?? 'friend';
    if (!window.confirm(`Remove ${name}?`)) return;

    try {
      await api(`/api/friends/${conversation.participant.id}`, { method: 'DELETE' });
      router.push('/friends');
    } catch {
      // ignore
    }
  };

  // Track picker search
  useEffect(() => {
    if (!trackPickerOpen) return;
    if (pickerTab === 'favorites') {
      void api<{ items: Track[] }>('/api/favorites').then((d) => setFavorites(d.items ?? []));
    } else if (pickerTab === 'search' && searchQuery.trim()) {
      const timer = setTimeout(async () => {
        try {
          const res = await api<{ songs: Track[] }>(
            `/api/search?q=${encodeURIComponent(searchQuery)}`,
          );
          setSearchResults(res.songs ?? []);
        } catch {
          setSearchResults([]);
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pickerTab, trackPickerOpen, searchQuery, api]);

  const friendName =
    conversation?.participant.displayName ?? conversation?.participant.username ?? 'Chat';

  return (
    <main className="page chat-thread-page">
      {/* Header (56px) */}
      <header className="chat-header">
        <button
          type="button"
          className="btn-icon"
          aria-label="Back to messages"
          onClick={() => router.push('/chat')}
        >
          <Icon icon={ArrowLeft} size={20} />
        </button>

        {conversation?.participant.avatarUrl ? (
          <img
            src={conversation.participant.avatarUrl}
            alt=""
            className="avatar-32"
            width={32}
            height={32}
          />
        ) : (
          <div className="avatar-fallback-32">{friendName[0]?.toUpperCase()}</div>
        )}

        <div className="chat-header-info">
          <strong>{friendName}</strong>
          <span className="chat-status-line">{isTypingRemote ? 'Typing…' : 'Active'}</span>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className="btn-icon"
            aria-label="Start a jam"
            onClick={handleStartJam}
          >
            <Icon icon={UsersThree} size={20} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="Options"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon icon={DotsThreeVertical} size={20} />
          </button>
        </div>

        {menuOpen && (
          <div className="menu-popover" onClick={() => setMenuOpen(false)}>
            <button type="button" className="menu-item" onClick={handleRemoveFriend}>
              Remove friend
            </button>
            <button type="button" className="menu-item danger" onClick={handleBlockFriend}>
              Block
            </button>
          </div>
        )}
      </header>

      {/* Messages list */}
      <div className="chat-messages-container">
        {loading ? (
          <p className="hint-text">Loading conversation…</p>
        ) : (
          messages.map((m, index) => {
            const isMine = m.senderId === me?.id;
            const prev = messages[index - 1];
            const isGrouped =
              prev &&
              prev.senderId === m.senderId &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) <
                120000;

            const isLastMessage = index === messages.length - 1;
            const isSeen =
              isMine &&
              otherReadAt &&
              new Date(m.createdAt).getTime() <= new Date(otherReadAt).getTime();

            return (
              <div
                key={m.id}
                className={`message-wrapper ${isMine ? 'message-mine' : 'message-theirs'} ${isGrouped ? 'message-grouped' : ''}`}
              >
                {m.kind === 'track' && m.track ? (
                  <div className="track-card-message">
                    <img
                      src={m.track.coverUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="cover-64"
                    />
                    <div className="track-card-meta">
                      <strong>{m.track.title}</strong>
                      <p>{m.track.artist}</p>
                    </div>
                    {m.track.status === 'ready' && (
                      <button
                        type="button"
                        className="btn-play-white"
                        aria-label={`Play ${m.track.title}`}
                        onClick={() => void player.playTrack(m.track!)}
                      >
                        <Icon icon={Play} size={18} />
                      </button>
                    )}
                  </div>
                ) : m.kind === 'jam' && m.jam ? (
                  <div className="jam-card-message">
                    <div className="five-bar-mark" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div>
                      <strong>Jam with {friendName}</strong>
                      <p>{m.jam.memberCount} listening</p>
                    </div>
                    {!m.jam.isEnded ? (
                      <Link href={`/j/${m.jam.code}`} className="btn btn-primary btn-xs">
                        Join
                      </Link>
                    ) : (
                      <span className="jam-ended-text">Jam ended</span>
                    )}
                  </div>
                ) : (
                  <div
                    className={`message-bubble ${isMine ? 'bubble-accent' : 'bubble-raised'}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (isMine && !m.deletedAt) void handleDeleteMessage(m.id);
                    }}
                  >
                    <p className={m.deletedAt ? 'italic text-3' : ''}>{m.body}</p>
                  </div>
                )}

                {isLastMessage && isSeen && <span className="seen-indicator">Seen</span>}
              </div>
            );
          })
        )}

        {isTypingRemote && (
          <div className="typing-bubble">
            <Equalizer />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <footer className="chat-composer">
        <button
          type="button"
          className="btn-icon"
          aria-label="Share a song"
          onClick={() => setTrackPickerOpen(true)}
        >
          <Icon icon={MusicNote} size={22} />
        </button>

        <textarea
          className="composer-textarea"
          placeholder="Message"
          rows={1}
          maxLength={1000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleBroadcastTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSendText();
            }
          }}
        />

        {text.length >= 900 && <span className="composer-counter">{1000 - text.length}</span>}

        <button
          type="button"
          className="btn-send-round"
          disabled={!text.trim() || sending}
          aria-label="Send message"
          onClick={handleSendText}
        >
          {sending ? <Equalizer /> : <Icon icon={ArrowUp} size={20} />}
        </button>
      </footer>

      {/* Track Picker Sheet */}
      {trackPickerOpen && (
        <div className="dialog-backdrop" onClick={() => setTrackPickerOpen(false)}>
          <aside
            className="suggest-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Share a song"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>Share a song</h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setTrackPickerOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="tab-strip">
              <button
                type="button"
                className={`tab-btn ${pickerTab === 'now' ? 'tab-btn-active' : ''}`}
                onClick={() => setPickerTab('now')}
              >
                Now playing
              </button>
              <button
                type="button"
                className={`tab-btn ${pickerTab === 'favorites' ? 'tab-btn-active' : ''}`}
                onClick={() => setPickerTab('favorites')}
              >
                Favourites
              </button>
              <button
                type="button"
                className={`tab-btn ${pickerTab === 'search' ? 'tab-btn-active' : ''}`}
                onClick={() => setPickerTab('search')}
              >
                Search
              </button>
            </div>

            <div className="track-picker-content">
              {pickerTab === 'now' &&
                (player.track ? (
                  <div
                    className="picker-track-row"
                    onClick={() => void handleSendTrack(player.track!)}
                  >
                    <img
                      src={player.track.coverUrl ?? `/api/cover/${player.track.id}`}
                      alt=""
                      width={44}
                      height={44}
                    />
                    <div>
                      <strong>{player.track.title}</strong>
                      <p>{player.track.artist}</p>
                    </div>
                  </div>
                ) : (
                  <p className="empty-sub">Nothing is playing right now.</p>
                ))}

              {pickerTab === 'favorites' &&
                (favorites.length === 0 ? (
                  <p className="empty-sub">No favourite songs yet.</p>
                ) : (
                  favorites.map((t) => (
                    <div
                      key={t.id}
                      className="picker-track-row"
                      onClick={() => void handleSendTrack(t)}
                    >
                      <img src={t.coverUrl ?? `/api/cover/${t.id}`} alt="" width={44} height={44} />
                      <div>
                        <strong>{t.title}</strong>
                        <p>{t.artist}</p>
                      </div>
                    </div>
                  ))
                ))}

              {pickerTab === 'search' && (
                <>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Search songs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchResults.map((t) => (
                    <div
                      key={t.id}
                      className="picker-track-row"
                      onClick={() => void handleSendTrack(t)}
                    >
                      <img src={t.coverUrl ?? `/api/cover/${t.id}`} alt="" width={44} height={44} />
                      <div>
                        <strong>{t.title}</strong>
                        <p>{t.artist}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
