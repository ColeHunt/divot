/**
 * Hand-drawn line icons for the wordmark and the avatar edit badge — the
 * bottom-nav tabs stayed on emoji by request. One stroke language (round
 * caps/joins, 1.7pt) so the two read as a matched pair rather than two
 * different icon styles.
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

/** A pin flag over the green — the Divot wordmark. */
export function FlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 20V4" />
      <path d="M7 5l8.5 3.2L7 11.4Z" fill="currentColor" stroke="none" />
      <path d="M3.2 20h8" />
    </Icon>
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
