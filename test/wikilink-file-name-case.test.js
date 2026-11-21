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

suite('wikilink target file name case (editor ctrl+click)', function () {
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
    tmpFile = path.join(__dirname, '.wikilink-file-name-case.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
    notebookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikilink-case-'));
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
  });

  // A real crossnote Notebook supplies processWikilink/resolveWikilink,
  // so this exercises the same transforms the preview applies.
  async function makeNotebook(config) {
    return Notebook.init({
      notebookPath: notebookDir,
      config,
    });
  }

  test('ctrl+click resolves through wikiLinkTargetFileNameChangeCase like the preview (#2477)', async function () {
    const notebook = await makeNotebook({
      wikiLinkTargetFileNameChangeCase: 'kebabCase',
    });
    const manager = { getNotebook: async () => notebook };

    const openedUris = [];
    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return { uri, getText: () => '' };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => editor;

    await bundle.openWikilinkTarget(
      `file://${path.join(notebookDir, 'source.md')}`,
      'Wiki Link',
      manager,
    );
    // The preview links `[[Wiki Link]]` to `wiki-link.md` when the
    // setting is kebabCase; the editor must land there too.
    assert.deepStrictEqual(openedUris, [
      `file://${path.join(notebookDir, 'wiki-link.md')}`,
    ]);
  });

  test('keeps fragments attached to the case-changed file name', async function () {
    const notebook = await makeNotebook({
      wikiLinkTargetFileNameChangeCase: 'kebabCase',
    });
    const manager = { getNotebook: async () => notebook };

    const openedUris = [];
    const receivedFragments = [];
    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return { uri, getText: () => '' };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => editor;
    globalThis.__crossnoteStubFindFragmentTargetLine = (_text, fragment) => {
      receivedFragments.push(fragment);
      return 0;
    };

    await bundle.openWikilinkTarget(
      `file://${path.join(notebookDir, 'source.md')}`,
      'Wiki Link#Intro',
      manager,
    );
    assert.deepStrictEqual(openedUris, [
      `file://${path.join(notebookDir, 'wiki-link.md')}`,
    ]);
    assert.deepStrictEqual(receivedFragments, ['Intro']);
  });

  test('leaves the name verbatim when the case setting is none', async function () {
    const notebook = await makeNotebook({
      wikiLinkTargetFileNameChangeCase: 'none',
    });
    const manager = { getNotebook: async () => notebook };

    const openedUris = [];
    globalThis.__vscodeStubOpenTextDocument = async (uri) => {
      openedUris.push(uri.toString());
      return { uri, getText: () => '' };
    };
    globalThis.__vscodeStubShowTextDocument = async (_doc, editor) => editor;

    await bundle.openWikilinkTarget(
      `file://${path.join(notebookDir, 'source.md')}`,
      'Wiki Link',
      manager,
    );
    assert.deepStrictEqual(openedUris, [
      `file://${path.join(notebookDir, 'Wiki Link.md')}`,
    ]);
  });
});
