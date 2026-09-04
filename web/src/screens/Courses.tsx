import { useEffect, useState } from 'react';
import type { CourseSummary, SavedCourse } from '@shared/types.js';
import { formatToPar } from '@shared/scoring.js';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

export function Courses() {
  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ courses: SavedCourse[] }>('/api/courses/saved')
      .then((res) => setSaved(res.courses))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      api
        .get<{ courses: CourseSummary[] }>(`/api/courses/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => setResults(res.courses))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const savedIds = new Set(saved.map((c) => c.id));

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Courses</span>
        <button className="btn btn-sm btn-primary" onClick={() => navigate('/courses/new')}>
          + Add
        </button>
      </div>

      <div className="card">
        <h2>Saved courses</h2>
        {loading ? (
          <p className="muted tiny">Loading…</p>
        ) : saved.length === 0 ? (
          <p className="muted tiny">Save a course below to quick-load its pars next time.</p>
        ) : (
          <div className="stack">
            {saved.map((course) => (
              <button
                key={course.id}
                className="btn btn-ghost btn-full row between"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                <span>
                  <span className="row-name">{course.name}</span>
                  {course.location && <span className="tiny muted"> · {course.location}</span>}
                </span>
                <span className="tiny muted">
                  {course.lastPlayed
                    ? `${course.lastPlayed.totalStrokes} (${formatToPar(course.lastPlayed.toPar)})`
                    : `${course.holeCount} holes`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Find a course</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all courses" />
        <div className="stack" style={{ marginTop: '0.6rem' }}>
          {results
            .filter((c) => !savedIds.has(c.id))
            .map((course) => (
              <button
                key={course.id}
                className="btn btn-ghost btn-full row between"
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                <span>
                  <span className="row-name">{course.name}</span>
                  {course.location && <span className="tiny muted"> · {course.location}</span>}
                </span>
                <span className="tiny muted">{course.holeCount} holes</span>
              </button>
            ))}
          {results.length === 0 && (
            <p className="tiny muted">
              {query.trim() ? 'No courses match that search.' : 'Nothing in the library yet — add one.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
