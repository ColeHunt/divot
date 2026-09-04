import { useEffect, useState, type FormEvent } from 'react';
import type { RoundInvite, RoundSummary, SavedCourse } from '@shared/types.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

interface MineResponse {
  active: RoundSummary[];
  recent: RoundSummary[];
}

export function Home() {
  const { user } = useAuth();
  const [active, setActive] = useState<RoundSummary[]>([]);
  const [invites, setInvites] = useState<RoundInvite[]>([]);
  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [mine, inviteRes, coursesRes] = await Promise.all([
      api.get<MineResponse>('/api/rounds/mine'),
      api.get<{ invites: RoundInvite[] }>('/api/rounds/invites'),
      api.get<{ courses: SavedCourse[] }>('/api/courses/saved'),
    ]);
    setActive(mine.active);
    setInvites(inviteRes.invites);
    setSaved(coursesRes.courses.slice(0, 3));
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function acceptInvite(roundCode: string) {
    await api.post(`/api/rounds/${roundCode}/join`);
    navigate(`/round/${roundCode}`);
  }

  async function declineInvite(roundCode: string) {
    await api.post(`/api/rounds/${roundCode}/decline`);
    setInvites((current) => current.filter((i) => i.round.code !== roundCode));
  }

  async function joinWithCode(event: FormEvent) {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setJoinError('Round codes are six characters.');
      return;
    }
    setBusy(true);
    setJoinError(null);
    try {
      await api.post(`/api/rounds/${cleaned}/join`);
      navigate(`/round/${cleaned}`);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : 'Could not join that round');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">⛳ Divot</span>
        <button className="btn-ghost tiny" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/account')}>
          Hey, {user?.name.split(' ')[0]}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="card">
          <h2>Round invites</h2>
          <div className="stack">
            {invites.map((invite) => (
              <div key={invite.round.code} className="row between">
                <div>
                  <div className="row-name">
                    {invite.round.courseName}
                    {invite.round.holesLabel && <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>{invite.round.holesLabel}</span>}
                    {invite.round.format === 'scramble' && <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>Scramble</span>}
                  </div>
                  <div className="row-meta">Code {invite.round.code}</div>
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => declineInvite(invite.round.code)}>
                    Decline
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => acceptInvite(invite.round.code)}>
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <button className="btn btn-primary btn-full" onClick={() => navigate('/round/new')}>
          Start a round
        </button>
        <form className="stack" onSubmit={joinWithCode}>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Round code"
          />
          <button className="btn btn-full" type="submit" disabled={busy}>
            Join with a code
          </button>
        </form>
        {joinError && <p className="tiny" style={{ color: 'var(--danger)' }}>{joinError}</p>}
      </div>

      {active.length > 0 && (
        <div className="card">
          <h2>In progress</h2>
          <div className="stack">
            {active.map((round) => (
              <button
                key={round.code}
                className="btn btn-ghost btn-full row between"
                onClick={() => navigate(`/round/${round.code}`)}
              >
                <span>
                  {round.courseName}
                  {round.holesLabel && <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>{round.holesLabel}</span>}
                  {round.format === 'scramble' && <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>Scramble</span>}
                </span>
                <span className="tiny muted">{round.playerNames.join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div className="card">
          <h2>Your courses</h2>
          <div className="stack">
            {saved.map((course) => (
              <button
                key={course.id}
                className="btn btn-ghost btn-full row between"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                <span>{course.name}</span>
                <span className="tiny muted">
                  {course.lastPlayed ? `Last: ${course.lastPlayed.totalStrokes} strokes` : 'Not played yet'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {active.length === 0 && invites.length === 0 && saved.length === 0 && (
        <p className="tiny muted" style={{ textAlign: 'center' }}>
          Save a course and start your first round to see it here.
        </p>
      )}
    </div>
  );
}
