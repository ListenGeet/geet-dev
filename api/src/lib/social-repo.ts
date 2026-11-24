import { createHash } from 'node:crypto';
import { db } from './db';
import { clerk, fetchPerson } from './clerk';
import { sendTemplate } from './email/send';
import { sendPush } from './push';
import {
  generateJamCode,
  type FriendItem,
  type FriendRequestItem,
  type SuggestionItem,
  type ConversationItem,
  type ChatMessageItem,
  type JamSnapshot,
  type NotificationItem,
  type SignInDeviceItem,
  type UserSummary,
} from '@geet/shared';

async function actorName(profileId: string): Promise<string> {
  const { data } = await db()
    .from('profiles')
    .select('display_name, username')
    .eq('id', profileId)
    .maybeSingle();
  return data?.display_name || (data?.username ? `@${data.username}` : 'A friend');
}

// --- Friends and presence ---------------------------------------------------------------------

export async function getFriends(profileId: string): Promise<FriendItem[]> {
  const { data: rows, error } = await db()
    .from('friendships')
    .select('id, requester_id, addressee_id, updated_at')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) throw new Error(`getFriends: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const friendIds = rows.map((r) =>
    r.requester_id === profileId ? r.addressee_id : r.requester_id,
  );

  const [profilesRes, devicesRes] = await Promise.all([
    db()
      .from('profiles')
      .select('id, username, display_name, avatar_url, show_listening')
      .in('id', friendIds),
    db()
      .from('devices')
      .select('profile_id, listening_track_id, listening_since, last_seen_at')
      .in('profile_id', friendIds)
      .not('listening_track_id', 'is', null)
      .gt('last_seen_at', new Date(Date.now() - 2 * 60 * 1000).toISOString()),
  ]);

  if (profilesRes.error) throw new Error(`getFriends profiles: ${profilesRes.error.message}`);
  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  // Track lookup for active listeners
  const listeningMap = new Map<string, { trackId: string; listeningSince: string }>();
  const trackIdsToFetch = new Set<string>();

  for (const d of devicesRes.data ?? []) {
    const prof = profilesMap.get(d.profile_id);
    if (prof?.show_listening === 'friends' && d.listening_track_id) {
      listeningMap.set(d.profile_id, {
        trackId: d.listening_track_id,
        listeningSince: d.listening_since ?? new Date().toISOString(),
      });
      trackIdsToFetch.add(d.listening_track_id);
    }
  }

  const tracksMap = new Map<string, { title: string; artist: string }>();
  if (trackIdsToFetch.size > 0) {
    const { data: tracks } = await db()
      .from('tracks')
      .select('id, title, artist')
      .in('id', Array.from(trackIdsToFetch));
    for (const t of tracks ?? []) {
      tracksMap.set(t.id, { title: t.title, artist: t.artist });
    }
  }

  const result: FriendItem[] = [];
  for (const r of rows) {
    const friendId = r.requester_id === profileId ? r.addressee_id : r.requester_id;
    const prof = profilesMap.get(friendId);
    if (!prof) continue;

    const activeListening = listeningMap.get(friendId);
    let listening: FriendItem['listening'] = null;
    if (activeListening) {
      const track = tracksMap.get(activeListening.trackId);
      if (track) {
        listening = {
          trackId: activeListening.trackId,
          trackTitle: track.title,
          artist: track.artist,
          listeningSince: activeListening.listeningSince,
        };
      }
    }

    result.push({
      id: prof.id,
      friendshipId: r.id,
      username: prof.username,
      displayName: prof.display_name,
      avatarUrl: prof.avatar_url,
      listening,
    });
  }

  // Alphabetical sorting by display name or username
  result.sort((a, b) =>
    (a.displayName ?? a.username ?? '').localeCompare(b.displayName ?? b.username ?? ''),
  );
  return result;
}

export async function getFriendRequests(
  profileId: string,
): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
  const { data: rows, error } = await db()
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .eq('status', 'pending')
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) throw new Error(`getFriendRequests: ${error.message}`);
  if (!rows || rows.length === 0) return { incoming: [], outgoing: [] };

  const otherIds = rows.map((r) =>
    r.requester_id === profileId ? r.addressee_id : r.requester_id,
  );
  const { data: profiles, error: pErr } = await db()
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);

  if (pErr) throw new Error(`getFriendRequests profiles: ${pErr.message}`);
  const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const incoming: FriendRequestItem[] = [];
  const outgoing: FriendRequestItem[] = [];

  for (const r of rows) {
    const isIncoming = r.addressee_id === profileId;
    const otherId = isIncoming ? r.requester_id : r.addressee_id;
    const prof = profilesMap.get(otherId);
    if (!prof) continue;

    const item: FriendRequestItem = {
      id: r.id,
      requesterId: r.requester_id,
      addresseeId: r.addressee_id,
      direction: isIncoming ? 'incoming' : 'outgoing',
      createdAt: r.created_at,
      user: {
        id: prof.id,
        username: prof.username,
        displayName: prof.display_name,
        avatarUrl: prof.avatar_url,
      },
    };

    if (isIncoming) incoming.push(item);
    else outgoing.push(item);
  }

  return { incoming, outgoing };
}

export async function sendFriendRequest(
  requesterId: string,
  targetUsername: string,
): Promise<{ ok: boolean; status: 'sent' | 'already_friends' | 'pending' | 'ignored' }> {
  const { data: targetProfile, error: pErr } = await db()
    .from('profiles')
    .select('id, accept_requests')
    .eq('username', targetUsername.trim().toLowerCase())
    .maybeSingle();

  if (pErr) throw new Error(`sendFriendRequest user lookup: ${pErr.message}`);
  if (!targetProfile || targetProfile.id === requesterId) {
    throw new Error('User not found or cannot add self');
  }

  const addresseeId = targetProfile.id;

  // Check if either user blocked the other
  const { data: blockedCheck } = await db()
    .from('friendships')
    .select('status')
    .eq('status', 'blocked')
    .or(
      `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`,
    )
    .maybeSingle();

  if (blockedCheck || targetProfile.accept_requests === 'nobody') {
    // Silently ignore per spec (doc 07)
    return { ok: true, status: 'ignored' };
  }

  // Check existing friendship
  const { data: existing } = await db()
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`,
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') return { ok: true, status: 'already_friends' };
    if (existing.status === 'pending') {
      if (existing.requester_id === addresseeId) {
        // Reciprocal request: auto-accept!
        await db()
          .from('friendships')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        await db().from('notifications').insert({
          profile_id: addresseeId,
          actor_id: requesterId,
          kind: 'request_accepted',
          reference_id: existing.id,
        });
        const name = await actorName(requesterId);
        await sendPush(addresseeId, 'friend_requests', {
          title: `${name} accepted`,
          body: "You're now friends.",
          url: '/friends',
          tag: `friend-accepted-${requesterId}`,
        });
        return { ok: true, status: 'already_friends' };
      }
      return { ok: true, status: 'pending' };
    }
  }

  // Insert pending friendship
  const { data: inserted, error: iErr } = await db()
    .from('friendships')
    .insert({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (iErr) {
    if (iErr.code === '23505') return { ok: true, status: 'pending' };
    throw new Error(`sendFriendRequest insert: ${iErr.message}`);
  }

  // Create notification for addressee
  await db().from('notifications').insert({
    profile_id: addresseeId,
    actor_id: requesterId,
    kind: 'friend_request',
    reference_id: inserted.id,
  });
  const name = await actorName(requesterId);
  await sendPush(addresseeId, 'friend_requests', {
    title: 'Friend request',
    body: `${name} wants to be friends on Geet.`,
    url: '/friends?tab=requests',
    tag: `friend-request-${requesterId}`,
  });

  return { ok: true, status: 'sent' };
}

export async function respondFriendRequest(
  friendshipId: string,
  profileId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<void> {
  const { data: row, error } = await db()
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .eq('id', friendshipId)
    .single();

  if (error || !row) throw new Error('Friend request not found');

  if (action === 'accept') {
    if (row.addressee_id !== profileId) throw new Error('Not authorized to accept this request');
    await db()
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);

    // Notify requester that request was accepted
    await db().from('notifications').insert({
      profile_id: row.requester_id,
      actor_id: profileId,
      kind: 'request_accepted',
      reference_id: friendshipId,
    });
    const name = await actorName(profileId);
    await sendPush(row.requester_id, 'friend_requests', {
      title: `${name} accepted`,
      body: "You're now friends.",
      url: '/friends',
      tag: `friend-accepted-${profileId}`,
    });
  } else if (action === 'decline') {
    if (row.addressee_id !== profileId) throw new Error('Not authorized to decline this request');
    await db().from('friendships').delete().eq('id', friendshipId);
  } else if (action === 'cancel') {
    if (row.requester_id !== profileId) throw new Error('Not authorized to cancel this request');
    await db().from('friendships').delete().eq('id', friendshipId);
  }
}

export async function removeFriend(profileId: string, friendId: string): Promise<void> {
  const { error } = await db()
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${profileId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${profileId})`,
    );

  if (error) throw new Error(`removeFriend: ${error.message}`);
}

export async function blockUser(profileId: string, targetId: string): Promise<void> {
  // First delete any existing friendship row between them
  await db()
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${profileId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${profileId})`,
    );

  // Insert blocked row
  const { error } = await db().from('friendships').insert({
    requester_id: profileId,
    addressee_id: targetId,
    status: 'blocked',
  });

  if (error) throw new Error(`blockUser: ${error.message}`);
}

