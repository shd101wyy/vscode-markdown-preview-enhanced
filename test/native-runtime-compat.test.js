/* global suite, test */

/**
 * Guards the shipped native bundle against code that needs a newer Node.js
 * than the VS Code extension host provides.
 *
 * Extensions 0.8.32–0.8.34 bundled cheerio 1.2.0, which requires the `File`
 * global from Node.js 20.18+, so on the Node 18 extension host of VS Code
 * 1.82–1.97 the extension failed to even load with `ReferenceError: File is
 * not defined` (#2394). crossnote pins cheerio to 1.0.0 and has its own
 * runtime-compat test; this one checks the artifact users actually run —
 * the esbuild bundle — so a future dependency bump that reintroduces
 * Node-20-only module-scope code fails CI here instead of shipping.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', 'out', 'native', 'extension.js');

// Load the bundle in a child process that mimics the extension host:
// - `File` is deleted, standing in for the Node 18 extension host;
// - `require('vscode')` is answered by a permissive stub: an object whose
//   prototype chain resolves any property to a no-op proxy. The prototype
//   matters because esbuild's `__toESM` copies *own enumerable properties*
//   off the module — a Proxy over `{}` has none, and the copied namespace
//   would crash at module scope on `vscode.workspace.getConfiguration`
//   (run by `globalConfigPath` in src/utils.ts).
const CHILD_SCRIPT = `
  'use strict';
  const assert = require('assert');
  const Module = require('module');

  assert.strictEqual(Reflect.deleteProperty(globalThis, 'File'), true);
  assert.strictEqual(typeof File, 'undefined');

  function stub() {
    return new Proxy(function () {}, {
      get(target, prop) {
        if (prop === Symbol.toPrimitive) return () => 'stub';
        if (prop === 'then') return undefined;
        if (prop === Symbol.iterator)
          return () => ({ next: () => ({ done: true, value: undefined }) });
        return stub();
      },
      apply: () => stub(),
      construct: () => stub(),
      set: () => true,
    });
  }

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return Object.create(stub());
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  require(${JSON.stringify(BUNDLE_PATH)});
  process.exit(0);
`;

suite('native runtime compatibility', function () {
  this.timeout(60000);

  test('bundle loads without the File global (Node 18 extension host)', function () {
    assert.ok(
      fs.existsSync(BUNDLE_PATH),
      `${BUNDLE_PATH} not found — run \`pnpm build\` first`,
    );

    const result = spawnSync(process.execPath, ['-e', CHILD_SCRIPT], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    });

    assert.strictEqual(
      result.error,
      undefined,
      `bundle load did not finish: ${result.error}`,
    );
    assert.strictEqual(
      result.status,
      0,
      `bundle failed to load on a File-less runtime:\n${result.stderr}`,
    );
  });
});
