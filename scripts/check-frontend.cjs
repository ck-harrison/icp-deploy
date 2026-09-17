#!/usr/bin/env node
// Transpile the in-page JSX exactly as the browser does, and fail on a syntax
// error or on emitted `import` statements.
//
// Why this exists as a committed script rather than a prose instruction: the
// frontend is one `<script type="text/babel">` block compiled in the browser by
// @babel/standalone, so a JSX syntax error is invisible until someone loads the
// page and opens the console. There is no build step to catch it. This check
// caught a real unclosed <span>.
//
// It lived in a scratch directory until 2026-09-17, which meant the gate step
// documented in CLAUDE.md could not actually be run by anyone who had not
// rebuilt the harness by hand — and after a session boundary, that was nobody.
// A gate that cannot be executed is a gate that is not enforced.
//
// Babel is fetched once into .cache/ (gitignored) from the same pinned CDN URL
// the page itself uses, so this adds no npm dependency to a two-dependency
// project and works offline after the first run.
//
// `.cjs`, not `.js`: package.json declares "type": "module", so a .js file in
// this repo is an ES module and `require` is not defined in it.

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
// Defaults to the real page, but takes an optional path so the check can be
// canaried against a COPY carrying a planted syntax error. Without this the only
// way to prove the check still works was to break public/index.html in place and
// revert it, which is a discipline nobody keeps: a check you can only test by
// mutating the file it guards is a check that stops being tested.
const PAGE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'public', 'index.html');
const CACHE_DIR = path.join(ROOT, '.cache');
// Cached as .cjs, not .js: package.json declares "type": "module", so a .js
// file here is loaded as an ES module and the UMD bundle's module.exports
// assignment never happens, leaving Babel.transform undefined.
const BABEL = path.join(CACHE_DIR, 'babel.min.cjs');
// Must stay pinned to @7: Babel 8 changed the default sourceType to 'module',
// which makes the transpiler emit `import` statements into a non-module script
// context. Same pin as the <script src> in public/index.html.
const BABEL_URL = 'https://unpkg.com/@babel/standalone@7/babel.min.js';

// Repo-relative for files inside the repo, absolute for anything outside, so a
// canary run against an external copy is unmistakably not the real page.
function label(p) {
  const rel = path.relative(ROOT, p);
  return rel && !rel.startsWith('..') ? rel : p;
}

function fetchBabel() {
  return new Promise((resolve, reject) => {
    const get = (url) => https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(new URL(res.headers.location, url).toString());
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} fetching Babel`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(BABEL, Buffer.concat(chunks));
        resolve();
      });
    }).on('error', reject);
    get(BABEL_URL);
  });
}

(async () => {
  if (!fs.existsSync(BABEL)) {
    process.stdout.write(`fetching ${BABEL_URL} into .cache/ (first run only)... `);
    try { await fetchBabel(); process.stdout.write('done\n'); }
    catch (e) {
      console.error(`FAIL: could not obtain Babel: ${e.message}`);
      console.error('This check cannot run offline on a first run. Re-run with network access.');
      process.exit(2); // distinct from 1: the check did not run, it is not a pass
    }
  }

  const Babel = require(BABEL);
    if (!fs.existsSync(PAGE)) {
    console.error(`FAIL: no such file: ${PAGE}`);
    console.error('Usage: node scripts/check-frontend.cjs [path-to-html]');
    process.exit(2); // could not run, which is not a pass
  }
  const html = fs.readFileSync(PAGE, 'utf-8');
  const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
  if (!m) {
    console.error(`FAIL: no <script type="text/babel"> block found in ${label(PAGE)}`);
    process.exit(1);
  }

  const src = m[1];
  let out;
  try {
    out = Babel.transform(src, { presets: ['react'] }).code;
  } catch (e) {
    console.error(`FAIL: ${label(PAGE)}: ${e.message}`);
    process.exit(1);
  }

  // Law 1: state the denominator, so "0 failures" cannot read as "0 examined".
  if (/^\s*import\s/m.test(out)) {
    console.error('FAIL: transpiler emitted `import` statements into a non-module script context.');
    console.error('Check the @babel/standalone pin: Babel 8 changed the sourceType default.');
    process.exit(1);
  }
  console.log(`PASS: ${label(PAGE)}: transpiled ${src.length} chars of JSX -> ${out.length} chars, no import statements emitted`);
})();
