import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { acceptFriendRequest, listFriendRequests, sendFriendRequest } from '../src/friends.js';
import { createCourse } from '../src/courses.js';
import {
  RoundError,
  completeRound,
  createRound,
  createTeam,
  declineRound,
  getRoundState,
  joinRound,
  joinTeam,
  leaveTeam,
  listMyInvites,
  listMyRounds,
  renameTeam,
  reopenRound,
  setScore,
} from '../src/rounds.js';
import { isValidRoundCode } from '../src/ids.js';

let alice: string;
let bob: string;
let cara: string;
let dave: string;
let courseId: string;

function startRound(
  creatorId: string,
  input: { courseId?: string; inviteFriendIds?: string[]; format?: string; teams?: unknown } = {},
) {
  return createRound(creatorId, { courseId, ...input });
}

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  bob = register('bob@example.com', 'password1', 'Bob').id;
  cara = register('cara@example.com', 'password1', 'Cara').id;
  dave = register('dave@example.com', 'password1', 'Dave').id;

  for (const friendId of [bob, cara, dave]) {
    sendFriendRequest(alice, friendId);
    acceptFriendRequest(friendId, listFriendRequests(friendId).incoming[0]!.id);
  }

  courseId = createCourse(alice, 'Pebble Creek', 'CA', [
    { number: 1, par: 4 },
    { number: 2, par: 3 },
    { number: 3, par: 5 },
  ]).id;
});

describe('createRound', () => {
  it('creates a round with a valid code and the creator already joined', () => {
    const { code } = startRound(alice, { courseId, inviteFriendIds: [] });
    expect(isValidRoundCode(code)).toBe(true);
    const state = getRoundState(code);
    expect(state.status).toBe('active');
    expect(state.format).toBe('stroke_play');
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.status).toBe('joined');
    expect(state.teams).toEqual([]);
  });

  it('invites friends but not strangers', () => {
    const { code } = startRound(alice, { courseId, inviteFriendIds: [bob, cara] });
    const state = getRoundState(code);
    const byId = new Map(state.players.map((p) => [p.userId, p]));
    expect(byId.get(bob)?.status).toBe('invited');
    expect(byId.has(dave)).toBe(false);
  });

  it('rejects an unknown course', () => {
    expect(() => startRound(alice, { courseId: 'nope' })).toThrow(RoundError);
  });
});

describe('joinRound', () => {
  it('lets anyone with the code join, invited or not', () => {
    const { code } = startRound(alice);
    joinRound(code, cara);
    const state = getRoundState(code);
    expect(state.players.some((p) => p.userId === cara && p.status === 'joined')).toBe(true);
  });

  it('flips an invited player to joined', () => {
    const { code } = startRound(alice, { inviteFriendIds: [bob] });
    joinRound(code, bob);
    const state = getRoundState(code);
    expect(state.players.find((p) => p.userId === bob)?.status).toBe('joined');
  });

  it('is idempotent for an already-joined player', () => {
    const { code } = startRound(alice);
    expect(() => joinRound(code, alice)).not.toThrow();
  });

  it('rejects an unknown code', () => {
    expect(() => joinRound('ZZZZZZ', alice)).toThrow(RoundError);
  });
});

describe('declineRound', () => {
  it('removes a pending invite without joining', () => {
    const { code } = startRound(alice, { inviteFriendIds: [bob] });
    declineRound(code, bob);
    const state = getRoundState(code);
    expect(state.players.some((p) => p.userId === bob)).toBe(false);
  });
});

describe('setScore (stroke play)', () => {
  it("records and updates a player's strokes for a hole", () => {
    const { code } = startRound(alice);
    setScore(code, alice, 1, 5);
    expect(getRoundState(code).players[0]!.scores).toEqual({ 1: 5 });
    setScore(code, alice, 1, 4);
    expect(getRoundState(code).players[0]!.scores).toEqual({ 1: 4 });
  });

  it('clears a score when given null', () => {
    const { code } = startRound(alice);
    setScore(code, alice, 1, 5);
    setScore(code, alice, 1, null);
    expect(getRoundState(code).players[0]!.scores).toEqual({});
  });

  it('rejects a non-player', () => {
    const { code } = startRound(alice);
    expect(() => setScore(code, cara, 1, 4)).toThrow(RoundError);
  });

  it('rejects a hole not on the course', () => {
    const { code } = startRound(alice);
    expect(() => setScore(code, alice, 99, 4)).toThrow(RoundError);
  });

  it('rejects an out-of-range stroke count', () => {
    const { code } = startRound(alice);
    expect(() => setScore(code, alice, 1, 0)).toThrow(RoundError);
    expect(() => setScore(code, alice, 1, 21)).toThrow(RoundError);
  });

  it('rejects scoring after the round is completed', () => {
    const { code } = startRound(alice);
    completeRound(code, alice);
    expect(() => setScore(code, alice, 1, 4)).toThrow(RoundError);
  });
});

describe('completeRound / reopenRound', () => {
  it('moves a round from active to completed and shows up in "mine"', () => {
    const { code } = startRound(alice);
    setScore(code, alice, 1, 4);
    completeRound(code, alice);
    const mine = listMyRounds(alice);
    expect(mine.active).toHaveLength(0);
    expect(mine.recent.map((r) => r.code)).toContain(code);
  });

  it('reopen lets scoring continue', () => {
    const { code } = startRound(alice);
    completeRound(code, alice);
    reopenRound(code, alice);
    expect(() => setScore(code, alice, 1, 4)).not.toThrow();
  });
});

