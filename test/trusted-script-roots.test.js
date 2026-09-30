/* global suite, test, suiteSetup, suiteTeardown, setup */

/**
 * `notebook.trustedScriptRoots` — the directories whose `head.html` scripts
 * crossnote may load besides the notebook's own (crossnote#446):
 *
 * - The global config directory is named as a root, so the scripts sitting
 *   beside the global `head.html` can load at all. They live outside every
 *   workspace, so nothing else would ever reach them.
 * - It is named only while preview scripts are on and the workspace is
 *   trusted — the same gate `previewScriptsEnabled` answers to.
 * - It comes from the *user-scope* `configPath` only. That setting is
 *   window-scoped, so a repository's `.vscode/settings.json` can point it at
 *   any directory on disk. A repository's own scripts already load once the
 *   user opts in; honouring its `configPath` here would let it extend that
 *   trust to directories outside itself.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const {
  stubPlugin,
  setConfiguration,
  setConfigurationScopes,
  setWorkspaceFolderResolver,
  setWorkspaceFolders,
  setWorkspaceTrusted,
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

/**
 * Where the global config directory sits when `configPath` names nothing —
 * spelled out here rather than imported, so the tests below assert against
 * the documented locations instead of against the implementation.
 */
const platformDefault =
  process.platform === 'win32'
    ? path.join(os.homedir(), './.crossnote')
    : process.env.XDG_CONFIG_HOME
      ? path.resolve(process.env.XDG_CONFIG_HOME, './crossnote')
      : path.resolve(os.homedir(), './.local/state/crossnote');

/** The roots a notebook is given for a file in the open workspace. */
async function rootsFor() {
  const manager = new bundle.NotebooksManager(makeExtensionContext());
  const notebook = await manager.getNotebook(bundle.Uri.file('/ws/a.md'));
  return notebook.trustedScriptRoots;
}

suite('trusted script roots', function () {
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
    tmpFile = path.join(__dirname, '.trusted-script-roots.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    setWorkspaceFolders([
      { uri: bundle.Uri.file('/ws'), name: 'ws', index: 0 },
    ]);
    setWorkspaceFolderResolver(() => ({
      uri: bundle.Uri.file('/ws'),
      name: 'ws',
      index: 0,
    }));
    setWorkspaceTrusted(true);
    setConfiguration({});
    setConfigurationScopes({});
  });

  test('names the user-configured global config directory', async function () {
    setConfigurationScopes({
      global: { enablePreviewScripts: true, configPath: '/home/me/mpe-config' },
    });
    assert.deepStrictEqual(await rootsFor(), ['/home/me/mpe-config']);
  });

  test('expands a leading ~ to the home directory', async function () {
    setConfigurationScopes({
      global: { enablePreviewScripts: true, configPath: '~/mpe-config' },
    });
    assert.deepStrictEqual(await rootsFor(), [
      path.join(os.homedir(), '/mpe-config'),
    ]);
  });

  test('ignores a configPath the workspace sets, using the default instead', async function () {
    setConfigurationScopes({
      global: { enablePreviewScripts: true },
      workspace: { configPath: '/ws/.evil-config' },
    });
    const roots = await rootsFor();
    assert.ok(
      !roots.includes('/ws/.evil-config'),
      `a workspace-set configPath must never become a trusted root, got ${JSON.stringify(roots)}`,
    );
    assert.deepStrictEqual(roots, [platformDefault]);
  });

  test('prefers the user value when the workspace overrides it', async function () {
    setConfigurationScopes({
      global: { enablePreviewScripts: true, configPath: '/home/me/mpe-config' },
      workspace: { configPath: '/ws/.evil-config' },
    });
    assert.deepStrictEqual(await rootsFor(), ['/home/me/mpe-config']);
  });

  test('names no root while preview scripts are off', async function () {
    setConfigurationScopes({
      global: {
        enablePreviewScripts: false,
        configPath: '/home/me/mpe-config',
      },
    });
    assert.deepStrictEqual(await rootsFor(), []);
  });

  test('names no root in an untrusted workspace', async function () {
    setWorkspaceTrusted(false);
    setConfigurationScopes({
      global: { enablePreviewScripts: true, configPath: '/home/me/mpe-config' },
    });
    assert.deepStrictEqual(await rootsFor(), []);
  });
});
