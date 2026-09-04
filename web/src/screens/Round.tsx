import { useMemo, useState } from 'react';
import { formatToPar, holesPlayed, toPar, totalStrokes } from '@shared/scoring.js';
import { useAuth } from '../lib/auth.js';
import { useRound } from '../lib/useRound.js';
import { navigate } from '../lib/router.js';

function strokeOptions(par: number): number[] {
  const start = Math.max(1, par - 2);
  return Array.from({ length: 6 }, (_, i) => start + i);
}

export function Round({ code }: { code: string }) {
  const { user } = useAuth();
  const { status, round, error, fatalError, setScore, completeRound, reopenRound } = useRound(code);
  const [holeIndex, setHoleIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const me = useMemo(() => round?.players.find((p) => p.userId === user?.id) ?? null, [round, user]);

  if (fatalError) {
    return (
      <div className="app">
        <div className="center-screen stack" style={{ textAlign: 'center' }}>
          <p>{fatalError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading round…</p>
        </div>
      </div>
    );
  }

  const hole = round.course.holes[holeIndex];
  const myScores = me?.scores ?? {};
  const isComplete = round.status === 'completed';

  function share() {
    const url = `${location.origin}/round/${code}`;
    if (navigator.share) {
      navigator.share({ title: round!.course.name, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  const leaderboard = [...round.players]
    .filter((p) => p.status === 'joined')
    .sort((a, b) => totalStrokes(a.scores) - totalStrokes(b.scores));

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/')}>
          ← Home
        </button>
        <div className="row">
          <span className={`status-dot ${status}`} />
          <button className="btn-ghost code-chip" style={{ padding: 0, minHeight: 0, fontSize: '0.95rem' }} onClick={share}>
            {code}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <div className="row-name">{round.course.name}</div>
            <div className="row-meta">{round.course.holeCount} holes</div>
          </div>
          {isComplete && <span className="badge badge-accent">Final</span>}
        </div>
      </div>

      {!isComplete && hole && (
        <div className="card">
          <div className="hole-nav">
            <button
              className="btn btn-sm"
              onClick={() => setHoleIndex((i) => Math.max(0, i - 1))}
              disabled={holeIndex === 0}
            >
              ← Prev
            </button>
            <div style={{ textAlign: 'center' }}>
              <div className="hole-num">Hole {hole.number}</div>
              <div className="hole-meta">
                Par {hole.par}
                {hole.yardage ? ` · ${hole.yardage} yds` : ''}
              </div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setHoleIndex((i) => Math.min(round.course.holes.length - 1, i + 1))}
              disabled={holeIndex === round.course.holes.length - 1}
            >
              Next →
            </button>
          </div>

          <div className="stroke-grid">
            {strokeOptions(hole.par).map((n) => (
              <button
                key={n}
                className="stroke-btn"
                aria-pressed={myScores[hole.number] === n}
                onClick={() => {
                  const next = myScores[hole.number] === n ? null : n;
                  setScore(hole.number, next);
                  if (next != null && holeIndex < round.course.holes.length - 1) {
                    setHoleIndex((i) => i + 1);
                  }
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Leaderboard</h2>
        <div className="stack">
          {leaderboard.map((player) => (
            <div key={player.userId} className="player-score-row">
              <div className="avatar">{player.name[0]?.toUpperCase()}</div>
              <div>
                <div className="row-name">{player.name}</div>
                <div className="row-meta">
                  {holesPlayed(player.scores)}/{round.course.holeCount} holes
                </div>
              </div>
              <div>
                <div className="stat">{totalStrokes(player.scores) || '—'}</div>
                <div className="row-meta" style={{ textAlign: 'right' }}>
                  {holesPlayed(player.scores) > 0 ? formatToPar(toPar(player.scores, round.course.holes)) : ''}
                </div>
              </div>
            </div>
          ))}
          {round.players.some((p) => p.status === 'invited') && (
            <p className="tiny muted">
              Waiting on: {round.players.filter((p) => p.status === 'invited').map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="stack">
        {isComplete ? (
          <button className="btn btn-full" onClick={reopenRound}>
            Reopen round
          </button>
        ) : (
          <button className="btn btn-primary btn-full" onClick={completeRound}>
            Finish round
          </button>
        )}
      </div>

      {copied && <div className="toast">Link copied</div>}
      {error && <div className="toast">{error}</div>}
    </div>
  );
}
