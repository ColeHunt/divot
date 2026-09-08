import type { HoleTrend } from '@shared/types.js';
import { ChartLegend, LineChart, type ChartSeries } from './LineChart.js';

const STROKES_COLOR = '#47c98a';
const PUTTS_COLOR = '#f2b134';
const PAR_COLOR = '#6b7d72';

/** Strokes-and-putts trend on one hole across past personal rounds, oldest first — x-axis is rounds played. */
export function HoleTrendChart({ trend, par, loading }: { trend: HoleTrend | null; par: number; loading: boolean }) {
  if (loading) return <p className="tiny muted" style={{ marginTop: '0.6rem' }}>Loading…</p>;
  if (!trend || trend.personal.length === 0) return null;

  const categories = trend.personal.map((e) => new Date(e.playedAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));
  const series: ChartSeries[] = [
    { label: 'Strokes', color: STROKES_COLOR, values: trend.personal.map((e) => e.strokes) },
    { label: 'Putts', color: PUTTS_COLOR, values: trend.personal.map((e) => e.putts) },
    { label: 'Par', color: PAR_COLOR, dashed: true, values: trend.personal.map(() => par) },
  ];

  return (
    <div style={{ marginTop: '0.8rem' }}>
      <LineChart categories={categories} series={series} height={160} minZero />
      <ChartLegend series={series} />
    </div>
  );
}
