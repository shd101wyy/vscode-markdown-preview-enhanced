/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver,
  setRelativePathResolver,
  setMarkdownEngine,
} = require('./vscode-stub');

const RELATIVE_PATH_COMMAND =
  'markdown-preview-enhanced.copyCurrentSourceRelativePath';
const FULL_PATH_COMMAND = 'markdown-preview-enhanced.copyCurrentSourcePath';

let bundle;
let tmpFile;
let provider;
let openPanels;

suite('preview source integration', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export { initExtensionCommon } from './src/extension-common';",
          "export { PreviewProvider, getActivePreviewSourceUri } from './src/preview-provider';",
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
    tmpFile = path.join(__dirname, '.preview-source-integration.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);

    await bundle.initExtensionCommon(makeExtensionContext());

    // Register the provider the way the extension does, so that the commands
    // reach it through the workspace-to-provider map.
    setWorkspaceFolderResolver(() => ({ uri: makeUri('/ws') }));
    provider = await bundle.PreviewProvider.getPreviewContentProvider(
      makeUri('/ws/a.md'),
      makeExtensionContext(),
    );
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    openPanels = [];
    recorder.clipboard.text = null;
    recorder.warnings = [];
    setWorkspaceFolderResolver(() => undefined);
    setRelativePathResolver((uri) => String(uri));
    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async () => '<html></html>',
    }));
  });

  teardown(function () {
    openPanels.forEach((panel) => panel.dispose());
  });

  test('publishes the rendered source once the preview is initialized', async function () {
    const panel = makePanel();

    assert.deepStrictEqual(provider.getPreviewSourceStates(), []);

    await initPreview(provider, panel, '/ws/docs/design.md');

    assert.deepStrictEqual(sourcePaths(provider), ['/ws/docs/design.md']);
  });

  test('publishes the destination after a link is followed inside the preview', async function () {
    const panel = makePanel();

    await initPreview(provider, panel, '/ws/a.md');
    await initPreview(provider, panel, '/ws/subdir/c.md');

    assert.deepStrictEqual(sourcePaths(provider), ['/ws/subdir/c.md']);
  });

  test('discards a render that lost the request race', async function () {
    const panel = makePanel();
    let releaseSlowRender;
    const slowRenderStarted = new Promise((resolve) => {
      setMarkdownEngine(() => ({
        generateHTMLTemplateForPreview: async () => {
          resolve();
          await new Promise((r) => {
            releaseSlowRender = r;
          });
          return '<html>stale</html>';
        },
      }));
    });

    const stale = initPreview(provider, panel, '/ws/slow.md');
    await slowRenderStarted;

    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async () => '<html>fresh</html>',
    }));
    await initPreview(provider, panel, '/ws/fast.md');

    releaseSlowRender();
    await stale;

    assert.deepStrictEqual(sourcePaths(provider), ['/ws/fast.md']);
    assert.strictEqual(panel.webview.html, '<html>fresh</html>');
  });

  test('drops the source when the preview panel is disposed', async function () {
    const panel = makePanel();

    await initPreview(provider, panel, '/ws/a.md');
    panel.dispose();

    assert.deepStrictEqual(provider.getPreviewSourceStates(), []);
    assert.strictEqual(bundle.getActivePreviewSourceUri(), undefined);
  });

  test('resolves nothing while no preview panel is focused', async function () {
    const panel = makePanel({ active: false });

    await initPreview(provider, panel, '/ws/a.md');

    assert.strictEqual(bundle.getActivePreviewSourceUri(), undefined);
  });

  test('copies the full path of the focused preview source', async function () {
    const panel = makePanel();

    await initPreview(provider, panel, '/ws/docs/design.md');
    await runCommand(FULL_PATH_COMMAND);

    assert.strictEqual(recorder.clipboard.text, '/ws/docs/design.md');
    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('copies the workspace-relative path of the focused preview source', async function () {
    const panel = makePanel();
    setWorkspaceFolderResolver(() => ({ uri: { fsPath: '/ws' } }));
    setRelativePathResolver((uri) => uri.path.replace('/ws/', ''));

    await initPreview(provider, panel, '/ws/docs/design.md');
    await runCommand(RELATIVE_PATH_COMMAND);

    assert.strictEqual(recorder.clipboard.text, 'docs/design.md');
    assert.deepStrictEqual(recorder.warnings, []);
  });

  test('warns instead of copying when no preview is focused', async function () {
    const panel = makePanel({ active: false });

    await initPreview(provider, panel, '/ws/a.md');
    await runCommand(FULL_PATH_COMMAND);

    assert.strictEqual(recorder.clipboard.text, null);
    assert.strictEqual(recorder.warnings.length, 1);
  });

  test('warns instead of copying a relative path for a source outside the workspace', async function () {
    const panel = makePanel();

    await initPreview(provider, panel, '/elsewhere/a.md');
    await runCommand(RELATIVE_PATH_COMMAND);

    assert.strictEqual(recorder.clipboard.text, null);
    assert.strictEqual(recorder.warnings.length, 1);
  });
});

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionUri: makeUri('/ext'),
    extensionPath: '/ext',
    extensionMode: 1,
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
  };
}

function makeUri(fsPath) {
  return {
    scheme: 'file',
    authority: '',
    path: fsPath,
    query: '',
    fragment: '',
    fsPath,
    with() {
      return this;
    },
    toString() {
      return `file://${fsPath}`;
    },
  };
}

function makePanel({ active = true } = {}) {
  const disposeHandlers = [];
  const panel = {
    active,
    title: '',
    iconPath: null,
    options: {},
    webview: {
      html: '',
      options: {},
      asWebviewUri: (uri) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
    },
    onDidDispose(handler) {
      disposeHandlers.push(handler);
      return { dispose() {} };
    },
    dispose() {
      disposeHandlers.forEach((handler) => handler());
      disposeHandlers.length = 0;
    },
  };
  openPanels.push(panel);
  return panel;
}

async function initPreview(provider, panel, fsPath) {
  const sourceUri = makeUri(fsPath);
  await provider.initPreview({
    sourceUri,
    document: { uri: sourceUri, getText: () => '' },
    webviewPanel: panel,
    viewOptions: { viewColumn: 2 },
  });
}

function sourcePaths(provider) {
  return provider
    .getPreviewSourceStates()
    .map((state) => state.sourceUri && state.sourceUri.fsPath);
}

async function runCommand(commandId) {
  const handler = recorder.commands.get(commandId);
  assert.ok(handler, `command ${commandId} is not registered`);
  await handler();
}
