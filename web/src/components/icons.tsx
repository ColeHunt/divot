/**
 * Hand-drawn line icons for the avatar edit badge, and the small two-tone
 * mark used in the wordmark. The wordmark icon deliberately doesn't share
 * the line-icon style below it: it's a shrunk-down echo of the app icon's
 * club-and-turf scene, not a glyph, so it carries its own fixed colors
 * instead of taking one from currentColor.
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

/** The wordmark's mark: the app icon's club and flying turf chunk, echoed at glyph size. */
export function DivotChunkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      <path d="M20 3 12 13" stroke="#cfd8d2" strokeWidth={2.1} strokeLinecap="round" fill="none" />
      <path d="M11 12.5 17 14.5 17.8 18.5 10.8 19.5Z" fill="#dfe6e1" stroke="#9aa39c" strokeWidth={1} />
      <g transform="rotate(-16 6 10)">
        <rect x="1.5" y="8" width="9" height="6" rx="1.5" fill="#2a1c12" />
        <rect x="1.5" y="8" width="9" height="2.6" rx="1.5" fill="#47c98a" />
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
