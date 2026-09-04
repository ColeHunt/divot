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
import { UserError, getUserById, login, register, searchUsers } from './users.js';

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
      return 401;
    default:
      return 400;
  }
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- auth ----

  app.post('/api/auth/register', (req, res) => {
    try {
      const user = register(req.body?.email, req.body?.password, req.body?.name);
      const token = createSession(user.id);
      setSessionCookie(res, token);
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
    try {
      const user = login(req.body?.email, req.body?.password);
      const token = createSession(user.id);
      setSessionCookie(res, token);
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

  const api = express.Router();
  api.use(requireAuth);

  // ---- users / friends ----

  api.get('/users/search', (req: AuthedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ users: searchUsers(q, req.userId!) });
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
      const round = createRound(req.userId!, req.body?.courseId, req.body?.inviteFriendIds);
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
