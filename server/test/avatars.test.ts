import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/db.js';
import { register } from '../src/users.js';
import { AvatarError, getAvatar, removeAvatar, setAvatar } from '../src/avatars.js';

// A 1x1 red pixel PNG, base64-encoded — a real, tiny, valid image.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let userId: string;

beforeEach(() => {
  setDb(openDb(':memory:'));
  userId = register('alice@example.com', 'password1', 'Alice').id;
});

describe('setAvatar / getAvatar', () => {
  it('stores and retrieves the image', () => {
    setAvatar(userId, TINY_PNG);
    const avatar = getAvatar(userId);
    expect(avatar?.mimeType).toBe('image/png');
    expect(avatar?.data.length).toBeGreaterThan(0);
  });

  it('is null before anything is set', () => {
    expect(getAvatar(userId)).toBeNull();
  });

  it('overwrites a previous avatar rather than erroring', () => {
    setAvatar(userId, TINY_PNG);
    const first = getAvatar(userId)!.data;
    setAvatar(
      userId,
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    );
    expect(getAvatar(userId)!.mimeType).toBe('image/jpeg');
    expect(getAvatar(userId)!.data).not.toEqual(first);
  });

  it('rejects a non-image data URL', () => {
    expect(() => setAvatar(userId, 'data:text/plain;base64,aGVsbG8=')).toThrow(AvatarError);
  });

  it('rejects garbage input', () => {
    expect(() => setAvatar(userId, 'not a data url')).toThrow(AvatarError);
    expect(() => setAvatar(userId, null)).toThrow(AvatarError);
  });
});

describe('removeAvatar', () => {
  it('clears a set avatar', () => {
    setAvatar(userId, TINY_PNG);
    removeAvatar(userId);
    expect(getAvatar(userId)).toBeNull();
  });

  it('is a no-op when there was never one', () => {
    expect(() => removeAvatar(userId)).not.toThrow();
  });
});
