import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, openDb, setDb } from '../src/db.js';
import { createSession, resolveSession } from '../src/auth.js';
import { UserError, login, register } from '../src/users.js';
import { confirmPasswordReset, requestPasswordReset } from '../src/passwordReset.js';

const BASE_URL = 'https://golf.example.com';

function latestToken(userId: string): string {
  const row = getDb()
    .prepare('SELECT token FROM password_reset_tokens WHERE user_id = ?')
    .get(userId) as { token: string } | undefined;
  if (!row) throw new Error('expected a reset token to exist');
  return row.token;
}

beforeEach(() => {
  setDb(openDb(':memory:'));
  register('alice@example.com', 'oldpassword1', 'Alice');
});

describe('requestPasswordReset', () => {
  it('creates a token for a known email', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL);
    expect(() => latestToken(alice.id)).not.toThrow();
  });

  it('does nothing (and does not throw) for an unknown email', async () => {
    await expect(requestPasswordReset('nobody@example.com', BASE_URL)).resolves.toBeUndefined();
    const count = (
      getDb().prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get() as { n: number }
    ).n;
    expect(count).toBe(0);
  });

  it('replaces an earlier unused token with a fresh one', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const first = latestToken(alice.id);
    await requestPasswordReset('alice@example.com', BASE_URL, 2000);
    const second = latestToken(alice.id);
    expect(second).not.toBe(first);
    expect(() => confirmPasswordReset(first, 'newpassword1', 3000)).toThrow(UserError);
  });
});

describe('confirmPasswordReset', () => {
  it('sets the new password and logs in with it afterward', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const token = latestToken(alice.id);

    confirmPasswordReset(token, 'newpassword1', 1000);

    expect(() => login('alice@example.com', 'oldpassword1')).toThrow(UserError);
    expect(login('alice@example.com', 'newpassword1').id).toBe(alice.id);
  });

  it('consumes the token — it cannot be used twice', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const token = latestToken(alice.id);

    confirmPasswordReset(token, 'newpassword1', 1000);
    expect(() => confirmPasswordReset(token, 'anotherpassword1', 2000)).toThrow(UserError);
  });

  it('rejects an expired token', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const token = latestToken(alice.id);
    const wayLater = 1000 + 24 * 3_600_000;
    expect(() => confirmPasswordReset(token, 'newpassword1', wayLater)).toThrow(UserError);
  });

  it('rejects an unknown token', () => {
    expect(() => confirmPasswordReset('not-a-real-token', 'newpassword1')).toThrow(UserError);
  });

  it('rejects a weak new password without consuming the token', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const token = latestToken(alice.id);

    expect(() => confirmPasswordReset(token, 'short', 1000)).toThrow(UserError);
    // the token must still work, since the failed attempt never consumed it
    expect(() => confirmPasswordReset(token, 'newpassword1', 2000)).not.toThrow();
  });

  it('signs the account out everywhere else', async () => {
    const alice = login('alice@example.com', 'oldpassword1');
    const otherSessionToken = createSession(alice.id);
    expect(resolveSession(otherSessionToken)).toBe(alice.id);

    await requestPasswordReset('alice@example.com', BASE_URL, 1000);
    const token = latestToken(alice.id);
    confirmPasswordReset(token, 'newpassword1', 1000);

    expect(resolveSession(otherSessionToken)).toBeNull();
  });
});
