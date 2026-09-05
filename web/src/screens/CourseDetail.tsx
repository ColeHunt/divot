import { useEffect, useState, type CSSProperties } from 'react';
import type { Course, CourseStats, Hole, LastRound } from '@shared/types.js';
import { coursePar, formatToPar } from '@shared/scoring.js';
import { ChartLegend, LineChart, type ChartSeries } from '../components/LineChart.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

interface DetailResponse {
  course: Course;
  saved: boolean;
  lastRound: LastRound | null;
}

const BEST_COLOR = '#47c98a';
const LAST_COLOR = '#f2b134';
const PAR_COLOR = '#6b7d72';

/**
 * Running total through each hole — strokes if `useToPar` is false, strokes
 * minus par (how far over/under) if true. A hole with no score (not part of
 * this round's selection, e.g. a front-9 round) leaves a gap rather than
 * resetting the total, so the line picks back up from wherever it left off.
 */
function cumulative(holes: Hole[], scores: Record<number, number>, useToPar: boolean): (number | null)[] {
  let sum = 0;
  let any = false;
  return holes.map((h) => {
    const strokes = scores[h.number];
    if (strokes == null) return any ? sum : null;
    any = true;
    sum += useToPar ? strokes - h.par : strokes;
    return sum;
  });
}

/** The running "even par" pace line — cumulative par through each hole, regardless of what was actually played. */
function cumulativePar(holes: Hole[]): number[] {
  let sum = 0;
  return holes.map((h) => {
    sum += h.par;
    return sum;
  });
}


export function CourseDetail({ id }: { id: string }) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [stats, setStats] = useState<CourseStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setStats(null);
    api.get<DetailResponse>(`/api/courses/${id}`).then(setData);
    api.get<CourseStats>(`/api/courses/${id}/stats`).then(setStats);
  }, [id]);

  async function toggleSave() {
    if (!data) return;
    setBusy(true);
    try {
      if (data.saved) {
        await api.delete(`/api/courses/${id}/save`);
      } else {
        await api.post(`/api/courses/${id}/save`);
      }
      setData({ ...data, saved: !data.saved });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!data) return;
    if (!window.confirm(`Delete ${data.course.name}? This can't be undone.`)) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/courses/${id}`);
      navigate('/courses');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete this course');
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const { course, lastRound } = data;
  const holes = course.holes;
  const categories = holes.map((h) => h.number);
  const showYardage = holes.some((h) => h.yardage);
  const scorecardColumns = 2 + (showYardage ? 1 : 0) + (lastRound ? 1 : 0);
  const sameRound = Boolean(
    stats?.bestRound && stats?.lastRound && stats.bestRound.roundId === stats.lastRound.roundId,
  );

  const strokesSeries: ChartSeries[] = [];
  const toParSeries: ChartSeries[] = [];

  function addRoundSeries(label: string, color: string, scores: Record<number, number>) {
    strokesSeries.push({ label, color, values: cumulative(holes, scores, false) });
    toParSeries.push({ label, color, values: cumulative(holes, scores, true) });
  }

  if (stats && stats.roundsPlayed > 0) {
    if (sameRound) {
      addRoundSeries('Your round', BEST_COLOR, stats.lastRound!.scores);
    } else {
      if (stats.bestRound) addRoundSeries('Best round', BEST_COLOR, stats.bestRound.scores);
      if (stats.lastRound) addRoundSeries('Last round', LAST_COLOR, stats.lastRound.scores);
    }
    strokesSeries.push({ label: 'Par pace', color: PAR_COLOR, dashed: true, values: cumulativePar(holes) });
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/courses')}>
          ← Courses
        </button>
        {isAdmin && (
          <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate(`/courses/${course.id}/edit`)}>
            Edit
          </button>
        )}
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>{course.name}</h1>
        {course.location && <p className="muted">{course.location}</p>}
        <p className="tiny muted">{course.holeCount} holes · par {coursePar(course.holes)}</p>
      </div>

      {stats && stats.roundsPlayed > 0 && (
        <>
          <div className="card stat-pair">
            {sameRound ? (
              <div>
                <div className="row-meta">Your only round</div>
                <div className="row-name">{stats.lastRound!.totalStrokes} strokes</div>
                <span className="badge badge-accent">{formatToPar(stats.lastRound!.toPar)}</span>
              </div>
            ) : (
              <>
                {stats.bestRound && (
                  <div>
                    <div className="row-meta">Best round</div>
                    <div className="row-name">{stats.bestRound.totalStrokes} strokes</div>
                    <span className="badge badge-accent">{formatToPar(stats.bestRound.toPar)}</span>
                  </div>
                )}
                {stats.lastRound && (
                  <div>
                    <div className="row-meta">Last round</div>
                    <div className="row-name">{stats.lastRound.totalStrokes} strokes</div>
                    <span className="badge badge-muted">{formatToPar(stats.lastRound.toPar)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <h2>Cumulative strokes</h2>
            <LineChart categories={categories} series={strokesSeries} />
            <ChartLegend series={strokesSeries} />
          </div>

          <div className="card">
            <h2>Cumulative score to par</h2>
            <LineChart categories={categories} series={toParSeries} zeroLine />
            <ChartLegend series={toParSeries} />
          </div>

          <p className="tiny muted" style={{ textAlign: 'center' }}>
            {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} played here.
          </p>
        </>
      )}

      <div className="card stack">
        <button className="btn btn-primary btn-full" onClick={() => navigate(`/round/new?course=${course.id}`)}>
          Start a round here
        </button>
        <button className="btn btn-full" onClick={toggleSave} disabled={busy}>
          {data.saved ? 'Remove from your courses' : 'Save to your courses'}
        </button>
      </div>

      {isAdmin && (
        <div className="card">
          <button className="btn btn-full btn-ghost btn-danger" onClick={remove} disabled={busy}>
            Delete course
          </button>
          {deleteError && <p className="tiny" style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{deleteError}</p>}
        </div>
      )}

      <div className="card">
        <h2>Scorecard</h2>
        <div className="stack" style={{ '--scorecard-cols': scorecardColumns } as CSSProperties}>
          <div className="scorecard-row scorecard-head">
            <span>Hole</span>
            <span>Par</span>
            {showYardage && <span>Yds</span>}
            {lastRound && <span>Last</span>}
          </div>
          {course.holes.map((h) => (
            <div className="scorecard-row" key={h.number}>
              <span>{h.number}</span>
              <span>{h.par}</span>
              {showYardage && <span>{h.yardage ?? '—'}</span>}
              {lastRound && <span>{lastRound.scores[h.number] ?? '—'}</span>}
            </div>
          ))}
          <div className="scorecard-row scorecard-total">
            <span>Total</span>
            <span>{coursePar(course.holes)}</span>
            {showYardage && <span>{course.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0) || '—'}</span>}
            {lastRound && <span>{lastRound.totalStrokes}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
