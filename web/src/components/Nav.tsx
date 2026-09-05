import { useEffect } from 'react';
import { navigate } from '../lib/router.js';

const TABS = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/courses', icon: '⛳', label: 'Courses' },
  { path: '/rounds', icon: '📋', label: 'Rounds' },
  { path: '/friends', icon: '👥', label: 'Friends' },
];

export function Nav({ path }: { path: string }) {
  /* Tells the document canvas to match the tab bar. On iOS standalone the
     shell can stop short of the physical bottom of the screen (see #root in
     styles.css) and the strip below it is painted by the canvas, which no
     element can cover; matching it to the bar is what makes that strip read
     as part of the bar rather than as a gap under it. Screens without a tab
     bar leave the canvas as the page background. */
  useEffect(() => {
    document.body.classList.add('has-tabbar');
    return () => document.body.classList.remove('has-tabbar');
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
