import { useEffect, useState } from 'react';
import type { Friend, FriendRequest, User } from '@shared/types.js';
import { api, ApiError } from '../lib/api.js';

interface RequestsResponse {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  async function refresh() {
    const [friendsRes, requestsRes] = await Promise.all([
      api.get<{ friends: Friend[] }>('/api/friends'),
      api.get<RequestsResponse>('/api/friends/requests'),
    ]);
    setFriends(friendsRes.friends);
    setIncoming(requestsRes.incoming);
    setOutgoing(requestsRes.outgoing);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api
        .get<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(cleaned)}`)
        .then((res) => setResults(res.users))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function addFriend(user: User) {
    try {
      await api.post('/api/friends/requests', { toUserId: user.id });
      flash(`Request sent to ${user.name}`);
      await refresh();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : 'Could not send that request');
    }
  }

  async function accept(request: FriendRequest) {
    await api.post(`/api/friends/requests/${request.id}/accept`);
    await refresh();
  }

  async function decline(request: FriendRequest) {
    await api.post(`/api/friends/requests/${request.id}/decline`);
    await refresh();
  }

  async function remove(friend: Friend) {
    await api.delete(`/api/friends/${friend.id}`);
    setFriends((current) => current.filter((f) => f.id !== friend.id));
  }

  const outgoingIds = new Set(outgoing.map((r) => r.to.id));
  const friendIds = new Set(friends.map((f) => f.id));

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Friends</span>
      </div>

      <div className="card">
        <h2>Add a friend</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
        {results.length > 0 && (
          <div className="stack" style={{ marginTop: '0.6rem' }}>
            {results.map((user) => (
              <div key={user.id} className="row between">
                <div className="row">
                  <div className="avatar">{initials(user.name)}</div>
                  <div>
                    <div className="row-name">{user.name}</div>
                    <div className="row-meta">{user.email}</div>
                  </div>
                </div>
                {friendIds.has(user.id) ? (
                  <span className="badge badge-muted">Friends</span>
                ) : outgoingIds.has(user.id) ? (
                  <span className="badge badge-muted">Pending</span>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => addFriend(user)}>
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {incoming.length > 0 && (
        <div className="card">
          <h2>Requests</h2>
          <div className="stack">
            {incoming.map((request) => (
              <div key={request.id} className="row between">
                <div className="row">
                  <div className="avatar">{initials(request.from.name)}</div>
                  <div className="row-name">{request.from.name}</div>
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => decline(request)}>
                    Decline
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => accept(request)}>
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Your friends {friends.length > 0 && `(${friends.length})`}</h2>
        {loading ? (
          <p className="muted tiny">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="muted tiny">No friends yet — search above to add one.</p>
        ) : (
          <div className="stack">
            {friends.map((friend) => (
              <div key={friend.id} className="row between">
                <div className="row">
                  <div className="avatar">{initials(friend.name)}</div>
                  <div className="row-name">{friend.name}</div>
                </div>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(friend)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {outgoing.length > 0 && (
        <p className="tiny muted">
          Pending: {outgoing.map((r) => r.to.name).join(', ')}
        </p>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
