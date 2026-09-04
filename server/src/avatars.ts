import { config } from './config.js';
import { getDb } from './db.js';

export class AvatarError extends Error {
  constructor(readonly code: 'bad_request', message: string) {
    super(message);
  }
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DATA_URL_RE = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/;

/** Parses the data URL the client's canvas.toDataURL() produces — no separate mime/body fields needed. */
function parseDataUrl(input: unknown): { mimeType: string; buffer: Buffer } {
  const match = typeof input === 'string' ? DATA_URL_RE.exec(input) : null;
  if (!match || !ALLOWED_MIME_TYPES.has(match[1]!)) {
    throw new AvatarError('bad_request', 'Upload a JPEG, PNG or WebP image');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2]!, 'base64');
  } catch {
    throw new AvatarError('bad_request', 'Could not read that image');
  }
  if (buffer.length === 0 || buffer.length > config.maxAvatarBytes) {
    throw new AvatarError('bad_request', 'Image is too large');
  }

  return { mimeType: match[1]!, buffer };
}

export function setAvatar(userId: string, dataUrl: unknown, now = Date.now()): void {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  getDb()
    .prepare(
      `INSERT INTO user_avatars (user_id, mime_type, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET mime_type = excluded.mime_type, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(userId, mimeType, buffer, now);
}

export function removeAvatar(userId: string): void {
  getDb().prepare('DELETE FROM user_avatars WHERE user_id = ?').run(userId);
}

export interface AvatarBlob {
  mimeType: string;
  data: Buffer;
}

export function getAvatar(userId: string): AvatarBlob | null {
  const row = getDb().prepare('SELECT mime_type, data FROM user_avatars WHERE user_id = ?').get(userId) as
    | { mime_type: string; data: Buffer }
    | undefined;
  return row ? { mimeType: row.mime_type, data: row.data } : null;
}
