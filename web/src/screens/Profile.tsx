import { useEffect, useState } from 'react';
import type { ProfileStats } from '@shared/types.js';
import { ProfileStatsBody } from '../components/ProfileStatsBody.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);

  useEffect(() => {
    if (!user) return;
    setStats(null);
    api.get<ProfileStats>(`/api/users/${user.id}/profile-stats`).then(setStats);
  }, [user]);

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/')}>
          ← Home
        </button>
      </div>

      {!stats ? (
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      ) : (
        <ProfileStatsBody
          stats={stats}
          action={
            <button
              className="btn btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => navigate('/account')}
            >
              Edit profile
            </button>
          }
        />
      )}
    </div>
  );
}
