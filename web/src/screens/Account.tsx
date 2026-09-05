import { useState, type ChangeEvent } from 'react';
import { Avatar } from '../components/Avatar.js';
import { PencilIcon } from '../components/icons.js';
import { api, ApiError } from '../lib/api.js';
import { messageFor, useAuth } from '../lib/auth.js';
import { resizeImageToDataUrl } from '../lib/image.js';
import { navigate } from '../lib/router.js';

export function Account() {
  const { user, updateName, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets picking the same file again re-trigger onChange
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await api.put('/api/users/me/avatar', { dataUrl });
      setAvatarVersion(Date.now());
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : 'Could not update your photo');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removePhoto() {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await api.delete('/api/users/me/avatar');
      setAvatarVersion(Date.now());
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : 'Could not remove your photo');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function signOut() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/profile')}>
          ← Profile
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Account</h1>
        <p className="muted">{user?.email}</p>
      </div>

      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <label className="avatar-picker">
          {user && <Avatar userId={user.id} name={user.name} large version={avatarVersion} />}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} disabled={avatarBusy} />
          <span className="edit-badge">
            <PencilIcon />
          </span>
        </label>
        <p className="tiny muted" style={{ margin: 0 }}>Tap to change your photo</p>
        <button className="btn-ghost tiny" style={{ padding: 0, minHeight: 0 }} onClick={removePhoto} disabled={avatarBusy}>
          Remove photo
        </button>
        {avatarError && <p className="tiny" style={{ color: 'var(--danger)' }}>{avatarError}</p>}
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
