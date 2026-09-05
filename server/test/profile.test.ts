import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { acceptFriendRequest, listFriendRequests, sendFriendRequest } from '../src/friends.js';
import { createCourse } from '../src/courses.js';
import { completeRound, createRound, setScore } from '../src/rounds.js';
import { ProfileError, getProfileStats } from '../src/profile.js';

let alice: string;
let bob: string;
let stranger: string;
let courseA: string;
let courseB: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  bob = register('bob@example.com', 'password1', 'Bob').id;
  stranger = register('stranger@example.com', 'password1', 'Stranger').id;

  sendFriendRequest(alice, bob);
  acceptFriendRequest(bob, listFriendRequests(bob).incoming[0]!.id);

  courseA = createCourse(alice, 'Pebble Creek', 'CA', [
    { number: 1, par: 4 },
    { number: 2, par: 3 },
  ]).id;
  courseB = createCourse(alice, 'Hillcrest', 'CA', [
    { number: 1, par: 5 },
    { number: 2, par: 4 },
  ]).id;
});

describe('getProfileStats', () => {
  it('is empty for a user with no completed rounds', () => {
    expect(getProfileStats(alice, alice)).toEqual({
      user: { id: alice, email: 'alice@example.com', name: 'Alice' },
      roundsPlayed: 0,
      favoriteCourse: null,
      bestRound: null,
      recentRounds: [],
    });
  });

  it('lets a user view their own stats without being friends with themself', () => {
    const { code } = createRound(alice, { courseId: courseA });
    setScore(code, alice, 1, 4);
    setScore(code, alice, 2, 3);
    completeRound(code, alice);

    expect(getProfileStats(alice, alice).roundsPlayed).toBe(1);
  });

  it('lets a friend view your stats', () => {
    const { code } = createRound(alice, { courseId: courseA });
    setScore(code, alice, 1, 4);
    completeRound(code, alice);

    expect(getProfileStats(bob, alice).roundsPlayed).toBe(1);
  });

  it('refuses a non-friend', () => {
    const { code } = createRound(alice, { courseId: courseA });
    setScore(code, alice, 1, 4);
    completeRound(code, alice);

    expect(() => getProfileStats(stranger, alice)).toThrow(ProfileError);
  });

  it('throws not_found for a missing user', () => {
    try {
      getProfileStats(alice, 'nobody');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProfileError);
      expect((error as ProfileError).code).toBe('not_found');
    }
  });

  it('picks the best round by to-par across different courses, not raw strokes', () => {
    // 9-over on the shorter course, but only 4-over relative to par overall.
    const better = createRound(alice, { courseId: courseA });
    setScore(better.code, alice, 1, 5, 1000); // par 4
    setScore(better.code, alice, 2, 4, 1000); // par 3, so +2 total
    completeRound(better.code, alice, 2000);

    const worse = createRound(alice, { courseId: courseB });
    setScore(worse.code, alice, 1, 7, 3000); // par 5
    setScore(worse.code, alice, 2, 6, 3000); // par 4, so +4 total
    completeRound(worse.code, alice, 4000);

    const stats = getProfileStats(alice, alice);
    expect(stats.bestRound?.roundId).toBe(better.id);
    expect(stats.bestRound?.toPar).toBe(2);
  });

  it('excludes an unscored round from best-round but keeps it in recent rounds', () => {
    const unscored = createRound(alice, { courseId: courseA });
    completeRound(unscored.code, alice, 1000);

    const scored = createRound(alice, { courseId: courseA });
    setScore(scored.code, alice, 1, 6, 2000);
    completeRound(scored.code, alice, 3000);

    const stats = getProfileStats(alice, alice);
    expect(stats.bestRound?.roundId).toBe(scored.id);
    expect(stats.recentRounds.map((r) => r.roundId)).toEqual([scored.id, unscored.id]);
  });

  it('picks the course played most often as favorite, tie-broken by most recent', () => {
    const r1 = createRound(alice, { courseId: courseA });
    completeRound(r1.code, alice, 1000);
    const r2 = createRound(alice, { courseId: courseB });
    completeRound(r2.code, alice, 2000);
    const r3 = createRound(alice, { courseId: courseB });
    completeRound(r3.code, alice, 3000);

    const stats = getProfileStats(alice, alice);
    expect(stats.favoriteCourse).toEqual({ courseId: courseB, name: 'Hillcrest', roundsPlayed: 2 });
  });

  it('orders recent rounds newest first and caps at 5', () => {
    const codes: string[] = [];
    for (let i = 0; i < 7; i++) {
      const round = createRound(alice, { courseId: courseA });
      completeRound(round.code, alice, 1000 * (i + 1));
      codes.push(round.id);
    }

    const stats = getProfileStats(alice, alice);
    expect(stats.roundsPlayed).toBe(7);
    expect(stats.recentRounds).toHaveLength(5);
    expect(stats.recentRounds.map((r) => r.roundId)).toEqual([...codes].reverse().slice(0, 5));
  });
});
