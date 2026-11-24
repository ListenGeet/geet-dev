'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  ChatCircleText,
  DotsThree,
  Play,
  UsersThree,
  MagnifyingGlass,
  Copy,
} from '@phosphor-icons/react';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { Icon } from '@/components/Icon';
import { Equalizer } from '@/components/Equalizer';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';
import { QRCode } from '@/components/social/QRCode';
import { SuggestTrackSheet } from '@/components/social/SuggestTrackSheet';
import type { FriendItem, FriendRequestItem } from '@geet/shared';

export default function FriendsPage() {
  const { me, api, status } = useMe();
  const player = usePlayer();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [friendQuery, setFriendQuery] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);

  // Sheets state
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendItem | null>(null);
  const [suggestTrack, setSuggestTrack] = useState<{
    id: string;
    title: string;
    artist: string;
  } | null>(null);

  // Add friend state
  const [searchUsername, setSearchUsername] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);
  const [userPreview, setUserPreview] = useState<{
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null>(null);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [sendingRequest, setSendingRequest] = useState(false);

  const debounceTimer = useRef<number | null>(null);

  const loadData = async () => {
    if (status !== 'ready') return;
    try {
      const data = await api<{
        friends: FriendItem[];
        requests: FriendRequestItem[];
        outgoing: FriendRequestItem[];
      }>('/api/friends');
      setFriends(data.friends ?? []);
      setIncomingRequests(data.requests ?? []);
      setOutgoingRequests(data.outgoing ?? []);
      window.dispatchEvent(new Event('geet:refresh-social-unread'));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (status === 'ready') void loadData();
  }, [status]);

  // Username search debounce for Add Friend dialog
  useEffect(() => {
    const raw = searchUsername.trim().replace(/^@/, '');
    if (!raw) {
      setUserPreview(null);
      setSearchStatus('');
      return;
    }

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    setSearchingUser(true);

    debounceTimer.current = window.setTimeout(async () => {
      try {
        const profile = await api<{
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
        }>(`/api/users/${encodeURIComponent(raw)}`);

        if (profile?.username) {
          setUserPreview({
            id: profile.username,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          });
          setSearchStatus('');
        } else {
          setUserPreview(null);
          setSearchStatus('No one with that username.');
        }
      } catch {
        setUserPreview(null);
        setSearchStatus('No one with that username.');
      } finally {
        setSearchingUser(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [searchUsername, api]);

  if (status === 'guest') {
    return (
      <main className="guest-page">
        <EmptyState
          title="Listen with friends"
          sentence="Add friends, chat, and listen to the same song at the same time."
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

  const handleSendRequest = async () => {
    if (!searchUsername.trim()) return;
    setSendingRequest(true);
    try {
      await api('/api/friends/requests', {
        method: 'POST',
        body: { username: searchUsername.trim().replace(/^@/, '') },
      });
      window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Friend request sent.' }));
      setSearchUsername('');
      setUserPreview(null);
      setAddFriendOpen(false);
      await loadData();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('geet:toast', {
          detail: err instanceof Error ? err.message : 'Could not send request',
        }),
      );
    } finally {
      setSendingRequest(false);
    }
  };

  const handleRespond = async (id: string, action: 'accept' | 'decline' | 'cancel') => {
    try {
      await api(`/api/friends/requests/${id}`, {
        method: 'PATCH',
        body: { action },
      });
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleRemoveFriend = async (friendId: string, name: string) => {
    if (!window.confirm(`Remove ${name}?`)) return;
    try {
      await api(`/api/friends/${friendId}`, { method: 'DELETE' });
      setSelectedFriend(null);
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleBlockUser = async (targetId: string, name: string) => {
    if (!window.confirm(`Block ${name}? They won't be able to find or message you.`)) return;
    try {
      await api(`/api/blocks/${targetId}`, { method: 'POST' });
      setSelectedFriend(null);
      await loadData();
    } catch {
      // ignore
    }
  };

  const startJamWithSong = async (trackId?: string) => {
    try {
      const res = await api<{ id: string; code: string }>('/api/jams', {
        method: 'POST',
        body: { trackId },
      });
      router.push(`/jam/${res.id}`);
    } catch {
      // ignore
    }
  };

  const openChatWithFriend = async (friendId: string) => {
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

  const listeningFriends = friends.filter((f) => f.listening !== null);
  const normalizedFriendQuery = friendQuery.trim().toLocaleLowerCase();
  const filteredFriends = friends.filter((friend) =>
    `${friend.displayName ?? ''} ${friend.username ?? ''}`
      .toLocaleLowerCase()
      .includes(normalizedFriendQuery),
  );
  const shareUrl =
    typeof window !== 'undefined' && me?.username
      ? `${window.location.origin}/u/${me.username}`
      : '';

  return (
    <main className="page friends-page">
      <header className="friends-intro">
        <div>
          <span className="friends-eyebrow">BETTER TOGETHER</span>
          <h1>Your people</h1>
          <p>See what your friends are playing and share a song back.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary friends-add-button"
          onClick={() => setAddFriendOpen(true)}
        >
          <Icon icon={UserPlus} size={19} />
          <span>Add friend</span>
        </button>
      </header>

      <div className="friends-overview" aria-label="Friends summary" aria-live="polite">
        <div>
          <strong>{friends.length}</strong>
          <span>Friends</span>
        </div>
        <span className="friends-overview-divider" />
        <div>
          <strong>{listeningFriends.length}</strong>
          <span>Listening now</span>
        </div>
        <span className="friends-overview-divider" />
        <div>
          <strong>{incomingRequests.length}</strong>
          <span>Requests</span>
        </div>
      </div>

      <div className="friends-tabs" role="group" aria-label="Friends sections">
        <button
          type="button"
          aria-pressed={activeTab === 'friends'}
          className={`friends-tab ${activeTab === 'friends' ? 'friends-tab-active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          Circle <span>{friends.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'requests'}
          className={`friends-tab ${activeTab === 'requests' ? 'friends-tab-active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {incomingRequests.length > 0 && (
            <span className="badge-count">{incomingRequests.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'friends' ? (
        <section className="friends-content">
          {/* Listening now horizontal row */}
          {listeningFriends.length > 0 && (
            <div className="listening-now-section">
              <div className="friends-section-title">
                <div>
                  <span className="friends-eyebrow">RIGHT NOW</span>
                  <h2>On repeat</h2>
                </div>
                <span className="friends-live-count">{listeningFriends.length} listening</span>
              </div>
              <div className="listening-now-scroll">
                {listeningFriends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="listening-avatar-card"
                    onClick={() => setSelectedFriend(f)}
                  >
                    <div className="avatar-ring-yellow">
                      {f.avatarUrl ? (
                        <img
                          src={f.avatarUrl}
                          alt=""
                          width={56}
                          height={56}
                          className="avatar-56"
                        />
                      ) : (
                        <div className="avatar-fallback-56">
                          {(f.displayName ?? f.username ?? 'F')[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="listening-name">
                      {f.displayName?.split(' ')[0] ?? f.username}
                    </span>
                    <span className="listening-song-title truncate">
                      {f.listening?.trackTitle} · {f.listening?.artist}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Friend list */}
          {friends.length === 0 ? (
            <div className="friends-empty">
              <Equalizer paused />
              <h2>No friends yet</h2>
              <p>Add someone by their username, or share your link.</p>
              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setAddFriendOpen(true)}
                >
                  Add friend
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (navigator.share && shareUrl) {
                      void navigator.share({
                        title: 'Geet',
                        text: 'Add me on Geet',
                        url: shareUrl,
                      });
                    } else if (shareUrl) {
                      void navigator.clipboard.writeText(shareUrl);
                      window.dispatchEvent(
                        new CustomEvent('geet:toast', { detail: 'Link copied.' }),
                      );
                    }
                  }}
                >
                  Share my link
                </button>
              </div>
            </div>
          ) : (
            <div className="friend-list-wrap">
              <div className="friends-list-heading">
                <div>
                  <span className="friends-eyebrow">YOUR CIRCLE</span>
                  <h2>Friends</h2>
                </div>
                <label className="friend-search">
                  <span className="sr-only">Search friends</span>
                  <input
                    value={friendQuery}
                    onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder="Find a friend"
                  />
                </label>
              </div>
              <div className="friend-list">
                {filteredFriends.length === 0 ? (
                  <p className="friend-search-empty">No friends match “{friendQuery}”.</p>
                ) : (
                  filteredFriends.map((f) => {
                    const name = f.displayName ?? f.username ?? 'Friend';
                    return (
                      <div key={f.id} className="friend-row">
                        <button
                          type="button"
                          className="friend-row-main"
                          onClick={() => setSelectedFriend(f)}
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
                          <div className="friend-row-info">
                            <strong>{name}</strong>
                            {f.listening ? (
                              <span className="friend-status active">
                                <Equalizer />
                                Listening to {f.listening.trackTitle}
                              </span>
                            ) : f.username ? (
                              <span className="friend-username">@{f.username}</span>
                            ) : null}
                          </div>
                        </button>

                        <div className="friend-row-actions">
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Message ${name}`}
                            onClick={() => openChatWithFriend(f.id)}
                          >
                            <Icon icon={ChatCircleText} size={20} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`More options for ${name}`}
                            onClick={() => setSelectedFriend(f)}
                          >
                            <Icon icon={DotsThree} size={20} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* Requests tab */
        <section className="requests-content">
          <div className="requests-group">
            <div className="friends-section-title">
              <div>
                <span className="friends-eyebrow">YOUR INBOX</span>
                <h2>Incoming</h2>
              </div>
              <span className="friends-live-count">{incomingRequests.length} pending</span>
            </div>
            {incomingRequests.length === 0 ? (
              <p className="empty-sub">No requests right now.</p>
            ) : (
              incomingRequests.map((r) => {
                const name = r.user.displayName ?? r.user.username ?? 'User';
                return (
                  <div key={r.id} className="request-row">
                    {r.user.avatarUrl ? (
                      <img
                        src={r.user.avatarUrl}
                        alt=""
                        className="avatar-40"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="avatar-fallback-40">{name[0]?.toUpperCase()}</div>
                    )}
                    <div className="request-info">
                      <strong>{name}</strong>
                      {r.user.username && <span>@{r.user.username}</span>}
                    </div>
                    <div className="request-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => handleRespond(r.id, 'accept')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn-text btn-xs"
                        onClick={() => handleRespond(r.id, 'decline')}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {outgoingRequests.length > 0 && (
            <div className="requests-group">
              <div className="friends-section-title">
                <div>
                  <span className="friends-eyebrow">WAITING ON</span>
                  <h2>Sent</h2>
                </div>
                <span className="friends-live-count">{outgoingRequests.length} pending</span>
              </div>
              {outgoingRequests.map((r) => {
                const name = r.user.displayName ?? r.user.username ?? 'User';
                return (
                  <div key={r.id} className="request-row">
                    {r.user.avatarUrl ? (
                      <img
                        src={r.user.avatarUrl}
                        alt=""
                        className="avatar-40"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="avatar-fallback-40">{name[0]?.toUpperCase()}</div>
                    )}
                    <div className="request-info">
                      <strong>{name}</strong>
                      <span className="status-sub">Pending</span>
                    </div>
                    <button
                      type="button"
                      className="btn-text btn-xs"
                      onClick={() => handleRespond(r.id, 'cancel')}
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Friend Detail Sheet */}
      {selectedFriend && (
        <div className="dialog-backdrop" onClick={() => setSelectedFriend(null)}>
          <aside
            className="friend-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Friend details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-top-actions">
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setSelectedFriend(null)}
              >
                ×
              </button>
            </div>

            <div className="friend-sheet-header">
              {selectedFriend.avatarUrl ? (
                <img
                  src={selectedFriend.avatarUrl}
                  alt=""
                  className="avatar-96"
                  width={96}
                  height={96}
                />
              ) : (
                <div className="avatar-fallback-96">
                  {(selectedFriend.displayName ?? selectedFriend.username ?? 'F')[0]?.toUpperCase()}
                </div>
              )}
              <h2>{selectedFriend.displayName ?? selectedFriend.username}</h2>
              {selectedFriend.username && (
                <p className="sheet-username">@{selectedFriend.username}</p>
              )}
            </div>

            <div className="friend-sheet-buttons">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  openChatWithFriend(selectedFriend.id);
                  setSelectedFriend(null);
                }}
              >
                Message
              </button>

              {selectedFriend.listening && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => {
                    void player.playTrack({
                      id: selectedFriend.listening!.trackId,
                      title: selectedFriend.listening!.trackTitle,
                      artist: selectedFriend.listening!.artist,
                    });
                    setSelectedFriend(null);
                  }}
                >
                  <Icon icon={Play} size={18} />
                  <span>Listen to this</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  startJamWithSong();
                  setSelectedFriend(null);
                }}
              >
                <Icon icon={UsersThree} size={18} />
                <span>Start a jam</span>
              </button>

              <div className="sheet-secondary-actions">
                {player.track && (
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setSuggestTrack(player.track);
                      setSelectedFriend(null);
                    }}
                  >
                    Suggest a song
                  </button>
                )}
                <button
                  type="button"
                  className="btn-text danger"
                  onClick={() =>
                    handleRemoveFriend(
                      selectedFriend.id,
                      selectedFriend.displayName ?? selectedFriend.username ?? 'this friend',
                    )
                  }
                >
                  Remove friend
                </button>
                <button
                  type="button"
                  className="btn-text danger"
                  onClick={() =>
                    handleBlockUser(
                      selectedFriend.id,
                      selectedFriend.displayName ?? selectedFriend.username ?? 'this user',
                    )
                  }
                >
                  Block
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Add Friend Sheet */}
      {addFriendOpen && (
        <div className="dialog-backdrop" onClick={() => setAddFriendOpen(false)}>
          <aside
            className="add-friend-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Add friend"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-friend-header">
              <div>
                <span className="friends-eyebrow">GROW YOUR CIRCLE</span>
                <h2>Add a friend</h2>
                <p>Find people by username or share your profile link.</p>
              </div>
              <button
                type="button"
                className="btn-icon"
                aria-label="Close"
                onClick={() => setAddFriendOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="add-friend-field-wrap">
              <div className="add-friend-section-label">
                <span className="add-friend-step">01</span>
                <div>
                  <strong>Search by username</strong>
                  <span>Enter their Geet handle to find their profile.</span>
                </div>
              </div>
              <label htmlFor="friend-username" className="add-friend-username-label">
                <span aria-hidden="true" className="add-friend-at">
                  @
                </span>
                <input
                  id="friend-username"
                  type="text"
                  className="field-input"
                  placeholder="Search a username"
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={20}
                />
                <Icon icon={MagnifyingGlass} size={19} />
              </label>

              <div className="add-friend-search-status" role="status" aria-live="polite">
                {searchingUser && <span>Looking for that profile…</span>}
                {!searchingUser && searchStatus && (
                  <span className="text-danger">{searchStatus}</span>
                )}
              </div>

              {userPreview && (
                <div className="user-preview-card add-friend-preview">
                  {userPreview.avatarUrl ? (
                    <img
                      src={userPreview.avatarUrl}
                      alt=""
                      className="avatar-48"
                      width={48}
                      height={48}
                    />
                  ) : (
                    <div className="avatar-fallback-48">
                      {(userPreview.displayName ?? userPreview.username)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>{userPreview.displayName ?? userPreview.username}</strong>
                    <p>@{userPreview.username}</p>
                  </div>
                  <span className="add-friend-preview-ready">Profile found</span>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={!userPreview || sendingRequest}
                onClick={handleSendRequest}
              >
                <Icon icon={UserPlus} size={18} />
                {sendingRequest ? 'Sending…' : 'Send request'}
              </button>
            </div>

            <div className="add-friend-divider">
              <span>OR SHARE YOUR PROFILE</span>
            </div>

            <div className="add-friend-share">
              <div className="add-friend-share-copy">
                <div className="add-friend-section-label">
                  <span className="add-friend-step">02</span>
                  <div>
                    <strong>Share your profile</strong>
                    <span>Anyone with your link can find you on Geet.</span>
                  </div>
                </div>
                <div className="add-friend-link-box">
                  <span>{shareUrl || 'Your profile link is not available yet.'}</span>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Copy profile link"
                    disabled={!shareUrl}
                    onClick={() => {
                      void navigator.clipboard.writeText(shareUrl);
                      window.dispatchEvent(
                        new CustomEvent('geet:toast', { detail: 'Link copied.' }),
                      );
                    }}
                  >
                    <Icon icon={Copy} size={18} />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary add-friend-share-button"
                  disabled={!shareUrl}
                  onClick={() => {
                    if (navigator.share && shareUrl) {
                      void navigator.share({
                        title: 'Geet',
                        text: 'Add me on Geet',
                        url: shareUrl,
                      });
                    } else if (shareUrl) {
                      void navigator.clipboard.writeText(shareUrl);
                      window.dispatchEvent(
                        new CustomEvent('geet:toast', { detail: 'Link copied.' }),
                      );
                    }
                  }}
                >
                  Share profile link
                </button>
              </div>
              {shareUrl && (
                <div className="add-friend-qr">
                  <div className="add-friend-qr-paper">
                    <QRCode text={shareUrl} size={132} />
                  </div>
                  <span>Scan to find me</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Suggest Song Sheet */}
      {suggestTrack && (
        <SuggestTrackSheet
          track={suggestTrack}
          isOpen={true}
          onClose={() => setSuggestTrack(null)}
        />
      )}
    </main>
  );
}
