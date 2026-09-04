import { useState, type FormEvent } from 'react';
import { messageFor, useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(messageFor(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="hero">
        <h1>⛳ divot</h1>
        <p className="muted">Rounds, courses and scores, with your friends.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
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
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          Sign in
        </button>
        {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
      </form>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        New here?{' '}
        <button className="btn-ghost" style={{ display: 'inline', padding: 0, minHeight: 0 }} onClick={() => navigate('/register')}>
          Create an account
        </button>
      </p>
    </div>
  );
}
