#!/usr/bin/env node
/**
 * Serve `web/dist` on localhost. The page is one self-contained file and works
 * over `file://` too; this exists so `npm run demo` gives a URL to click.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distFile = join(here, 'dist', 'motronic-bench.html');
const port = Number(process.env.PORT ?? 8099);

readFileSync(distFile); // fails loud here if the build has not run

createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  // Re-read per request so a rebuild shows up on refresh.
  response
    .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    .end(readFileSync(distFile));
}).listen(port, () => {
  process.stdout.write(`motronic bench on http://localhost:${port}/  (ctrl-c to stop)\n`);
});
