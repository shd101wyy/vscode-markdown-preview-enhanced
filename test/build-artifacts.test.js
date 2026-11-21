/* global suite, test */

/**
 * Asserts the build produced every runtime file the shipped bundle loads
 * from disk next to itself.
 *
 * The copy steps in build.js used to warn-and-skip when they could not find
 * a file, so the markdown_yo → @shd101wyy/markdown-yo repackaging shipped
 * releases whose out/native/ had no markdown-yo-wasm-api.wasm while every
 * build stayed green — the emscripten glue resolves it from __dirname, so
 * `markdownParser: 'markdown-yo'` silently ran on its markdown-it fallback
 * everywhere. The copy steps now fail the build, and this test is the
 * regression net at the artifact level: CI builds before testing, so a
 * future change that quietly drops or renames any load-time file fails
 * here with the missing path named.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');

// Everything the extension needs beyond its own code at load or first use.
// crossnote is pinned exact, so these can never be legitimately absent from
// a build that succeeded. (crossnote-serve.js is bundled whenever the pinned
// crossnote exports ./cli, which every version since the serve CLI does.)
const ARTIFACTS = [
  // esbuild bundles — native extension host, web extension host, serve CLI
  'native/extension.js',
  'web/extension.js',
  'native/crossnote-serve.js',
  // markdown-yo wasm — loaded by the bundled emscripten glue from __dirname
  'native/markdown-yo-wasm-api.wasm',
  // jsdom's sync-XHR worker — require.resolve()d when jsdom loads (tikz)
  'native/xhr-sync-worker.js',
  // node-tikzjax wasm + TeX data — loaded when a tikz diagram renders
  'tex/tex.wasm.gz',
  'tex/core.dump.gz',
  'tex/tex_files.tar.gz',
];

suite('build artifacts', function () {
  test('the build shipped every load-time file the bundle expects', function () {
    // Same convention as native-runtime-compat: the suite runs after
    // `pnpm build` (CI guarantees it), so a missing bundle means the build
    // was never run, not that it silently skipped a copy.
    const bundle = path.join(OUT_DIR, 'native', 'extension.js');
    assert.ok(
      fs.existsSync(bundle),
      `${bundle} not found — run \`pnpm build\` first`,
    );

    const missing = ARTIFACTS.filter(
      (rel) => !fs.existsSync(path.join(OUT_DIR, rel)),
    );
    assert.deepStrictEqual(
      missing,
      [],
      `pnpm build completed but did not produce: ${missing.join(
        ', ',
      )} — a copy step or bundle target regressed`,
    );
  });
});
