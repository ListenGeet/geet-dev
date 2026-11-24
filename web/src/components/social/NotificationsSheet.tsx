'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { Equalizer } from '@/components/Equalizer';
import type { NotificationItem } from '@geet/shared';

export function NotificationsSheet({
  isOpen,
  onClose,
  onUnreadChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}) {
  const { api, status } = useMe();
  const player = usePlayer();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const fetchNotifications = async () => {
    if (status !== 'ready') return;
    try {
      const data = await api<{ items: NotificationItem[]; unreadCount: number }>(
        '/api/notifications',
      );
      setNotifications(data.items);
      onUnreadChange?.(data.unreadCount);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (status === 'ready') {
      void fetchNotifications();
    }
  }, [status, isOpen]);

  if (!isOpen) return null;
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const markAllRead = async () => {
    try {
      await api('/api/notifications/read', { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      onUnreadChange?.(0);
    } catch {
      // ignore
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await api(`/api/friends/requests/${friendshipId}`, {
        method: 'PATCH',
        body: { action: 'accept' },
      });
      await fetchNotifications();
    } catch {
      // ignore
    }
  };

  const handleDeclineRequest = async (friendshipId: string) => {
    try {
      await api(`/api/friends/requests/${friendshipId}`, {
        method: 'PATCH',
        body: { action: 'decline' },
      });
      await fetchNotifications();
    } catch {
      // ignore
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <aside
        className="notifications-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header notifications-header">
          <div className="notifications-heading-copy">
            <span className="social-page-eyebrow">YOUR INBOX</span>
            <h2>Notifications</h2>
            <p>
              {unreadCount
                ? `${unreadCount} new update${unreadCount === 1 ? '' : 's'}`
                : 'You’re all caught up.'}
            </p>
          </div>
          <div className="sheet-header-actions">
            <button
              type="button"
              className="btn-text"
              onClick={markAllRead}
              disabled={!unreadCount}
            >
              Mark all read
            </button>
            <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="notifications-list">
          {notifications.length === 0 ? (
            <div className="notifications-empty">
              <Equalizer paused />
              <p>You&apos;re all caught up.</p>
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = !item.readAt;
              const actorName = item.actor.displayName || item.actor.username || 'Someone';

              return (
                <div
                  key={item.id}
                  className={`notification-row ${isUnread ? 'notification-unread' : ''}`}
                >
                  {isUnread && <span className="notification-dot" aria-hidden="true" />}
                  {item.track ? (
                    <img
                      src={item.track.coverUrl}
                      alt=""
                      className="notification-cover"
                      width={44}
                      height={44}
                    />
                  ) : item.actor.avatarUrl ? (
                    <img
                      src={item.actor.avatarUrl}
                      alt=""
                      className="notification-avatar"
                      width={44}
                      height={44}
                    />
                  ) : (
                    <div className="notification-avatar-fallback">
                      {actorName[0]?.toUpperCase()}
                    </div>
                  )}

                  <div className="notification-body">
                    {item.kind === 'friend_request' && (
                      <p>
                        <strong>{actorName}</strong> sent you a friend request.
                      </p>
                    )}
                    {item.kind === 'request_accepted' && (
                      <p>
                        <strong>{actorName}</strong> accepted your request.
                      </p>
                    )}
                    {item.kind === 'suggestion' && (
                      <p>
                        <strong>{actorName}</strong> suggested{' '}
                        <strong>{item.track?.title ?? 'a song'}</strong>.
                      </p>
                    )}
                    {item.kind === 'jam_invite' && (
                      <p>
                        <strong>{actorName}</strong> invited you to a jam.
                      </p>
                    )}
                    <span className="notification-time">
                      {new Date(item.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="notification-actions">
                    {item.kind === 'friend_request' && item.referenceId && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => handleAcceptRequest(item.referenceId!)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn-text btn-xs"
                          onClick={() => handleDeclineRequest(item.referenceId!)}
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {item.kind === 'suggestion' && item.track && (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => {
                          void player.playTrack({
                            id: item.track!.id,
                            title: item.track!.title,
                            artist: item.track!.artist,
                            coverUrl: item.track!.coverUrl,
                          });
                          onClose();
                        }}
                      >
                        Play
                      </button>
                    )}
                    {item.kind === 'jam_invite' && item.referenceId && (
                      <Link
                        href={`/j/${item.referenceId}`}
                        className="btn btn-primary btn-xs"
                        onClick={onClose}
                      >
                        Join
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
