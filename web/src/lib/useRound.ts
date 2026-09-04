import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoundState, ServerMessage } from '@shared/types.js';
import { RoundSocket, onWake, type ConnectionStatus } from './socket.js';

export interface RoundView {
  status: ConnectionStatus;
  round: RoundState | null;
  error: string | null;
  fatalError: string | null;
  setScore: (hole: number, strokes: number | null) => void;
  completeRound: () => void;
  reopenRound: () => void;
  dismissError: () => void;
}

/** Errors that mean "this round will never work here", as opposed to transient ones. */
const FATAL_CODES = new Set(['round_not_found', 'not_a_player', 'not_authenticated']);

export function useRound(code: string): RoundView {
  const [round, setRound] = useState<RoundState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const socketRef = useRef<RoundSocket | null>(null);

  useEffect(() => {
    const socket = new RoundSocket(code, {
      onStatus: setStatus,
      onMessage: (message: ServerMessage) => {
        if (message.t === 'state') {
          setRound((current) => (current && current.rev > message.round.rev ? current : message.round));
        } else if (message.t === 'error') {
          if (FATAL_CODES.has(message.code)) {
            setFatalError(message.message);
          } else {
            setError(message.message);
          }
        }
      },
    });

    socketRef.current = socket;
    socket.connect();
    const stopWake = onWake(() => socket.poke());

    return () => {
      stopWake();
      socket.close();
      socketRef.current = null;
    };
  }, [code]);

  const setScore = useCallback((hole: number, strokes: number | null) => {
    socketRef.current?.send({ t: 'set_score', code, hole, strokes });
  }, [code]);

  const completeRound = useCallback(() => {
    socketRef.current?.send({ t: 'complete_round', code });
  }, [code]);

  const reopenRound = useCallback(() => {
    socketRef.current?.send({ t: 'reopen_round', code });
  }, [code]);

  const dismissError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return { status, round, error, fatalError, setScore, completeRound, reopenRound, dismissError };
}
