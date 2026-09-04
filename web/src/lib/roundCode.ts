/** Mirrors server/src/ids.ts — kept in sync by hand since it's a few lines of pure logic. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

export function normaliseRoundCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .split('')
    .filter((char) => CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, CODE_LENGTH);
}

export function isValidRoundCode(code: string): boolean {
  return code.length === CODE_LENGTH && code.split('').every((c) => CODE_ALPHABET.includes(c));
}
