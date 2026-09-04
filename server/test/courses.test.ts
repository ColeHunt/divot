import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { completeRound, createRound, setScore } from '../src/rounds.js';
import {
  CourseError,
  createCourse,
  deleteCourse,
  getCourseStats,
  getHoleHistory,
  getLastRound,
  isSaved,
  listSavedCourses,
  saveCourse,
  searchCourses,
  unsaveCourse,
  updateCourse,
} from '../src/courses.js';

let alice: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  alice = register('alice@example.com', 'password1', 'Alice').id;
});

describe('createCourse', () => {
  it('stores holes sorted by number', () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [
      { number: 2, par: 3 },
      { number: 1, par: 4, yardage: 380 },
    ]);
    expect(course.holes.map((h) => h.number)).toEqual([1, 2]);
    expect(course.holeCount).toBe(2);
    expect(course.holes[0]!.yardage).toBe(380);
  });

  it('rejects a course with no holes', () => {
    expect(() => createCourse(alice, 'Empty', null, [])).toThrow(CourseError);
  });

  it('rejects an out-of-range par', () => {
    expect(() => createCourse(alice, 'Bad', null, [{ number: 1, par: 12 }])).toThrow(CourseError);
  });

  it('rejects a blank name', () => {
    expect(() => createCourse(alice, '  ', null, [{ number: 1, par: 4 }])).toThrow(CourseError);
  });
});

describe('searchCourses', () => {
  it('matches by name or location, case-insensitively', () => {
    createCourse(alice, 'Pebble Creek', 'Monterey', [{ number: 1, par: 4 }]);
    createCourse(alice, 'Torrey Pines', 'San Diego', [{ number: 1, par: 4 }]);
    expect(searchCourses('pebble').map((c) => c.name)).toEqual(['Pebble Creek']);
    expect(searchCourses('diego').map((c) => c.name)).toEqual(['Torrey Pines']);
    expect(searchCourses('').length).toBe(2);
  });
});

describe('saved courses', () => {
  it('save/unsave is idempotent and reflected in isSaved', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    expect(isSaved(alice, course.id)).toBe(false);
    saveCourse(alice, course.id);
    saveCourse(alice, course.id);
    expect(isSaved(alice, course.id)).toBe(true);
    expect(listSavedCourses(alice).map((c) => c.id)).toEqual([course.id]);
    unsaveCourse(alice, course.id);
    expect(isSaved(alice, course.id)).toBe(false);
  });
});

describe('getLastRound', () => {
  it('is null until a round on that course is completed', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);
    expect(getLastRound(alice, course.id)).toBeNull();

    const { code } = createRound(alice, { courseId: course.id });
    setScore(code, alice, 1, 5);
    setScore(code, alice, 2, 3);
    expect(getLastRound(alice, course.id)).toBeNull(); // still active

    completeRound(code, alice);
    const last = getLastRound(alice, course.id);
    expect(last?.totalStrokes).toBe(8);
    expect(last?.toPar).toBe(1);
    expect(last?.scores).toEqual({ 1: 5, 2: 3 });
  });

  it('returns the most recently completed round when there are several', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);

    const first = createRound(alice, { courseId: course.id }, 1000);
    setScore(first.code, alice, 1, 5, 1000);
    completeRound(first.code, alice, 2000);

    const second = createRound(alice, { courseId: course.id }, 3000);
    setScore(second.code, alice, 1, 3, 3000);
    completeRound(second.code, alice, 4000);

    expect(getLastRound(alice, course.id)?.code).toBe(second.code);
  });

  it('resolves through a team scorecard for a scramble round', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);

    const { code } = createRound(alice, { courseId: course.id, format: 'scramble' });
    setScore(code, alice, 1, 5);
    setScore(code, alice, 2, 4);
    completeRound(code, alice);

    const last = getLastRound(alice, course.id);
    expect(last?.totalStrokes).toBe(9);
    expect(last?.scores).toEqual({ 1: 5, 2: 4 });
  });
});

describe('getCourseStats', () => {
  it('is all nulls with zero rounds played', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    expect(getCourseStats(alice, course.id)).toEqual({ roundsPlayed: 0, bestRound: null, lastRound: null });
  });

  it('reports the same round as both best and last when there is only one', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);
    const { code } = createRound(alice, { courseId: course.id });
    setScore(code, alice, 1, 5);
    setScore(code, alice, 2, 4);
    completeRound(code, alice);

    const stats = getCourseStats(alice, course.id);
    expect(stats.roundsPlayed).toBe(1);
    expect(stats.bestRound?.code).toBe(code);
    expect(stats.lastRound?.code).toBe(code);
    expect(stats.bestRound?.totalStrokes).toBe(9);
  });

  it('picks the lowest-scoring round as best even when it is not the most recent', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);

    const great = createRound(alice, { courseId: course.id }, 1000);
    setScore(great.code, alice, 1, 3, 1000);
    completeRound(great.code, alice, 2000);

    const mediocre = createRound(alice, { courseId: course.id }, 3000);
    setScore(mediocre.code, alice, 1, 6, 3000);
    completeRound(mediocre.code, alice, 4000);

    const stats = getCourseStats(alice, course.id);
    expect(stats.roundsPlayed).toBe(2);
    expect(stats.bestRound?.code).toBe(great.code);
    expect(stats.lastRound?.code).toBe(mediocre.code);
  });

  it('excludes an unscored round from "best" but still surfaces it as "last"', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);

    const scored = createRound(alice, { courseId: course.id }, 1000);
    setScore(scored.code, alice, 1, 5, 1000);
    completeRound(scored.code, alice, 2000);

    const blank = createRound(alice, { courseId: course.id }, 3000);
    completeRound(blank.code, alice, 4000);

    const stats = getCourseStats(alice, course.id);
    expect(stats.bestRound?.code).toBe(scored.code);
    expect(stats.lastRound?.code).toBe(blank.code);
  });

  it('only counts completed rounds', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    const { code } = createRound(alice, { courseId: course.id });
    setScore(code, alice, 1, 4);
    expect(getCourseStats(alice, course.id)).toEqual({ roundsPlayed: 0, bestRound: null, lastRound: null });
  });
});

