import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { getDb } from './db.js';
import {
  type AuthedRequest,
  attachUser,
  clearSessionCookie,
  createSession,
  destroySession,
  parseCookies,
  requireAuth,
  setSessionCookie,
} from './auth.js';
import { checkRateLimit, clearRateLimit } from './rateLimit.js';
import { confirmPasswordReset, requestPasswordReset } from './passwordReset.js';
import { AvatarError, getAvatar, removeAvatar, setAvatar } from './avatars.js';
import { attachHub, broadcastRound } from './hub.js';
import {
  FriendError,
  acceptFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriendRequest,
  sendFriendRequest,
  unfriend,
} from './friends.js';
import {
  CourseError,
  createCourse,
  getCourse,
  getLastRound,
  isSaved,
  listSavedCourses,
  saveCourse,
  searchCourses,
  unsaveCourse,
} from './courses.js';
import { isValidRoundCode, normaliseRoundCode } from './ids.js';
import {
  RoundError,
  completeRound,
  createRound,
  declineRound,
  getRoundState,
  joinRound,
  listMyInvites,
  listMyRounds,
  roundExists,
} from './rounds.js';
import { UserError, getUserById, login, normaliseEmail, register, searchUsers, updateName } from './users.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The compiled server lives at dist/server/src, so the built client is four
 * levels up in production and two in dev.
 */
