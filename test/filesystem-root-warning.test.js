/* global suite, test, suiteSetup, suiteTeardown, setup */

/**
 * The "notebook root is refused for note indexing" warning
 * (vscode-mpe#2376):
 *
 * - A filesystem-root root must only warn when it is a real workspace
 *   folder — i.e. the user deliberately opened a drive root as the
 *   workspace. When no folder is open, the notebook root falls back to
 *   the standalone file's own directory, and a file directly under a
 *   drive root made the extension nag with a notification on every
 *   markdown file activation, even though the user never asked for
 *   note indexing (vscode-mpe#2413).
 * - The home directory (#2376 follow-up) warns in both cases — a loose
 *   markdown file directly in `~` is rare, and walking `~` is exactly
 *   the #2376 filesystem scan — and the index build (backlinks, tags,
 *   wikilink completion) is skipped for refused roots so the refusal
 *   holds on the currently-pinned crossnote too.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver,
  setWorkspaceFolders,
} = require('./vscode-stub');

let bundle;
let tmpFile;

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionPath: '/ext',
    globalStorageUri: { fsPath: '/ext/storage' },
  };
}

function stubNotebookRefreshes() {
  return globalThis.__vscodeStubNotebookRefreshes;
}

suite('notebook-root refusal warning', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export { default as NotebooksManager } from './src/notebooks-manager';",
          "export { notebookIndexingRefusalReason } from './src/utils';",
          "export { Uri } from 'vscode';",
        ].join('\n'),
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
    tmpFile = path.join(__dirname, '.filesystem-root-warning.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    recorder.warnings = [];
    globalThis.__vscodeStubNotebookRefreshes = [];
    setWorkspaceFolders([]);
    setWorkspaceFolderResolver(() => undefined);
  });

  test('no warning when no folder is open and the file sits in a drive root', async function () {
    // getWorkspaceFolderUri falls back to dirname('/a.md') === '/',
    // which is a filesystem root — but not a workspace the user opened.
    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file('/a.md'));
    await manager.getNotebook(bundle.Uri.file('/b.md'));

    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('no warning when the workspace root is a regular folder', async function () {
    const folder = { uri: bundle.Uri.file('/ws'), index: 0, name: 'ws' };
    setWorkspaceFolders([folder]);
    setWorkspaceFolderResolver((uri) =>
      uri.fsPath.startsWith('/ws') ? folder : undefined,
    );

    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file('/ws/a.md'));

    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('warns once when the user opened a filesystem root as the workspace', async function () {
    const folder = { uri: bundle.Uri.file('/'), index: 0, name: '/' };
    setWorkspaceFolders([folder]);
    setWorkspaceFolderResolver(() => folder);

    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file('/a.md'));
    await manager.getNotebook(bundle.Uri.file('/b.md'));

    assert.strictEqual(recorder.warnings.length, 1);
    assert.match(recorder.warnings[0], /is a filesystem root/);
  });

  test('no warning for a file outside all opened workspace folders', async function () {
    // A folder is open, but the standalone file lives directly under a
    // drive root outside it: the fallback root is still a guess, so the
    // warning must not fire.
    const folder = { uri: bundle.Uri.file('/ws'), index: 0, name: 'ws' };
    setWorkspaceFolders([folder]);
    setWorkspaceFolderResolver((uri) =>
      uri.fsPath.startsWith('/ws') ? folder : undefined,
    );

    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file('/outside.md'));

    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('refusal reason: filesystem root, home directory, or undefined', function () {
    const driveRoot = path.parse(path.resolve('/')).root;
    assert.strictEqual(
      bundle.notebookIndexingRefusalReason(driveRoot),
      'filesystem-root',
    );
    // vscode-uri round-trips lower the drive letter on Windows
    // (`C:\Users\…` -> `c:\Users\…`); the comparison must still match.
    assert.strictEqual(
      bundle.notebookIndexingRefusalReason(os.homedir()),
      'home-directory',
    );
    if (process.platform === 'win32') {
      const lowered = os.homedir().replace(/^[a-zA-Z]/, (c) => c.toLowerCase());
      assert.strictEqual(
        bundle.notebookIndexingRefusalReason(lowered),
        'home-directory',
      );
    }
    assert.strictEqual(
      bundle.notebookIndexingRefusalReason(path.join(os.homedir(), 'notes')),
      undefined,
    );
  });

  test('warns once when a standalone file sits directly in the home directory', async function () {
    // No folder is open: getWorkspaceFolderUri falls back to the file's
    // own directory, which is `~` here. Unlike a drive root (#2413)
    // this warns — a loose markdown file directly in `~` is rare, and
    // walking `~` is exactly the #2376 filesystem scan.
    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file(path.join(os.homedir(), 'a.md')));
    await manager.getNotebook(bundle.Uri.file(path.join(os.homedir(), 'b.md')));

    assert.strictEqual(recorder.warnings.length, 1);
    assert.match(recorder.warnings[0], /is the home directory/);
  });

  test('warns once when the user opened the home directory as the workspace', async function () {
    const folder = {
      uri: bundle.Uri.file(os.homedir()),
      index: 0,
      name: 'home',
    };
    setWorkspaceFolders([folder]);
    setWorkspaceFolderResolver(() => folder);

    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNotebook(bundle.Uri.file(path.join(os.homedir(), 'a.md')));
    await manager.getNotebook(bundle.Uri.file(path.join(os.homedir(), 'b.md')));

    assert.strictEqual(recorder.warnings.length, 1);
    assert.match(recorder.warnings[0], /is the home directory/);
  });

  test('skips the index build for a home-directory notebook root', async function () {
    // The backlinks path (same guard covers tags, wikilink completion
    // and the file list) must not even ask crossnote to build the
    // index, so the refusal holds on the currently-pinned crossnote.
    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNoteBacklinks(
      bundle.Uri.file(path.join(os.homedir(), 'a.md')),
    );

    assert.deepStrictEqual(stubNotebookRefreshes(), []);
    assert.match(recorder.warnings[0], /is the home directory/);
  });

  test('builds the index for a regular workspace root', async function () {
    const folder = { uri: bundle.Uri.file('/ws'), index: 0, name: 'ws' };
    setWorkspaceFolders([folder]);
    setWorkspaceFolderResolver((uri) =>
      uri.fsPath.startsWith('/ws') ? folder : undefined,
    );

    const manager = new bundle.NotebooksManager(makeExtensionContext());
    await manager.getNoteBacklinks(bundle.Uri.file('/ws/a.md'));

    assert.deepStrictEqual(stubNotebookRefreshes(), ['ifNotLoaded']);
    assert.deepStrictEqual(recorder.warnings, []);
  });
});
