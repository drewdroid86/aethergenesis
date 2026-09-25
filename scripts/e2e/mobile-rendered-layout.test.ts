import test from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WsPkg from 'ws';

// ==========================================
// Mobile rendered layout (standalone — not part of f7/f8 or run-e2e-tests)
// Rendered getBoundingClientRect() checks over the phone top-cluster
// panels (Scale Ladder, breadcrumb, You Are Here, ConstantsPanel in both
// open and closed states) at 360/390/412/480px viewports, served from
// `vite preview` (requires `vite build` first) and driven via headless
// Chromium CDP. Plus a >=44px rendered touch-target assertion for the
// interactive elements this task governs (ConstantsPanel both states +
// the You Are Here toggle; breadcrumb inline text-links are pre-existing
// compact navigation affordances outside this task's touch list).
// If no headless Chromium is available the suite SKIPS (reported as
// not-runnable-here) — it never fakes a pass.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;
const CDP_PORT = 19222;
const VIEWPORTS = [360, 390, 412, 480];
const VIEWPORT_H = 844;
const EPS = 1;

function findChrome(): string | null {
  const env = process.env.CHROME_PATH ?? process.env.CHROME_BIN ?? process.env.CHROMIUM_PATH;
  if (env && existsSync(env)) return env;
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/opt/google/chrome/chrome',
          ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const CHROME = findChrome();

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

interface PanelRects {
  ladder: Rect | null;
  crumbs: Rect | null;
  badge: Rect | null;
  toggle: Rect | null;
  panel: Rect | null;
  canvas: Rect | null;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
  );
}

