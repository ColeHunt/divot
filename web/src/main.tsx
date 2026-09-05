import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

/* iOS hands a standalone home-screen app the whole frame, home-indicator zone
   included — and with no viewport-fit=cover there is no env(safe-area-inset-*)
   to derive that zone from, so the tab bar's labels end up sitting on top of
   the indicator. Nothing else can detect this: display-mode: standalone also
   matches on Android, where the frame is already inset for the nav bar and a
   reserve would be wrong. navigator.standalone is iOS-only and exactly the
   condition we mean. */
if ((navigator as { standalone?: boolean }).standalone) {
  document.documentElement.classList.add('ios-standalone');
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
