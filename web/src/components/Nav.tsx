import { navigate } from '../lib/router.js';

const TABS = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/courses', icon: '⛳', label: 'Courses' },
  { path: '/rounds', icon: '📋', label: 'Rounds' },
  { path: '/friends', icon: '👥', label: 'Friends' },
];

export function Nav({ path }: { path: string }) {
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
