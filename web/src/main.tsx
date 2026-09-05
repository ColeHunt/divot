import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

/**
 * 100dvh should track the real visible viewport on its own, but on this
 * device/iOS combination the very first layout still uses a stale, taller
 * value — the tab bar floats above the true bottom edge until something
 * (e.g. a scroll) forces a recalculation. Measuring window.visualViewport
 * directly and pushing it into a CSS variable sidesteps relying on the
 * browser to get the dvh unit right on first paint; it also stays correct
 * if the on-screen keyboard opens, which shrinks the visual viewport
 * without necessarily firing a dvh update either.
 */
function syncViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

syncViewportHeight();
window.visualViewport?.addEventListener('resize', syncViewportHeight);
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