export async function unblockUser(profileId: string, targetId: string): Promise<void> {
  const { error } = await db()
    .from('friendships')
    .delete()
    .eq('requester_id', profileId)
    .eq('addressee_id', targetId)
    .eq('status', 'blocked');

  if (error) throw new Error(`unblockUser: ${error.message}`);
}

export async function getBlockedUsers(profileId: string): Promise<UserSummary[]> {
  const { data: rows, error } = await db()
    .from('friendships')
    .select('addressee_id')
    .eq('requester_id', profileId)
    .eq('status', 'blocked');

  if (error) throw new Error(`getBlockedUsers: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const blockedIds = rows.map((r) => r.addressee_id);
  const { data: profiles, error: pErr } = await db()
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', blockedIds);

  if (pErr) throw new Error(`getBlockedUsers profiles: ${pErr.message}`);
  return (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
  }));
}

export async function updatePresence(profileId: string, trackId: string | null): Promise<void> {
  const { data: existingDevice } = await db()
    .from('devices')
    .select('id')
    .eq('profile_id', profileId)
    .eq('kind', 'web')
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existingDevice) {
    await db()
      .from('devices')
      .update({
        listening_track_id: trackId,
        listening_since: trackId ? now : null,
        last_seen_at: now,
      })
      .eq('id', existingDevice.id);
  } else {
    await db()
      .from('devices')
      .insert({
        profile_id: profileId,
        name: 'Web Browser',
        kind: 'web',
        listening_track_id: trackId,
        listening_since: trackId ? now : null,
        last_seen_at: now,
      });
  }
}

// --- Suggestions ------------------------------------------------------------------------------

export async function getSuggestions(profileId: string): Promise<SuggestionItem[]> {
  const { data: rows, error } = await db()
    .from('suggestions')
    .select('id, from_id, to_id, track_id, note, seen_at, created_at')
    .eq('to_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`getSuggestions: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const fromIds = [...new Set(rows.map((r) => r.from_id))];
  const trackIds = [...new Set(rows.map((r) => r.track_id))];

  const [profilesRes, tracksRes] = await Promise.all([
    db().from('profiles').select('id, username, display_name, avatar_url').in('id', fromIds),
    db().from('tracks').select('id, title, artist, duration_ms').in('id', trackIds),
  ]);

  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const tracksMap = new Map((tracksRes.data ?? []).map((t) => [t.id, t]));

  return rows.map((r) => {
    const from = profilesMap.get(r.from_id);
    const track = tracksMap.get(r.track_id);
    return {
      id: r.id,
      from: {
        id: from?.id ?? r.from_id,
        username: from?.username ?? null,
        displayName: from?.display_name ?? null,
        avatarUrl: from?.avatar_url ?? null,
      },
      toId: r.to_id,
      trackId: r.track_id,
      note: r.note,
      seenAt: r.seen_at,
      createdAt: r.created_at,
      track: track
        ? {
            id: track.id,
            title: track.title,
            artist: track.artist,
            durationMs: track.duration_ms ?? 0,
            coverUrl: `/api/cover/${track.id}`,
          }
        : null,
    };
  });
}

export async function createSuggestions(
  fromId: string,
  toIds: string[],
  trackId: string,
  note: string | null,
): Promise<{ count: number }> {
  // Validate friends and not blocked
  const validToIds: string[] = [];
  for (const toId of toIds) {
    if (toId === fromId) continue;
    const { data: friendship } = await db()
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${fromId},addressee_id.eq.${toId}),and(requester_id.eq.${toId},addressee_id.eq.${fromId})`,
      )
      .maybeSingle();

    if (friendship) validToIds.push(toId);
  }

  if (validToIds.length === 0) return { count: 0 };

  const { data: suggestedTrack } = await db()
    .from('tracks')
    .select('title, artist')
    .eq('id', trackId)
    .maybeSingle();
  const name = await actorName(fromId);

  for (const toId of validToIds) {
    // Insert suggestion
    const { data: sug } = await db()
      .from('suggestions')
      .insert({
        from_id: fromId,
        to_id: toId,
        track_id: trackId,
        note,
      })
      .select('id')
      .single();

    // Insert notification
    await db()
      .from('notifications')
      .insert({
        profile_id: toId,
        actor_id: fromId,
        kind: 'suggestion',
        reference_id: sug?.id ?? null,
        track_id: trackId,
      });

    await sendPush(toId, 'suggestions', {
      title: `${name} suggested a song`,
      body: suggestedTrack
        ? `${suggestedTrack.title} by ${suggestedTrack.artist}`
        : 'A song for you.',
      url: '/notifications',
      tag: `suggestion-${fromId}-${trackId}`,
    });

    // Also share track in chat thread
    const conv = await getOrCreateConversation(fromId, toId);
    await sendMessage(conv.id, fromId, 'track', note ?? undefined, trackId, undefined, false);
  }

  return { count: validToIds.length };
}

// --- Conversations and Messages ----------------------------------------------------------------

export async function getOrCreateConversation(
  userA: string,
  userB: string,
): Promise<{ id: string }> {
  const [u1, u2] = userA < userB ? [userA, userB] : [userB, userA];

  const { data: existing, error } = await db()
    .from('conversations')
    .select('id')
    .eq('user_a', u1)
    .eq('user_b', u2)
    .maybeSingle();

  if (error) throw new Error(`getOrCreateConversation lookup: ${error.message}`);
  if (existing) return { id: existing.id };

  const { data: inserted, error: iErr } = await db()
    .from('conversations')
    .insert({ user_a: u1, user_b: u2 })
    .select('id')
    .single();

  if (iErr) {
    if (iErr.code === '23505') {
      const { data: row } = await db()
        .from('conversations')
        .select('id')
        .eq('user_a', u1)
        .eq('user_b', u2)
        .single();
      if (row) return { id: row.id };
    }
    throw new Error(`getOrCreateConversation insert: ${iErr.message}`);
  }

  return { id: inserted.id };
}

export async function getConversations(profileId: string): Promise<ConversationItem[]> {
  const { data: convs, error } = await db()
    .from('conversations')
    .select('id, user_a, user_b, last_message_at')
    .or(`user_a.eq.${profileId},user_b.eq.${profileId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getConversations: ${error.message}`);
  if (!convs || convs.length === 0) return [];

  const otherUserIds = convs.map((c) => (c.user_a === profileId ? c.user_b : c.user_a));
  const convIds = convs.map((c) => c.id);

  const [profilesRes, readsRes, messagesRes] = await Promise.all([
    db().from('profiles').select('id, username, display_name, avatar_url').in('id', otherUserIds),
    db()
      .from('conversation_reads')
      .select('conversation_id, last_read_at')
      .eq('profile_id', profileId)
      .in('conversation_id', convIds),
    db()
      .from('messages')
      .select(
        'id, conversation_id, sender_id, kind, body, track_id, jam_id, created_at, deleted_at',
      )
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false }),
  ]);

  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const readsMap = new Map((readsRes.data ?? []).map((r) => [r.conversation_id, r.last_read_at]));

  // Group latest message and count unread per conversation
  const lastMsgMap = new Map<string, NonNullable<typeof messagesRes.data>[number]>();
  const unreadCountMap = new Map<string, number>();
  const trackIdsToFetch = new Set<string>();

  for (const m of messagesRes.data ?? []) {
    if (!lastMsgMap.has(m.conversation_id)) {
      lastMsgMap.set(m.conversation_id, m);
    }
    if (m.track_id) trackIdsToFetch.add(m.track_id);

    const lastRead = readsMap.get(m.conversation_id);
    if (m.sender_id !== profileId && (!lastRead || new Date(m.created_at) > new Date(lastRead))) {
      unreadCountMap.set(m.conversation_id, (unreadCountMap.get(m.conversation_id) ?? 0) + 1);
    }
  }

  const trackTitlesMap = new Map<string, string>();
  if (trackIdsToFetch.size > 0) {
    const { data: tracks } = await db()
      .from('tracks')
      .select('id, title')
      .in('id', Array.from(trackIdsToFetch));
    for (const t of tracks ?? []) trackTitlesMap.set(t.id, t.title);
  }

  return convs.map((c) => {
    const otherId = c.user_a === profileId ? c.user_b : c.user_a;
    const prof = profilesMap.get(otherId);
    const lastMsg = lastMsgMap.get(c.id);

    return {
      id: c.id,
      participant: {
        id: prof?.id ?? otherId,
        username: prof?.username ?? null,
        displayName: prof?.display_name ?? null,
        avatarUrl: prof?.avatar_url ?? null,
      },
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            kind: lastMsg.kind as 'text' | 'track' | 'jam',
            body: lastMsg.deleted_at ? 'Message deleted' : lastMsg.body,
            trackTitle: lastMsg.track_id ? (trackTitlesMap.get(lastMsg.track_id) ?? null) : null,
            senderId: lastMsg.sender_id,
            createdAt: lastMsg.created_at,
          }
        : null,
      unreadCount: unreadCountMap.get(c.id) ?? 0,
      lastMessageAt: c.last_message_at,
    };
  });
}

export async function getMessages(
  conversationId: string,
  profileId: string,
  cursor?: string,
  limit = 40,
): Promise<{ items: ChatMessageItem[]; nextCursor: string | null; otherReadAt: string | null }> {
  // Confirm caller is participant
  const { data: conv, error: cErr } = await db()
    .from('conversations')
    .select('user_a, user_b')
    .eq('id', conversationId)
    .single();

  if (cErr || !conv) throw new Error('Conversation not found');
  if (conv.user_a !== profileId && conv.user_b !== profileId) {
    throw new Error('Not authorized to view this conversation');
  }

  const otherId = conv.user_a === profileId ? conv.user_b : conv.user_a;

  // Read other participant's last read timestamp
  const { data: otherRead } = await db()
    .from('conversation_reads')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('profile_id', otherId)
    .maybeSingle();

  let query = db()
    .from('messages')
    .select('id, conversation_id, sender_id, kind, body, track_id, jam_id, deleted_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`getMessages: ${error.message}`);

  const hasNext = (rows?.length ?? 0) > limit;
  const list = hasNext ? rows!.slice(0, limit) : (rows ?? []);
  const nextCursor =
    hasNext && list.length > 0 ? (list[list.length - 1]?.created_at ?? null) : null;

  const trackIds = [...new Set(list.map((m) => m.track_id).filter(Boolean))] as string[];
  const jamIds = [...new Set(list.map((m) => m.jam_id).filter(Boolean))] as string[];

  const [tracksRes, jamsRes] = await Promise.all([
    trackIds.length > 0
      ? db().from('tracks').select('id, title, artist, duration_ms, status').in('id', trackIds)
      : { data: [] },
    jamIds.length > 0
      ? db().from('jams').select('id, code, ended_at, host_id').in('id', jamIds)
      : { data: [] },
  ]);

  const tracksMap = new Map((tracksRes.data ?? []).map((t) => [t.id, t]));
  const jamsMap = new Map((jamsRes.data ?? []).map((j) => [j.id, j]));

  // Get member counts for jams
  const jamCounts = new Map<string, number>();
  if (jamIds.length > 0) {
    const { data: members } = await db()
      .from('jam_members')
      .select('jam_id')
      .in('jam_id', jamIds)
      .is('left_at', null);
    for (const m of members ?? []) {
      jamCounts.set(m.jam_id, (jamCounts.get(m.jam_id) ?? 0) + 1);
    }
  }

  const items: ChatMessageItem[] = list.map((m) => {
    let track: ChatMessageItem['track'] = null;
    if (m.track_id) {
      const t = tracksMap.get(m.track_id);
      track = t
        ? {
            id: t.id,
            title: t.status === 'ready' ? t.title : 'Song removed',
            artist: t.status === 'ready' ? t.artist : '',
            durationMs: t.duration_ms ?? 0,
            coverUrl: `/api/cover/${t.id}`,
            status: t.status,
          }
        : null;
    }

    let jam: ChatMessageItem['jam'] = null;
    if (m.jam_id) {
      const j = jamsMap.get(m.jam_id);
      jam = j
        ? {
            id: j.id,
            code: j.code,
            hostName: null,
            memberCount: jamCounts.get(j.id) ?? 1,
            isEnded: !!j.ended_at,
          }
        : null;
    }

    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      kind: m.kind as 'text' | 'track' | 'jam',
      body: m.deleted_at ? 'Message deleted' : m.body,
      trackId: m.track_id,
      jamId: m.jam_id,
      deletedAt: m.deleted_at,
      createdAt: m.created_at,
      track,
      jam,
    };
  });

  // Return in chronological order for UI display
  return {
    items: items.reverse(),
    nextCursor,
    otherReadAt: otherRead?.last_read_at ?? null,
  };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  kind: 'text' | 'track' | 'jam',
  body?: string,
  trackId?: string,
  jamId?: string,
  sendNotification = true,
): Promise<ChatMessageItem> {
  const { data: conv, error: cErr } = await db()
    .from('conversations')
    .select('user_a, user_b')
    .eq('id', conversationId)
    .single();

  if (cErr || !conv) throw new Error('Conversation not found');
  if (conv.user_a !== senderId && conv.user_b !== senderId) {
    throw new Error('Not authorized to message in this conversation');
  }

  const recipientId = conv.user_a === senderId ? conv.user_b : conv.user_a;

  // Check friendship and not blocked
  const { data: friendship } = await db()
    .from('friendships')
    .select('status')
    .or(
      `and(requester_id.eq.${senderId},addressee_id.eq.${recipientId}),and(requester_id.eq.${recipientId},addressee_id.eq.${senderId})`,
    )
    .maybeSingle();

  if (!friendship || friendship.status !== 'accepted') {
    throw new Error('Only friends can message each other');
  }

  const { data: msg, error } = await db()
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      kind,
      body: body ?? null,
      track_id: trackId ?? null,
      jam_id: jamId ?? null,
    })
    .select('*')
    .single();

  if (error || !msg) throw new Error(`sendMessage: ${error?.message}`);

  // Update conversation last_message_at
  await db()
    .from('conversations')
    .update({ last_message_at: msg.created_at })
    .eq('id', conversationId);

  if (sendNotification && kind !== 'jam') {
    const name = await actorName(senderId);
    const track =
      kind === 'track' && trackId
        ? await db().from('tracks').select('title').eq('id', trackId).maybeSingle()
        : null;
    await sendPush(recipientId, 'messages', {
      title: name,
      body:
        kind === 'track'
          ? `Sent you a song: ${track?.data?.title ?? 'a song'}`
          : (body ?? '').slice(0, 80),
      url: `/chat/${conversationId}`,
      tag: `message-${conversationId}`,
    });
  }

  return {
    id: msg.id,
    conversationId: msg.conversation_id,
    senderId: msg.sender_id,
    kind: msg.kind as 'text' | 'track' | 'jam',
    body: msg.body,
    trackId: msg.track_id,
    jamId: msg.jam_id,
    deletedAt: null,
    createdAt: msg.created_at,
  };
}

export async function deleteMessageForEveryone(messageId: string, senderId: string): Promise<void> {
  const { data: msg, error } = await db()
    .from('messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .single();

  if (error || !msg) throw new Error('Message not found');
  if (msg.sender_id !== senderId) throw new Error('Can only delete your own messages');

  await db().from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
}

export async function markConversationRead(
  conversationId: string,
  profileId: string,
  lastReadMessageId?: string,
): Promise<void> {
  await db()
    .from('conversation_reads')
    .upsert({
      conversation_id: conversationId,
      profile_id: profileId,
      last_read_at: new Date().toISOString(),
      last_read_message_id: lastReadMessageId ?? null,
    });
}

// --- Jams -------------------------------------------------------------------------------------

export async function createJam(
  hostId: string,
  trackId?: string,
): Promise<{ id: string; code: string }> {
  let code = generateJamCode();
  let attempts = 0;

  while (attempts < 5) {
    const { data: existing } = await db().from('jams').select('id').eq('code', code).maybeSingle();
    if (!existing) break;
    code = generateJamCode();
    attempts++;
  }

  const { data: jam, error } = await db()
    .from('jams')
    .insert({
      code,
      host_id: hostId,
      controls: 'host',
      track_id: trackId ?? null,
      position_ms: 0,
      is_playing: false,
      version: 0,
    })
    .select('id, code')
    .single();

  if (error || !jam) throw new Error(`createJam: ${error?.message}`);

  // Insert host as active member
  await db().from('jam_members').insert({
    jam_id: jam.id,
    profile_id: hostId,
  });

  // If initial track supplied, add to queue as well
  if (trackId) {
    await db().from('jam_queue').insert({
      jam_id: jam.id,
      track_id: trackId,
      added_by: hostId,
      position: 0,
    });
  }

  return jam;
}

export async function getJamSnapshot(
  jamIdOrCode: string,
  callerId: string,
): Promise<JamSnapshot | null> {
  const isCode = !jamIdOrCode.includes('-');
  const query = db().from('jams').select('*');
  const { data: jam, error } = await (isCode
    ? query.eq('code', jamIdOrCode.toUpperCase()).maybeSingle()
    : query.eq('id', jamIdOrCode).maybeSingle());

  if (error || !jam) return null;

  const { data: membership } = await db()
    .from('jam_members')
    .select('profile_id')
    .eq('jam_id', jam.id)
    .eq('profile_id', callerId)
    .is('left_at', null)
    .maybeSingle();
  if (!membership) return null;

  // Active members
  const { data: members } = await db()
    .from('jam_members')
    .select('profile_id, joined_at, left_at')
    .eq('jam_id', jam.id)
    .is('left_at', null);

  const memberProfileIds = (members ?? []).map((m) => m.profile_id);
  const { data: memberProfiles } = await db()
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', memberProfileIds);

  const profMap = new Map((memberProfiles ?? []).map((p) => [p.id, p]));

  const memberItems = (members ?? []).map((m) => {
    const prof = profMap.get(m.profile_id);
    return {
      profileId: m.profile_id,
      joinedAt: m.joined_at,
      isHost: m.profile_id === jam.host_id,
      user: {
        id: m.profile_id,
        username: prof?.username ?? null,
        displayName: prof?.display_name ?? null,
        avatarUrl: prof?.avatar_url ?? null,
      },
    };
  });

  // Jam queue
  const { data: queueRows } = await db()
    .from('jam_queue')
    .select('id, track_id, position, added_by')
    .eq('jam_id', jam.id)
    .order('position', { ascending: true });

  const queueTrackIds = [...new Set((queueRows ?? []).map((q) => q.track_id))];
  if (jam.track_id && !queueTrackIds.includes(jam.track_id)) {
    queueTrackIds.push(jam.track_id);
  }

  const { data: tracks } = await db()
    .from('tracks')
    .select('id, title, artist, duration_ms, waveform')
    .in('id', queueTrackIds);

  const tracksMap = new Map((tracks ?? []).map((t) => [t.id, t]));

  const queueItems = (queueRows ?? []).map((q) => {
    const t = tracksMap.get(q.track_id);
    const addedProf = q.added_by ? profMap.get(q.added_by) : null;
    return {
      id: q.id,
      jamId: jam.id,
      trackId: q.track_id,
      position: q.position,
      addedBy: q.added_by
        ? {
            id: q.added_by,
            username: addedProf?.username ?? null,
            displayName: addedProf?.display_name ?? null,
            avatarUrl: addedProf?.avatar_url ?? null,
          }
        : null,
      track: {
        id: q.track_id,
        title: t?.title ?? 'Unknown song',
        artist: t?.artist ?? 'Unknown artist',
        durationMs: t?.duration_ms ?? 0,
        coverUrl: `/api/cover/${q.track_id}`,
      },
    };
  });

  let currentTrack: JamSnapshot['currentTrack'] = null;
  if (jam.track_id) {
    const ct = tracksMap.get(jam.track_id);
    if (ct) {
      currentTrack = {
        id: ct.id,
        title: ct.title,
        artist: ct.artist,
        durationMs: ct.duration_ms ?? 0,
        waveform: ct.waveform ?? [],
        coverUrl: `/api/cover/${ct.id}`,
      };
    }
  }

  return {
    id: jam.id,
    code: jam.code,
    hostId: jam.host_id,
    controls: jam.controls as 'host' | 'everyone',
    trackId: jam.track_id,
    positionMs: jam.position_ms,
    isPlaying: jam.is_playing,
    version: jam.version,
    updatedAt: jam.updated_at,
    endedAt: jam.ended_at,
    members: memberItems,
    queue: queueItems,
    currentTrack,
    serverNow: Date.now(),
  };
}

export async function joinJam(code: string, profileId: string): Promise<JamSnapshot> {
  const { data: jam, error } = await db().rpc('join_jam', { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message);

  const snapshot = await getJamSnapshot(jam.id, profileId);
  if (!snapshot) throw new Error('Could not load joined jam snapshot');
  return snapshot;
}

export async function updateJamState(
  jamId: string,
  callerId: string,
  trackId: string | undefined,
  positionMs: number,
  isPlaying: boolean,
  expectedVersion: number,
): Promise<JamSnapshot> {
  const { error } = await db().rpc('update_jam_state', {
    p_jam: jamId,
    p_caller: callerId,
    p_track: trackId ?? null,
    p_position: positionMs,
    p_playing: isPlaying,
    p_expected_version: expectedVersion,
  });

  if (error) throw new Error(error.message);

  const snapshot = await getJamSnapshot(jamId, callerId);
  if (!snapshot) throw new Error('Jam not found after update');
  return snapshot;
}

export async function addJamQueue(jamId: string, callerId: string, trackId: string): Promise<void> {
  // Check member
  const { data: member } = await db()
    .from('jam_members')
    .select('profile_id')
    .eq('jam_id', jamId)
    .eq('profile_id', callerId)
    .is('left_at', null)
    .maybeSingle();

  if (!member) throw new Error('Must be an active member of the jam');

  const { data: maxPos } = await db()
    .from('jam_queue')
    .select('position')
    .eq('jam_id', jamId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos = (maxPos?.position ?? -1) + 1;

  await db().from('jam_queue').insert({
    jam_id: jamId,
    track_id: trackId,
    added_by: callerId,
    position: nextPos,
  });
}

export async function removeJamQueueItem(
  jamId: string,
  callerId: string,
  itemId: string,
): Promise<void> {
  await db().from('jam_queue').delete().eq('id', itemId).eq('jam_id', jamId);
}

export async function reorderJamQueue(
  jamId: string,
  callerId: string,
  itemIds: string[],
): Promise<void> {
  const { data: jam } = await db()
    .from('jams')
    .select('host_id, controls')
    .eq('id', jamId)
    .single();
  if (!jam) throw new Error('Jam not found');

  if (jam.host_id !== callerId && jam.controls !== 'everyone') {
    throw new Error('Only controllers can reorder the queue');
  }

  for (let pos = 0; pos < itemIds.length; pos++) {
    await db()
      .from('jam_queue')
      .update({ position: pos })
      .eq('id', itemIds[pos])
      .eq('jam_id', jamId);
  }
}

export async function changeJamControls(
  jamId: string,
  hostId: string,
  controls: 'host' | 'everyone',
): Promise<void> {
  const { data: jam } = await db().from('jams').select('host_id, version').eq('id', jamId).single();
  if (!jam || jam.host_id !== hostId) throw new Error('Only the host can change control mode');

  await db()
    .from('jams')
    .update({ controls, version: jam.version + 1, updated_at: new Date().toISOString() })
    .eq('id', jamId);
}

export async function leaveJam(jamId: string, profileId: string): Promise<void> {
  const { error } = await db().rpc('leave_jam', { p_jam: jamId, p_profile: profileId });
  if (error) throw new Error(error.message);
}

export async function endJam(jamId: string, hostId: string): Promise<void> {
  const { error } = await db().rpc('end_jam', { p_jam: jamId, p_host: hostId });
  if (error) throw new Error(error.message);
}

export async function inviteJamFriends(
  jamId: string,
  hostId: string,
  toIds: string[],
): Promise<void> {
  const { data: jam } = await db()
    .from('jams')
    .select('id, code, ended_at')
    .eq('id', jamId)
    .single();
  if (!jam || jam.ended_at) throw new Error('Jam is not active');

  const name = await actorName(hostId);

  for (const toId of toIds) {
    if (toId === hostId) continue;
    const conv = await getOrCreateConversation(hostId, toId);
    await sendMessage(conv.id, hostId, 'jam', undefined, undefined, jamId);

    await db().from('notifications').insert({
      profile_id: toId,
      actor_id: hostId,
      kind: 'jam_invite',
      reference_id: jam.code,
    });
    await sendPush(toId, 'jams', {
      title: `${name} invited you to a jam`,
      body: 'Tap to join.',
      url: `/j/${jam.code}`,
      tag: `jam-invite-${jam.id}`,
    });
  }
}

// --- Notifications ----------------------------------------------------------------------------

export async function getNotifications(profileId: string): Promise<NotificationItem[]> {
  const { data: rows, error } = await db()
    .from('notifications')
    .select('id, actor_id, kind, reference_id, track_id, read_at, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`getNotifications: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const trackIds = [...new Set(rows.map((r) => r.track_id).filter(Boolean))] as string[];

  const [profilesRes, tracksRes] = await Promise.all([
    actorIds.length > 0
      ? db().from('profiles').select('id, username, display_name, avatar_url').in('id', actorIds)
      : { data: [] },
    trackIds.length > 0
      ? db().from('tracks').select('id, title, artist').in('id', trackIds)
      : { data: [] },
  ]);

  const profilesMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const tracksMap = new Map((tracksRes.data ?? []).map((t) => [t.id, t]));

  return rows.map((r) => {
    const actor = r.actor_id ? profilesMap.get(r.actor_id) : null;
    const track = r.track_id ? tracksMap.get(r.track_id) : null;

    return {
      id: r.id,
      kind: r.kind as NotificationItem['kind'],
      actor: {
        id: actor?.id ?? r.actor_id ?? '',
        username: actor?.username ?? null,
        displayName: actor?.display_name ?? null,
        avatarUrl: actor?.avatar_url ?? null,
      },
      referenceId: r.reference_id,
      track: track
        ? {
            id: track.id,
            title: track.title,
            artist: track.artist,
            coverUrl: `/api/cover/${track.id}`,
          }
        : null,
      readAt: r.read_at,
      createdAt: r.created_at,
    };
  });
}

export async function markNotificationsRead(profileId: string): Promise<void> {
  await db()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null);
}

// --- Devices and Sign-in Alerts ----------------------------------------------------------------

export function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';

  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { browser, os };
}

