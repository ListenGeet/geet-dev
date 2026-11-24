'use client';

import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import type { FriendItem } from '@geet/shared';

export function SuggestTrackSheet({
  track,
  isOpen,
  onClose,
}: {
  track: { id: string; title: string; artist: string; coverUrl?: string } | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { api, status } = useMe();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'ready' && isOpen) {
      void api<{ friends: FriendItem[] }>('/api/friends')
        .then((data) => setFriends(data.friends ?? []))
        .catch(() => setFriends([]));
    }
  }, [status, isOpen]);

  if (!isOpen || !track) return null;

  const filteredFriends = friends.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (f.displayName ?? '').toLowerCase().includes(q) ||
      (f.username ?? '').toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id].slice(0, 20),
    );
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) return;
    setSending(true);
    setError('');

    try {
      await api('/api/suggestions', {
        method: 'POST',
        body: {
          toIds: selectedIds,
          trackId: track.id,
          note: note.trim() || undefined,
        },
      });

      window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Song suggested to friends.' }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send suggestions');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <aside
        className="suggest-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Suggest to friends"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2>Suggest to friends</h2>
          <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="suggest-track-card">
          <img src={track.coverUrl ?? `/api/cover/${track.id}`} alt="" width={48} height={48} />
          <div>
            <strong>{track.title}</strong>
            <p>{track.artist}</p>
          </div>
        </div>

        <input
          type="text"
          className="field-input"
          placeholder="Search friends"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="suggest-friends-list">
          {filteredFriends.length === 0 ? (
            <p className="empty-sub">No friends found.</p>
          ) : (
            filteredFriends.map((f) => {
              const selected = selectedIds.includes(f.id);
              const name = f.displayName ?? f.username ?? 'Friend';
              return (
                <div
                  key={f.id}
                  className={`suggest-friend-row ${selected ? 'suggest-selected' : ''}`}
                  onClick={() => toggleSelect(f.id)}
                >
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt="" className="avatar-sm" width={36} height={36} />
                  ) : (
                    <div className="avatar-fallback-sm">{name[0]?.toUpperCase()}</div>
                  )}
                  <div className="suggest-friend-info">
                    <strong>{name}</strong>
                    {f.username && <span>@{f.username}</span>}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(f.id)}
                    aria-label={`Select ${name}`}
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="suggest-note-box">
          <input
            type="text"
            className="field-input"
            placeholder="Add an optional note (max 140 chars)"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="char-counter">{140 - note.length}</span>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={selectedIds.length === 0 || sending}
          onClick={handleSend}
        >
          {sending
            ? 'Sending…'
            : `Send to ${selectedIds.length} friend${selectedIds.length === 1 ? '' : 's'}`}
        </button>
      </aside>
    </div>
  );
}
