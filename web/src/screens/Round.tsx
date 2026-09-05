import { useEffect, useMemo, useState } from 'react';
import type { HoleHistory, RoundTeam } from '@shared/types.js';
import { formatToPar, holesPlayed, scoreName, toPar, totalPutts, totalStrokes } from '@shared/scoring.js';
import { Avatar } from '../components/Avatar.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useRound } from '../lib/useRound.js';
import { navigate } from '../lib/router.js';

const MIN_STROKES = 1;
const MAX_STROKES = 20;
const MIN_PUTTS = 0;
const MAX_PUTTS = 10;

function initials(name: string): string {
  return name[0]?.toUpperCase() ?? '?';
}

/** Green for under par, dim for even, red for over — matches the badge colors used elsewhere. */
function scoreColor(diff: number): string {
  if (diff < 0) return 'var(--accent)';
  if (diff === 0) return 'var(--text-dim)';
  return 'var(--danger)';
}

/** One row of past strokes on a hole, e.g. "Your history" or "Scramble history". */
function HistoryChips({ label, strokes, par }: { label: string; strokes: number[]; par: number }) {
  if (strokes.length === 0) return null;
  return (
    <div style={{ marginTop: '0.7rem' }}>
      <div className="tiny muted">{label}</div>
      <div className="chip-row" style={{ marginTop: '0.4rem' }}>
        {strokes.map((n, i) => (
          <span key={i} className="badge badge-muted">
            {n} · {scoreName(n - par)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Round({ code }: { code: string }) {
  const { user } = useAuth();
  const {
    status,
    round,
    error,
    fatalError,
    setScore,
    setPutts,
    completeRound,
    reopenRound,
    createTeam,
    joinTeam,
    leaveTeam,
    renameTeam,
  } = useRound(code);
  const [holeIndex, setHoleIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [pendingPutts, setPendingPutts] = useState<number | null>(null);
  const [holeHistory, setHoleHistory] = useState<Record<number, HoleHistory>>({});

  const me = useMemo(() => round?.players.find((p) => p.userId === user?.id) ?? null, [round, user]);
  const myTeam = useMemo(
    () => round?.teams.find((t) => user && t.memberUserIds.includes(user.id)) ?? null,
    [round, user],
  );

  const isScramble = round?.format === 'scramble';
  const hole = round?.course.holes[holeIndex];
  const myScores = (isScramble ? myTeam?.scores : me?.scores) ?? {};
  const myPutts = (isScramble ? myTeam?.putts : me?.putts) ?? {};

  // Re-baseline the steppers when navigating to a different hole, or when the
  // *committed* value for the hole being viewed changes — our own save
  // confirming over the websocket, or (in scramble) a teammate scoring the
  // same shared hole. An in-progress adjustment on this hole is otherwise
  // left alone, so it doesn't jump around mid-edit.
  const committedForHole = hole ? myScores[hole.number] : undefined;
  const committedPuttsForHole = hole ? myPutts[hole.number] : undefined;
  useEffect(() => {
    if (!hole) return;
    setPending(committedForHole ?? hole.par);
    setPendingPutts(committedPuttsForHole ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.number, committedForHole, committedPuttsForHole]);

  useEffect(() => {
    api
      .get<{ history: Record<number, HoleHistory> }>(`/api/rounds/${code}/hole-history`)
      .then((res) => setHoleHistory(res.history))
      .catch(() => {});
  }, [code]);

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

  const isComplete = round.status === 'completed';
  const canScore = isScramble ? Boolean(myTeam) : Boolean(me);
  const isCreator = user?.id === round.createdBy;

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

  async function removeRound() {
    if (!window.confirm('Delete this round? This cannot be undone.')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/rounds/${code}`);
      navigate('/');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete this round');
      setDeleting(false);
    }
  }

  function nameFor(userId: string): string {
    return round!.players.find((p) => p.userId === userId)?.name ?? 'Someone';
  }

  const playerLeaderboard = [...round.players]
    .filter((p) => p.status === 'joined')
    .sort((a, b) => totalStrokes(a.scores) - totalStrokes(b.scores));

  const teamLeaderboard = [...round.teams].sort(
    (a, b) => totalStrokes(a.scores) - totalStrokes(b.scores),
  );

  const unassigned = round.players.filter(
    (p) => p.status === 'joined' && !round.teams.some((t) => t.memberUserIds.includes(p.userId)),
  );

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

      <div className="card" style={{ padding: '0.6rem 1rem' }}>
        <div className="row between">
          <div>
            <div className="row-name">{round.course.name}</div>
            <div className="row-meta">
              {round.course.holeCount} holes
              {round.holesLabel ? ` (${round.holesLabel})` : ''}
              {isScramble ? ' · Scramble' : ''}
            </div>
          </div>
          {isComplete && <span className="badge badge-accent">Final</span>}
        </div>
      </div>

      {isScramble && !myTeam && (
        <div className="card">
          <h2>Join a team</h2>
          {round.teams.length > 0 && (
            <div className="stack" style={{ marginBottom: '0.6rem' }}>
              {round.teams.map((team) => (
                <div key={team.id} className="row between">
                  <div>
                    <div className="row-name">{team.name}</div>
                    <div className="row-meta">{team.memberUserIds.map(nameFor).join(', ')}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => joinTeam(team.id)}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder={`Team ${round.teams.length + 1}`}
              maxLength={30}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                createTeam(newTeamName.trim() || undefined);
                setNewTeamName('');
              }}
            >
              New team
            </button>
          </div>
        </div>
      )}

      {isScramble && myTeam && (
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Your team</h2>
            <button className="btn-ghost tiny" style={{ padding: 0, minHeight: 0 }} onClick={() => setRenaming((r) => !r)}>
              Rename
            </button>
          </div>
          {renaming ? (
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <input
                value={teamNameDraft || myTeam.name}
                onChange={(e) => setTeamNameDraft(e.target.value)}
                maxLength={30}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  renameTeam(myTeam.id, (teamNameDraft || myTeam.name).trim());
                  setRenaming(false);
                  setTeamNameDraft('');
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div className="row-name" style={{ marginTop: '0.2rem' }}>{myTeam.name}</div>
          )}
          <div className="row-meta" style={{ marginTop: '0.3rem' }}>
            {myTeam.memberUserIds.map(nameFor).join(', ')}
          </div>
          {!isComplete && (
            <button className="btn btn-sm btn-ghost btn-danger" style={{ marginTop: '0.6rem' }} onClick={leaveTeam}>
              Leave team
            </button>
          )}
        </div>
      )}

      {!isComplete && hole && canScore && (
        <div className="card scoring-card">
          <div className="hole-nav">
            <button
              className="btn"
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
              className="btn"
              onClick={() => setHoleIndex((i) => Math.min(round.course.holes.length - 1, i + 1))}
              disabled={holeIndex === round.course.holes.length - 1}
            >
              Next →
            </button>
          </div>

          <div className="score-stepper">
            <button
              className="stepper-btn"
              aria-label="Decrease strokes"
              onClick={() => setPending((p) => Math.max(MIN_STROKES, p - 1))}
              disabled={pending <= MIN_STROKES}
            >
              −
            </button>
            <div className="stepper-value">
              <div className="stepper-number">{pending}</div>
              <div className="stepper-label" style={{ color: scoreColor(pending - hole.par) }}>
                {scoreName(pending - hole.par)}
              </div>
            </div>
            <button
              className="stepper-btn"
              aria-label="Increase strokes"
              onClick={() => setPending((p) => Math.min(MAX_STROKES, p + 1))}
              disabled={pending >= MAX_STROKES}
            >
              +
            </button>
          </div>

          <div className="putts-row">
            <span className="tiny muted">Putts</span>
            <button
              className="mini-stepper-btn"
              aria-label="Decrease putts"
              onClick={() => setPendingPutts((p) => (p == null ? null : Math.max(MIN_PUTTS, p - 1)))}
              disabled={pendingPutts == null || pendingPutts <= MIN_PUTTS}
            >
              −
            </button>
            <span className="putts-value">{pendingPutts ?? '–'}</span>
            <button
              className="mini-stepper-btn"
              aria-label="Increase putts"
              onClick={() => setPendingPutts((p) => Math.min(MAX_PUTTS, (p ?? 0) + 1))}
              disabled={pendingPutts != null && pendingPutts >= MAX_PUTTS}
            >
              +
            </button>
            {pendingPutts != null && (
              <button
                className="btn-ghost tiny"
                style={{ padding: 0, minHeight: 0 }}
                onClick={() => setPendingPutts(null)}
              >
                Clear
              </button>
            )}
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              setScore(hole.number, pending);
              setPutts(hole.number, pendingPutts);
              if (holeIndex < round.course.holes.length - 1) setHoleIndex((i) => i + 1);
            }}
          >
            Save score
          </button>

          {myScores[hole.number] != null && (
            <button
              className="btn-ghost tiny"
              style={{ display: 'block', margin: '0.6rem auto 0', padding: 0, minHeight: 0 }}
              onClick={() => {
                setScore(hole.number, null);
                setPending(hole.par);
              }}
            >
              Clear score
            </button>
          )}

          <HistoryChips
            label="Your history on this hole"
            strokes={holeHistory[hole.number]?.personal ?? []}
            par={hole.par}
          />
          <HistoryChips
            label="Scramble history on this hole"
            strokes={holeHistory[hole.number]?.scramble ?? []}
            par={hole.par}
          />
        </div>
      )}

      <div className="card">
        <h2>Leaderboard</h2>
        {isScramble ? (
          <div className="stack">
            {teamLeaderboard.map((team: RoundTeam) => (
              <div key={team.id} className="player-score-row">
                <div className="avatar">{initials(team.name)}</div>
                <div>
                  <div className="row-name">{team.name}</div>
                  <div className="row-meta">
                    {team.memberUserIds.map(nameFor).join(', ')} · {holesPlayed(team.scores)}/{round.course.holeCount} holes
                    {holesPlayed(team.putts) > 0 ? ` · ${totalPutts(team.putts)} putts` : ''}
                  </div>
                </div>
                <div>
                  <div className="stat">{totalStrokes(team.scores) || '—'}</div>
                  <div className="row-meta" style={{ textAlign: 'right' }}>
                    {holesPlayed(team.scores) > 0 ? formatToPar(toPar(team.scores, round.course.holes)) : ''}
                  </div>
                </div>
              </div>
            ))}
            {teamLeaderboard.length === 0 && <p className="tiny muted">No teams yet.</p>}
            {unassigned.length > 0 && (
              <p className="tiny muted">Not on a team yet: {unassigned.map((p) => p.name).join(', ')}</p>
            )}
          </div>
        ) : (
          <div className="stack">
            {playerLeaderboard.map((player) => (
              <div key={player.userId} className="player-score-row">
                <Avatar userId={player.userId} name={player.name} />
                <div>
                  <div className="row-name">{player.name}</div>
                  <div className="row-meta">
                    {holesPlayed(player.scores)}/{round.course.holeCount} holes
                    {holesPlayed(player.putts) > 0 ? ` · ${totalPutts(player.putts)} putts` : ''}
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
          </div>
        )}
        {round.players.some((p) => p.status === 'invited') && (
          <p className="tiny muted">
            Waiting on: {round.players.filter((p) => p.status === 'invited').map((p) => p.name).join(', ')}
          </p>
        )}
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

      {isCreator && (
        <div className="card">
          <button className="btn btn-full btn-ghost btn-danger" onClick={removeRound} disabled={deleting}>
            Delete round
          </button>
        </div>
      )}

      {copied && <div className="toast">Link copied</div>}
      {error && <div className="toast">{error}</div>}
      {deleteError && <div className="toast">{deleteError}</div>}
    </div>
  );
}
