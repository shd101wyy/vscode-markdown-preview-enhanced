/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

// Screen positions for scroll sync (#2450): where the cursor sits in the
// viewport and where to scroll so a position lands at a given height —
// counting the editor's wrapped rows, which VS Code does not expose.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { stubPlugin } = require('./vscode-stub');

let bundle;
let tmpFile;

suite('editor screen positions (scroll sync)', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents:
          "import * as vscode from 'vscode';" +
          'export {' +
          '  getScreenRatio,' +
          '  getCenterPosition,' +
          "  getTopPositionForRatio } from './src/editor-screen-position';" +
          'export const stubPosition = (line, character) =>' +
          '  new vscode.Position(line, character);',
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
    tmpFile = path.join(__dirname, '.editor-screen-position.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    // wordWrap 'off' unless a test overrides it.
    globalThis.__vscodeStubConfiguration = { wordWrap: 'off' };
  });

  teardown(function () {
    globalThis.__vscodeStubConfiguration = {};
  });

  function makeEditor({ lines, visibleRanges, tabSize = 4 }) {
    return {
      options: { tabSize },
      visibleRanges: visibleRanges.map(
        ({ startLine, startCharacter, endLine, endCharacter }) => ({
          start: { line: startLine, character: startCharacter },
          end: { line: endLine, character: endCharacter },
        }),
      ),
      document: {
        lineCount: lines.length,
        lineAt: (line) => ({ text: lines[line] ?? '' }),
      },
    };
  }

  const wholeDoc = (lineCount) => [
    {
      startLine: 0,
      startCharacter: 0,
      endLine: lineCount - 1,
      endCharacter: 1000,
    },
  ];

  test('without wrapping, the ratio is the position among the visible lines', function () {
    const lines = Array.from({ length: 10 }, (_, i) => 'line ' + i);
    const editor = makeEditor({ lines, visibleRanges: wholeDoc(10) });
    assert.strictEqual(
      bundle.getScreenRatio(editor, bundle.stubPosition(4, 0)),
      0.45,
    );
    // Off-screen positions have no ratio.
    assert.strictEqual(
      bundle.getScreenRatio(editor, bundle.stubPosition(99, 0)),
      undefined,
    );
  });

  test('a wrapped row moves the cursor down by the rows it adds', function () {
    // Line 0 wraps to 3 rows at wordWrapColumn 20 (45 chars, no spaces),
    // so the cursor past column 40 sits on row 2 — not row 0.
    globalThis.__vscodeStubConfiguration = {
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 20,
    };
    const lines = ['x'.repeat(45), 'short'];
    const editor = makeEditor({
      lines,
      visibleRanges: [
        {
          startLine: 0,
          startCharacter: 0,
          endLine: 1,
          endCharacter: 5,
        },
      ],
    });
    // 4 rows total (3 + 1); the cursor at column 41 is on row 2.
    assert.strictEqual(
      bundle.getScreenRatio(editor, bundle.stubPosition(0, 41)),
      (2 + 0.5) / 4,
    );
  });

  test('the center position starts the viewport middle row', function () {
    const lines = Array.from({ length: 10 }, (_, i) => 'line ' + i);
    const editor = makeEditor({ lines, visibleRanges: wholeDoc(10) });
    const center = bundle.getCenterPosition(editor);
    assert.ok(center, 'expected a center position');
    // Row 5 of 10 — floor(10 / 2).
    assert.strictEqual(center.position.line, 5);
    assert.strictEqual(center.position.character, 0);
    assert.strictEqual(center.ratio, (5 + 0.5) / 10);
  });

  test('getTopPositionForRatio reveals rows above the position', function () {
    const lines = Array.from({ length: 10 }, (_, i) => 'line ' + i);
    const editor = makeEditor({ lines, visibleRanges: wholeDoc(10) });
    // Putting line 8 in the middle means the top is line 3.
    const top = bundle.getTopPositionForRatio(
      editor,
      bundle.stubPosition(8, 0),
      0.5,
    );
    assert.strictEqual(top.line, 3);
    assert.strictEqual(top.character, 0);
    // A ratio at the very top is the position itself.
    const zero = bundle.getTopPositionForRatio(
      editor,
      bundle.stubPosition(8, 0),
      0,
    );
    assert.strictEqual(zero.line, 8);
  });

  test('with wordWrap on, the ratio exists once a wrap column is inferred', function () {
    globalThis.__vscodeStubConfiguration = { wordWrap: 'on' };
    const lines = ['x'.repeat(25)];
    // Before any usable sample the column is unknown.
    const cold = makeEditor({
      lines,
      visibleRanges: [
        { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 25 },
      ],
    });
    assert.strictEqual(
      bundle.getScreenRatio(cold, bundle.stubPosition(0, 0)),
      undefined,
    );
    // A viewport that starts mid-line at character 10 shows a real row
    // start: with no whitespace, only column 10 explains it.
    const warm = makeEditor({
      lines,
      visibleRanges: [
        { startLine: 0, startCharacter: 10, endLine: 0, endCharacter: 25 },
      ],
    });
    // Two rows are visible above char 10 (row 0: 0-9) and the sampled
    // row (10-19); the tail row is clipped by the range end at 25.
    const ratio = bundle.getScreenRatio(warm, bundle.stubPosition(0, 12));
    assert.ok(ratio !== undefined, 'expected a ratio after inference');
    assert.ok(ratio > 0 && ratio <= 1, 'ratio must be within (0, 1]');
  });
});
