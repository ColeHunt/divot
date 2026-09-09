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
  /** Clamp the y-axis floor to 0 after padding — for a quantity that can never
   *  go negative, like cumulative strokes, so the bottom tick can't imply a
   *  value the data could never actually reach. */
  minZero?: boolean;
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

/** Rounds `value` to a "nice" 1/2/5×10ⁿ number, the classic axis-tick-step trick — avoids ticks like 53/57.5/62.1. */
function niceNumber(value: number, round: boolean): number {
  if (!(value > 0)) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = round
    ? fraction < 1.5
      ? 1
      : fraction < 3
        ? 2
        : fraction < 7
          ? 5
          : 10
    : fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 5
          ? 5
          : 10;
  return niceFraction * 10 ** exponent;
}

/** A "nice" axis range and evenly-spaced tick values for it — e.g. 50/55/60 rather than 53/57.5/62.1. */
function niceScale(rawMin: number, rawMax: number, targetTicks: number): { min: number; max: number; ticks: number[] } {
  const step = niceNumber(niceNumber(rawMax - rawMin, false) / (targetTicks - 1), true);
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min, max, ticks };
}

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
export function LineChart({ categories, series, height = 200, zeroLine = false, minZero = false }: LineChartProps) {
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  let rawMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  let rawMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  if (zeroLine) {
    rawMin = Math.min(rawMin, 0);
    rawMax = Math.max(rawMax, 0);
  }
  if (rawMin === rawMax) {
    rawMin -= 1;
    rawMax += 1;
  }

  const { min, max, ticks: rawTicks } = niceScale(rawMin, rawMax, 5);
  const axisMin = minZero ? Math.max(min, 0) : min;
  const tickValues = rawTicks.filter((t) => t >= axisMin);

  const xFor = (i: number) =>
    categories.length > 1 ? PAD_LEFT + (i / (categories.length - 1)) * plotWidth : PAD_LEFT + plotWidth / 2;
  const yFor = (v: number) => PAD_TOP + (1 - (v - axisMin) / (max - axisMin)) * plotHeight;

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

      {categories.map((c, i) => {
        // The first/last label anchors to start/end rather than centering on
        // its point, so it stays inside the viewBox instead of overhanging
        // the edge and getting clipped.
        const anchor =
          categories.length <= 1 ? 'middle' : i === 0 ? 'start' : i === categories.length - 1 ? 'end' : 'middle';
        return (
          <text key={i} x={xFor(i)} y={height - 4} className="chart-axis-label" textAnchor={anchor}>
            {c}
          </text>
        );
      })}

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
