import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { getDb } from './db.js';
import { generateSessionToken } from './ids.js';

const SCRYPT_KEYLEN = 64;

/** Format: scrypt:<saltHex>:<hashHex>. No params encoded — this app only ever uses one. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex!, 'hex');
    const expected = Buffer.from(hashHex!, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

/** `maxAgeSeconds` omitted (undefined) makes a browser-session cookie, gone when the browser closes. */
function sessionCookieString(token: string, maxAgeSeconds: number | undefined): string {
  const attrs = [
    `${config.sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAgeSeconds != null) attrs.push(`Max-Age=${maxAgeSeconds}`);
  if (config.isProduction) attrs.push('Secure');
  return attrs.join('; ');
}

export function createSession(userId: string, now = Date.now()): string {
  const token = generateSessionToken();
  const ttlMs = config.sessionTtlDays * 24 * 3_600_000;
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now, now + ttlMs);
  return token;
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * `remember: true` persists the cookie for sessionTtlDays, same as before this
 * flag existed. `remember: false` sends no Max-Age at all — the browser drops
 * it the moment it closes, regardless of the session's own server-side expiry.
 */
export function setSessionCookie(res: Response, token: string, remember: boolean): void {
  res.setHeader(
    'Set-Cookie',
    sessionCookieString(token, remember ? config.sessionTtlDays * 24 * 3600 : undefined),
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', sessionCookieString('', 0));
}

export function resolveSession(token: string, now = Date.now()): string | null {
  const row = getDb()
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .get(token) as { user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < now) {
    destroySession(token);
    return null;
  }
  return row.user_id;
}

export interface AuthedRequest extends Request {
  userId?: string;
}

/** Attaches req.userId when a valid session cookie is present. Never rejects. */
export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[config.sessionCookieName];
  if (token) {
    const userId = resolveSession(token);
    if (userId) req.userId = userId;
  }
  next();
}

/** Rejects with 401 unless attachUser already found a session. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  next();
}
