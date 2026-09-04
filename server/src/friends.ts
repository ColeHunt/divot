import { config } from './config.js';
import { getDb } from './db.js';
import { generateId } from './ids.js';
import { getUserById } from './users.js';
import type { Friend, FriendRequest, User } from '../../shared/src/types.js';

export class FriendError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'self'
      | 'already_friends'
      | 'already_pending'
      | 'too_many_pending'
      | 'not_your_request',
    message: string,
  ) {
    super(message);
  }
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  created_at: number;
  accepted_at: number | null;
}

function existingBetween(userA: string, userB: string): FriendshipRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(userA, userB, userB, userA) as FriendshipRow | undefined;
}

/** Sends a friend request. Idempotent in the sense that a reverse-pending request auto-accepts. */
export function sendFriendRequest(requesterId: string, addresseeId: string, now = Date.now()): void {
  if (requesterId === addresseeId) throw new FriendError('self', 'You cannot friend yourself');
  if (!getUserById(addresseeId)) throw new FriendError('not_found', 'No account with that id');

  const db = getDb();
  const existing = existingBetween(requesterId, addresseeId);
  if (existing) {
    if (existing.accepted_at != null) {
      throw new FriendError('already_friends', 'You are already friends');
    }
    if (existing.requester_id === requesterId) {
      throw new FriendError('already_pending', 'Friend request already sent');
    }
    // The other person already asked us — accepting is more useful than a duplicate row.
    db.prepare('UPDATE friendships SET accepted_at = ? WHERE id = ?').run(now, existing.id);
    return;
  }

  const pendingCount = (
    db.prepare('SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ? AND accepted_at IS NULL')
      .get(requesterId) as { n: number }
  ).n;
  if (pendingCount >= config.maxPendingRequestsPerUser) {
    throw new FriendError('too_many_pending', 'Too many pending requests outstanding');
  }

  db.prepare(
    'INSERT INTO friendships (id, requester_id, addressee_id, created_at, accepted_at) VALUES (?, ?, ?, ?, NULL)',
  ).run(generateId(), requesterId, addresseeId, now);
}

export function acceptFriendRequest(userId: string, requestId: string, now = Date.now()): void {
  const db = getDb();
  const row = db.prepare('SELECT * FROM friendships WHERE id = ?').get(requestId) as
    | FriendshipRow
    | undefined;
  if (!row || row.addressee_id !== userId) {
    throw new FriendError('not_your_request', 'No such request');
  }
  db.prepare('UPDATE friendships SET accepted_at = ? WHERE id = ?').run(now, requestId);
}

/** Declines an incoming request, or cancels one you sent — either deletes the row. */
export function removeFriendRequest(userId: string, requestId: string): void {
  const result = getDb()
    .prepare(
      'DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?) AND accepted_at IS NULL',
    )
    .run(requestId, userId, userId);
  if (result.changes === 0) throw new FriendError('not_your_request', 'No such request');
}

export function unfriend(userId: string, friendId: string): void {
  getDb()
    .prepare(
      `DELETE FROM friendships
       WHERE accepted_at IS NOT NULL
       AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    )
    .run(userId, friendId, friendId, userId);
}

export function listFriends(userId: string): Friend[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, f.accepted_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.accepted_at IS NOT NULL
       ORDER BY u.name ASC`,
    )
    .all(userId, userId, userId) as Array<{ id: string; email: string; name: string; accepted_at: number }>;
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    friendsSince: row.accepted_at,
  }));
}

export function isFriend(userA: string, userB: string): boolean {
  const row = existingBetween(userA, userB);
  return Boolean(row && row.accepted_at != null);
}

function toRequest(row: FriendshipRow, from: User, to: User): FriendRequest {
  return { id: row.id, from, to, createdAt: row.created_at };
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export function listFriendRequests(userId: string): FriendRequests {
  const db = getDb();
  const incomingRows = db
    .prepare('SELECT * FROM friendships WHERE addressee_id = ? AND accepted_at IS NULL ORDER BY created_at DESC')
    .all(userId) as FriendshipRow[];
  const outgoingRows = db
    .prepare('SELECT * FROM friendships WHERE requester_id = ? AND accepted_at IS NULL ORDER BY created_at DESC')
    .all(userId) as FriendshipRow[];

  const me = getUserById(userId)!;
  return {
    incoming: incomingRows.map((row) => toRequest(row, getUserById(row.requester_id)!, me)),
    outgoing: outgoingRows.map((row) => toRequest(row, me, getUserById(row.addressee_id)!)),
  };
}
