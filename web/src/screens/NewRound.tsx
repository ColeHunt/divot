import { useEffect, useState } from 'react';
import type { CourseSummary, Friend, RoundFormat, SavedCourse } from '@shared/types.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface TeamDraft {
  name: string;
  memberIds: string[];
}

export function NewRound() {
  const { user } = useAuth();
  const preselected = new URLSearchParams(location.search).get('course');

  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [courseId, setCourseId] = useState<string | null>(preselected);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<RoundFormat>('stroke_play');
  const [teams, setTeams] = useState<TeamDraft[]>([{ name: 'Team 1', memberIds: user ? [user.id] : [] }]);
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
      if (next.has(id)) {
        next.delete(id);
        setTeams((t) => t.map((team) => ({ ...team, memberIds: team.memberIds.filter((m) => m !== id) })));
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleOnTeam(teamIndex: number, personId: string) {
    setTeams((current) =>
      current.map((team, i) => {
        if (i === teamIndex) {
          const onIt = team.memberIds.includes(personId);
          return { ...team, memberIds: onIt ? team.memberIds.filter((m) => m !== personId) : [...team.memberIds, personId] };
        }
        return { ...team, memberIds: team.memberIds.filter((m) => m !== personId) };
      }),
    );
  }

  function addTeam() {
    setTeams((current) => [...current, { name: `Team ${current.length + 1}`, memberIds: [] }]);
  }

  function removeTeam(index: number) {
    setTeams((current) => current.filter((_, i) => i !== index));
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
        format,
        teams: format === 'scramble' ? teams : undefined,
      });
      navigate(`/round/${res.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start that round');
    } finally {
      setBusy(false);
    }
  }

  const roster = [
    ...(user ? [{ id: user.id, name: 'You' }] : []),
    ...friends.filter((f) => invited.has(f.id)).map((f) => ({ id: f.id, name: f.name.split(' ')[0]! })),
  ];

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
        <h2>Format</h2>
        <div className="chip-row">
          <button className="chip" aria-pressed={format === 'stroke_play'} onClick={() => setFormat('stroke_play')}>
            Stroke play
          </button>
          <button className="chip" aria-pressed={format === 'scramble'} onClick={() => setFormat('scramble')}>
            Scramble
          </button>
        </div>
        {format === 'scramble' && (
          <p className="tiny muted" style={{ marginTop: '0.5rem' }}>
            Everyone on a team shares one scorecard. Split into more than one team for multiple
            scrambles happening in the same round.
          </p>
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

      {format === 'scramble' && (
        <div className="card">
          <h2>Who's scrambling with whom</h2>
          <div className="stack">
            {teams.map((team, index) => (
              <div key={index} className="card" style={{ margin: 0, background: 'var(--surface-2)' }}>
                <div className="row between" style={{ marginBottom: '0.5rem' }}>
                  <input
                    value={team.name}
                    onChange={(e) =>
                      setTeams((current) => current.map((t, i) => (i === index ? { ...t, name: e.target.value } : t)))
                    }
                    maxLength={30}
                    style={{ fontWeight: 600 }}
                  />
                  {teams.length > 1 && (
                    <button className="btn-ghost tiny" style={{ padding: '0 0 0 0.5rem', minHeight: 0 }} onClick={() => removeTeam(index)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="chip-row">
                  {roster.map((person) => (
                    <button
                      key={person.id}
                      className="chip"
                      aria-pressed={team.memberIds.includes(person.id)}
                      onClick={() => toggleOnTeam(index, person.id)}
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-sm" style={{ marginTop: '0.6rem' }} onClick={addTeam}>
            + Add another team
          </button>
          <p className="tiny muted" style={{ marginTop: '0.6rem' }}>
            Anyone left off a team, or who joins later with the code, can create or join one once
            they're in the round.
          </p>
        </div>
      )}

      <button className="btn btn-primary btn-full" onClick={start} disabled={busy || !courseId}>
        Start round
      </button>
      {error && <p className="tiny" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
