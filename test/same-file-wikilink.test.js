/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { stubPlugin } = require('./vscode-stub');

let bundle;
let tmpFile;

suite('same-file wikilink navigation', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents:
          "export { openWikilinkTarget } from './src/wikilink-document-link-provider';",
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
    tmpFile = path.join(__dirname, '.same-file-wikilink.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    globalThis.__vscodeStubOpenTextDocument = undefined;
    globalThis.__vscodeStubShowTextDocument = undefined;
    globalThis.__crossnoteStubFindFragmentTargetLine = undefined;
  });

  teardown(function () {
    globalThis.__vscodeStubOpenTextDocument = undefined;
    globalThis.__vscodeStubShowTextDocument = undefined;
    globalThis.__crossnoteStubFindFragmentTargetLine = undefined;
  });

  test('navigates to same-file heading and block wikilinks', async function () {
    const openedUris = [];
    const shownEditors = [];
    const receivedFragments = [];

    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return {
        uri,
        getText: () => '# Intro\n\nTarget paragraph ^my-block\n',
      };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => {
      shownEditors.push(editor);
      return editor;
    };
    globalThis.__crossnoteStubFindFragmentTargetLine = (_text, fragment) => {
      receivedFragments.push(fragment);
      return fragment === '^my-block' ? 2 : 0;
    };

    await bundle.openWikilinkTarget('file:///ws/note.md', '#Intro');
    await bundle.openWikilinkTarget('file:///ws/note.md', '^my-block');

    assert.deepStrictEqual(openedUris, [
      'file:///ws/note.md',
      'file:///ws/note.md',
    ]);
    assert.deepStrictEqual(receivedFragments, ['Intro', '^my-block']);
    assert.strictEqual(shownEditors[0].selection.active.line, 0);
    assert.strictEqual(shownEditors[1].selection.active.line, 2);
  });

  test('ignores empty wikilink body without note or fragment', async function () {
    let opened = false;
    globalThis.__vscodeStubOpenTextDocument = async () => {
      opened = true;
      return { getText: () => '' };
    };

    await bundle.openWikilinkTarget('file:///ws/note.md', '   ');
    assert.strictEqual(opened, false);
  });
});
