import { useEffect, useState } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Pushes a new path and notifies every usePath() subscriber — pushState alone does not. */
export function navigate(path: string): void {
  if (location.pathname + location.search !== path) {
    history.pushState({}, '', path);
  }
  listeners.forEach((listen) => listen());
}

export function usePath(): string {
  const [path, setPath] = useState(() => location.pathname);

  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  return path;
}
