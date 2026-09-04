import { useEffect, useState } from 'react';
import type { CourseSummary, Friend, SavedCourse } from '@shared/types.js';
import { api, ApiError } from '../lib/api.js';
import { navigate } from '../lib/router.js';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function NewRound() {
  const preselected = new URLSearchParams(location.search).get('course');

  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [courseId, setCourseId] = useState<string | null>(preselected);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ courses: SavedCourse[] }>('/api/courses/saved'),
      api.get<{ friends: Friend[] }>('/api/friends'),
    ]).then(([coursesRes, friendsRes]) => {
      setSaved(coursesRes.courses);
      setFriends(friendsRes.friends);
      if (preselected) {
        const match = coursesRes.courses.find((c) => c.id === preselected);
        if (match) setCourseName(match.name);
        else api.get<{ course: { name: string } }>(`/api/courses/${preselected}`).then((r) => setCourseName(r.course.name));
      }
    });
  }, [preselected]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      api
        .get<{ courses: CourseSummary[] }>(`/api/courses/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => setResults(res.courses))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  function pickCourse(id: string, name: string) {
    setCourseId(id);
    setCourseName(name);
    setResults([]);
    setQuery('');
  }

  function toggleFriend(id: string) {
    setInvited((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function start() {
    if (!courseId) {
      setError('Pick a course first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ code: string }>('/api/rounds', {
        courseId,
        inviteFriendIds: [...invited],
      });
      navigate(`/round/${res.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start that round');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="btn-ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate('/')}>
          ← Cancel
        </button>
      </div>

      <div className="hero" style={{ padding: '0.5rem 0 1.25rem' }}>
        <h1 style={{ fontSize: '1.6rem' }}>Start a round</h1>
      </div>

      <div className="card">
        <h2>Course</h2>
        {courseId && courseName ? (
          <div className="row between">
            <span className="row-name">{courseName}</span>
            <button className="btn btn-sm" onClick={() => { setCourseId(null); setCourseName(null); }}>
              Change
            </button>
          </div>
        ) : (
          <div className="stack">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses"
            />
            {(query.trim() ? results : saved).map((course) => (
              <button
                key={course.id}
                className="btn btn-ghost btn-full row between"
                onClick={() => pickCourse(course.id, course.name)}
              >
                <span>{course.name}</span>
                <span className="tiny muted">{course.holeCount} holes</span>
              </button>
            ))}
            {!query.trim() && saved.length === 0 && (
              <p className="tiny muted">No saved courses yet — search or add one from Courses.</p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Invite friends (optional)</h2>
        {friends.length === 0 ? (
          <p className="tiny muted">Add friends to invite them straight into a round.</p>
        ) : (
          <div className="chip-row">
            {friends.map((friend) => (
              <button
                key={friend.id}
                className="chip"
                aria-pressed={invited.has(friend.id)}
                onClick={() => toggleFriend(friend.id)}
              >
                {initials(friend.name)} {friend.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: '0.6rem' }}>
          Anyone can also join with the round's code once it starts.
        </p>
      </div>

      <button className="btn btn-primary btn-full" onClick={start} disabled={busy || !courseId}>
        Start round
      </button>
      {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
