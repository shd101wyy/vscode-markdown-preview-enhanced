/* global suite, test */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

suite('native runtime compatibility', function () {
  test('parses HTML with crossnote cheerio without a global File constructor', function () {
    const script = `
      const assert = require('assert');
      const { createRequire } = require('module');
      assert.strictEqual(Reflect.deleteProperty(globalThis, 'File'), true);
      assert.strictEqual(typeof globalThis.File, 'undefined');
      const requireFromCrossnote = createRequire(require.resolve('crossnote'));
      const cheerio = requireFromCrossnote('cheerio');
      const $ = cheerio.load('<main><h1>Preview</h1></main>');
      assert.strictEqual($('h1').text(), 'Preview');
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
