import { useEffect, useState } from 'react';

/**
 * Viewport readout, off by default and shown only on `?vp=1`.
 *
 * iOS standalone lays a page out against a viewport that can disagree with the
 * web view it is drawn into, and nothing in the document can observe that from
 * CSS alone. This reports the numbers that decide it — a snapshot frozen at
 * first paint next to live values, changed rows in orange — so one screenshot
 * on first open and one after a scroll show exactly what moved.
 */

interface Snap {
  standalone: string;
  dpr: number;
  screen: string;
  inner: string;
  docClient: number;
  visual: string;
  insetTop: string;
  insetBottom: string;
  barTop: string;
  barBottom: string;
  rootH: string;
  scrollY: number;
}

/** env() only resolves inside a real declaration, so measure it off a probe element. */
function readInsets(): { top: string; bottom: string } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: cs.paddingTop, bottom: cs.paddingBottom };
  probe.remove();
  return out;
}

function snapshot(): Snap {
  const bar = document.querySelector('.tabbar')?.getBoundingClientRect();
  const root = document.getElementById('root')?.getBoundingClientRect();
  const vv = window.visualViewport;
  const insets = readInsets();
  const r = (n: number) => String(Math.round(n));
  return {
    standalone: String((navigator as unknown as { standalone?: boolean }).standalone),
    dpr: window.devicePixelRatio,
    screen: `${window.screen.width}x${window.screen.height}`,
    inner: `${window.innerWidth}x${window.innerHeight}`,
    docClient: document.documentElement.clientHeight,
    visual: vv ? `${r(vv.height)} off${r(vv.offsetTop)} pg${r(vv.pageTop)} s${vv.scale}` : 'none',
    insetTop: insets.top,
    insetBottom: insets.bottom,
    barTop: bar ? r(bar.top) : '-',
    barBottom: bar ? r(bar.bottom) : '-',
    rootH: root ? r(root.height) : '-',
    scrollY: Math.round(window.scrollY),
  };
}

export function ViewportDebug() {
  const [atLoad, setAtLoad] = useState<Snap | null>(null);
  const [live, setLive] = useState<Snap | null>(null);

  useEffect(() => {
    const first = snapshot();
    setAtLoad(first);
    setLive(first);

    const update = () => setLive(snapshot());
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    const timer = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.clearInterval(timer);
    };
  }, []);

  if (!atLoad || !live) return null;

  const rows: Array<[string, string, string]> = [
    ['standalone', atLoad.standalone, live.standalone],
    ['dpr', String(atLoad.dpr), String(live.dpr)],
    ['screen', atLoad.screen, live.screen],
    ['inner', atLoad.inner, live.inner],
    ['docClientH', String(atLoad.docClient), String(live.docClient)],
    ['visualVP', atLoad.visual, live.visual],
    ['inset top', atLoad.insetTop, live.insetTop],
    ['inset bot', atLoad.insetBottom, live.insetBottom],
    ['bar top', atLoad.barTop, live.barTop],
    ['bar bottom', atLoad.barBottom, live.barBottom],
    ['#root h', atLoad.rootH, live.rootH],
    ['scrollY', String(atLoad.scrollY), String(live.scrollY)],
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0f0',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: '#ff0' }}>VIEWPORT DEBUG — temporary · load | live</div>
      {rows.map(([label, a, b]) => (
        <div key={label} style={{ color: a === b ? '#0f0' : '#f80' }}>
          {label.padEnd(11, ' ')} {a} | {b}
        </div>
      ))}
    </div>
  );
}
