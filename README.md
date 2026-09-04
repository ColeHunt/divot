# divot

A golf app for tracking rounds with friends. Create an account, add friends,
save the courses you play, and start a round together — everyone enters
their own scores from their own phone and the scorecard updates live for the
whole group.

## What it does

- **Accounts and friends.** Sign up, search for people by name or email,
  send and accept friend requests.
- **Join rounds together.** Start a round on a course and invite friends
  directly, or just share the round's six-character code — anyone who has
  it can join. Scores sync live across every player's phone as they're
  entered, the same real-time model as [one4one](https://github.com/ColeHunt/one4one).
- **Course library.** Courses are a shared library any account can search
  or add to. Save the ones you play for quick access, with pars (and
  optional yardages) loaded instantly the next time you start a round there.
- **Last round data.** Every course you've saved shows your most recent
  completed round on it — total strokes, score to par, hole by hole.
- **Round history.** Every round you've played, in progress or finished, in
  one place.

## Stack

| Piece | What |
|---|---|
| `shared/` | Scoring math (strokes, to-par) and the wire types. Pure and unit-tested. |
| `server/` | Express + `ws` + SQLite (`better-sqlite3`). Sessions are a cookie-backed token in the database — no JWTs, no third-party auth. Serves the built client in production. |
| `web/` | Vite + React, mobile-first. No router or state library — a small pathname-based router and plain fetch/WebSocket calls, the same minimal approach as one4one and onward. |

The server broadcasts a full round snapshot on every score change rather
than patching — rounds are small (a foursome, rarely more than a dozen),
and it removes a class of divergence bugs.

## Running it locally

```bash
npm install
npm run dev
```

`npm run dev` starts the API on `:8080` and Vite on `:5173` with a proxy for
`/api` and `/ws`. Open http://localhost:5173, create an account, add a
course, and start a round.

```bash
npm test         # scoring math, rounds/friends/courses store
npm run typecheck
npm run build    # web/dist + server/dist
npm start        # production mode: one process, one port
```

## Deploying

See [`docs/DEPLOY.md`](docs/DEPLOY.md) — systemd or Docker Compose on a
Droplet, riding the same shared reverse proxy as one4one and onward, with
the nginx config live scoring needs.

## Privacy

Everything lives in one SQLite file on your own server: accounts, friends,
courses and every round. Passwords are hashed (scrypt) and never stored in
the clear. A round's code is enough for anyone to join it, so treat it like
you would a room link — share it with the people you're actually playing
with.
