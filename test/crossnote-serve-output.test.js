/* global suite, test, suiteSetup, suiteTeardown */

/**
 * Unit tests for the pure helpers in src/crossnote-serve-output.ts. The
 * server manager itself imports `vscode` (only resolvable at extension host
 * runtime), so the output parser lives in its own file specifically to make
 * this kind of standalone testing possible.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

let parseListeningLine;
let tmpFile;

suite('crossnote-serve-output', function () {
  this.timeout(15000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      entryPoints: [
        path.join(__dirname, '..', 'src', 'crossnote-serve-output.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      logLevel: 'silent',
    });
    tmpFile = path.join(__dirname, '.crossnote-serve-output.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    parseListeningLine = require(tmpFile).parseListeningLine;
  });

  suiteTeardown(function () {
    if (tmpFile) {
      fs.rmSync(tmpFile, { force: true });
    }
  });

  test('parses the listening event from a --json startup line', function () {
    const event = parseListeningLine(
      '{"event":"listening","url":"http://127.0.0.1:3000","port":3000,"host":"127.0.0.1","rootDirectories":["/notes"],"vscode":true}\n',
    );
    assert.strictEqual(event.url, 'http://127.0.0.1:3000');
    assert.strictEqual(event.port, 3000);
    assert.deepStrictEqual(event.rootDirectories, ['/notes']);
  });

  test('finds the listening event among other output', function () {
    const event = parseListeningLine(
      'crossnote serve\nsome warning\n{"event":"listening","url":"http://127.0.0.1:3001","port":3001,"host":"127.0.0.1","rootDirectories":[],"vscode":false}\n',
    );
    assert.strictEqual(event.url, 'http://127.0.0.1:3001');
  });

  test('ignores non-listening JSON and non-JSON lines', function () {
    assert.strictEqual(parseListeningLine('not json at all\n'), null);
    assert.strictEqual(
      parseListeningLine('{"command":"updateMarkdown"}\n'),
      null,
    );
    assert.strictEqual(parseListeningLine(''), null);
  });

  test('requires a url on the listening event', function () {
    assert.strictEqual(parseListeningLine('{"event":"listening"}\n'), null);
  });
});
