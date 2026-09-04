import path from 'node:path';

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 8080),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  isProduction: process.env.NODE_ENV === 'production',

  sessionCookieName: 'divot_session',
  sessionTtlDays: 30,

  /** Guardrails so no single account or round can exhaust the box. */
  maxFriendsPerUser: 500,
  maxPendingRequestsPerUser: 200,
  maxHolesPerCourse: 36,
  maxPlayersPerRound: 12,
  maxMessageBytes: 4096,
  /** Client messages allowed per connection per minute. */
  messagesPerMinute: 120,
};
