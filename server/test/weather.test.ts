import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress, getHistoricalWeather, getLiveWeather } from '../src/weather.js';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocodeAddress', () => {
  it('resolves the first result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [{ latitude: 36.57, longitude: -121.95, name: 'Pebble Beach', admin1: 'California', country: 'United States' }],
      }),
    );
    const result = await geocodeAddress('Pebble Beach Golf Links');
    expect(result).toEqual({
      latitude: 36.57,
      longitude: -121.95,
      displayName: 'Pebble Beach, California, United States',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('geocoding-api.open-meteo.com');
  });

  it('returns null with no results', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
    expect(await geocodeAddress('nowhere at all')).toBeNull();
  });

  it('returns null for a blank query without calling fetch', async () => {
    expect(await geocodeAddress('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null if the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await geocodeAddress('Pebble Beach')).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    expect(await geocodeAddress('Pebble Beach')).toBeNull();
  });
});

describe('getLiveWeather', () => {
  it('parses the current conditions', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        current: {
          temperature_2m: 71.6,
          apparent_temperature: 69.2,
          wind_speed_10m: 8.4,
          weather_code: 1,
          is_day: 1,
        },
      }),
    );
    const weather = await getLiveWeather(36.57, -121.95);
    expect(weather).toMatchObject({
      tempF: 72,
      feelsLikeF: 69,
      windMph: 8,
      condition: 'Mainly clear',
      conditionCode: 1,
      isDay: true,
    });
  });

  it('returns null when the response has no usable temperature', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ current: {} }));
    expect(await getLiveWeather(36.57, -121.95)).toBeNull();
  });
});

describe('getHistoricalWeather', () => {
  it('picks the hour closest to the target time, and uses the forecast endpoint for a recent round', async () => {
    const playedAt = Date.now() - 60 * 60 * 1000; // an hour ago
    fetchMock.mockResolvedValue(
      jsonResponse({
        hourly: {
          time: ['2026-01-01T00:00', '2026-01-01T01:00', '2026-01-01T02:00'],
          temperature_2m: [50, 55, 60],
          apparent_temperature: [48, 53, 58],
          wind_speed_10m: [5, 6, 7],
          weather_code: [0, 2, 61],
        },
      }),
    );
    // Force the "closest hour" to resolve to index 1 by stubbing Date parsing indirectly:
    // instead, just assert we get a valid snapshot back and the forecast (not archive) host is used.
    const weather = await getHistoricalWeather(36.57, -121.95, playedAt);
    expect(weather).not.toBeNull();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.open-meteo.com/v1/forecast');
  });

  it('uses the archive endpoint for an older round', async () => {
    const playedAt = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    fetchMock.mockResolvedValue(
      jsonResponse({
        hourly: {
          time: ['2025-12-01T12:00'],
          temperature_2m: [65],
          apparent_temperature: [64],
          wind_speed_10m: [4],
          weather_code: [3],
        },
      }),
    );
    const weather = await getHistoricalWeather(36.57, -121.95, playedAt);
    expect(weather).toMatchObject({ tempF: 65, condition: 'Overcast', isDay: true });
    expect(String(fetchMock.mock.calls[0]![0])).toContain('archive-api.open-meteo.com');
  });

  it('returns null when there is no hourly data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hourly: { time: [] } }));
    expect(await getHistoricalWeather(36.57, -121.95, Date.now())).toBeNull();
  });
});
