/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for src/find-fragment-target-line.ts.
 *
 * Pure helper, no vscode runtime needed — runs under plain mocha.  We
 * use esbuild (already a dev dep) to compile the TS source on the fly
 * so we don't have to add ts-node or maintain a separate tsconfig just
 * for tests.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let findFragmentTargetLine;
let tmpFile;

suite('findFragmentTargetLine', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '..', 'src', 'find-fragment-target-line.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.find-fragment-target-line.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    findFragmentTargetLine = require(tmpFile).findFragmentTargetLine;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  test('returns -1 for an empty fragment', function () {
    assert.strictEqual(
      findFragmentTargetLine('hello\nworld', ''),
      -1,
      'empty fragment should match nothing',
    );
  });

  test('finds a paragraph by ^block-id', function () {
    const text = ['# Heading', '', 'First paragraph. ^abc', '', 'Second.'].join(
      '\n',
    );
    assert.strictEqual(findFragmentTargetLine(text, '^abc'), 2);
  });

  test('finds the line for a combined Heading^block fragment via the block', function () {
    // The resolver only matches the LAST `^id` in the fragment, which is
    // the right behavior — block IDs are unique per file, so we ignore
    // the heading prefix and jump straight to the block.
    const text = [
      '# Setup',
      'A line.',
      'Pinned line. ^my-block',
      '# Other',
    ].join('\n');
    assert.strictEqual(findFragmentTargetLine(text, 'Setup^my-block'), 2);
  });

  test('returns -1 when ^block-id is not present', function () {
    const text = '# Heading\n\nNo block here.';
    assert.strictEqual(findFragmentTargetLine(text, '^missing'), -1);
  });

  test('falls through to heading-slug match when fragment has no caret', function () {
    const text = '# Setup\n\nBody.\n\n## Configuration\n\nMore.';
    // HeadingIdGenerator slug for "Setup" is "setup"
    assert.strictEqual(findFragmentTargetLine(text, 'setup'), 0);
    // For "Configuration" → "configuration"
    assert.strictEqual(findFragmentTargetLine(text, 'configuration'), 4);
  });

  test('does not falsely match a block-id substring inside a paragraph', function () {
    // The trailing-^id matcher requires whitespace before and end-of-line
    // after, so an inline mention does not count as the block target.
    const text = ['Some prose mentioning ^abc inline.', 'Another. ^abc'].join(
      '\n',
    );
    // The second line ends with " ^abc" — that's the block, line 1
    assert.strictEqual(findFragmentTargetLine(text, '^abc'), 1);
  });

  test('handles ^block-id with hyphens and underscores', function () {
    const text = 'Para. ^my-block_123';
    assert.strictEqual(findFragmentTargetLine(text, '^my-block_123'), 0);
  });

  test('returns -1 when the fragment matches neither a block nor a heading', function () {
    const text = '# Setup\n\nBody.';
    assert.strictEqual(findFragmentTargetLine(text, 'NoSuchAnchor'), -1);
  });
});
