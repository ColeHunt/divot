import { useState, type FormEvent } from 'react';
import type { Hole } from '@shared/types.js';
import { api } from '../lib/api.js';

export interface HoleInput {
  number: number;
  par: number;
  yardage: string;
}

export interface CourseFormValues {
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  holes: { number: number; par: number; yardage: number | null }[];
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

function defaultHoles(count: number): HoleInput[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 4, yardage: '' }));
}

/** Converts a saved course's holes into the form's string-valued editing shape. */
export function holesToInput(holes: Hole[]): HoleInput[] {
  return holes.map((h) => ({ number: h.number, par: h.par, yardage: h.yardage != null ? String(h.yardage) : '' }));
}

interface CourseFormProps {
  initialName?: string;
  initialLocation?: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialHoles?: HoleInput[];
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (values: CourseFormValues) => void;
}

export function CourseForm({
  initialName = '',
  initialLocation = '',
  initialLatitude = null,
  initialLongitude = null,
  initialHoles,
  submitLabel,
  busy,
  error,
  onSubmit,
}: CourseFormProps) {
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialLatitude != null && initialLongitude != null
      ? { latitude: initialLatitude, longitude: initialLongitude }
      : null,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [holes, setHoles] = useState<HoleInput[]>(
    initialHoles && initialHoles.length > 0 ? initialHoles : defaultHoles(18),
  );

  function changeLocation(value: string) {
    setLocation(value);
    // A pin found for a previous address text no longer matches once that
    // text changes — drop it rather than silently keep pointing at the old place.
    setCoords(null);
    setResolvedName(null);
    setGeocodeError(null);
  }

  async function findOnMap() {
    if (!location.trim()) return;
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await api.get<{ result: GeocodeResult | null }>(
        `/api/geocode?query=${encodeURIComponent(location.trim())}`,
      );
      if (res.result) {
        setCoords({ latitude: res.result.latitude, longitude: res.result.longitude });
        setResolvedName(res.result.displayName || location.trim());
      } else {
        setGeocodeError("Couldn't find that location. Try a more specific address.");
      }
    } catch {
      setGeocodeError("Couldn't look that up right now.");
    } finally {
      setGeocoding(false);
    }
  }

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

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      location: location.trim() || null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      holes: holes.map((h) => ({
        number: h.number,
        par: h.par,
        yardage: h.yardage.trim() ? Number(h.yardage) : null,
      })),
    });
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card stack">
        <label className="field">
          <span>Course name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <label className="field">
          <span>Location (optional)</span>
          <div className="row">
            <input value={location} onChange={(e) => changeLocation(e.target.value)} maxLength={80} />
            <button
              type="button"
              className="btn btn-sm"
              onClick={findOnMap}
              disabled={geocoding || !location.trim()}
            >
              {geocoding ? 'Finding…' : 'Find on map'}
            </button>
          </div>
          {coords && (
            <p className="tiny muted" style={{ marginTop: '0.3rem' }}>
              📍 Pinned{resolvedName ? `: ${resolvedName}` : ''} —{' '}
              <a
                href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                view on map
              </a>
            </p>
          )}
          {geocodeError && (
            <p className="tiny" style={{ color: 'var(--danger)', marginTop: '0.3rem' }}>
              {geocodeError}
            </p>
          )}
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
        {submitLabel}
      </button>
      {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  );
}
