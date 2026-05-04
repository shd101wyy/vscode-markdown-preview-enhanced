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
let parseHeadingTriggerContext;
let extractHeadings;
let parseNoteTriggerContext;
let parseTagTriggerContext;
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
    parseHeadingTriggerContext = mod.parseHeadingTriggerContext;
    extractHeadings = mod.extractHeadings;
    parseNoteTriggerContext = mod.parseNoteTriggerContext;
    parseTagTriggerContext = mod.parseTagTriggerContext;
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

  suite('parseHeadingTriggerContext', function () {
    test('returns null when not in a wikilink', function () {
      assert.strictEqual(parseHeadingTriggerContext('# Heading'), null);
      assert.strictEqual(parseHeadingTriggerContext(''), null);
    });

    test('returns null when there is no #', function () {
      assert.strictEqual(parseHeadingTriggerContext('[[README'), null);
      assert.strictEqual(parseHeadingTriggerContext('[[README^abc'), null);
    });

    test('captures empty partial right after [[Note#', function () {
      assert.deepStrictEqual(parseHeadingTriggerContext('[[README#'), {
        noteName: 'README',
        partial: '',
      });
    });

    test('captures partial heading slug while typing', function () {
      assert.deepStrictEqual(parseHeadingTriggerContext('[[README#se'), {
        noteName: 'README',
        partial: 'se',
      });
    });

    test('does NOT match when the fragment already contains ^ (block context wins)', function () {
      // [[Note#Heading^abc] should be handled by parseBlockIdTriggerContext,
      // not parseHeadingTriggerContext.
      assert.strictEqual(
        parseHeadingTriggerContext('[[README#Setup^abc'),
        null,
      );
    });

    test('only looks at the cursor position', function () {
      assert.deepStrictEqual(
        parseHeadingTriggerContext('Already [[Other#X]] then [[README#'),
        { noteName: 'README', partial: '' },
      );
    });
  });

  suite('extractHeadings', function () {
    test('returns [] when there are no headings', function () {
      assert.deepStrictEqual(extractHeadings('Just prose, no #.'), []);
    });

    test('extracts ATX headings with text + slug', function () {
      const text = ['# Setup Guide', '', 'Body.', '', '## Configuration'].join(
        '\n',
      );
      const out = extractHeadings(text);
      assert.deepStrictEqual(out, [
        { level: 1, text: 'Setup Guide', slug: 'setup-guide' },
        { level: 2, text: 'Configuration', slug: 'configuration' },
      ]);
    });

    test('strips trailing {#id} attribute spans before slugifying', function () {
      const text = '# Custom ID heading {#my-id}';
      const out = extractHeadings(text);
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].text, 'Custom ID heading');
    });

    test('disambiguates duplicate headings the same way crossnote does', function () {
      // HeadingIdGenerator suffixes duplicates with -1, -2, …
      const text = '# Setup\n\n# Setup\n\n# Setup';
      const slugs = extractHeadings(text).map((h) => h.slug);
      assert.deepStrictEqual(slugs, ['setup', 'setup-1', 'setup-2']);
    });

    test('skips lines inside fenced code blocks', function () {
      const text = [
        '# Real heading',
        '',
        '```js',
        '# not a heading',
        '## also not',
        '```',
        '',
        '## Another real heading',
      ].join('\n');
      const out = extractHeadings(text);
      assert.deepStrictEqual(
        out.map((h) => h.text),
        ['Real heading', 'Another real heading'],
      );
    });

    test('handles all 6 heading levels', function () {
      const text = '# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6';
      const out = extractHeadings(text);
      assert.deepStrictEqual(
        out.map((h) => h.level),
        [1, 2, 3, 4, 5, 6],
      );
    });

    test('does not treat 7+ leading hashes as a heading', function () {
      const out = extractHeadings('####### too many');
      assert.deepStrictEqual(out, []);
    });
  });

  suite('parseNoteTriggerContext', function () {
    test('returns null for plain text and empty input', function () {
      assert.strictEqual(parseNoteTriggerContext(''), null);
      assert.strictEqual(parseNoteTriggerContext('No brackets'), null);
      assert.strictEqual(parseNoteTriggerContext('Just one ['), null);
    });

    test('matches `[[` with empty partial', function () {
      assert.deepStrictEqual(parseNoteTriggerContext('See [['), {
        partial: '',
        isEmbed: false,
      });
    });

    test('matches `![[` and flags as embed', function () {
      assert.deepStrictEqual(parseNoteTriggerContext('Look at ![['), {
        partial: '',
        isEmbed: true,
      });
    });

    test('captures partial note name', function () {
      assert.deepStrictEqual(parseNoteTriggerContext('[[Read'), {
        partial: 'Read',
        isEmbed: false,
      });
      assert.deepStrictEqual(parseNoteTriggerContext('![[image'), {
        partial: 'image',
        isEmbed: true,
      });
    });

    test('does NOT match once # is typed (heading context takes over)', function () {
      assert.strictEqual(parseNoteTriggerContext('[[Note#Setup'), null);
    });

    test('does NOT match once ^ is typed (block context takes over)', function () {
      assert.strictEqual(parseNoteTriggerContext('[[Note^abc'), null);
    });

    test('does NOT match once | is typed (alias context — out of scope)', function () {
      assert.strictEqual(parseNoteTriggerContext('[[Note|al'), null);
    });

    test('does NOT match a single bracket', function () {
      assert.strictEqual(parseNoteTriggerContext('Plain [link'), null);
    });

    test('only looks at the cursor position (closed wikilinks earlier on the line)', function () {
      assert.deepStrictEqual(
        parseNoteTriggerContext('Already [[A]] but now [['),
        { partial: '', isEmbed: false },
      );
    });
  });

  suite('parseTagTriggerContext', function () {
    test('returns null for empty input', function () {
      assert.strictEqual(parseTagTriggerContext(''), null);
    });

    test('matches a # in mid-line body text', function () {
      assert.deepStrictEqual(parseTagTriggerContext('Hello #'), {
        partial: '',
      });
      assert.deepStrictEqual(parseTagTriggerContext('Hello #wo'), {
        partial: 'wo',
      });
    });

    test('captures nested tag partials', function () {
      assert.deepStrictEqual(parseTagTriggerContext('See #parent/'), {
        partial: 'parent/',
      });
      assert.deepStrictEqual(parseTagTriggerContext('See #parent/ch'), {
        partial: 'parent/ch',
      });
    });

    test('SUPPRESSES at start of line for ATX heading markers', function () {
      assert.strictEqual(parseTagTriggerContext('#'), null);
      assert.strictEqual(parseTagTriggerContext('##'), null);
      assert.strictEqual(parseTagTriggerContext('###'), null);
      assert.strictEqual(parseTagTriggerContext('# '), null);
      assert.strictEqual(parseTagTriggerContext('## '), null);
    });

    test('does NOT match inside an unclosed [[…]] (handled by heading/block ctx)', function () {
      assert.strictEqual(parseTagTriggerContext('See [[Note#'), null);
      assert.strictEqual(parseTagTriggerContext('See [[Note#se'), null);
    });

    test('matches AFTER a closed [[…]] earlier on the line', function () {
      assert.deepStrictEqual(parseTagTriggerContext('See [[Other]] now #'), {
        partial: '',
      });
    });

    test('matches `#` after various punctuation delimiters', function () {
      assert.deepStrictEqual(parseTagTriggerContext('(#'), { partial: '' });
      assert.deepStrictEqual(parseTagTriggerContext('foo,#'), { partial: '' });
      assert.deepStrictEqual(parseTagTriggerContext('end. #'), { partial: '' });
    });

    test('does NOT match when preceded by a word character (URL fragment-ish)', function () {
      assert.strictEqual(parseTagTriggerContext('http://x.com#'), null);
      assert.strictEqual(parseTagTriggerContext('foo#'), null);
    });
  });
});
