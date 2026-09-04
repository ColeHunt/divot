import { useState, type FormEvent } from 'react';
import { messageFor, useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function ResetPassword() {
  const { resetPassword } = useAuth();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigate('/');
    } catch (err) {
      setError(messageFor(err, 'Could not reset your password'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="app">
        <div className="hero">
          <h1>⛳ divot</h1>
        </div>
        <div className="card stack" style={{ textAlign: 'center' }}>
          <p>This link is missing its reset code.</p>
          <button className="btn btn-full" onClick={() => navigate('/forgot-password')}>
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="hero">
        <h1>⛳ divot</h1>
        <p className="muted">Choose a new password.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="tiny muted">At least 8 characters.</span>
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          Reset password
        </button>
        {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
      </form>
    </div>
  );
}
