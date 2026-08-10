#!/usr/bin/env node
/**
 * One server for every demo. `npm run demo` builds the bundles, then this
 * serves them from a single origin:
 *
 *   /         hub page linking the demos below
 *   /3d/      the three.js engine bay        (web3d/dist, built by vite)
 *   /2d       the current 2D bench           (web/dist, built by build.js)
 *   /classic  the original demo, frozen      (web-original, a kept artifact)
 *   /api/*    proxied to the MAME gateway    (run-mame-gateway.ts, :8098)
 *
 * A demo whose bundle is missing is listed on the hub as not built instead of
 * crashing the server, so one broken build never hides the others. The MAME
 * card lights up when the gateway answers /api/mode; with the proxy in place,
 * /2d?backend=mame and /3d/?backend=mame run the pages on the real firmware.
 */

import { createServer, request as httpRequest } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const port = Number(process.env.PORT ?? 8099);
const mamePort = Number(process.env.MAME_PORT ?? 8098);

const DIST_3D = join(root, 'web3d', 'dist');
const PAGES = {
  '/2d': join(here, 'dist', 'motronic-bench.html'),
  '/classic': join(root, 'web-original', 'motronic-bench.html'),
};

const DEMOS = [
  {
    href: '/3d/',
    name: '3D engine bay',
    detail: 'three.js cutaway · attract mode · live scope',
    file: join(DIST_3D, 'index.html'),
    rebuild: 'npm run demo',
  },
  {
    href: '/2d',
    name: '2D bench',
    detail: 'canvas cutaway · four-stroke cycle · big gauges',
    file: PAGES['/2d'],
    rebuild: 'npm run demo',
  },
  {
    href: '/classic',
    name: 'Classic',
    detail: 'the original demo, frozen as shipped',
    file: PAGES['/classic'],
    rebuild: 'see web-original/README.md',
  },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};

/** Ask the gateway who it is; null when it is not running. */
const probeMame = () =>
  new Promise((resolve) => {
    const probe = httpRequest(
      { host: '127.0.0.1', port: mamePort, path: '/api/mode', timeout: 300 },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    probe.on('timeout', () => {
      probe.destroy();
      resolve(null);
    });
    probe.on('error', () => resolve(null));
    probe.end();
  });

const hubPage = (mame) => {
  const cards = DEMOS.map((demo) => {
    const built = existsSync(demo.file);
    const state = built ? '' : `<span class="off">not built · ${demo.rebuild}</span>`;
    const open = built ? `<a href="${demo.href}">` : '<div class="dead">';
    const close = built ? '</a>' : '</div>';
    return `${open}<h2>${demo.name}</h2><p>${demo.detail}</p>${state}${close}`;
  }).join('\n');
  const mameCard =
    mame === null
      ? `<div class="dead"><h2>MAME · real ROM</h2><p>the canonical firmware in a patched MAME</p>
         <span class="off">gateway not running · npm run demo:mame -- --mame … --rom …</span></div>`
      : `<a href="/3d/?backend=mame"><h2>MAME · real ROM</h2>
         <p>3d bay on the emulated firmware · ${mame.mode} · ${mame.controls}</p>
         <span class="live">gateway up on :${mamePort} · 2d: <code>/2d?backend=mame</code></span></a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Motronic 1.7 — demos</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-content: center; gap: 12px;
         background: #0a0d13; color: #dce4ee; font-family: "Avenir Next", system-ui, sans-serif; }
  .eyebrow { font: 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .22em;
             text-transform: uppercase; color: #75828f; }
  h1 { margin: 0 0 12px; font-size: 26px; }
  a, .dead { display: block; width: min(420px, 86vw); padding: 16px 18px; border-radius: 12px;
             border: 1px solid rgba(148,170,200,.16); background: rgba(13,17,24,.66);
             color: inherit; text-decoration: none; }
  a:hover { border-color: #ff7a29; }
  h2 { margin: 0; font-size: 15px; }
  p { margin: 4px 0 0; font: 12px/1.5 ui-monospace, Menlo, monospace; color: #75828f; }
  .dead { opacity: .45; }
  .off { font: 10px/1 ui-monospace, Menlo, monospace; color: #ff7a29; }
  .live { font: 10px/1.6 ui-monospace, Menlo, monospace; color: #5eead4; }
  code { font: inherit; color: #dce4ee; }
</style></head><body>
<div><p class="eyebrow">motronic 1.7 · clean-room ecu</p><h1>Demos</h1></div>
${cards}
${mameCard}
</body></html>`;
};

const send = (response, status, body, type = 'text/plain; charset=utf-8') => {
  response
    .writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
    .end(body);
};

const sendFile = (response, path) => {
  if (!existsSync(path)) {
    send(response, 404, `not built yet — run \`npm run demo\` from cleanroom/ and reload`);
    return;
  }
  // Re-read per request so a rebuild shows up on refresh.
  send(response, 200, readFileSync(path), TYPES[extname(path)] ?? 'application/octet-stream');
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  if (pathname === '/') {
    void probeMame().then((mame) => send(response, 200, hubPage(mame), TYPES['.html']));
    return;
  }
  if (pathname.startsWith('/api/')) {
    // Same-origin bridge to the MAME gateway so /2d and /3d/ pages can use
    // ?backend=mame without CORS. Streams both ways; SSE included.
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: mamePort,
        path: request.url,
        method: request.method,
        headers: { ...request.headers, host: `127.0.0.1:${mamePort}` },
      },
      (gatewayResponse) => {
        response.writeHead(gatewayResponse.statusCode ?? 502, gatewayResponse.headers);
        gatewayResponse.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) {
        send(
          response,
          502,
          '{"error":"MAME gateway is not running — start it with npm run demo:mame"}',
          'application/json; charset=utf-8',
        );
      }
    });
    request.pipe(upstream);
    return;
  }
  if (pathname in PAGES) {
    sendFile(response, PAGES[pathname]);
    return;
  }
  if (pathname === '/3d') {
    response.writeHead(302, { location: '/3d/' }).end();
    return;
  }
  if (pathname.startsWith('/3d/')) {
    const rel = normalize(pathname.slice('/3d/'.length) || 'index.html');
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
      send(response, 400, 'bad path');
      return;
    }
    sendFile(response, join(DIST_3D, rel));
    return;
  }
  send(response, 404, 'no such page — the demo hub lives at /');
}).listen(port, () => {
  process.stdout.write(`motronic demos on http://localhost:${port}/  (ctrl-c to stop)\n`);
});
