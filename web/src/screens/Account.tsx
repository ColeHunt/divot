import { useState } from 'react';
import { messageFor, useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Account() {
  const { user, updateName, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateName(name.trim());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(messageFor(err, 'Could not update your name'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/')}>
          ← Home
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Account</h1>
        <p className="muted">{user?.email}</p>
      </div>

      <div className="card stack">
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <button className="btn btn-primary btn-full" onClick={save} disabled={busy || !name.trim()}>
          Save
        </button>
        {saved && <p className="tiny" style={{ color: 'var(--accent)' }}>Saved.</p>}
        {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      <div className="card">
        <button className="btn btn-full btn-danger" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
