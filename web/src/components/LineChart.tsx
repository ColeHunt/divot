export interface ChartSeries {
  label: string;
  color: string;
  dashed?: boolean;
  /** One entry per category, aligned by index. null leaves a gap in the line. */
  values: (number | null)[];
}

interface LineChartProps {
  categories: (string | number)[];
  series: ChartSeries[];
  height?: number;
  /** Include y=0 in the plotted range and draw a faint line at it — for a to-par chart. */
  zeroLine?: boolean;
}

const WIDTH = 600;
// Wide enough for a 4-5 character y-axis label (e.g. "-72.2") at the current
// .chart-axis-label font-size without its leading digit or minus sign
// clipping against the SVG's own left edge — the viewBox doesn't grow to fit
// overflowing text the way a normal block element would.
const PAD_LEFT = 60;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

/** Splits a values array into runs of consecutive non-null points, so a chart line breaks cleanly around missing holes instead of interpolating across them. */
function segments(values: (number | null)[]): Array<Array<{ i: number; v: number }>> {
  const runs: Array<Array<{ i: number; v: number }>> = [];
  let current: Array<{ i: number; v: number }> = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    current.push({ i, v });
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

/** A legend row matching a chart's series — solid/dashed swatch plus label. */
export function ChartLegend({ series }: { series: ChartSeries[] }) {
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

/** A small dependency-free SVG line chart — this app has no charting library, and the data here is tiny (one point per hole). */
export function LineChart({ categories, series, height = 200, zeroLine = false }: LineChartProps) {
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  let min = allValues.length > 0 ? Math.min(...allValues) : 0;
  let max = allValues.length > 0 ? Math.max(...allValues) : 1;
  if (zeroLine) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const pad = span * 0.15;
  min -= pad;
  max += pad;

  const xFor = (i: number) =>
    categories.length > 1 ? PAD_LEFT + (i / (categories.length - 1)) * plotWidth : PAD_LEFT + plotWidth / 2;
  const yFor = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotHeight;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) * i) / yTicks);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="line-chart" role="img">
      {tickValues.map((t) => (
        <g key={t}>
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} className="chart-gridline" />
          <text x={PAD_LEFT - 6} y={yFor(t)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
            {Math.round(t * 10) / 10}
          </text>
        </g>
      ))}

      {zeroLine && (
        <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(0)} y2={yFor(0)} className="chart-zero-line" />
      )}

      {categories.map((c, i) => (
        <text key={i} x={xFor(i)} y={height - 4} className="chart-axis-label" textAnchor="middle">
          {c}
        </text>
      ))}

      {series.map((s) =>
        segments(s.values).map((run, runIndex) => (
          <g key={`${s.label}-${runIndex}`}>
            <polyline
              points={run.map((p) => `${xFor(p.i)},${yFor(p.v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5,4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {run.map((p) => (
              <circle key={p.i} cx={xFor(p.i)} cy={yFor(p.v)} r={3} fill={s.color} />
            ))}
          </g>
        )),
      )}
    </svg>
  );
}
