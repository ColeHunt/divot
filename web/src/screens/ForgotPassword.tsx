import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { Wordmark } from '../components/Wordmark.js';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() });
      // Always shown, whether or not that email has an account — the API
      // itself never reveals which, so the UI shouldn't either.
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="hero">
        <h1><Wordmark /></h1>
      </div>

      {sent ? (
        <div className="card stack" style={{ textAlign: 'center' }}>
          <p>If an account uses that email, a reset link is on its way.</p>
          <p className="tiny muted">The link expires in 30 minutes.</p>
          <button className="btn btn-full" onClick={() => navigate('/login')}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <p className="tiny muted" style={{ margin: 0 }}>
            Enter the email on your account and we'll send a link to reset your password.
          </p>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        <button className="btn-ghost" style={{ display: 'inline', padding: 0, minHeight: 0 }} onClick={() => navigate('/login')}>
          Back to sign in
        </button>
      </p>
    </div>
  );
}
