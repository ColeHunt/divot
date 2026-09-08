import { useEffect, useState } from 'react';
import type { CourseRoundHistoryEntry, Hole, HoleTrend } from '@shared/types.js';
import { coursePar } from '@shared/scoring.js';
import { LineChart } from './LineChart.js';
import { HoleTrendChart } from './HoleTrendChart.js';
import { api } from '../lib/api.js';

const STROKES_COLOR = '#47c98a';
const PAR_COLOR = '#6b7d72';

/**
 * A course's score-over-time chart, with each completed round on the
 * x-axis — either the total score for the round, or (via the dropdown) one
 * hole's personal strokes-and-putts trend. Shared between the course page
 * and an individual round's page, since both know a course id and its holes
 * and want the exact same history.
 */
export function ScoreHistoryCard({ courseId, holes }: { courseId: string; holes: Hole[] }) {
  const [roundHistory, setRoundHistory] = useState<CourseRoundHistoryEntry[] | null>(null);
  const [historyView, setHistoryView] = useState<'total' | number>('total');
  const [holeTrends, setHoleTrends] = useState<Record<number, HoleTrend>>({});
  const [loadingHoleTrend, setLoadingHoleTrend] = useState(false);

  useEffect(() => {
    setRoundHistory(null);
    setHoleTrends({});
    setHistoryView('total');
    api.get<{ rounds: CourseRoundHistoryEntry[] }>(`/api/courses/${courseId}/round-history`).then((res) => setRoundHistory(res.rounds));
  }, [courseId]);

  // Fetches a hole's trend the first time it's selected, then keeps it cached
  // in holeTrends so flipping back and forth between holes doesn't re-fetch.
  useEffect(() => {
    if (historyView === 'total' || holeTrends[historyView]) return;
    setLoadingHoleTrend(true);
    api
      .get<{ trend: HoleTrend }>(`/api/courses/${courseId}/holes/${historyView}/trend`)
      .then((trendRes) => setHoleTrends((prev) => ({ ...prev, [historyView]: trendRes.trend })))
      .catch(() => {})
      .finally(() => setLoadingHoleTrend(false));
  }, [courseId, historyView, holeTrends]);

  // Nothing to chart yet (still loading, or no completed rounds here at all).
  if (!roundHistory || roundHistory.length === 0) return null;

  const selectedHoleTrend = typeof historyView === 'number' ? holeTrends[historyView] ?? null : null;
  const selectedHolePar = typeof historyView === 'number' ? holes.find((h) => h.number === historyView)?.par ?? 4 : 4;
  const noHoleHistoryYet =
    typeof historyView === 'number' && !loadingHoleTrend && (!selectedHoleTrend || selectedHoleTrend.personal.length === 0);

  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Score history</h2>
        <select
          value={historyView === 'total' ? 'total' : String(historyView)}
          onChange={(e) => setHistoryView(e.target.value === 'total' ? 'total' : Number(e.target.value))}
        >
          <option value="total">Total score</option>
          {holes.map((h) => (
            <option key={h.number} value={h.number}>
              Hole {h.number}
            </option>
          ))}
        </select>
      </div>
      <p className="tiny muted" style={{ marginTop: '0.2rem' }}>Each point is one round you've played here.</p>

      {historyView === 'total' ? (
        <div style={{ marginTop: '0.6rem' }}>
          <LineChart
            categories={roundHistory.map((r) =>
              new Date(r.playedAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            )}
            series={[
              { label: 'Strokes', color: STROKES_COLOR, values: roundHistory.map((r) => r.totalStrokes) },
              { label: 'Par', color: PAR_COLOR, dashed: true, values: roundHistory.map(() => coursePar(holes)) },
            ]}
            minZero
          />
        </div>
      ) : noHoleHistoryYet ? (
        <p className="tiny muted" style={{ marginTop: '0.6rem' }}>Not enough rounds yet.</p>
      ) : (
        <HoleTrendChart trend={selectedHoleTrend} par={selectedHolePar} loading={loadingHoleTrend} />
      )}
    </div>
  );
}
