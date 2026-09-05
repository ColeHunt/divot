import { useEffect } from 'react';
import { navigate } from '../lib/router.js';

const TABS = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/courses', icon: '⛳', label: 'Courses' },
  { path: '/rounds', icon: '📋', label: 'Rounds' },
  { path: '/friends', icon: '👥', label: 'Friends' },
];

export function Nav({ path }: { path: string }) {
  // On some iOS/WebKit combinations, this position:fixed bar renders
  // against a stale viewport snapshot from the page's initial layout
  // until an actual scroll event forces a repaint — reproduced reliably
  // as a gap below the bar on first open that closes the instant the
  // page is scrolled. Nudging the scroll position by a pixel and back,
  // once there's something on screen to scroll, forces that same repaint
  // without the person needing to touch the screen. Runs once, on the
  // bar's first mount, not on every navigation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.scrollTo(0, 1);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <button
          key={tab.path}
          aria-current={path === tab.path}
          onClick={() => navigate(tab.path)}
        >
          <span className="icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
