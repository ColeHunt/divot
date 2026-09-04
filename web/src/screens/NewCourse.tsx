import { useState, type FormEvent } from 'react';
import type { Course } from '@shared/types.js';
import { api, ApiError } from '../lib/api.js';
import { navigate } from '../lib/router.js';

interface HoleInput {
  number: number;
  par: number;
  yardage: string;
}

function defaultHoles(count: number): HoleInput[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 4, yardage: '' }));
}

export function NewCourse() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [holes, setHoles] = useState<HoleInput[]>(defaultHoles(18));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setHoleCount(count: number) {
    setHoles((current) => {
      if (count === current.length) return current;
      if (count < current.length) return current.slice(0, count);
      return [...current, ...defaultHoles(count - current.length).map((h, i) => ({ ...h, number: current.length + i + 1 }))];
    });
  }

  function setPar(index: number, par: number) {
    setHoles((current) => current.map((h, i) => (i === index ? { ...h, par } : h)));
  }

  function setYardage(index: number, yardage: string) {
    setHoles((current) => current.map((h, i) => (i === index ? { ...h, yardage } : h)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ course: Course }>('/api/courses', {
        name: name.trim(),
        location: location.trim() || null,
        holes: holes.map((h) => ({
          number: h.number,
          par: h.par,
          yardage: h.yardage.trim() ? Number(h.yardage) : null,
        })),
      });
      navigate(`/courses/${res.course.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that course');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/courses')}>
          ← Courses
        </button>
      </div>

      <form className="stack" onSubmit={submit}>
        <div className="card stack">
          <label className="field">
            <span>Course name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <label className="field">
            <span>Location (optional)</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>Holes</span>
            <div className="chip-row">
              {[9, 18].map((n) => (
                <button
                  type="button"
                  key={n}
                  className="chip"
                  aria-pressed={holes.length === n}
                  onClick={() => setHoleCount(n)}
                >
                  {n} holes
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="card">
          <h2>Pars {holes.length !== 9 && holes.length !== 18 ? `(${holes.length} holes)` : ''}</h2>
          <div className="hole-input-list">
            <span className="head">Hole</span>
            <span className="head">Par</span>
            <span className="head">Yards</span>
            {holes.map((hole, index) => (
              <div key={hole.number} style={{ display: 'contents' }}>
                <span>{hole.number}</span>
                <select value={hole.par} onChange={(e) => setPar(index, Number(e.target.value))}>
                  {[3, 4, 5, 6].map((par) => (
                    <option key={par} value={par}>
                      {par}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="numeric"
                  value={hole.yardage}
                  onChange={(e) => setYardage(index, e.target.value.replace(/\D/g, ''))}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          Save course
        </button>
        {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
      </form>
    </div>
  );
}
