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

/** One player's completed round on a course, used to show "last time here". */
export interface LastRound {
  roundId: string;
  code: string;
  playedAt: number;
  totalStrokes: number;
  toPar: number;
  scores: Record<number, number>;
}

export type RoundStatus = 'active' | 'completed';
export type RoundPlayerStatus = 'invited' | 'joined';

export interface RoundPlayer {
  userId: string;
  name: string;
  status: RoundPlayerStatus;
  joinedAt: number | null;
  /** Hole number -> strokes. Missing holes have not been entered yet. */
  scores: Record<number, number>;
}

export interface RoundState {
  id: string;
  code: string;
  status: RoundStatus;
  /** Monotonic revision. Clients ignore snapshots older than the one they hold. */
  rev: number;
  course: Course;
  createdBy: string;
  startedAt: number;
  completedAt: number | null;
  players: RoundPlayer[];
}

/** A trimmed-down RoundState for "my rounds" list views. */
export interface RoundSummary {
  id: string;
  code: string;
  status: RoundStatus;
  courseName: string;
  courseId: string;
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
  | { t: 'complete_round'; code: string }
  | { t: 'reopen_round'; code: string }
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
  | 'not_your_round';
