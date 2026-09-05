import { useEffect, useState } from 'react';
import type { ProfileStats } from '@shared/types.js';
import { ProfileStatsBody } from '../components/ProfileStatsBody.js';
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

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/friends')}>
          ← Friends
        </button>
      </div>

      {error ? (
        <div className="center-screen">
          <p className="muted">{error}</p>
        </div>
      ) : !stats ? (
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      ) : (
        <ProfileStatsBody stats={stats} />
      )}
    </div>
  );
}
