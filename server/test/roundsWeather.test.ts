import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { createCourse, updateCourse } from '../src/courses.js';
import { attachRoundWeather, completeRound, createRound, getRoundState } from '../src/rounds.js';

vi.mock('../src/weather.js', () => ({
  getHistoricalWeather: vi.fn(),
}));

import { getHistoricalWeather } from '../src/weather.js';

const mockedGetHistoricalWeather = vi.mocked(getHistoricalWeather);

let alice: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
  mockedGetHistoricalWeather.mockReset();
});

describe('attachRoundWeather', () => {
  it('caches the weather for a completed round on a course with coordinates', async () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 36.57, -121.95);
    const { code } = createRound(alice, { courseId: course.id });
    completeRound(code, alice);

    mockedGetHistoricalWeather.mockResolvedValue({
      tempF: 68,
      feelsLikeF: 66,
      windMph: 5,
      condition: 'Mainly clear',
      conditionCode: 1,
      isDay: true,
      observedAt: Date.now(),
    });

    await attachRoundWeather(code);

    expect(mockedGetHistoricalWeather).toHaveBeenCalledTimes(1);
    expect(getRoundState(code).weather).toMatchObject({ tempF: 68, condition: 'Mainly clear' });
  });

  it('does nothing for a course with no coordinates', async () => {
    const course = createCourse(alice, 'No Coords GC', null, [{ number: 1, par: 4 }]);
    const { code } = createRound(alice, { courseId: course.id });
    completeRound(code, alice);

    await attachRoundWeather(code);

    expect(mockedGetHistoricalWeather).not.toHaveBeenCalled();
    expect(getRoundState(code).weather).toBeNull();
  });

  it('only fetches once, even if called again', async () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 36.57, -121.95);
    const { code } = createRound(alice, { courseId: course.id });
    completeRound(code, alice);
    mockedGetHistoricalWeather.mockResolvedValue({
      tempF: 68,
      feelsLikeF: 66,
      windMph: 5,
      condition: 'Mainly clear',
      conditionCode: 1,
      isDay: true,
      observedAt: Date.now(),
    });

    await attachRoundWeather(code);
    await attachRoundWeather(code);

    expect(mockedGetHistoricalWeather).toHaveBeenCalledTimes(1);
  });

  it('leaves weather null if the lookup fails', async () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 36.57, -121.95);
    const { code } = createRound(alice, { courseId: course.id });
    completeRound(code, alice);
    mockedGetHistoricalWeather.mockResolvedValue(null);

    await attachRoundWeather(code);

    expect(getRoundState(code).weather).toBeNull();
  });

  it('does nothing for a round that has not been completed', async () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 36.57, -121.95);
    const { code } = createRound(alice, { courseId: course.id });

    await attachRoundWeather(code);

    expect(mockedGetHistoricalWeather).not.toHaveBeenCalled();
  });
});

describe('course coordinates', () => {
  it('round-trips through createCourse and updateCourse', () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 36.57, -121.95);
    expect(course.latitude).toBe(36.57);
    expect(course.longitude).toBe(-121.95);

    const updated = updateCourse(course.id, course.name, 'Pebble Beach, CA', [{ number: 1, par: 4 }], 40.1, -74.2);
    expect(updated.latitude).toBe(40.1);
    expect(updated.longitude).toBe(-74.2);
  });

  it('rejects out-of-range coordinates as null rather than throwing', () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }], 999, -999);
    expect(course.latitude).toBeNull();
    expect(course.longitude).toBeNull();
  });
});
