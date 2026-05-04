/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for the pure helpers in src/block-id-helpers.ts.  The
 * provider class itself imports `vscode` (only resolvable at extension
 * host runtime), so the helpers live in their own file specifically to
 * make this kind of standalone testing possible.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let parseBlockIdTriggerContext;
let extractBlockIds;
let tmpFile;

suite('block-id-helpers', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '..', 'src', 'block-id-helpers.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.block-id-helpers.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    const mod = require(tmpFile);
    parseBlockIdTriggerContext = mod.parseBlockIdTriggerContext;
    extractBlockIds = mod.extractBlockIds;
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  suite('parseBlockIdTriggerContext', function () {
    test('returns null when the cursor is not in a wikilink', function () {
      assert.strictEqual(parseBlockIdTriggerContext('plain text ^abc'), null);
      assert.strictEqual(parseBlockIdTriggerContext(''), null);
      assert.strictEqual(parseBlockIdTriggerContext('No brackets here'), null);
    });

    test('returns null when the wikilink has no caret', function () {
      assert.strictEqual(parseBlockIdTriggerContext('[[README'), null);
      assert.strictEqual(parseBlockIdTriggerContext('[[README#Heading'), null);
    });

    test('captures note name + empty partial right after [[Note^', function () {
      assert.deepStrictEqual(parseBlockIdTriggerContext('[[README^'), {
        noteName: 'README',
        partial: '',
      });
    });

    test('captures partial id while the user is typing', function () {
      assert.deepStrictEqual(parseBlockIdTriggerContext('[[README^ab'), {
        noteName: 'README',
        partial: 'ab',
      });
    });

    test('handles a heading prefix [[Note#Heading^...', function () {
      assert.deepStrictEqual(
        parseBlockIdTriggerContext('See [[README#Setup^abc'),
        { noteName: 'README', partial: 'abc' },
      );
    });

    test('trims whitespace around the note name', function () {
      assert.deepStrictEqual(parseBlockIdTriggerContext('[[ Notes/Daily ^'), {
        noteName: 'Notes/Daily',
        partial: '',
      });
    });

    test('only looks at the cursor position (ignores text after)', function () {
      // The provider always passes textBeforeCursor.  Make sure a closing
      // ]] later in the line doesn't break detection.
      assert.deepStrictEqual(
        parseBlockIdTriggerContext('Already closed [[Other]] now [[README^'),
        { noteName: 'README', partial: '' },
      );
    });
  });

  suite('extractBlockIds', function () {
    test('returns [] for content with no block ids', function () {
      assert.deepStrictEqual(extractBlockIds('Just some prose.\nNothing.'), []);
    });

    test('finds a block id at end of paragraph', function () {
      const text = '# H\n\nFirst paragraph. ^abc\n\nNext.';
      assert.deepStrictEqual(extractBlockIds(text), [
        { id: 'abc', body: 'First paragraph.' },
      ]);
    });

    test('preserves source order', function () {
      const text = [
        'Line one. ^one',
        'Middle.',
        'Line two. ^two',
        'Line three. ^three',
      ].join('\n');
      const out = extractBlockIds(text);
      assert.deepStrictEqual(
        out.map((b) => b.id),
        ['one', 'two', 'three'],
      );
    });

    test('dedupes ids that appear more than once', function () {
      const text = 'First. ^abc\nSecond.\nThird. ^abc';
      const out = extractBlockIds(text);
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].id, 'abc');
      assert.strictEqual(out[0].body, 'First.');
    });

    test('does not match an inline ^id with non-whitespace before/after', function () {
      // ^id must be preceded by whitespace AND end the line — otherwise
      // it might be a normal use of the caret in math, an emoji, etc.
      const text = 'Mention of ^abc in middle.\nReal block. ^abc';
      const out = extractBlockIds(text);
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].body, 'Real block.');
    });

    test('handles ids with hyphens, underscores and digits', function () {
      const text = 'Block. ^my-block_123';
      const out = extractBlockIds(text);
      assert.deepStrictEqual(out, [{ id: 'my-block_123', body: 'Block.' }]);
    });
  });
});
