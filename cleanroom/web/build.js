#!/usr/bin/env node
/**
 * Build the demos into self-contained HTML files.
 *
 * `tsc` compiles `src/` and `web/app/` together to CommonJS in `web/.build/`,
 * which resolves the `.ts` import specifiers a browser cannot load. Every
 * emitted module is then inlined behind a twenty-line module registry, so the
 * pages make no network request at all. One compile feeds every page; each
 * page differs only in entry module, shell, and stylesheet.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, '.build');
const distDir = join(here, 'dist');

const PAGES = [
  {
    entry: 'web/app/main',
    shell: 'shell.html',
    style: 'style.css',
    out: 'motronic-bench.html',
  },
  {
    entry: 'web/app/main-evidence',
    shell: 'shell-evidence.html',
    style: 'style-evidence.css',
    out: 'evidence-bench.html',
  },
];

const compile = () => {
  rmSync(buildDir, { recursive: true, force: true });
  try {
    execFileSync('tsc', ['-p', join(here, 'tsconfig.web.json')], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(
      `tsc failed (is TypeScript on PATH? \`npm i -g typescript\`): ${error.message}`,
    );
  }
};

/** Every emitted module, keyed by its extensionless path relative to .build. */
const collectModules = (dir = buildDir) => {
  const modules = new Map();
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      for (const [id, source] of collectModules(path)) modules.set(id, source);
      continue;
    }
    if (!entry.endsWith('.js')) continue;
    const id = relative(buildDir, path).slice(0, -3).split(sep).join('/');
    modules.set(id, readFileSync(path, 'utf8'));
  }
  return modules;
};

const RUNTIME = `
var __registry = {};
var __cache = {};
function __resolve(from, request) {
  if (request.charAt(0) !== '.') return request;
  var parts = from.split('/').slice(0, -1).concat(request.split('/'));
  var out = [];
  for (var i = 0; i < parts.length; i += 1) {
    var part = parts[i];
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  var id = out.join('/');
  return id.slice(-3) === '.js' ? id.slice(0, -3) : id;
}
function __makeRequire(from) {
  return function (request) {
    var id = __resolve(from, request);
    if (__cache[id]) return __cache[id].exports;
    var factory = __registry[id];
    if (!factory) throw new Error('module not bundled: ' + id + ' (from ' + from + ')');
    var module = { exports: {} };
    __cache[id] = module;
    factory(module, module.exports, __makeRequire(id));
    return module.exports;
  };
}
`;

const bundle = (modules, entry) => {
  const parts = [RUNTIME];
  for (const [id, source] of modules) {
    parts.push(
      `__registry[${JSON.stringify(id)}] = function (module, exports, require) {\n${source}\n};`,
    );
  }
  parts.push(`__makeRequire('bundle')(${JSON.stringify('./' + entry)});`);
  return parts.join('\n');
};

const build = () => {
  compile();
  const modules = collectModules();
  mkdirSync(distDir, { recursive: true });
  for (const page of PAGES) {
    if (!modules.has(page.entry)) throw new Error(`entry module ${page.entry} was not emitted`);
    const script = bundle(modules, page.entry).replaceAll('</script', '<\\/script');
    const html = readFileSync(join(here, page.shell), 'utf8')
      .replace('/* STYLE */', () => readFileSync(join(here, page.style), 'utf8'))
      .replace('/* SCRIPT */', () => script);
    const outFile = join(distDir, page.out);
    writeFileSync(outFile, html);
    const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
    process.stdout.write(`${modules.size} modules -> ${outFile} (${kb} kB, self-contained)\n`);
  }
};

build();