describe('listMyInvites', () => {
  it('shows a pending invite until joined or declined', () => {
    const { code } = startRound(alice, { inviteFriendIds: [bob] });
    expect(listMyInvites(bob).map((i) => i.round.code)).toContain(code);
    joinRound(code, bob);
    expect(listMyInvites(bob).map((i) => i.round.code)).not.toContain(code);
  });
});

describe('scramble rounds', () => {
  it('defaults to one team of everyone invited when no teams are given', () => {
    const { code } = startRound(alice, { format: 'scramble', inviteFriendIds: [bob, cara] });
    const state = getRoundState(code);
    expect(state.format).toBe('scramble');
    expect(state.teams).toHaveLength(1);
    expect(new Set(state.teams[0]!.memberUserIds)).toEqual(new Set([alice, bob, cara]));
  });

  it('splits explicit teams, leaving unlisted invitees unassigned', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob, cara, dave],
      teams: [
        { name: 'Eagles', memberIds: [alice, bob] },
        { name: 'Birdies', memberIds: [cara] },
      ],
    });
    const state = getRoundState(code);
    expect(state.teams).toHaveLength(2);
    const eagles = state.teams.find((t) => t.name === 'Eagles')!;
    const birdies = state.teams.find((t) => t.name === 'Birdies')!;
    expect(new Set(eagles.memberUserIds)).toEqual(new Set([alice, bob]));
    expect(birdies.memberUserIds).toEqual([cara]);
    // dave was invited but not put on a team
    expect(state.teams.some((t) => t.memberUserIds.includes(dave))).toBe(false);
  });

  it('ignores a would-be teammate who was never invited', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob],
      teams: [{ name: 'Team', memberIds: [alice, bob, cara] }],
    });
    const state = getRoundState(code);
    expect(new Set(state.teams[0]!.memberUserIds)).toEqual(new Set([alice, bob]));
  });

  it('scores apply to the whole team, and any teammate can enter them', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob],
      teams: [{ memberIds: [alice, bob] }],
    });
    joinRound(code, bob);
    setScore(code, alice, 1, 4);
    let state = getRoundState(code);
    expect(state.teams[0]!.scores).toEqual({ 1: 4 });
    // players themselves carry no individual scores in a scramble
    expect(state.players.every((p) => Object.keys(p.scores).length === 0)).toBe(true);

    setScore(code, bob, 1, 3);
    state = getRoundState(code);
    expect(state.teams[0]!.scores).toEqual({ 1: 3 });
  });

  it('rejects scoring from a player not on any team', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob, dave],
      teams: [{ memberIds: [alice, bob] }], // dave was invited but left off the only team
    });
    joinRound(code, dave);
    expect(() => setScore(code, dave, 1, 4)).toThrow(RoundError);
  });

  it('rejects team actions on a stroke_play round', () => {
    const { code } = startRound(alice);
    expect(() => createTeam(code, alice, 'Solo')).toThrow(RoundError);
  });
});

describe('team management', () => {
  it('createTeam moves the caller off any prior team', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob],
      teams: [{ name: 'Original', memberIds: [alice, bob] }],
    });
    joinRound(code, bob);
    const newTeamId = createTeam(code, bob, 'Bob solo');
    const state = getRoundState(code);
    const original = state.teams.find((t) => t.name === 'Original')!;
    const fresh = state.teams.find((t) => t.id === newTeamId)!;
    expect(original.memberUserIds).toEqual([alice]);
    expect(fresh.memberUserIds).toEqual([bob]);
  });

  it('joinTeam moves the caller from their current team to the target', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob, cara],
      teams: [
        { name: 'A', memberIds: [alice] },
        { name: 'B', memberIds: [bob, cara] },
      ],
    });
    joinRound(code, bob);
    joinRound(code, cara);
    const state1 = getRoundState(code);
    const teamA = state1.teams.find((t) => t.name === 'A')!;
    joinTeam(code, bob, teamA.id);

    const state2 = getRoundState(code);
    expect(state2.teams.find((t) => t.name === 'A')!.memberUserIds.sort()).toEqual([alice, bob].sort());
    expect(state2.teams.find((t) => t.name === 'B')!.memberUserIds).toEqual([cara]);
  });

  it('an emptied team is removed', () => {
    const { code } = startRound(alice, {
      format: 'scramble',
      inviteFriendIds: [bob],
      teams: [
        { name: 'Solo', memberIds: [bob] },
        { name: 'Main', memberIds: [alice] },
      ],
    });
    joinRound(code, bob);
    leaveTeam(code, bob);
    const state = getRoundState(code);
    expect(state.teams.some((t) => t.name === 'Solo')).toBe(false);
  });

  it('rejects joining a team from another round', () => {
    const first = startRound(alice, { format: 'scramble' });
    const secondCourse = createCourse(alice, 'Other Course', null, [{ number: 1, par: 4 }]).id;
    const second = startRound(alice, { courseId: secondCourse, format: 'scramble' });
    const otherTeamId = getRoundState(second.code).teams[0]!.id;
    expect(() => joinTeam(first.code, alice, otherTeamId)).toThrow(RoundError);
  });

  it('renameTeam updates the name for everyone', () => {
    const { code } = startRound(alice, { format: 'scramble' });
    const teamId = getRoundState(code).teams[0]!.id;
    renameTeam(code, alice, teamId, 'The Eagles');
    expect(getRoundState(code).teams[0]!.name).toBe('The Eagles');
  });
});
