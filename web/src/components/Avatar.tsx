import { useEffect, useState } from 'react';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface AvatarProps {
  userId: string;
  name: string;
  large?: boolean;
  /** Bump this (e.g. to Date.now()) right after this user's own avatar changes, to bypass the browser cache. */
  version?: number;
}

export function Avatar({ userId, name, large, version }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  // A user with no avatar 404s every time otherwise — reset the "give up and
  // show initials" flag whenever we might have a new image to try (a fresh
  // version, or navigating onto a different person's avatar entirely).
  useEffect(() => setBroken(false), [userId, version]);

  const className = `avatar avatar-img${large ? ' avatar-lg' : ''}`;

  if (broken) {
    return <div className={`avatar${large ? ' avatar-lg' : ''}`}>{initials(name)}</div>;
  }

  const src = `/api/users/${userId}/avatar${version ? `?v=${version}` : ''}`;
  return <img className={className} src={src} alt="" onError={() => setBroken(true)} />;
}