export async function recordSignInDevice(
  profileId: string,
  clerkUserId: string,
  sid: string,
  ua: string,
  city: string | null,
  country: string | null,
  method = 'Google or email code',
): Promise<void> {
  const { browser, os } = parseUserAgent(ua);
  const countryCode = country ?? 'IN';
  const fingerprint = createHash('sha256').update(`${browser}:${os}:${countryCode}`).digest('hex');
  const label = `${browser} on ${os}`;

  const { data: existing, error: eErr } = await db()
    .from('sign_in_devices')
    .select('id, first_seen')
    .eq('profile_id', profileId)
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (eErr) {
    console.error('[devices] lookup failed:', eErr.message);
    return;
  }

  const now = new Date().toISOString();
  if (existing) {
    await db()
      .from('sign_in_devices')
      .update({
        last_seen: now,
        clerk_session_id: sid,
        city: city ?? undefined,
        country: country ?? undefined,
      })
      .eq('id', existing.id);
    return;
  }

  // Insert new sign-in device
  const { error: iErr } = await db().from('sign_in_devices').insert({
    profile_id: profileId,
    fingerprint,
    label,
    city,
    country,
    first_seen: now,
    last_seen: now,
    clerk_session_id: sid,
  });

  if (iErr) {
    console.error('[devices] insert failed:', iErr.message);
    return;
  }

  // Check if eligible for signin-alert email:
  // Rules (doc 20 section 4):
  // 1. Not on the first device
  // 2. Not within 10 minutes of sign-up
  // 3. Max 3 per day
  const { data: profile } = await db()
    .from('profiles')
    .select('created_at, language')
    .eq('id', profileId)
    .single();

  if (!profile) return;
  const createdAtMs = new Date(profile.created_at).getTime();
  const isOldEnough = Date.now() - createdAtMs > 10 * 60 * 1000;

  const { count: deviceCount } = await db()
    .from('sign_in_devices')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  if (!isOldEnough || (deviceCount ?? 0) <= 1) return;

  // Check how many alerts queued/sent today
  const today = new Date().toISOString().slice(0, 10);
  const { count: alertsToday } = await db()
    .from('email_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('template', 'signin-alert')
    .gte('created_at', `${today}T00:00:00Z`);

  if ((alertsToday ?? 0) >= 3) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://listengeet.com';
  const locationText = [city, country].filter(Boolean).join(', ') || 'Unknown location';
  const timeFormatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const person = await fetchPerson(clerkUserId);
  if (!person.email) return;
  await sendTemplate(
    {
      kind: 'alert',
      to: person.email,
      profileId,
      priority: 4,
      idempotencyKey: `alert-${profileId}-${fingerprint}-${today}`,
    },
    'signin-alert',
    {
      device: label,
      location: locationText,
      time: timeFormatted,
      method,
      secure_url: `${appUrl}/profile#devices`,
      email: person.email,
    },
  );
}

export async function getSignInDevices(
  profileId: string,
  currentSid?: string,
): Promise<SignInDeviceItem[]> {
  const { data: rows, error } = await db()
    .from('sign_in_devices')
    .select('id, label, city, country, first_seen, last_seen, clerk_session_id')
    .eq('profile_id', profileId)
    .order('last_seen', { ascending: false });

  if (error) throw new Error(`getSignInDevices: ${error.message}`);

  return (rows ?? []).map((r, index) => ({
    id: r.id,
    label: r.label,
    city: r.city,
    country: r.country,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    isCurrent: currentSid ? r.clerk_session_id === currentSid : index === 0,
  }));
}

export async function signOutOtherDevices(
  profileId: string,
  clerkUserId: string,
  currentSid: string,
): Promise<{ revokedCount: number }> {
  let count = 0;
  try {
    const sessionList = await clerk().sessions.getSessionList({ userId: clerkUserId });
    for (const session of sessionList.data ?? []) {
      if (session.id !== currentSid && session.status === 'active') {
        await clerk().sessions.revokeSession(session.id);
        count++;
      }
    }
  } catch (err) {
    console.error('[devices] clerk revoke failed:', err);
  }

  // Remove other devices from sign_in_devices table
  await db()
    .from('sign_in_devices')
    .delete()
    .eq('profile_id', profileId)
    .neq('clerk_session_id', currentSid);

  return { revokedCount: count };
}

// --- Push tokens -------------------------------------------------------------------------------

export async function getPushPreferences(
  profileId: string,
): Promise<Record<string, boolean> | null> {
  const { data, error } = await db()
    .from('push_tokens')
    .select('prefs')
    .eq('profile_id', profileId)
    .eq('kind', 'webpush')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getPushPreferences: ${error.message}`);
  return (data?.prefs as Record<string, boolean> | null) ?? null;
}

export async function savePushSubscription(
  profileId: string,
  endpoint: string,
  keys: { p256dh: string; auth: string },
  prefs?: Record<string, boolean>,
): Promise<void> {
  const preferences = prefs ?? {
    friend_requests: true,
    messages: true,
    jams: true,
    suggestions: true,
  };
  const { error } = await db().from('push_tokens').upsert(
    {
      profile_id: profileId,
      kind: 'webpush',
      endpoint,
      keys,
      prefs: preferences,
    },
    { onConflict: 'kind,endpoint' },
  );

  if (error) throw new Error(`savePushSubscription: ${error.message}`);

  const { error: prefsError } = await db()
    .from('push_tokens')
    .update({ prefs: preferences })
    .eq('profile_id', profileId)
    .eq('kind', 'webpush');
  if (prefsError) throw new Error(`savePushSubscription preferences: ${prefsError.message}`);
}

export async function deletePushSubscription(profileId: string, endpoint: string): Promise<void> {
  await db().from('push_tokens').delete().eq('profile_id', profileId).eq('endpoint', endpoint);
}
