import { useEffect, useState } from 'react';
import type { ProfileStats } from '@shared/types.js';
import { formatToPar } from '@shared/scoring.js';
import { Avatar } from '../components/Avatar.js';
import { api, ApiError } from '../lib/api.js';
import { navigate } from '../lib/router.js';

export function FriendProfile({ userId }: { userId: string }) {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    setError(null);
    api
      .get<ProfileStats>(`/api/users/${userId}/profile-stats`)
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this profile'));
  }, [userId]);

  if (error) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/friends')}>
            ← Friends
          </button>
        </div>
        <div className="center-screen">
          <p className="muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
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
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/friends')}>
          ← Friends
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar userId={stats.user.id} name={stats.user.name} large />
        </div>
        <h1 style={{ fontSize: '1.6rem', marginTop: '0.6rem' }}>{stats.user.name}</h1>
      </div>

      {stats.roundsPlayed === 0 ? (
        <div className="card">
          <p className="muted tiny">No completed rounds yet.</p>
        </div>
      ) : (
        <>
          <div className="card stat-pair">
            {stats.bestRound && (
              <div>
                <div className="row-meta">Best round</div>
                <div className="row-name">{stats.bestRound.totalStrokes} strokes</div>
                <span className="badge badge-accent">{formatToPar(stats.bestRound.toPar)}</span>
                <div className="tiny muted">{stats.bestRound.courseName}</div>
              </div>
            )}
            {stats.favoriteCourse && (
              <button
                className="btn-ghost"
                style={{ padding: 0, minHeight: 0, textAlign: 'left', display: 'block' }}
                onClick={() => navigate(`/courses/${stats.favoriteCourse!.courseId}`)}
              >
                <div className="row-meta">Favorite course</div>
                <div className="row-name">{stats.favoriteCourse.name}</div>
                <div className="tiny muted">
                  {stats.favoriteCourse.roundsPlayed} round{stats.favoriteCourse.roundsPlayed === 1 ? '' : 's'} played
                </div>
              </button>
            )}
          </div>

          <div className="card">
            <h2>Recent rounds</h2>
            <div className="stack">
              {stats.recentRounds.map((round) => (
                <div key={round.roundId} className="row between">
                  <span>
                    <span className="row-name">
                      {round.courseName}
                      {round.format === 'scramble' && (
                        <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>
                          Scramble
                        </span>
                      )}
                    </span>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {new Date(round.playedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="tiny muted">
                    {round.totalStrokes} ({formatToPar(round.toPar)})
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="tiny muted" style={{ textAlign: 'center' }}>
            {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} played overall.
          </p>
        </>
      )}
    </div>
  );
}