function findWebDist(): string | null {
  const candidates = [
    path.resolve(here, '../../../../web/dist'),
    path.resolve(here, '../../web/dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

function errorStatus(code: string): number {
  switch (code) {
    case 'not_found':
    case 'round_not_found':
      return 404;
    case 'not_authenticated':
      return 401;
    case 'already_friends':
    case 'already_pending':
    case 'self':
    case 'email_taken':
    case 'round_full':
    case 'not_your_request':
    case 'not_a_player':
      return 409;
    case 'bad_credentials':
    case 'invalid_reset_token':
      return 401;
    case 'rate_limited':
      return 429;
    default:
      return 400;
  }
}

export function createApp(): express.Express {
  const app = express();
  // Exactly one hop of proxying in front (Nginx Proxy Manager) — trusts its
  // X-Forwarded-For/Proto so req.ip is the real client (rate limiting) and
  // req.protocol correctly reads 'https' (building reset-password links).
  app.set('trust proxy', 1);
  // 3mb, not 32kb, to leave headroom for a base64-encoded avatar upload
  // (client-resized to ~1.5mb raw, which inflates by ~4/3 as base64).
  app.use(express.json({ limit: '3mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- auth ----

  app.post('/api/auth/register', (req, res) => {
    try {
      const user = register(req.body?.email, req.body?.password, req.body?.name);
      const token = createSession(user.id);
      setSessionCookie(res, token, true);
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof UserError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const rateLimitKey = `login:${req.ip}:${normaliseEmail(req.body?.email)}`;
    if (!checkRateLimit(rateLimitKey, config.loginRateLimit.maxAttempts, config.loginRateLimit.windowMinutes * 60_000)) {
      res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' });
      return;
    }
    try {
      const user = login(req.body?.email, req.body?.password);
      clearRateLimit(rateLimitKey);
      const token = createSession(user.id);
      setSessionCookie(res, token, req.body?.remember !== false);
      res.json({ user });
    } catch (error) {
      if (error instanceof UserError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[config.sessionCookieName];
    if (token) destroySession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.userId) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }
    const user = getUserById(req.userId);
    if (!user) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }
    res.json({ user });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const rateLimitKey = `reset:${req.ip}:${normaliseEmail(req.body?.email)}`;
    if (!checkRateLimit(rateLimitKey, config.resetRateLimit.maxAttempts, config.resetRateLimit.windowMinutes * 60_000)) {
      res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' });
      return;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await requestPasswordReset(req.body?.email, baseUrl);
    // Always the same response, whether or not that email has an account —
    // otherwise this endpoint would let anyone probe which emails are registered.
    res.json({ ok: true });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    try {
      const user = confirmPasswordReset(req.body?.token, req.body?.password);
      const token = createSession(user.id);
      setSessionCookie(res, token, true);
      res.json({ user });
    } catch (error) {
      if (error instanceof UserError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  const api = express.Router();
  api.use(requireAuth);

  api.patch('/auth/me', (req: AuthedRequest, res) => {
    try {
      const user = updateName(req.userId!, req.body?.name);
      res.json({ user });
    } catch (error) {
      if (error instanceof UserError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  // ---- users / friends ----

  api.get('/users/search', (req: AuthedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ users: searchUsers(q, req.userId!) });
  });

  // Same visibility as name/email today (any signed-in user, via /users/search) — not just friends.
  api.get('/users/:id/avatar', (req: AuthedRequest, res) => {
    const avatar = getAvatar(req.params.id!);
    if (!avatar) {
      // Never cached: a "no avatar yet" 404 must not stick around in the
      // browser past this user's first upload, since most places that show
      // an avatar (Friends, a round's leaderboard) never pass a cache-busting
      // version — only this user's own Account screen does, right after they
      // change it themselves.
      res.set('Cache-Control', 'no-store').status(404).end();
      return;
    }
    // Short TTL, not the usual "images never change" caching — this image
    // can be replaced or removed, and most viewers (Friends, a round's
    // leaderboard) have no cache-busting version to force a fresh fetch when
    // that happens. A minute bounds how stale someone else's photo can look.
    res.set('Content-Type', avatar.mimeType).set('Cache-Control', 'private, max-age=60').send(avatar.data);
  });

  api.put('/users/me/avatar', (req: AuthedRequest, res) => {
    try {
      setAvatar(req.userId!, req.body?.dataUrl);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof AvatarError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.delete('/users/me/avatar', (req: AuthedRequest, res) => {
    removeAvatar(req.userId!);
    res.json({ ok: true });
  });

  api.get('/friends', (req: AuthedRequest, res) => {
    res.json({ friends: listFriends(req.userId!) });
  });

  api.get('/friends/requests', (req: AuthedRequest, res) => {
    res.json(listFriendRequests(req.userId!));
  });

  api.post('/friends/requests', (req: AuthedRequest, res) => {
    try {
      sendFriendRequest(req.userId!, String(req.body?.toUserId ?? ''));
      res.status(201).json({ ok: true });
    } catch (error) {
      if (error instanceof FriendError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.post('/friends/requests/:id/accept', (req: AuthedRequest, res) => {
    try {
      acceptFriendRequest(req.userId!, req.params.id!);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof FriendError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.post('/friends/requests/:id/decline', (req: AuthedRequest, res) => {
    try {
      removeFriendRequest(req.userId!, req.params.id!);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof FriendError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.delete('/friends/:userId', (req: AuthedRequest, res) => {
    unfriend(req.userId!, req.params.userId!);
    res.json({ ok: true });
  });

  // ---- courses ----

  api.get('/courses/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ courses: searchCourses(q) });
  });

  api.get('/courses/saved', (req: AuthedRequest, res) => {
    res.json({ courses: listSavedCourses(req.userId!) });
  });

  api.post('/courses', (req: AuthedRequest, res) => {
    try {
      const course = createCourse(req.userId!, req.body?.name, req.body?.location, req.body?.holes);
      res.status(201).json({ course });
    } catch (error) {
      if (error instanceof CourseError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.get('/courses/:id', (req: AuthedRequest, res) => {
    try {
      const course = getCourse(req.params.id!);
      res.json({
        course,
        saved: isSaved(req.userId!, course.id),
        lastRound: getLastRound(req.userId!, course.id),
      });
    } catch (error) {
      if (error instanceof CourseError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.post('/courses/:id/save', (req: AuthedRequest, res) => {
    try {
      saveCourse(req.userId!, req.params.id!);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof CourseError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.delete('/courses/:id/save', (req: AuthedRequest, res) => {
    unsaveCourse(req.userId!, req.params.id!);
    res.json({ ok: true });
  });

  // ---- rounds ----

  api.get('/rounds/mine', (req: AuthedRequest, res) => {
    res.json(listMyRounds(req.userId!));
  });

  api.get('/rounds/invites', (req: AuthedRequest, res) => {
    res.json({ invites: listMyInvites(req.userId!) });
  });

  api.post('/rounds', (req: AuthedRequest, res) => {
    try {
      const round = createRound(req.userId!, req.body);
      res.status(201).json(round);
    } catch (error) {
      if (error instanceof RoundError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.get('/rounds/:code', (req: AuthedRequest, res) => {
    const code = normaliseRoundCode(req.params.code ?? '');
    if (!isValidRoundCode(code) || !roundExists(code)) {
      res.status(404).json({ error: 'round_not_found' });
      return;
    }
    res.json({ round: getRoundState(code) });
  });

  api.post('/rounds/:code/join', (req: AuthedRequest, res) => {
    try {
      const code = normaliseRoundCode(req.params.code ?? '');
      joinRound(code, req.userId!);
      broadcastRound(code);
      res.json({ round: getRoundState(code) });
    } catch (error) {
      if (error instanceof RoundError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  api.post('/rounds/:code/decline', (req: AuthedRequest, res) => {
    const code = normaliseRoundCode(req.params.code ?? '');
    declineRound(code, req.userId!);
    res.json({ ok: true });
  });

  api.post('/rounds/:code/complete', (req: AuthedRequest, res) => {
    try {
      const code = normaliseRoundCode(req.params.code ?? '');
      completeRound(code, req.userId!);
      broadcastRound(code);
      res.json({ round: getRoundState(code) });
    } catch (error) {
      if (error instanceof RoundError) {
        res.status(errorStatus(error.code)).json({ error: error.code, message: error.message });
        return;
      }
      throw error;
    }
  });

  app.use('/api', api);

  const webDist = findWebDist();
  if (webDist) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // SPA fallback: every non-API path renders the client, which routes client-side.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  return app;
}

function start(): void {
  getDb();
  const app = createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: config.maxMessageBytes });
  const stopHeartbeat = attachHub(wss);

  server.listen(config.port, () => {
    console.log(`divot listening on http://localhost:${config.port}`);
    console.log(`data dir: ${config.dataDir}`);
  });

  const shutdown = () => {
    stopHeartbeat();
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only boot when run directly, so tests can import the app without a listener.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  start();
}
