import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { acceptFriendRequest, listFriendRequests, sendFriendRequest } from '../src/friends.js';
import { createCourse } from '../src/courses.js';
import {
  RoundError,
  completeRound,
  createRound,
  declineRound,
  getRoundState,
  joinRound,
  listMyInvites,
  listMyRounds,
  reopenRound,
  setScore,
} from '../src/rounds.js';
import { isValidRoundCode } from '../src/ids.js';

let alice: string;
let bob: string;
let cara: string;
let courseId: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  bob = register('bob@example.com', 'password1', 'Bob').id;
  cara = register('cara@example.com', 'password1', 'Cara').id;

  sendFriendRequest(alice, bob);
  acceptFriendRequest(bob, listFriendRequests(bob).incoming[0]!.id);

  courseId = createCourse(alice, 'Pebble Creek', 'CA', [
    { number: 1, par: 4 },
    { number: 2, par: 3 },
    { number: 3, par: 5 },
  ]).id;
});

describe('createRound', () => {
  it('creates a round with a valid code and the creator already joined', () => {
    const { code } = createRound(alice, courseId, []);
    expect(isValidRoundCode(code)).toBe(true);
    const state = getRoundState(code);
    expect(state.status).toBe('active');
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.status).toBe('joined');
  });

  it('invites friends but not strangers', () => {
    const { code } = createRound(alice, courseId, [bob, cara]);
    const state = getRoundState(code);
    const byId = new Map(state.players.map((p) => [p.userId, p]));
    expect(byId.get(bob)?.status).toBe('invited');
    expect(byId.has(cara)).toBe(false);
  });

  it('rejects an unknown course', () => {
    expect(() => createRound(alice, 'nope', [])).toThrow(RoundError);
  });
});

describe('joinRound', () => {
  it('lets anyone with the code join, invited or not', () => {
    const { code } = createRound(alice, courseId, []);
    joinRound(code, cara);
    const state = getRoundState(code);
    expect(state.players.some((p) => p.userId === cara && p.status === 'joined')).toBe(true);
  });

  it('flips an invited player to joined', () => {
    const { code } = createRound(alice, courseId, [bob]);
    joinRound(code, bob);
    const state = getRoundState(code);
    expect(state.players.find((p) => p.userId === bob)?.status).toBe('joined');
  });

  it('is idempotent for an already-joined player', () => {
    const { code } = createRound(alice, courseId, []);
    expect(() => joinRound(code, alice)).not.toThrow();
  });

  it('rejects an unknown code', () => {
    expect(() => joinRound('ZZZZZZ', alice)).toThrow(RoundError);
  });
});

describe('declineRound', () => {
  it('removes a pending invite without joining', () => {
    const { code } = createRound(alice, courseId, [bob]);
    declineRound(code, bob);
    const state = getRoundState(code);
    expect(state.players.some((p) => p.userId === bob)).toBe(false);
  });
});

describe('setScore', () => {
  it('records and updates a player\'s strokes for a hole', () => {
    const { code } = createRound(alice, courseId, []);
    setScore(code, alice, 1, 5);
    expect(getRoundState(code).players[0]!.scores).toEqual({ 1: 5 });
    setScore(code, alice, 1, 4);
    expect(getRoundState(code).players[0]!.scores).toEqual({ 1: 4 });
  });

  it('clears a score when given null', () => {
    const { code } = createRound(alice, courseId, []);
    setScore(code, alice, 1, 5);
    setScore(code, alice, 1, null);
    expect(getRoundState(code).players[0]!.scores).toEqual({});
  });

  it('rejects a non-player', () => {
    const { code } = createRound(alice, courseId, []);
    expect(() => setScore(code, cara, 1, 4)).toThrow(RoundError);
  });

  it('rejects a hole not on the course', () => {
    const { code } = createRound(alice, courseId, []);
    expect(() => setScore(code, alice, 99, 4)).toThrow(RoundError);
  });

  it('rejects an out-of-range stroke count', () => {
    const { code } = createRound(alice, courseId, []);
    expect(() => setScore(code, alice, 1, 0)).toThrow(RoundError);
    expect(() => setScore(code, alice, 1, 21)).toThrow(RoundError);
  });

  it('rejects scoring after the round is completed', () => {
    const { code } = createRound(alice, courseId, []);
    completeRound(code, alice);
    expect(() => setScore(code, alice, 1, 4)).toThrow(RoundError);
  });
});

describe('completeRound / reopenRound', () => {
  it('moves a round from active to completed and shows up in "mine"', () => {
    const { code } = createRound(alice, courseId, []);
    setScore(code, alice, 1, 4);
    completeRound(code, alice);
    const mine = listMyRounds(alice);
    expect(mine.active).toHaveLength(0);
    expect(mine.recent.map((r) => r.code)).toContain(code);
  });

  it('reopen lets scoring continue', () => {
    const { code } = createRound(alice, courseId, []);
    completeRound(code, alice);
    reopenRound(code, alice);
    expect(() => setScore(code, alice, 1, 4)).not.toThrow();
  });
});

describe('listMyInvites', () => {
  it('shows a pending invite until joined or declined', () => {
    const { code } = createRound(alice, courseId, [bob]);
    expect(listMyInvites(bob).map((i) => i.round.code)).toContain(code);
    joinRound(code, bob);
    expect(listMyInvites(bob).map((i) => i.round.code)).not.toContain(code);
  });
});