// Minimal CDP client over a WebSocket (global when available, else ws).
class Cdp {
  private ws: any;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  static async connect(url: string): Promise<Cdp> {
    const cdp = new Cdp();
    const WSImpl: any = (globalThis as any).WebSocket ?? WsPkg;
    cdp.ws = new WSImpl(url);
    await new Promise<void>((resolve, reject) => {
      cdp.ws.onopen = () => resolve();
      cdp.ws.onerror = (e: any) => reject(e);
      if (typeof cdp.ws.on === 'function') {
        cdp.ws.on('open', () => resolve());
        cdp.ws.on('error', (e: any) => reject(e));
      }
    });
    cdp.ws.onmessage = (ev: any) => {
      const msg = JSON.parse(typeof ev === 'string' ? ev : ev.data);
      if (msg.id != null && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)!;
        cdp.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    if (typeof cdp.ws.on === 'function') {
      cdp.ws.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.id != null && cdp.pending.has(msg.id)) {
          const { resolve, reject } = cdp.pending.get(msg.id)!;
          cdp.pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      });
    }
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    return res.result?.value;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const MEASURE_JS = `(() => {
  const q = (s) => document.querySelector(s);
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
  };
  return {
    ladder: rectOf(q('[aria-label="Cosmic Scale Ladder"]')),
    crumbs: rectOf(q('[aria-label="Spatial Breadcrumb Hierarchy"]')),
    badge: rectOf(q('[aria-label="Current Location and You Are Here status"]')),
    toggle: rectOf(q('[data-testid="constants-toggle"]')),
    panel: rectOf(q('[data-testid="constants-panel"]')),
    canvas: rectOf(q('canvas')),
  };
})()`;

const TOUCH_JS = `(() => {
  const out = [];
  const roots = ['[data-testid="constants-panel"]', '[data-testid="constants-toggle"]', '[aria-label="Current Location and You Are Here status"]']
    .map((s) => document.querySelector(s)).filter(Boolean);
  for (const root of roots) {
    const els = [];
    if (root.matches('button,a,input')) els.push(root);
    root.querySelectorAll('button,a,input').forEach((e) => els.push(e));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const label = el.getAttribute('aria-label') || el.tagName;
      if (el.tagName === 'INPUT' && el.type === 'range') {
        if (r.width < 44) out.push(label + ': range width ' + r.width);
      } else if (r.width < 44 || r.height < 44) {
        out.push(label + ': ' + r.width + 'x' + r.height);
      }
    }
  }
  return out;
})()`;

test(
  'mobile rendered top-cluster layout: no overlap, in-viewport, >=44px touch targets',
  { skip: CHROME ? undefined : 'no headless Chromium in this environment (not-runnable-here)', timeout: 240000 },
  async (t) => {
    assert.ok(CHROME, 'Chromium binary required when not skipped');
    assert.ok(
      existsSync(join(root, 'dist', 'index.html')),
      'dist/index.html missing — run `vite build` before this test (it drives `vite preview`)'
    );

    let preview: ChildProcess | null = null;
    let chrome: ChildProcess | null = null;
    let profileDir: string | null = null;
    try {
      preview = spawn('node', [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
        cwd: root,
        stdio: 'ignore',
      });
      await waitFor(PREVIEW_URL, 30000);

      profileDir = mkdtempSync(join(tmpdir(), 'f-mobile-layout-'));
      chrome = spawn(
        CHROME!,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--enable-unsafe-swiftshader',
          '--use-angle=swiftshader',
          `--remote-debugging-port=${CDP_PORT}`,
          `--user-data-dir=${profileDir}`,
          'about:blank',
        ],
        { stdio: 'ignore' }
      );
      await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 30000);

      const created: any = await (
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })
      ).json();
      const cdp = await Cdp.connect(created.webSocketDebuggerUrl);
      try {
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        for (const width of VIEWPORTS) {
          // eslint-disable-next-line no-await-in-loop
          await t.test(`viewport ${width}x${VIEWPORT_H}`, async () => {
            await cdp.send('Emulation.setDeviceMetricsOverride', {
              width,
              height: VIEWPORT_H,
              deviceScaleFactor: 2,
              mobile: true,
            });
            await cdp.send('Page.navigate', { url: PREVIEW_URL });

            const start = Date.now();
            for (;;) {
              const ready = await cdp.evaluate(
                `!!document.querySelector('[aria-label="Cosmic Scale Ladder"]')`
              );
              if (ready) break;
              if (Date.now() - start > 30000) throw new Error(`app did not mount at ${width}px`);
              await new Promise((r) => setTimeout(r, 500));
            }
            await new Promise((r) => setTimeout(r, 1500));

            const checkState = async (state: string) => {
              const rects = (await cdp.evaluate(MEASURE_JS)) as PanelRects;
              assert.ok(rects.ladder?.visible, `${state}: Scale Ladder must render at ${width}px`);
              assert.ok(rects.crumbs?.visible, `${state}: breadcrumb must render at ${width}px`);
              assert.ok(rects.badge?.visible, `${state}: You Are Here must render at ${width}px`);
              assert.ok(rects.canvas && rects.canvas.w > 0 && rects.canvas.h > 0, `${state}: canvas must stay mounted at ${width}px`);

              const parts: [string, Rect | null][] =
                state === 'open'
                  ? [
                      ['ladder', rects.ladder],
                      ['crumbs', rects.crumbs],
                      ['badge', rects.badge],
                      ['constants-panel', rects.panel],
                    ]
                  : [
                      ['ladder', rects.ladder],
                      ['crumbs', rects.crumbs],
                      ['badge', rects.badge],
                      ['constants-toggle', rects.toggle],
                    ];
              const live = parts.filter(([, r]) => r?.visible) as [string, Rect][];
              assert.ok(live.length === parts.length, `${state}: all top-cluster panels must be visible at ${width}px`);
              for (const [name, r] of live) {
                assert.ok(
                  r.x >= -EPS && r.x + r.w <= width + EPS,
                  `${state}: ${name} must not clip horizontally at ${width}px (x=${r.x}, w=${r.w})`
                );
              }
              for (let i = 0; i < live.length; i++) {
                for (let j = i + 1; j < live.length; j++) {
                  assert.ok(
                    !overlaps(live[i][1], live[j][1]),
                    `${state}: ${live[i][0]} overlaps ${live[j][0]} at ${width}px`
                  );
                }
              }

              const violations = (await cdp.evaluate(TOUCH_JS)) as string[];
              assert.deepStrictEqual(violations, [], `${state}: touch-target violations at ${width}px`);
            };

            await checkState('closed');

            const opened = await cdp.evaluate(
              `(() => { const b = document.querySelector('[data-testid="constants-toggle"]'); if (!b) return false; b.click(); return true; })()`
            );
            assert.ok(opened, `closed: constants toggle must be clickable at ${width}px`);
            await new Promise((r) => setTimeout(r, 800));
            const openRects = (await cdp.evaluate(MEASURE_JS)) as PanelRects;
            assert.ok(openRects.panel?.visible, 'open: constants panel must render in-flow after toggle');
            await checkState('open');
          });
        }
      } finally {
        cdp.close();
      }
    } finally {
      if (chrome) chrome.kill('SIGKILL');
      if (preview) preview.kill('SIGTERM');
      if (profileDir) {
        try {
          rmSync(profileDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  }
);
