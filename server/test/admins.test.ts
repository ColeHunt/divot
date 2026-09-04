import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { grantAdmin, isAdmin, listAdmins, revokeAdmin } from '../src/admins.js';

let alice: string;
let bob: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  bob = register('bob@example.com', 'password1', 'Bob').id;
});

describe('isAdmin', () => {
  it('is false for everyone by default', () => {
    expect(isAdmin(alice)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('is true once granted', () => {
    grantAdmin(alice);
    expect(isAdmin(alice)).toBe(true);
    expect(isAdmin(bob)).toBe(false);
  });

  it('is false again once revoked', () => {
    grantAdmin(alice);
    revokeAdmin(alice);
    expect(isAdmin(alice)).toBe(false);
  });
});

describe('grantAdmin', () => {
  it('is idempotent', () => {
    grantAdmin(alice, 1000);
    expect(() => grantAdmin(alice, 2000)).not.toThrow();
    expect(listAdmins()).toHaveLength(1);
  });
});

describe('listAdmins', () => {
  it('lists granted admins with their user info, oldest first', () => {
    grantAdmin(bob, 2000);
    grantAdmin(alice, 1000);
    const admins = listAdmins();
    expect(admins.map((a) => a.email)).toEqual(['alice@example.com', 'bob@example.com']);
  });
});
