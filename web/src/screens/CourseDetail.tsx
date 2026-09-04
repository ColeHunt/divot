import { useEffect, useState } from 'react';
import type { Course, LastRound } from '@shared/types.js';
import { coursePar, formatToPar } from '@shared/scoring.js';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

interface DetailResponse {
  course: Course;
  saved: boolean;
  lastRound: LastRound | null;
}

export function CourseDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    api.get<DetailResponse>(`/api/courses/${id}`).then(setData);
  }, [id]);

  async function toggleSave() {
    if (!data) return;
    setBusy(true);
    try {
      if (data.saved) {
        await api.delete(`/api/courses/${id}/save`);
      } else {
        await api.post(`/api/courses/${id}/save`);
      }
      setData({ ...data, saved: !data.saved });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="app">
        <div className="center-screen">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const { course, lastRound } = data;

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/courses')}>
          ← Courses
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>{course.name}</h1>
        {course.location && <p className="muted">{course.location}</p>}
        <p className="tiny muted">{course.holeCount} holes · par {coursePar(course.holes)}</p>
      </div>

      <div className="card stack">
        <button className="btn btn-primary btn-full" onClick={() => navigate(`/round/new?course=${course.id}`)}>
          Start a round here
        </button>
        <button className="btn btn-full" onClick={toggleSave} disabled={busy}>
          {data.saved ? 'Remove from your courses' : 'Save to your courses'}
        </button>
      </div>

      {lastRound && (
        <div className="card">
          <h2>Your last round</h2>
          <div className="row between">
            <span className="row-name">{lastRound.totalStrokes} strokes</span>
            <span className="badge badge-accent">{formatToPar(lastRound.toPar)}</span>
          </div>
          <p className="tiny muted">{new Date(lastRound.playedAt).toLocaleDateString()}</p>
        </div>
      )}

      <div className="card">
        <h2>Scorecard</h2>
        <div className="scorecard">
          <table>
            <thead>
              <tr>
                <th>Hole</th>
                {course.holes.map((h) => (
                  <th key={h.number}>{h.number}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Par</td>
                {course.holes.map((h) => (
                  <td key={h.number}>{h.par}</td>
                ))}
                <td>{coursePar(course.holes)}</td>
              </tr>
              {course.holes.some((h) => h.yardage) && (
                <tr>
                  <td>Yards</td>
                  {course.holes.map((h) => (
                    <td key={h.number}>{h.yardage ?? '—'}</td>
                  ))}
                  <td>{course.holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0) || '—'}</td>
                </tr>
              )}
              {lastRound && (
                <tr>
                  <td>Last time</td>
                  {course.holes.map((h) => (
                    <td key={h.number}>{lastRound.scores[h.number] ?? '—'}</td>
                  ))}
                  <td>{lastRound.totalStrokes}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
