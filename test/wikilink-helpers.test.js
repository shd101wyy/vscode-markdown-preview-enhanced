/* global suite, test, suiteSetup, suiteTeardown */

// The shared wikilink target split (used by both the document-link
// provider and the hover provider, so a click and the hover tooltip
// always agree) — #2472 / #2479 follow-ups.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { stubPlugin } = require('./vscode-stub');

let bundle;
let tmpFile;

suite('splitWikilinkTarget', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents:
          "export { splitWikilinkTarget } from './src/wikilink-helpers';",
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
      plugins: [stubPlugin()],
    });
    tmpFile = path.join(__dirname, '.wikilink-helpers.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  const split = (target) => bundle.splitWikilinkTarget(target);

  test('a plain note name has no fragment', function () {
    assert.deepStrictEqual(split('Note'), { noteName: 'Note', fragment: '' });
    assert.deepStrictEqual(split('  Note  '), {
      noteName: 'Note',
      fragment: '',
    });
  });

  test('heading and block fragments split off their note', function () {
    assert.deepStrictEqual(split('Note#Heading'), {
      noteName: 'Note',
      fragment: 'Heading',
    });
    assert.deepStrictEqual(split('Note^block-id'), {
      noteName: 'Note',
      fragment: '^block-id',
    });
    // The fragment keeps the block marker itself, trimmed — the hover
    // used to leave the untrimmed form behind.
    assert.deepStrictEqual(split('Note^ '), {
      noteName: 'Note',
      fragment: '^',
    });
    assert.deepStrictEqual(split('Note# Heading '), {
      noteName: 'Note',
      fragment: 'Heading',
    });
  });

  test('a same-file fragment names no note', function () {
    assert.deepStrictEqual(split('#Heading'), {
      noteName: '',
      fragment: 'Heading',
    });
    assert.deepStrictEqual(split('^block-id'), {
      noteName: '',
      fragment: '^block-id',
    });
    // Spaces around the fragment never become a note name.
    assert.deepStrictEqual(split(' #Heading '), {
      noteName: '',
      fragment: 'Heading',
    });
  });

  test('the first marker splits; the fragment keeps the rest', function () {
    assert.deepStrictEqual(split('Note#Head^tail'), {
      noteName: 'Note',
      fragment: 'Head^tail',
    });
    // A note whose name contains no marker is found even with both
    // markers later in the string.
    assert.deepStrictEqual(split('dir/Note#H'), {
      noteName: 'dir/Note',
      fragment: 'H',
    });
  });
});
