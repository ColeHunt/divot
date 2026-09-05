import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

export type Db = Database.Database;

let db: Db | null = null;

export function openDb(file?: string): Db {
  const target = file ?? path.join(config.dataDir, 'divot.sqlite');
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });

  const instance = new Database(target);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  migrate(instance);
  return instance;
}

export function getDb(): Db {
  if (!db) db = openDb();
  return db;
}

export function setDb(instance: Db): void {
  db = instance;
}

function migrate(instance: Db): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    -- Presence of a row means that user has admin rights (currently: editing
    -- and deleting any course in the shared library). Granted by hand only —
    -- server/src/adminCli.ts, run on the box itself — there is no self-serve
    -- "become an admin" path anywhere in the app.
    CREATE TABLE IF NOT EXISTS admins (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      granted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- One row per outstanding "forgot password" link. Consumed (deleted) on
    -- use; a fresh request replaces any prior unused token for the same user
    -- rather than letting old links keep working alongside new ones.
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

    -- Presence of a row means the user has a custom avatar; absence falls
    -- back to initials on the client. Stored as a blob in this same database
    -- rather than a separate directory of files, so one .backup of
    -- divot.sqlite still covers everything.
    CREATE TABLE IF NOT EXISTS user_avatars (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mime_type  TEXT NOT NULL,
      data       BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- A row is a pending friend request until accepted_at is set, at which
    -- point requester and addressee are friends. Declining or unfriending
    -- deletes the row outright rather than tracking a 'declined' status, so a
    -- fresh request can always be sent again later.
    CREATE TABLE IF NOT EXISTS friendships (
      id            TEXT PRIMARY KEY,
      requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      accepted_at   INTEGER,
      UNIQUE(requester_id, addressee_id)
    );

    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

    -- Courses are a shared library: any account can add one, and any account
    -- can attach a round to it. There is no per-user ownership of a course
    -- beyond created_by, which is informational only.
    CREATE TABLE IF NOT EXISTS courses (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      location   TEXT,
      hole_count INTEGER NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name);

    CREATE TABLE IF NOT EXISTS course_holes (
      course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      par         INTEGER NOT NULL,
      yardage     INTEGER,
      PRIMARY KEY (course_id, hole_number)
    );

    -- Presence of a row means the user has saved the course to their quick
    -- list. Same "presence, not a flag" idiom used throughout this schema.
    CREATE TABLE IF NOT EXISTS user_saved_courses (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      saved_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, course_id)
    );

    CREATE INDEX IF NOT EXISTS idx_saved_courses_user ON user_saved_courses(user_id);

    CREATE TABLE IF NOT EXISTS rounds (
      id           TEXT PRIMARY KEY,
      code         TEXT NOT NULL UNIQUE,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'active',
      -- 'stroke_play': round_scores holds one card per player. 'scramble':
      -- players are grouped into round_teams and round_team_scores holds one
      -- shared card per team instead; round_scores stays empty for that round.
      format       TEXT NOT NULL DEFAULT 'stroke_play',
      rev          INTEGER NOT NULL DEFAULT 0,
      started_at   INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_rounds_course ON rounds(course_id);

    -- The holes actually being played in a round — e.g. just the front 9 of
    -- an 18-hole course. One row per hole, snapshotted at creation so a
    -- later edit to the course's own holes never reshapes a round already
    -- in progress or in the history books. A round with no rows here (any
    -- round created before this table existed) falls back to every hole on
    -- the course, which is exactly what it did before this feature shipped.
    CREATE TABLE IF NOT EXISTS round_holes (
      round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      PRIMARY KEY (round_id, hole_number)
    );

    -- 'invited' rows are a pending invite; 'joined' rows are an active
    -- participant. A creator's own row starts 'joined'. joined_at is null
    -- until the status flips.
    CREATE TABLE IF NOT EXISTS round_players (
      round_id   TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status     TEXT NOT NULL DEFAULT 'invited',
      invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      joined_at  INTEGER,
      PRIMARY KEY (round_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_round_players_user ON round_players(user_id);

    CREATE TABLE IF NOT EXISTS round_scores (
      round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      strokes     INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (round_id, user_id, hole_number)
    );

    -- Putts are tracked the same way as strokes but are entirely optional —
    -- a hole with no row here just has no putt count recorded, same
    -- "presence, not a flag" idiom as the rest of this schema.
    CREATE TABLE IF NOT EXISTS round_putts (
      round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      putts       INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (round_id, user_id, hole_number)
    );

    -- A scramble round's teams. 'position' keeps them in creation order for
    -- display, since "Team 1" / "Team 2" default names are not otherwise
    -- ordered by anything meaningful.
    CREATE TABLE IF NOT EXISTS round_teams (
      id       TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      name     TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_round_teams_round ON round_teams(round_id);

    -- A player belongs to at most one team per round; joining a new team
    -- removes their membership on any other team in the same round first,
    -- enforced in application code rather than a constraint here.
    CREATE TABLE IF NOT EXISTS round_team_members (
      team_id TEXT NOT NULL REFERENCES round_teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_round_team_members_user ON round_team_members(user_id);

    CREATE TABLE IF NOT EXISTS round_team_scores (
      round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      team_id     TEXT NOT NULL REFERENCES round_teams(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      strokes     INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (team_id, hole_number)
    );

    CREATE INDEX IF NOT EXISTS idx_round_team_scores_round ON round_team_scores(round_id);

    CREATE TABLE IF NOT EXISTS round_team_putts (
      round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      team_id     TEXT NOT NULL REFERENCES round_teams(id) ON DELETE CASCADE,
      hole_number INTEGER NOT NULL,
      putts       INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (team_id, hole_number)
    );

    CREATE INDEX IF NOT EXISTS idx_round_team_putts_round ON round_team_putts(round_id);
  `);
}
