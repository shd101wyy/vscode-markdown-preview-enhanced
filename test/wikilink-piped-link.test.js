/* global suite, test, suiteSetup, suiteTeardown, teardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const esbuild = require('esbuild');
const { Notebook } = require('crossnote');
const { stubPlugin } = require('./vscode-stub');

let bundle;
let tmpFile;
let notebookDir;

suite('piped wikilink target half (editor ctrl+click)', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents:
          "import * as vscode from 'vscode';" +
          "export { openWikilinkTarget } from './src/wikilink-document-link-provider';" +
          "export { wikilinkTargetHalf } from './src/wikilink-helpers';" +
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
    tmpFile = path.join(__dirname, '.wikilink-piped-link.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
    notebookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikilink-pipe-'));
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
    if (notebookDir && fs.existsSync(notebookDir)) {
      fs.rmSync(notebookDir, { recursive: true, force: true });
    }
  });

  teardown(function () {
    globalThis.__vscodeStubOpenTextDocument = undefined;
    globalThis.__vscodeStubShowTextDocument = undefined;
    globalThis.__crossnoteStubFindFragmentTargetLine = undefined;
    globalThis.__vscodeStubFsReadFile = undefined;
  });

  // A real crossnote Notebook supplies processWikilink/resolveWikilink,
  // so the same pipe rules the preview applies decide the target.
  async function makeNotebook(config) {
    return Notebook.init({
      notebookPath: notebookDir,
      config,
    });
  }

  function stubOpen() {
    const openedUris = [];
    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return { uri, getText: () => '' };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => editor;
    return openedUris;
  }

  test('wikilinkTargetHalf mirrors processWikilink pipe rules', function () {
    assert.strictEqual(bundle.wikilinkTargetHalf('Note', true), 'Note');
    assert.strictEqual(bundle.wikilinkTargetHalf('Note', false), 'Note');
    assert.strictEqual(bundle.wikilinkTargetHalf('Note|Alias', false), 'Note');
    assert.strictEqual(bundle.wikilinkTargetHalf('Alias|Note', true), 'Note');
    // Multi-pipe bodies keep processWikilink's splits[0]/splits[1] picks.
    assert.strictEqual(bundle.wikilinkTargetHalf('a|b|c', false), 'a');
    assert.strictEqual(bundle.wikilinkTargetHalf('a|b|c', true), 'b');
    // Halves are trimmed either way.
    assert.strictEqual(
      bundle.wikilinkTargetHalf(' Note | Alias ', false),
      'Note',
    );
    assert.strictEqual(
      bundle.wikilinkTargetHalf(' Alias | Note ', true),
      'Note',
    );
  });

  test('default style [[target|display]] keeps resolving the target', async function () {
    const notebook = await makeNotebook({});
    const manager = { getNotebook: async () => notebook };
    const openedUris = stubOpen();

    await bundle.openWikilinkTarget(
      bundle.stubUri(path.join(notebookDir, 'source.md')).toString(),
      'Target Note|Display Text',
      manager,
    );
    assert.deepStrictEqual(openedUris, [
      bundle.stubUri(path.join(notebookDir, 'Target Note.md')).toString(),
    ]);
  });

  test('GitHub style [[display|target]] follows the target, not the display (#2479)', async function () {
    const notebook = await makeNotebook({
      useGitHubStylePipedLink: true,
    });
    const manager = { getNotebook: async () => notebook };
    const openedUris = stubOpen();

    await bundle.openWikilinkTarget(
      bundle.stubUri(path.join(notebookDir, 'source.md')).toString(),
      'Display Text|Target Note',
      manager,
    );
    // Used to open `Display Text.md` — the display half.
    assert.deepStrictEqual(openedUris, [
      bundle.stubUri(path.join(notebookDir, 'Target Note.md')).toString(),
    ]);
  });

  test('GitHub style keeps fragments attached to the target half', async function () {
    const notebook = await makeNotebook({
      useGitHubStylePipedLink: true,
    });
    const manager = { getNotebook: async () => notebook };
    const openedUris = stubOpen();
    const receivedFragments = [];
    globalThis.__crossnoteStubFindFragmentTargetLine = (_text, fragment) => {
      receivedFragments.push(fragment);
      return 0;
    };

    await bundle.openWikilinkTarget(
      bundle.stubUri(path.join(notebookDir, 'source.md')).toString(),
      'Display Text|Target Note#Intro',
      manager,
    );
    assert.deepStrictEqual(openedUris, [
      bundle.stubUri(path.join(notebookDir, 'Target Note.md')).toString(),
    ]);
    assert.deepStrictEqual(receivedFragments, ['Intro']);
  });

  test('GitHub style works with the case transform too', async function () {
    const notebook = await makeNotebook({
      useGitHubStylePipedLink: true,
      wikiLinkTargetFileNameChangeCase: 'kebabCase',
    });
    const manager = { getNotebook: async () => notebook };
    const openedUris = stubOpen();

    await bundle.openWikilinkTarget(
      bundle.stubUri(path.join(notebookDir, 'source.md')).toString(),
      'Display Text|Target Note',
      manager,
    );
    assert.deepStrictEqual(openedUris, [
      bundle.stubUri(path.join(notebookDir, 'target-note.md')).toString(),
    ]);
  });

  test('hover previews the target half on GitHub style, not the display (#2479)', async function () {
    const notebook = await makeNotebook({
      useGitHubStylePipedLink: true,
    });
    const manager = { getNotebook: async () => notebook };

    const readUris = [];
    globalThis.__vscodeStubFsReadFile = async (uri) => {
      readUris.push(uri.toString());
      return new TextEncoder().encode('# Real target\n\nTarget note body.');
    };

    const provider = new bundle.WikilinkHoverProvider(manager);
    const document = {
      uri: bundle.stubUri(path.join(notebookDir, 'source.md')),
      lineAt: () => ({ text: 'see [[Display Text|Target Note]] here' }),
    };
    const hover = await provider.provideHover(
      document,
      bundle.stubPosition(0, 4),
    );

    // The hover read and previewed the *target* note's content.
    assert.deepStrictEqual(readUris, [
      bundle.stubUri(path.join(notebookDir, 'Target Note.md')).toString(),
    ]);
    assert.ok(hover, 'expected a hover');
    assert.match(hover.contents.value, /Real target/);
    assert.match(hover.contents.value, /Target note body\./);
  });

  test('hover previews the first half on the default style', async function () {
    const notebook = await makeNotebook({});
    const manager = { getNotebook: async () => notebook };

    const readUris = [];
    globalThis.__vscodeStubFsReadFile = async (uri) => {
      readUris.push(uri.toString());
      return new TextEncoder().encode('Target note body.');
    };

    const provider = new bundle.WikilinkHoverProvider(manager);
    const document = {
      uri: bundle.stubUri(path.join(notebookDir, 'source.md')),
      lineAt: () => ({ text: 'see [[Target Note|Display Text]] here' }),
    };
    const hover = await provider.provideHover(
      document,
      bundle.stubPosition(0, 4),
    );

    assert.deepStrictEqual(readUris, [
      bundle.stubUri(path.join(notebookDir, 'Target Note.md')).toString(),
    ]);
    assert.ok(hover, 'expected a hover');
    assert.match(hover.contents.value, /Target note body\./);
  });
});
