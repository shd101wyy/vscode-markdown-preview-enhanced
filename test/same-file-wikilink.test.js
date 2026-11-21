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
          "import * as vscode from 'vscode';" +
          "export { openWikilinkTarget } from './src/wikilink-document-link-provider';" +
          "export { WikilinkHoverProvider } from './src/wikilink-hover-provider';" +
          'export const stubUri = (p) => vscode.Uri.file(p);' +
          'export const stubPosition = (line, character) => new vscode.Position(line, character);',
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
    globalThis.__vscodeStubFsReadFile = undefined;
  });

  teardown(function () {
    globalThis.__vscodeStubOpenTextDocument = undefined;
    globalThis.__vscodeStubShowTextDocument = undefined;
    globalThis.__crossnoteStubFindFragmentTargetLine = undefined;
    globalThis.__vscodeStubFsReadFile = undefined;
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

  test('trims spaces around same-file heading and block wikilinks', async function () {
    const openedUris = [];
    const receivedFragments = [];

    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return {
        uri,
        getText: () => '# Heading\n\nTarget paragraph ^my-block\n',
      };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => editor;
    globalThis.__crossnoteStubFindFragmentTargetLine = (_text, fragment) => {
      receivedFragments.push(fragment);
      return fragment === '^my-block' ? 2 : 0;
    };

    // `[[ #Heading ]]`: the space before `#` must not become a note
    // name, and the space after the heading must not stay in the
    // fragment.
    await bundle.openWikilinkTarget('file:///ws/note.md', ' #Heading ');
    await bundle.openWikilinkTarget('file:///ws/note.md', ' #^my-block ');

    assert.deepStrictEqual(openedUris, [
      'file:///ws/note.md',
      'file:///ws/note.md',
    ]);
    assert.deepStrictEqual(receivedFragments, ['Heading', '^my-block']);
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

  test('hover previews the same-file fragment from the current document (#2472)', async function () {
    const readUris = [];
    globalThis.__vscodeStubFsReadFile = async (uri) => {
      readUris.push(uri.toString());
      return new TextEncoder().encode(
        '# Title\n\n## Intro Section\n\nIntro body text.\n\nLater.\n',
      );
    };

    // No notebooksManager: same-file hover must not need one.  The
    // fragment is the slug form ('Intro Section' → 'intro-section'),
    // which is what crossnote's findFragmentTargetLine matches; the
    // bundle stubs it, so resolve the heading line here like the click
    // tests do.
    globalThis.__crossnoteStubFindFragmentTargetLine = (_text, fragment) =>
      fragment === 'intro-section' ? 2 : -1;
    const provider = new bundle.WikilinkHoverProvider();
    const document = {
      uri: bundle.stubUri('/ws/note.md'),
      lineAt: () => ({ text: 'link to [[#intro-section]] here' }),
    };
    const hover = await provider.provideHover(
      document,
      bundle.stubPosition(0, 11),
    );

    // The hover read the current document and previewed the section
    // under its heading.
    assert.deepStrictEqual(readUris, [
      bundle.stubUri('/ws/note.md').toString(),
    ]);
    assert.ok(hover, 'expected a hover');
    assert.match(hover.contents.value, /Intro body text\./);
  });
});