describe('getHoleHistory', () => {
  it('is empty with no completed rounds', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);
    expect(getHoleHistory(alice, course.id)).toEqual({});
  });

  it('collects past strokes per hole, most recent round first', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);

    const first = createRound(alice, { courseId: course.id }, 1000);
    setScore(first.code, alice, 1, 5, 1000);
    setScore(first.code, alice, 2, 3, 1000);
    completeRound(first.code, alice, 2000);

    const second = createRound(alice, { courseId: course.id }, 3000);
    setScore(second.code, alice, 1, 4, 3000);
    completeRound(second.code, alice, 4000);

    expect(getHoleHistory(alice, course.id)).toEqual({
      1: { personal: [4, 5], scramble: [] },
      2: { personal: [3], scramble: [] },
    });
  });

  it('excludes the given round id, e.g. the one currently being played', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);

    const past = createRound(alice, { courseId: course.id }, 1000);
    setScore(past.code, alice, 1, 5, 1000);
    completeRound(past.code, alice, 2000);

    const current = createRound(alice, { courseId: course.id }, 3000);
    setScore(current.code, alice, 1, 3, 3000);

    expect(getHoleHistory(alice, course.id, current.id)).toEqual({
      1: { personal: [5], scramble: [] },
    });
  });

  it('caps history per hole at 5 entries', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    for (let i = 0; i < 7; i += 1) {
      const round = createRound(alice, { courseId: course.id }, 1000 + i);
      setScore(round.code, alice, 1, 4, 1000 + i);
      completeRound(round.code, alice, 1000 + i);
    }
    expect(getHoleHistory(alice, course.id)[1]!.personal).toHaveLength(5);
  });

  it('only counts completed rounds', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    const { code } = createRound(alice, { courseId: course.id });
    setScore(code, alice, 1, 4);
    expect(getHoleHistory(alice, course.id)).toEqual({});
  });

  it('resolves through a team scorecard for a past scramble round, kept separate from personal history', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [
      { number: 1, par: 4 },
      { number: 2, par: 3 },
    ]);

    const solo = createRound(alice, { courseId: course.id }, 1000);
    setScore(solo.code, alice, 1, 6, 1000);
    completeRound(solo.code, alice, 2000);

    const scramble = createRound(alice, { courseId: course.id, format: 'scramble' }, 3000);
    setScore(scramble.code, alice, 1, 5, 3000);
    setScore(scramble.code, alice, 2, 4, 3000);
    completeRound(scramble.code, alice, 4000);

    expect(getHoleHistory(alice, course.id)).toEqual({
      1: { personal: [6], scramble: [5] },
      2: { personal: [], scramble: [4] },
    });
  });
});

describe('updateCourse', () => {
  it('replaces name, location and the full hole list', () => {
    const course = createCourse(alice, 'Pebble Creek', 'CA', [{ number: 1, par: 4 }]);
    const updated = updateCourse(course.id, 'Pebble Creek GC', 'Pebble Beach, CA', [
      { number: 1, par: 5, yardage: 520 },
      { number: 2, par: 3 },
    ]);
    expect(updated.name).toBe('Pebble Creek GC');
    expect(updated.location).toBe('Pebble Beach, CA');
    expect(updated.holeCount).toBe(2);
    expect(updated.holes).toEqual([
      { number: 1, par: 5, yardage: 520 },
      { number: 2, par: 3, yardage: null },
    ]);
  });

  it('rejects an unknown course', () => {
    expect(() => updateCourse('nope', 'Name', null, [{ number: 1, par: 4 }])).toThrow(CourseError);
  });

  it('validates the same as creation', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    expect(() => updateCourse(course.id, '  ', null, [{ number: 1, par: 4 }])).toThrow(CourseError);
    expect(() => updateCourse(course.id, 'Name', null, [])).toThrow(CourseError);
  });
});

describe('deleteCourse', () => {
  it('removes a course with no rounds played on it', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    deleteCourse(course.id);
    expect(() => updateCourse(course.id, 'x', null, [{ number: 1, par: 4 }])).toThrow(CourseError);
  });

  it('refuses to delete a course with round history, without deleting anything', () => {
    const course = createCourse(alice, 'Pebble Creek', null, [{ number: 1, par: 4 }]);
    createRound(alice, { courseId: course.id });
    expect(() => deleteCourse(course.id)).toThrow(CourseError);
    // still there afterward — the attempt didn't partially apply
    expect(() => updateCourse(course.id, 'still here', null, [{ number: 1, par: 4 }])).not.toThrow();
  });

  it('rejects an unknown course', () => {
    expect(() => deleteCourse('nope')).toThrow(CourseError);
  });
});
