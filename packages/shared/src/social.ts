/** Social, chat and jam constants, validators and shared models. docs/07, docs/13, docs/15. */

export const JAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JAM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const MAX_JAM_MEMBERS = 8;
export const MAX_MESSAGE_CHARS = 1000;
export const MESSAGE_COUNTER_THRESHOLD = 900;
export const MAX_SUGGESTION_NOTE_CHARS = 140;
export const MAX_SUGGESTION_RECIPIENTS = 20;

export const RATE_LIMIT_FRIEND_REQUESTS_DAILY = 20;
export const RATE_LIMIT_SUGGESTIONS_DAILY = 20;
export const RATE_LIMIT_MESSAGES_PER_MINUTE = 30;

export const DRIFT_SEEK_THRESHOLD_MS = 300;
export const DRIFT_NUDGE_LOW_MS = 80;
export const DRIFT_NUDGE_HIGH_MS = 300;
export const DRIFT_RATE_FASTER = 1.03;
export const DRIFT_RATE_SLOWER = 0.97;
export const DRIFT_NUDGE_DURATION_MS = 3000;

export function isValidJamCode(code: string): boolean {
  return JAM_CODE_PATTERN.test(code.trim().toUpperCase());
}

export function generateJamCode(randomFn = Math.random): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(randomFn() * JAM_CODE_ALPHABET.length);
    result += JAM_CODE_ALPHABET[idx];
  }
  return result;
}

export function cleanMessageBody(
  raw: string,
): { ok: true; body: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Message cannot be empty.' };
  if (trimmed.length > MAX_MESSAGE_CHARS)
    return { ok: false, message: `Message must be ${MAX_MESSAGE_CHARS} characters or fewer.` };
  return { ok: true, body: trimmed };
}

export function cleanSuggestionNote(
  raw: string | undefined,
): { ok: true; note: string | null } | { ok: false; message: string } {
  if (!raw || !raw.trim()) return { ok: true, note: null };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_SUGGESTION_NOTE_CHARS)
    return { ok: false, message: `Note must be ${MAX_SUGGESTION_NOTE_CHARS} characters or fewer.` };
  return { ok: true, note: trimmed };
}

export interface UserSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FriendListeningStatus {
  trackId: string;
  trackTitle: string;
  artist: string;
  listeningSince: string;
}

export interface FriendItem {
  id: string;
  friendshipId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  listening: FriendListeningStatus | null;
  lastSeenAt?: string | null;
}

export interface FriendRequestItem {
  id: string;
  requesterId: string;
  addresseeId: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
  user: UserSummary;
}

export interface SuggestionItem {
  id: string;
  from: UserSummary;
  toId: string;
  trackId: string;
  note: string | null;
  seenAt: string | null;
  createdAt: string;
  track?: {
    id: string;
    title: string;
    artist: string;
    durationMs: number;
    coverUrl: string;
  } | null;
}

export interface ConversationItem {
  id: string;
  participant: UserSummary;
  lastMessage: {
    id: string;
    kind: 'text' | 'track' | 'jam';
    body: string | null;
    trackTitle?: string | null;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string | null;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'track' | 'jam';
  body: string | null;
  trackId: string | null;
  jamId: string | null;
  deletedAt: string | null;
  createdAt: string;
  track?: {
    id: string;
    title: string;
    artist: string;
    durationMs: number;
    coverUrl: string;
    status?: string;
  } | null;
  jam?: {
    id: string;
    code: string;
    hostName: string | null;
    memberCount: number;
    isEnded: boolean;
  } | null;
}

export interface JamMemberItem {
  profileId: string;
  joinedAt: string;
  isHost: boolean;
  user: UserSummary;
}

export interface JamQueueItem {
  id: string;
  jamId: string;
  trackId: string;
  position: number;
  addedBy: UserSummary | null;
  track: {
    id: string;
    title: string;
    artist: string;
    durationMs: number;
    coverUrl: string;
  };
}

export interface JamSnapshot {
  id: string;
  code: string;
  hostId: string;
  controls: 'host' | 'everyone';
  trackId: string | null;
  positionMs: number;
  isPlaying: boolean;
  version: number;
  updatedAt: string;
  endedAt: string | null;
  members: JamMemberItem[];
  queue: JamQueueItem[];
  currentTrack: {
    id: string;
    title: string;
    artist: string;
    durationMs: number;
    waveform: number[];
    coverUrl: string;
  } | null;
  serverNow: number;
}

export interface NotificationItem {
  id: string;
  kind: 'friend_request' | 'request_accepted' | 'suggestion' | 'jam_invite';
  actor: UserSummary;
  referenceId: string | null;
  track: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string;
  } | null;
  readAt: string | null;
  createdAt: string;
}

export interface SignInDeviceItem {
  id: string;
  label: string | null;
  city: string | null;
  country: string | null;
  firstSeen: string;
  lastSeen: string;
  isCurrent: boolean;
}
