/* global suite, test, suiteSetup, suiteTeardown, setup */

/**
 * The "notebook root is a filesystem root" warning (vscode-mpe#2376)
 * must only fire when the root is a real workspace folder — i.e. the
 * user deliberately opened a drive root as the workspace. When no
 * folder is open, the notebook root falls back to the standalone
 * file's own directory, and a file directly under a drive root made
 * the extension nag with a notification on every markdown file
 * activation, even though the user never asked for note indexing
 * (vscode-mpe#2413).
 */

const assert = require('assert');
const fs = require('fs');
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

suite('filesystem-root warning', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export { default as NotebooksManager } from './src/notebooks-manager';",
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
});
