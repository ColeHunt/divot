import { useEffect, useState } from 'react';
import type { RoundSummary } from '@shared/types.js';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

interface MineResponse {
  active: RoundSummary[];
  recent: RoundSummary[];
}

function RoundRow({ round }: { round: RoundSummary }) {
  return (
    <button className="btn btn-ghost btn-full row between" onClick={() => navigate(`/round/${round.code}`)}>
      <span>
        <span className="row-name">
          {round.courseName}
          {round.format === 'scramble' && <span className="badge badge-muted" style={{ marginLeft: '0.4rem' }}>Scramble</span>}
        </span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {round.playerNames.join(', ')}
        </span>
      </span>
      <span className="tiny muted">
        {new Date(round.completedAt ?? round.startedAt).toLocaleDateString()}
      </span>
    </button>
  );
}

export function Rounds() {
  const [data, setData] = useState<MineResponse | null>(null);

  useEffect(() => {
    api.get<MineResponse>('/api/rounds/mine').then(setData);
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Your rounds</span>
      </div>

      {!data ? (
        <p className="muted tiny">Loading…</p>
      ) : (
        <>
          {data.active.length > 0 && (
            <div className="card">
              <h2>In progress</h2>
              <div className="stack">
                {data.active.map((round) => (
                  <RoundRow key={round.code} round={round} />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2>Completed</h2>
            {data.recent.length === 0 ? (
              <p className="tiny muted">No finished rounds yet.</p>
            ) : (
              <div className="stack">
                {data.recent.map((round) => (
                  <RoundRow key={round.code} round={round} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
