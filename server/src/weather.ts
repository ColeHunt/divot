import type { WeatherSnapshot } from '../../shared/src/types.js';

/**
 * Client for Open-Meteo — free, no API key, no request quota for this app's
 * volume. Two endpoints are used: the geocoding API to turn a course's
 * free-text location into coordinates, and the forecast/archive APIs to look
 * up live or historical weather for those coordinates. Every function here
 * is best-effort: a network failure or unexpected response just yields
 * `null` rather than throwing, since weather is a nice-to-have overlay on
 * top of a round, never something that should block scoring a round.
 */

const FETCH_TIMEOUT_MS = 5000;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** WMO weather codes, as used by Open-Meteo's `weather_code` field. */
const CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with light hail',
  99: 'Thunderstorm with heavy hail',
};

function describeCode(code: unknown): string {
  return CONDITIONS[Number(code)] ?? 'Unknown';
}

function roundOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

/** Resolves a free-text address/course name to coordinates. Returns null if nothing matched or the lookup failed. */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  const data = await fetchJson(url);
  const result = data?.results?.[0];
  if (!result || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return null;

  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return { latitude: result.latitude, longitude: result.longitude, displayName: parts.join(', ') };
}

/** Current conditions at a location, fetched live on every call. */
export async function getLiveWeather(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,is_day` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const data = await fetchJson(url);
  const current = data?.current;
  const tempF = roundOrNull(current?.temperature_2m);
  if (tempF == null) return null;

  return {
    tempF,
    feelsLikeF: roundOrNull(current.apparent_temperature),
    windMph: roundOrNull(current.wind_speed_10m),
    condition: describeCode(current.weather_code),
    conditionCode: Number(current.weather_code),
    isDay: current.is_day === 1,
    observedAt: Date.now(),
  };
}

/**
 * Open-Meteo's historical archive dataset lags real time by a few days, so a
 * round completed more recently than that has to be looked up through the
 * regular forecast endpoint instead (which also serves the recent past).
 */
const ARCHIVE_CUTOFF_MS = 5 * 24 * 60 * 60 * 1000;

function isDaytime(localIso: string): boolean {
  const hour = Number(localIso.slice(11, 13));
  return hour >= 6 && hour < 20;
}

/** Weather at a location at a specific past time — the conditions during a completed round. Null if not available. */
export async function getHistoricalWeather(
  latitude: number,
  longitude: number,
  atMs: number,
): Promise<WeatherSnapshot | null> {
  const date = new Date(atMs).toISOString().slice(0, 10);
  const useForecastArchive = Date.now() - atMs < ARCHIVE_CUTOFF_MS;
  const base = useForecastArchive
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/archive';
  const url =
    `${base}?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}` +
    `&hourly=temperature_2m,apparent_temperature,wind_speed_10m,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const data = await fetchJson(url);
  const hourly = data?.hourly;
  const times: string[] | undefined = hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return null;

  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i += 1) {
    const diff = Math.abs(new Date(times[i]!).getTime() - atMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  const tempF = roundOrNull(hourly.temperature_2m?.[bestIndex]);
  if (tempF == null) return null;

  return {
    tempF,
    feelsLikeF: roundOrNull(hourly.apparent_temperature?.[bestIndex]),
    windMph: roundOrNull(hourly.wind_speed_10m?.[bestIndex]),
    condition: describeCode(hourly.weather_code?.[bestIndex]),
    conditionCode: Number(hourly.weather_code?.[bestIndex]),
    isDay: isDaytime(times[bestIndex]!),
    observedAt: atMs,
  };
}
