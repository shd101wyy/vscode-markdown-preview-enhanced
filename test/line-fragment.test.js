/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for src/line-fragment.ts.
 *
 * Pure helper, no vscode runtime needed — runs under plain mocha.  Same
 * esbuild-on-the-fly approach as find-fragment-target-line.test.js.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let parseLineFragment;
let tmpFile;

suite('parseLineFragment', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '..', 'src', 'line-fragment.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.line-fragment.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    parseLineFragment = require(tmpFile).parseLineFragment;
  });

  suiteTeardown(function () {
    if (tmpFile) {
      fs.unlinkSync(tmpFile);
    }
  });

  const cases = [
    // GitHub-style with the L prefix
    ['L100', { startLine: 99, endLine: 99 }],
    ['L100-L104', { startLine: 99, endLine: 103 }],
    ['L100-104', { startLine: 99, endLine: 103 }],
    ['l100', { startLine: 99, endLine: 99 }],
    // bare shorthand from vscode-mpe#2453
    ['100', { startLine: 99, endLine: 99 }],
    ['100-104', { startLine: 99, endLine: 103 }],
    // clamping
    ['L0', { startLine: 0, endLine: 0 }],
    ['L1', { startLine: 0, endLine: 0 }],
    ['L0-0', { startLine: 0, endLine: 0 }],
    // reversed range clamps to the start line
    ['L104-L100', { startLine: 103, endLine: 103 }],
  ];
  for (const [fragment, expected] of cases) {
    test(`parses #${fragment}`, function () {
      assert.deepStrictEqual(parseLineFragment(fragment), expected);
    });
  }

  const nonLineFragments = [
    '',
    'heading',
    'L',
    'L100x',
    'xL100',
    'L100-L104-L108',
    'L-100',
    '-100',
    'L100-',
    '12.5',
    '1e3',
  ];
  for (const fragment of nonLineFragments) {
    test(`returns null for #${fragment}`, function () {
      assert.strictEqual(parseLineFragment(fragment), null);
    });
  }
});
