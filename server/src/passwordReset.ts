import { config } from './config.js';
import { getDb } from './db.js';
import { generateSessionToken } from './ids.js';
import { sendPasswordResetEmail } from './email.js';
import { UserError, getUserByEmail, getUserById, requireValidPassword, setPassword } from './users.js';
import type { User } from '../../shared/src/types.js';

/**
 * Starts a reset for `email`, if an account with that address exists. Always
 * resolves — the caller (the route) responds with the same generic message
 * either way, so this never reveals whether an email is registered.
 */
export async function requestPasswordReset(email: unknown, baseUrl: string, now = Date.now()): Promise<void> {
  const user = getUserByEmail(email);
  if (!user) return;

  const db = getDb();
  const token = generateSessionToken();
  const ttlMs = config.passwordResetTtlMinutes * 60_000;

  db.transaction(() => {
    // A fresh request replaces any earlier unused link for this user, so only the latest one works.
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    db.prepare(
      'INSERT INTO password_reset_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).run(token, user.id, now, now + ttlMs);
  })();

  await sendPasswordResetEmail(user.email, `${baseUrl}/reset-password?token=${token}`);
}

/**
 * Consumes a reset token and sets the new password. Validates the new
 * password *before* consuming the token, so a rejected (too weak) password
 * doesn't burn the user's one working link. Also signs the account out
 * everywhere else, the standard "password changed" behavior.
 */
export function confirmPasswordReset(token: unknown, newPassword: unknown, now = Date.now()): User {
  const cleanToken = typeof token === 'string' ? token : '';
  const db = getDb();
  const row = db
    .prepare('SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?')
    .get(cleanToken) as { user_id: string; expires_at: number } | undefined;

  if (!row || row.expires_at < now) {
    if (row) db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(cleanToken);
    throw new UserError('invalid_reset_token', 'This reset link is invalid or has expired');
  }

  requireValidPassword(newPassword);

  db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(cleanToken);
  setPassword(row.user_id, newPassword);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);

  return getUserById(row.user_id)!;
}
