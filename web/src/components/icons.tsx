/**
 * Hand-drawn line icons for the avatar edit badge, and the small two-tone
 * mark used in the wordmark. The wordmark icon deliberately doesn't share
 * the line-icon style below it: it's a shrunk-down echo of the app icon's
 * flying turf chunk (same green-over-soil tile, same tilt), not a glyph, so
 * it carries its own fixed colors instead of taking one from currentColor.
 */
import type { SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

/** The wordmark's mark: the same flying turf chunk as the app icon, echoed at glyph size. */
export function DivotChunkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      <g transform="rotate(-12 12 12)">
        <rect x="5" y="8" width="14" height="9" rx="2" fill="#2a1c12" />
        <rect x="5" y="8" width="14" height="4" rx="2" fill="#47c98a" />
      </g>
    </svg>
  );
}

/** A pencil — edit-photo badge. */
export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth={1.9}>
      <path d="M4.5 19.5l1-4L15 5l3.5 3.5L8 19l-3.5.5z" />
      <path d="M13.3 6.7l3.5 3.5" />
    </Icon>
  );
}
