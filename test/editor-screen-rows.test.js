/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for src/editor-screen-rows.ts.
 *
 * Pure helper, no vscode runtime needed — runs under plain mocha, compiled
 * on the fly with esbuild like the other pure-helper tests.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

let rows;
let tmpFile;

suite('editor-screen-rows', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '..', 'src', 'editor-screen-rows.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.editor-screen-rows.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    rows = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  const wrap = (text, column, wrappingIndent = 'none') =>
    rows.wrapLine(text, { column, tabSize: 4, wrappingIndent });

  test('does not wrap without a column or within it', function () {
    assert.deepStrictEqual(wrap('a long line of text', Infinity), [0]);
    assert.deepStrictEqual(wrap('short', 10), [0]);
  });

  test('breaks after spaces, never before them', function () {
    //            0123456789012345678
    const text = 'aaaa bbbb cccc dddd';
    assert.deepStrictEqual(wrap(text, 10), [0, 10]);
    // The space after "bbbb" may overflow the row.
    assert.deepStrictEqual(wrap(text, 9), [0, 10]);
    assert.deepStrictEqual(wrap(text, 8), [0, 5, 10, 15]);
  });

  test('hard-breaks words longer than a row', function () {
    assert.deepStrictEqual(wrap('abcdefghij', 4), [0, 4, 8]);
  });

  test('breaks after punctuation such as / and ,', function () {
    assert.deepStrictEqual(wrap('aaa/bbbbbb', 6), [0, 4]);
    assert.deepStrictEqual(wrap('aaa,bbbbbb', 6), [0, 4]);
  });

  test('indents continuation rows like the line', function () {
    // Continuation rows start 2 columns in, so "bbbb cc" no longer fits.
    assert.deepStrictEqual(wrap('  aaaa bbbb cc', 8, 'same'), [0, 7, 12]);
    assert.deepStrictEqual(wrap('  aaaa bbbb cc', 8, 'none'), [0, 7]);
  });

  test('counts full-width characters as two columns', function () {
    assert.deepStrictEqual(wrap('中文中文中文', 4), [0, 2, 4]);
  });

  test('rowOfCharacter finds the row a character is on', function () {
    assert.strictEqual(rows.rowOfCharacter([0, 10, 20], 0), 0);
    assert.strictEqual(rows.rowOfCharacter([0, 10, 20], 9), 0);
    assert.strictEqual(rows.rowOfCharacter([0, 10, 20], 10), 1);
    assert.strictEqual(rows.rowOfCharacter([0, 10, 20], 25), 2);
  });

  // Line 0 has one row, line 1 three rows, line 2 one row, line 3 two rows.
  const layout = { 0: [0], 1: [0, 10, 20], 2: [0], 3: [0, 10] };
  const rowStarts = (line) => layout[line] || [0];
  const range = (startLine, startChar, endLine, endChar) => ({
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  });

  test('visibleRowCount counts wrapped rows, including partial lines', function () {
    assert.strictEqual(
      rows.visibleRowCount(rowStarts, [range(0, 0, 3, 15)]),
      7,
    );
    // Starting on line 1's second row, ending on line 3's first row.
    assert.strictEqual(
      rows.visibleRowCount(rowStarts, [range(1, 10, 3, 10)]),
      4,
    );
  });

  test('screenRowOf counts rows from the top of the viewport', function () {
    const ranges = [range(0, 0, 3, 15)];
    assert.strictEqual(
      rows.screenRowOf(rowStarts, ranges, { line: 0, character: 0 }),
      0,
    );
    assert.strictEqual(
      rows.screenRowOf(rowStarts, ranges, { line: 1, character: 25 }),
      3,
    );
    assert.strictEqual(
      rows.screenRowOf(rowStarts, ranges, { line: 3, character: 12 }),
      6,
    );
    assert.strictEqual(
      rows.screenRowOf(rowStarts, [range(1, 10, 3, 10)], {
        line: 1,
        character: 2,
      }),
      undefined,
    );
  });

  test('positionAtScreenRow returns the start of that row', function () {
    const ranges = [range(0, 0, 3, 15)];
    assert.deepStrictEqual(rows.positionAtScreenRow(rowStarts, ranges, 2), {
      line: 1,
      character: 10,
    });
    assert.deepStrictEqual(rows.positionAtScreenRow(rowStarts, ranges, 4), {
      line: 2,
      character: 0,
    });
  });

  test('positionRowsAbove walks up through wrapped rows', function () {
    assert.deepStrictEqual(
      rows.positionRowsAbove(rowStarts, { line: 3, character: 12 }, 3),
      { line: 1, character: 20 },
    );
    assert.deepStrictEqual(
      rows.positionRowsAbove(rowStarts, { line: 3, character: 12 }, 100),
      { line: 0, character: 0 },
    );
  });

  test('WrapColumnEstimator infers the column from row starts', function () {
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    const estimator = new rows.WrapColumnEstimator();
    assert.strictEqual(estimator.column, undefined);
    // At column 12 the rows start at 0, 10, 20 and 30.
    estimator.observe(text, 10);
    estimator.observe(text, 20);
    const column = estimator.column;
    assert.ok(column !== undefined);
    assert.deepStrictEqual(
      rows.wrapLine(text, { column, tabSize: 4 }).slice(0, 3),
      [0, 10, 20],
    );
  });

  test('WrapColumnEstimator starts over after a resize', function () {
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    const estimator = new rows.WrapColumnEstimator();
    estimator.observe(text, 10);
    // A row starting at 25 is impossible for every column that started one at 10.
    estimator.observe(text, 25);
    const column = estimator.column;
    assert.ok(rows.wrapLine(text, { column, tabSize: 4 }).includes(25));
  });
});
