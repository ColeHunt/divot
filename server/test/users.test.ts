import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { UserError, getUserByEmail, register, updateName } from '../src/users.js';

beforeEach(() => {
  setDb(openDb(':memory:'));
});

describe('updateName', () => {
  it('changes the display name without touching identity', () => {
    const alice = register('alice@example.com', 'password1', 'Alice');
    const updated = updateName(alice.id, 'Alicia');
    expect(updated.id).toBe(alice.id);
    expect(updated.email).toBe(alice.email);
    expect(updated.name).toBe('Alicia');
  });

  it('trims and collapses whitespace', () => {
    const alice = register('alice@example.com', 'password1', 'Alice');
    const updated = updateName(alice.id, '  Alicia   Hunt  ');
    expect(updated.name).toBe('Alicia Hunt');
  });

  it('rejects a blank name', () => {
    const alice = register('alice@example.com', 'password1', 'Alice');
    expect(() => updateName(alice.id, '   ')).toThrow(UserError);
  });
});

describe('getUserByEmail', () => {
  it('finds a user case-insensitively', () => {
    const alice = register('alice@example.com', 'password1', 'Alice');
    expect(getUserByEmail('ALICE@EXAMPLE.COM')?.id).toBe(alice.id);
  });

  it('returns null for an unregistered email', () => {
    expect(getUserByEmail('nobody@example.com')).toBeNull();
  });
});
