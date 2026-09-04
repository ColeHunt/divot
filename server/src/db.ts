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

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

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
      rev          INTEGER NOT NULL DEFAULT 0,
      started_at   INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_rounds_course ON rounds(course_id);

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
  `);
}
