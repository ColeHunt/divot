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

  /** Failed sign-in attempts allowed per email+IP before a short lockout. */
  loginRateLimit: { maxAttempts: 10, windowMinutes: 15 },
  /** Password reset requests allowed per email+IP — tighter, since each one sends an email. */
  resetRateLimit: { maxAttempts: 5, windowMinutes: 15 },
  passwordResetTtlMinutes: 30,

  /**
   * Sending address for password reset emails; Resend's shared test sender
   * until a real domain is verified. `||` rather than `??` on purpose — an
   * unset Docker Compose env var arrives as `''`, not undefined, and that
   * should fall back too, not send with a blank From header.
   */
  emailFrom: process.env.EMAIL_FROM || 'divot <onboarding@resend.dev>',
  resendApiKey: process.env.RESEND_API_KEY || undefined,

  /** A client-resized avatar should be a few hundred KB at most; this leaves headroom. */
  maxAvatarBytes: 1_500_000,

  /** Guardrails so no single account or round can exhaust the box. */
  maxFriendsPerUser: 500,
  maxPendingRequestsPerUser: 200,
  maxHolesPerCourse: 36,
  maxPlayersPerRound: 12,
  maxTeamsPerRound: 12,
  maxTeamNameLength: 30,
  maxMessageBytes: 4096,
  /** Client messages allowed per connection per minute. */
  messagesPerMinute: 120,
};
