/** Wire types shared by the server and the web client. */

export interface User {
  id: string;
  email: string;
  name: string;
}

export type FriendRequestStatus = 'pending';

export interface FriendRequest {
  id: string;
  from: User;
  to: User;
  createdAt: number;
}

export interface Friend extends User {
  friendsSince: number;
}

export interface Hole {
  number: number;
  par: number;
  yardage: number | null;
}

export interface Course {
  id: string;
  name: string;
  location: string | null;
  holeCount: number;
  holes: Hole[];
  createdAt: number;
}

/** A trimmed-down Course for list views, without the hole-by-hole breakdown. */
export interface CourseSummary {
  id: string;
  name: string;
  location: string | null;
  holeCount: number;
}

/** A course on the current user's quick-access list, with their most recent round on it. */
export interface SavedCourse extends CourseSummary {
  savedAt: number;
  lastPlayed: LastRound | null;
}

/** One player's completed round on a course, used to show "last time here" or a stats comparison line. */
export interface LastRound {
  roundId: string;
  code: string;
  playedAt: number;
  totalStrokes: number;
  toPar: number;
  scores: Record<number, number>;
}

/** A user's stats on one course: their lowest-scoring and most recent completed rounds there. */
export interface CourseStats {
  roundsPlayed: number;
  bestRound: LastRound | null;
  lastRound: LastRound | null;
}

/**
 * A user's past strokes on one hole, split by the format they were earned
 * under. A 'scramble' score is the whole team's shared shot, not this
 * player's own play, so it's kept separate from genuinely personal
 * 'stroke_play' history rather than blended into one misleading average.
 */
export interface HoleHistory {
  personal: number[];
  scramble: number[];
}

export type RoundStatus = 'active' | 'completed';
export type RoundPlayerStatus = 'invited' | 'joined';
export type RoundFormat = 'stroke_play' | 'scramble';

export interface RoundPlayer {
  userId: string;
  name: string;
  status: RoundPlayerStatus;
  joinedAt: number | null;
  /**
   * Hole number -> strokes. For a 'scramble' round this is always empty —
   * scoring lives on the player's team instead, in RoundState.teams.
   */
  scores: Record<number, number>;
  /** Hole number -> putts. Entirely optional — a hole missing here just has no putt count recorded. */
  putts: Record<number, number>;
}

/** A scramble team. Only present on 'scramble' rounds — empty on 'stroke_play'. */
export interface RoundTeam {
  id: string;
  name: string;
  memberUserIds: string[];
  /** Hole number -> strokes, the team's shared scorecard. */
  scores: Record<number, number>;
  /** Hole number -> putts, the team's shared putt count. Optional, same as RoundPlayer.putts. */
  putts: Record<number, number>;
}

export interface RoundState {
  id: string;
  code: string;
  status: RoundStatus;
  format: RoundFormat;
  /** Monotonic revision. Clients ignore snapshots older than the one they hold. */
  rev: number;
  /** Only the holes actually being played — e.g. 9 of 18 for a front/back-9 round. */
  course: Course;
  /** "Front 9" / "Back 9" for a partial round on an 18-hole course; null when the whole course is being played. */
  holesLabel: string | null;
  createdBy: string;
  startedAt: number;
  completedAt: number | null;
  players: RoundPlayer[];
  /** Populated for 'scramble' rounds; always empty for 'stroke_play'. */
  teams: RoundTeam[];
}

/** A trimmed-down RoundState for "my rounds" list views. */
export interface RoundSummary {
  id: string;
  code: string;
  status: RoundStatus;
  format: RoundFormat;
  courseName: string;
  courseId: string;
  holesLabel: string | null;
  startedAt: number;
  completedAt: number | null;
  playerNames: string[];
}

/** A pending round invite waiting for the current user to accept or decline. */
export interface RoundInvite {
  round: RoundSummary;
  invitedBy: string | null;
}

export type ClientMessage =
  | { t: 'subscribe'; code: string }
  | { t: 'set_score'; code: string; hole: number; strokes: number | null }
  | { t: 'set_putts'; code: string; hole: number; putts: number | null }
  | { t: 'complete_round'; code: string }
  | { t: 'reopen_round'; code: string }
  | { t: 'create_team'; code: string; name?: string }
  | { t: 'join_team'; code: string; teamId: string }
  | { t: 'leave_team'; code: string }
  | { t: 'rename_team'; code: string; teamId: string; name: string }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'state'; round: RoundState }
  | { t: 'error'; code: ServerErrorCode; message: string }
  | { t: 'pong' };

export type ServerErrorCode =
  | 'round_not_found'
  | 'not_authenticated'
  | 'not_a_player'
  | 'bad_request'
  | 'rate_limited'
  | 'round_completed'
  | 'round_full'
  | 'not_your_round'
  | 'not_on_a_team'
  | 'team_not_found';
