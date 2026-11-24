'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { NotePencil, MagnifyingGlass } from '@phosphor-icons/react';
import { useMe } from '@/components/auth/MeProvider';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';
import { getRealtimeClient, retainRealtime, releaseRealtime } from '@/lib/realtime';
import type { ConversationItem, FriendItem } from '@geet/shared';

export default function ChatListPage() {
  const { api, status } = useMe();
  const { getToken } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    const data = await api<{ items: ConversationItem[] }>('/api/conversations');
    setConversations(data.items ?? []);
    window.dispatchEvent(new Event('geet:refresh-social-unread'));
  }, [api]);

  useEffect(() => {
    if (status === 'ready') {
      void Promise.all([
        loadConversations().catch(() => setConversations([])),
        api<{ friends: FriendItem[] }>('/api/friends')
          .then((d) => setFriends(d.friends ?? []))
          .catch(() => setFriends([])),
      ]).finally(() => setLoading(false));
    } else if (status === 'guest') {
      setLoading(false);
    }
  }, [status, api, loadConversations]);

  useEffect(() => {
    if (status !== 'ready') return;
    retainRealtime();
    const realtime = getRealtimeClient(getToken);
    const channel = realtime
      ?.channel('chat-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadConversations().catch(() => undefined);
      })
      .subscribe();
    return () => {
      if (channel) void channel.unsubscribe();
      releaseRealtime();
    };
  }, [status, getToken, loadConversations]);

  if (status === 'guest') {
    return (
      <main className="guest-page">
        <EmptyState
          title="Messages"
          sentence="Sign in to chat with friends and share music."
          image="/illustrations/no-downloads.svg"
          action={
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  const startChatWith = async (friendId: string) => {
    try {
      const conv = await api<{ id: string }>('/api/conversations', {
        method: 'POST',
        body: { withId: friendId },
      });
      router.push(`/chat/${conv.id}`);
    } catch {
      // ignore
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = c.participant.displayName ?? c.participant.username ?? '';
    return name.toLowerCase().includes(q);
  });

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  return (
    <main className="page chat-list-page">
      <header className="page-header flex-between social-page-heading">
        <div>
          <span className="social-page-eyebrow">YOUR CONVERSATIONS</span>
          <h1>Messages</h1>
          <p>Good songs are better when they’re shared.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary chat-new-message"
          onClick={() => setFriendPickerOpen(true)}
        >
          <Icon icon={NotePencil} size={22} />
          <span>New message</span>
        </button>
      </header>

      <div className="search-wrap">
        <label className="shell-search">
          <Icon icon={MagnifyingGlass} size={18} />
          <input
            type="text"
            placeholder="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="hint-text">Loading messages…</p>
      ) : filteredConversations.length === 0 ? (
        <div className="friends-empty">
          <h2>No messages yet</h2>
          <p>Start a conversation with a friend.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFriendPickerOpen(true)}
          >
            Find a friend
          </button>
        </div>
      ) : (
        <div className="conversation-list">
          {filteredConversations.map((c) => {
            const name = c.participant.displayName ?? c.participant.username ?? 'Friend';
            let preview = '';
            if (c.lastMessage) {
              if (c.lastMessage.kind === 'track') {
                preview = `♪ ${c.lastMessage.trackTitle ?? 'Song'}`;
              } else if (c.lastMessage.kind === 'jam') {
                preview = 'Jam invite';
              } else {
                preview = c.lastMessage.body ?? '';
              }
            }

            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`conversation-row ${c.unreadCount > 0 ? 'conversation-unread' : ''}`}
              >
                {c.participant.avatarUrl ? (
                  <img
                    src={c.participant.avatarUrl}
                    alt=""
                    className="avatar-48"
                    width={48}
                    height={48}
                  />
                ) : (
                  <div className="avatar-fallback-48">{name[0]?.toUpperCase()}</div>
                )}

                <div className="conv-info">
                  <div className="conv-top">
                    <strong className={c.unreadCount > 0 ? 'font-bold' : ''}>{name}</strong>
                    <span className="conv-time">{formatTime(c.lastMessage?.createdAt)}</span>
                  </div>
                  <div className="conv-bottom">
                    <span className="conv-preview truncate">{preview || 'Say hello'}</span>
                    {c.unreadCount > 0 && <span className="badge-count">{c.unreadCount}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* New message friend picker modal */}
      {friendPickerOpen && (
        <div className="dialog-backdrop" onClick={() => setFriendPickerOpen(false)}>
          <aside
            className="suggest-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="New message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>New message</h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setFriendPickerOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="friend-picker-list">
              {friends.length === 0 ? (
                <p className="empty-sub">No friends found. Add friends first.</p>
              ) : (
                friends.map((f) => {
                  const name = f.displayName ?? f.username ?? 'Friend';
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="friend-picker-row"
                      onClick={() => {
                        setFriendPickerOpen(false);
                        void startChatWith(f.id);
                      }}
                    >
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
                        {f.username && <p>@{f.username}</p>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
