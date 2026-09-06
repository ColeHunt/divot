import type { WeatherSnapshot } from '@shared/types.js';

/** A rough icon per WMO weather code (shared/src/weather.ts on the server uses the same codes). */
const ICON_BY_CODE: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

function iconFor(weather: WeatherSnapshot): string {
  if (!weather.isDay && weather.conditionCode <= 1) return '🌙';
  return ICON_BY_CODE[weather.conditionCode] ?? '🌡️';
}

/** A compact "72°F · Partly cloudy" pill, used for both a course's live weather and a round's cached-at-completion weather. */
export function WeatherChip({ weather, label }: { weather: WeatherSnapshot; label?: string }) {
  return (
    <span className="chip" title={weather.condition}>
      <span aria-hidden="true">{iconFor(weather)}</span>
      <span>
        {label ? `${label} ` : ''}
        {weather.tempF}°F · {weather.condition}
        {weather.windMph != null ? ` · ${weather.windMph} mph wind` : ''}
      </span>
    </span>
  );
}
