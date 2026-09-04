import { useEffect, useState } from 'react';
import type { Course, CourseStats as CourseStatsData, Hole } from '@shared/types.js';
import { formatToPar } from '@shared/scoring.js';
import { LineChart, type ChartSeries } from '../components/LineChart.js';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

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

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <div key={s.label} className="chart-legend-item">
          <span
            className="chart-legend-swatch"
            style={{ borderTopColor: s.color, borderTopStyle: s.dashed ? 'dashed' : 'solid' }}
          />
          {s.label}
        </div>
      ))}
    </div>
  );
}

export function CourseStats({ id }: { id: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [stats, setStats] = useState<CourseStatsData | null>(null);

  useEffect(() => {
    setCourse(null);
    setStats(null);
    Promise.all([
      api.get<{ course: Course }>(`/api/courses/${id}`),
      api.get<CourseStatsData>(`/api/courses/${id}/stats`),
    ]).then(([courseRes, statsRes]) => {
      setCourse(courseRes.course);
      setStats(statsRes);
    });
  }, [id]);

  if (!course || !stats) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const holes = course.holes;
  const categories = holes.map((h) => h.number);
  const sameRound = Boolean(
    stats.bestRound && stats.lastRound && stats.bestRound.roundId === stats.lastRound.roundId,
  );

  const strokesSeries: ChartSeries[] = [];
  const toParSeries: ChartSeries[] = [];

  function addRoundSeries(label: string, color: string, scores: Record<number, number>) {
    strokesSeries.push({ label, color, values: cumulative(holes, scores, false) });
    toParSeries.push({ label, color, values: cumulative(holes, scores, true) });
  }

  if (sameRound) {
    addRoundSeries('Your round', BEST_COLOR, stats.lastRound!.scores);
  } else {
    if (stats.bestRound) addRoundSeries('Best round', BEST_COLOR, stats.bestRound.scores);
    if (stats.lastRound) addRoundSeries('Last round', LAST_COLOR, stats.lastRound.scores);
  }
  if (strokesSeries.length > 0) {
    strokesSeries.push({ label: 'Par pace', color: PAR_COLOR, dashed: true, values: cumulativePar(holes) });
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate(`/courses/${id}`)}>
          ← {course.name}
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Stats</h1>
        <p className="muted">{course.name}</p>
      </div>

      {stats.roundsPlayed === 0 ? (
        <div className="card">
          <p className="tiny muted" style={{ textAlign: 'center' }}>
            Finish a round here to start seeing your stats.
          </p>
        </div>
      ) : (
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
            <Legend series={strokesSeries} />
          </div>

          <div className="card">
            <h2>Cumulative score to par</h2>
            <LineChart categories={categories} series={toParSeries} zeroLine />
            <Legend series={toParSeries} />
          </div>

          <p className="tiny muted" style={{ textAlign: 'center' }}>
            {stats.roundsPlayed} round{stats.roundsPlayed === 1 ? '' : 's'} played here.
          </p>
        </>
      )}
    </div>
  );
}
