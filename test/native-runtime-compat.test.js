/* global suite, test */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

suite('native runtime compatibility', function () {
  test('loads crossnote HTML parsing without a global File constructor', function () {
    const script = `
      const { createRequire } = require('module');
      delete globalThis.File;
      const requireFromCrossnote = createRequire(require.resolve('crossnote'));
      requireFromCrossnote('cheerio');
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });

    assert.strictEqual(
      result.status,
      0,
      [result.stderr, result.stdout].filter(Boolean).join('\n'),
    );
  });
});
