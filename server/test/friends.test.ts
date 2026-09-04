import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import {
  FriendError,
  acceptFriendRequest,
  isFriend,
  listFriendRequests,
  listFriends,
  removeFriendRequest,
  sendFriendRequest,
  unfriend,
} from '../src/friends.js';

let alice: string;
let bob: string;
let cara: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  bob = register('bob@example.com', 'password1', 'Bob').id;
  cara = register('cara@example.com', 'password1', 'Cara').id;
});

describe('sendFriendRequest', () => {
  it('creates a pending request visible to both sides', () => {
    sendFriendRequest(alice, bob);
    const { outgoing } = listFriendRequests(alice);
    const { incoming } = listFriendRequests(bob);
    expect(outgoing).toHaveLength(1);
    expect(incoming).toHaveLength(1);
    expect(isFriend(alice, bob)).toBe(false);
  });

  it('rejects friending yourself', () => {
    expect(() => sendFriendRequest(alice, alice)).toThrow(FriendError);
  });

  it('auto-accepts when the other side already sent one', () => {
    sendFriendRequest(alice, bob);
    sendFriendRequest(bob, alice);
    expect(isFriend(alice, bob)).toBe(true);
  });

  it('rejects a duplicate outgoing request', () => {
    sendFriendRequest(alice, bob);
    expect(() => sendFriendRequest(alice, bob)).toThrow(FriendError);
  });

  it('rejects requesting an existing friend', () => {
    sendFriendRequest(alice, bob);
    acceptFriendRequest(bob, listFriendRequests(bob).incoming[0]!.id);
    expect(() => sendFriendRequest(alice, bob)).toThrow(FriendError);
  });
});

describe('acceptFriendRequest', () => {
  it('makes both users friends', () => {
    sendFriendRequest(alice, bob);
    const requestId = listFriendRequests(bob).incoming[0]!.id;
    acceptFriendRequest(bob, requestId);
    expect(isFriend(alice, bob)).toBe(true);
    expect(listFriends(alice).map((f) => f.id)).toContain(bob);
    expect(listFriends(bob).map((f) => f.id)).toContain(alice);
  });

  it('only the addressee can accept', () => {
    sendFriendRequest(alice, bob);
    const requestId = listFriendRequests(bob).incoming[0]!.id;
    expect(() => acceptFriendRequest(alice, requestId)).toThrow(FriendError);
    expect(() => acceptFriendRequest(cara, requestId)).toThrow(FriendError);
  });
});

describe('removeFriendRequest', () => {
  it('lets the addressee decline', () => {
    sendFriendRequest(alice, bob);
    const requestId = listFriendRequests(bob).incoming[0]!.id;
    removeFriendRequest(bob, requestId);
    expect(listFriendRequests(alice).outgoing).toHaveLength(0);
  });

  it('lets the requester cancel', () => {
    sendFriendRequest(alice, bob);
    const requestId = listFriendRequests(alice).outgoing[0]!.id;
    removeFriendRequest(alice, requestId);
    expect(listFriendRequests(bob).incoming).toHaveLength(0);
  });

  it('a declined request can be sent again', () => {
    sendFriendRequest(alice, bob);
    removeFriendRequest(bob, listFriendRequests(bob).incoming[0]!.id);
    expect(() => sendFriendRequest(alice, bob)).not.toThrow();
  });
});

describe('unfriend', () => {
  it('removes an accepted friendship in either direction', () => {
    sendFriendRequest(alice, bob);
    acceptFriendRequest(bob, listFriendRequests(bob).incoming[0]!.id);
    unfriend(bob, alice);
    expect(isFriend(alice, bob)).toBe(false);
  });
});
