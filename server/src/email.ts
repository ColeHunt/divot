import { config } from './config.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Sends via Resend's HTTP API — no SMTP, no extra dependency (Node's global
 * fetch is enough). If RESEND_API_KEY isn't set yet, this logs the link
 * instead of sending, so password reset still works end to end in dev, and
 * setting up email later is just adding one env var, nothing to redeploy code for.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!config.resendApiKey) {
    console.warn(`RESEND_API_KEY not set — would have emailed ${to} this reset link: ${resetUrl}`);
    return;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to,
        subject: 'Reset your divot password',
        html: `
          <p>Someone asked to reset the password on this divot account.</p>
          <p><a href="${resetUrl}">Choose a new password</a></p>
          <p>This link expires in ${config.passwordResetTtlMinutes} minutes. If you didn't request this, you can ignore this email — your password hasn't changed.</p>
        `,
      }),
    });
    if (!response.ok) {
      console.error('Resend returned an error sending the reset email', response.status, await response.text());
    }
  } catch (error) {
    console.error('Failed to send password reset email', error);
  }
}
