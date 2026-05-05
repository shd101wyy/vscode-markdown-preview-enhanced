/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for `rankByCloseness`, the Levenshtein-based suggester
 * used in the wikilink hover provider's "did you mean …" message.
 *
 * Same on-the-fly esbuild trick as block-id-helpers.test.js — the
 * function lives in a file that also imports vscode, so we mark
 * vscode + crossnote external and pluck out only this helper.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let rankByCloseness;
let tmpFile;

suite('rankByCloseness', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '..', 'src', 'wikilink-hover-provider.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
      external: ['vscode', 'crossnote'],
    });
    tmpFile = path.join(__dirname, '.rank-by-closeness.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    // Stub vscode + crossnote so the bundle's top-level `require()`
    // calls resolve.  The function under test doesn't touch them.
    require.cache[require.resolve.paths('vscode')[0] + '/vscode.js'];
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...rest) {
      if (request === 'vscode' || request === 'crossnote') {
        return request;
      }
      return origResolve.call(this, request, parent, ...rest);
    };
    require.cache['vscode'] = {
      id: 'vscode',
      filename: 'vscode',
      loaded: true,
      exports: {},
    };
    require.cache['crossnote'] = {
      id: 'crossnote',
      filename: 'crossnote',
      loaded: true,
      exports: {
        extractBlockIds: () => [],
        findFragmentTargetLine: () => -1,
        matter: (s) => ({ data: {}, content: s }),
      },
    };
    const mod = require(tmpFile);
    rankByCloseness = mod.rankByCloseness;
    Module._resolveFilename = origResolve;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
    delete require.cache['vscode'];
    delete require.cache['crossnote'];
  });

  test('puts substring matches ahead of non-substring matches', function () {
    const ranked = rankByCloseness('foo', ['xyz', 'foobar', 'fox']);
    assert.deepStrictEqual(ranked, ['foobar', 'fox', 'xyz']);
  });

  test('breaks ties by Levenshtein distance', function () {
    // None of these contain "abc" as substring, so all rank by
    // distance; "abc" → "abd" is 1, "abc" → "xyz" is 3.
    const ranked = rankByCloseness('abc', ['xyz', 'abd']);
    assert.deepStrictEqual(ranked, ['abd', 'xyz']);
  });

  test('is case-insensitive', function () {
    const ranked = rankByCloseness('Setup', ['SETUP', 'random']);
    assert.strictEqual(ranked[0], 'SETUP');
  });

  test('returns [] when there are no candidates', function () {
    assert.deepStrictEqual(rankByCloseness('anything', []), []);
  });

  test('returns the only candidate when there is one', function () {
    assert.deepStrictEqual(rankByCloseness('abc', ['xyz']), ['xyz']);
  });

  test('typo case: ^abc -> ^asb is the closest neighbor', function () {
    // The user-reported scenario: file has ^asb, link uses ^abc.
    const ranked = rankByCloseness('abc', [
      'asb',
      'unrelated-block',
      'totally-different',
    ]);
    assert.strictEqual(ranked[0], 'asb');
  });
});
