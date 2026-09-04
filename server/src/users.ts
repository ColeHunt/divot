import { getDb } from './db.js';
import { generateId } from './ids.js';
import { hashPassword, verifyPassword } from './auth.js';
import type { User } from '../../shared/src/types.js';

export class UserError extends Error {
  constructor(
    readonly code:
      | 'invalid_email'
      | 'weak_password'
      | 'invalid_name'
      | 'email_taken'
      | 'bad_credentials'
      | 'invalid_reset_token'
      | 'rate_limited',
    message: string,
  ) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 40;

/** Exported so callers keying a rate limit by email (auth.ts routes) normalise the same way this module does. */
export function normaliseEmail(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : '';
}

function sanitiseName(input: unknown): string {
  const name = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  return name.slice(0, MAX_NAME_LENGTH);
}

/** Shared by register and password reset — same minimum, one place to change it. */
export function requireValidPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new UserError('weak_password', 'Password must be at least 8 characters');
  }
  return password;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name };
}

export function register(email: unknown, password: unknown, name: unknown, now = Date.now()): User {
  const cleanEmail = normaliseEmail(email);
  if (!EMAIL_RE.test(cleanEmail)) throw new UserError('invalid_email', 'Enter a valid email address');

  const cleanName = sanitiseName(name);
  if (!cleanName) throw new UserError('invalid_name', 'Enter your name');

  const cleanPassword = requireValidPassword(password);

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) throw new UserError('email_taken', 'An account with that email already exists');

  const id = generateId();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, cleanEmail, hashPassword(cleanPassword), cleanName, now);

  return { id, email: cleanEmail, name: cleanName };
}

export function login(email: unknown, password: unknown): User {
  const cleanEmail = normaliseEmail(email);
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as
    | UserRow
    | undefined;
  if (!row || typeof password !== 'string' || !verifyPassword(password, row.password_hash)) {
    throw new UserError('bad_credentials', 'Incorrect email or password');
  }
  return toUser(row);
}

export function getUserById(id: string): User | null {
  const row = getDb().prepare('SELECT id, email, name FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

export function getUserByEmail(email: unknown): User | null {
  const row = getDb().prepare('SELECT id, email, name FROM users WHERE email = ?').get(normaliseEmail(email)) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

export function updateName(userId: string, name: unknown): User {
  const cleanName = sanitiseName(name);
  if (!cleanName) throw new UserError('invalid_name', 'Enter your name');
  getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(cleanName, userId);
  return getUserById(userId)!;
}

/** Used by the password reset flow once a token has been validated — no old-password check, that's the token's job. */
export function setPassword(userId: string, password: unknown): void {
  const cleanPassword = requireValidPassword(password);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(cleanPassword), userId);
}

const MAX_SEARCH_RESULTS = 20;

/** Search by name or email prefix/substring, excluding the searcher themself. */
export function searchUsers(query: string, excludeUserId: string): User[] {
  const cleaned = query.trim();
  if (cleaned.length < 2) return [];
  const like = `%${cleaned.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const rows = getDb()
    .prepare(
      `SELECT id, email, name FROM users
       WHERE id != ? AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
       ORDER BY name ASC
       LIMIT ?`,
    )
    .all(excludeUserId, like, like, MAX_SEARCH_RESULTS) as UserRow[];
  return rows.map(toUser);
}
