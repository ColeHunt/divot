import { useState, type FormEvent } from 'react';
import { messageFor, useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), password, name.trim());
    } catch (err) {
      setError(messageFor(err, 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="hero">
        <h1>⛳ Divot</h1>
        <p className="muted">Rounds, courses and scores, with your friends.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="name"
            required
          />
        </label>
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
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="tiny muted">At least 8 characters.</span>
        </label>
        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          Create account
        </button>
        {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
      </form>

      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Already have an account?{' '}
        <button className="btn-ghost" style={{ display: 'inline', padding: 0, minHeight: 0 }} onClick={() => navigate('/login')}>
          Sign in
        </button>
      </p>
    </div>
  );
}
