import { getDb } from './db.js';

export function isAdmin(userId: string | undefined): boolean {
  if (!userId) return false;
  return Boolean(getDb().prepare('SELECT 1 FROM admins WHERE user_id = ?').get(userId));
}

export function grantAdmin(userId: string, now = Date.now()): void {
  getDb()
    .prepare('INSERT INTO admins (user_id, granted_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING')
    .run(userId, now);
}

export function revokeAdmin(userId: string): void {
  getDb().prepare('DELETE FROM admins WHERE user_id = ?').run(userId);
}

export interface AdminEntry {
  userId: string;
  email: string;
  name: string;
  grantedAt: number;
}

export function listAdmins(): AdminEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT a.user_id AS user_id, u.email AS email, u.name AS name, a.granted_at AS granted_at
       FROM admins a JOIN users u ON u.id = a.user_id
       ORDER BY a.granted_at ASC`,
    )
    .all() as Array<{ user_id: string; email: string; name: string; granted_at: number }>;
  return rows.map((row) => ({ userId: row.user_id, email: row.email, name: row.name, grantedAt: row.granted_at }));
}
