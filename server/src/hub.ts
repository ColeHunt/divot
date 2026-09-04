import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { parseCookies, resolveSession } from './auth.js';
import { isValidRoundCode, normaliseRoundCode } from './ids.js';
import {
  RoundError,
  completeRound,
  createTeam,
  getRoundState,
  joinTeam,
  leaveTeam,
  renameTeam,
  reopenRound,
  roundExists,
  setScore,
} from './rounds.js';
import type { ClientMessage, ServerErrorCode, ServerMessage } from '../../shared/src/types.js';

interface Session {
  socket: WebSocket;
  userId: string;
  roundCode: string | null;
  alive: boolean;
  windowStart: number;
  messagesInWindow: number;
}

const sessions = new Map<WebSocket, Session>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendError(socket: WebSocket, code: ServerErrorCode, message: string): void {
  send(socket, { t: 'error', code, message });
}

/**
 * Push a fresh snapshot to every session subscribed to this round. Rounds are
 * small (a foursome, at most a dozen), so — same as one4one — the server
 * broadcasts the whole state on every change rather than patching.
 */
export function broadcastRound(code: string): void {
  let state: ReturnType<typeof getRoundState> | null = null;
  for (const session of sessions.values()) {
    if (session.roundCode !== code) continue;
    if (!state) {
      try {
        state = getRoundState(code);
      } catch {
        session.roundCode = null;
        continue;
      }
    }
    send(session.socket, { t: 'state', round: state });
  }
}

function withinRateLimit(session: Session, now: number): boolean {
  if (now - session.windowStart >= 60_000) {
    session.windowStart = now;
    session.messagesInWindow = 0;
  }
  session.messagesInWindow += 1;
  return session.messagesInWindow <= config.messagesPerMinute;
}

function handleMessage(session: Session, raw: string): void {
  const now = Date.now();
  if (!withinRateLimit(session, now)) {
    sendError(session.socket, 'rate_limited', 'Slow down a moment');
    return;
  }

  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    sendError(session.socket, 'bad_request', 'Malformed message');
    return;
  }

  try {
    switch (message?.t) {
      case 'ping':
        send(session.socket, { t: 'pong' });
        return;

      case 'subscribe': {
        const code = normaliseRoundCode(String(message.code ?? ''));
        if (!isValidRoundCode(code) || !roundExists(code)) {
          sendError(session.socket, 'round_not_found', 'That round code does not exist');
          return;
        }
        const state = getRoundState(code);
        if (!state.players.some((p) => p.userId === session.userId && p.status === 'joined')) {
          sendError(session.socket, 'not_a_player', 'Join the round first');
          return;
        }
        session.roundCode = code;
        send(session.socket, { t: 'state', round: state });
        return;
      }

      case 'set_score': {
        const code = requireSubscribed(session);
        setScore(code, session.userId, message.hole, message.strokes, now);
        broadcastRound(code);
        return;
      }

      case 'complete_round': {
        const code = requireSubscribed(session);
        completeRound(code, session.userId, now);
        broadcastRound(code);
        return;
      }

      case 'reopen_round': {
        const code = requireSubscribed(session);
        reopenRound(code, session.userId, now);
        broadcastRound(code);
        return;
      }

      case 'create_team': {
        const code = requireSubscribed(session);
        createTeam(code, session.userId, message.name);
        broadcastRound(code);
        return;
      }

      case 'join_team': {
        const code = requireSubscribed(session);
        joinTeam(code, session.userId, String(message.teamId ?? ''));
        broadcastRound(code);
        return;
      }

      case 'leave_team': {
        const code = requireSubscribed(session);
        leaveTeam(code, session.userId);
        broadcastRound(code);
        return;
      }

      case 'rename_team': {
        const code = requireSubscribed(session);
        renameTeam(code, session.userId, String(message.teamId ?? ''), message.name);
        broadcastRound(code);
        return;
      }

      default:
        sendError(session.socket, 'bad_request', 'Unknown message');
    }
  } catch (error) {
    if (error instanceof RoundError) {
      sendError(session.socket, error.code, error.message);
      return;
    }
    console.error('ws handler failed', error);
    sendError(session.socket, 'bad_request', 'Something went wrong');
  }
}

function requireSubscribed(session: Session): string {
  if (!session.roundCode) throw new RoundError('not_a_player', 'Subscribe to a round first');
  return session.roundCode;
}

export function attachHub(wss: WebSocketServer): () => void {
  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const token = parseCookies(request.headers.cookie)[config.sessionCookieName];
    const userId = token ? resolveSession(token) : null;
    if (!userId) {
      sendError(socket, 'not_authenticated', 'Sign in first');
      socket.close();
      return;
    }

    const session: Session = {
      socket,
      userId,
      roundCode: null,
      alive: true,
      windowStart: Date.now(),
      messagesInWindow: 0,
    };
    sessions.set(socket, session);

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();
      if (raw.length > config.maxMessageBytes) {
        sendError(socket, 'bad_request', 'Message too large');
        return;
      }
      handleMessage(session, raw);
    });

    socket.on('pong', () => {
      session.alive = true;
    });

    socket.on('close', () => {
      sessions.delete(socket);
    });

    socket.on('error', () => {
      sessions.delete(socket);
    });
  });

  // Drop connections that stopped answering, so phones that went into a
  // pocket do not accumulate as ghost sessions.
  const heartbeat = setInterval(() => {
    for (const session of sessions.values()) {
      if (!session.alive) {
        session.socket.terminate();
        continue;
      }
      session.alive = false;
      session.socket.ping();
    }
  }, 30_000);

  return () => clearInterval(heartbeat);
}
