/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver,
  setMarkdownEngine,
  setConfiguration,
} = require('./vscode-stub');

/**
 * Custom editor panels are provided by VS Code, one per document, and pinned
 * to that document. These tests pin down their interplay with the default
 * "Single Preview" mode, where the extension otherwise reuses one shared
 * panel (vscode-mpe#2433).
 */
let bundle;
let tmpFile;
let provider;
let openPanels;

suite('custom editor previews in single-preview mode', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export { initExtensionCommon } from './src/extension-common';",
          "export { PreviewProvider } from './src/preview-provider';",
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
    tmpFile = path.join(__dirname, '.custom-editor-single-preview.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);

    setWorkspaceFolderResolver(() => ({ uri: makeUri('/ws') }));
    // Registers the window event handlers (including
    // onDidChangeActiveTextEditor) the extension listens with.
    await bundle.initExtensionCommon(makeExtensionContext());
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
    setConfiguration({ previewMode: 'Single Preview' });
    // Render each document's own text so assertions can tell which panel
    // received which document.
    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async ({ inputString }) =>
        `<html>${inputString}</html>`,
    }));
  });

  teardown(function () {
    openPanels.forEach((panel) => panel.dispose());
    setConfiguration({});
  });

  test('renders the second document into its own panel, not the first (#2433)', async function () {
    const panelA = makePanel();
    const panelB = makePanel();

    await initCustomEditorPreview('/ws/a.md', 'a', panelA);
    await initCustomEditorPreview('/ws/b.md', 'b', panelB);

    assert.strictEqual(panelA.webview.html, '<html>a</html>');
    assert.strictEqual(panelB.webview.html, '<html>b</html>');
  });

  test('keeps per-document preview state for both panels', async function () {
    const panelA = makePanel();
    const panelB = makePanel();

    await initCustomEditorPreview('/ws/a.md', 'a', panelA);
    await initCustomEditorPreview('/ws/b.md', 'b', panelB);

    assert.deepStrictEqual(sourcePaths(provider).sort(), [
      '/ws/a.md',
      '/ws/b.md',
    ]);
    assert.deepStrictEqual(provider.getPreviews(makeUri('/ws/b.md')), [panelB]);
    // Live updates must not be gated off by the single-preview target.
    assert.strictEqual(
      provider.shouldUpdateMarkdown(makeUri('/ws/b.md')),
      true,
    );
    assert.strictEqual(
      provider.shouldUpdateMarkdown(makeUri('/ws/a.md')),
      true,
    );
  });

  test('closing one custom editor tab keeps the other working', async function () {
    const panelA = makePanel();
    const panelB = makePanel();

    await initCustomEditorPreview('/ws/a.md', 'a', panelA);
    await initCustomEditorPreview('/ws/b.md', 'b', panelB);
    panelA.dispose();

    assert.deepStrictEqual(sourcePaths(provider), ['/ws/b.md']);
    assert.deepStrictEqual(provider.getPreviews(makeUri('/ws/b.md')), [panelB]);
    assert.strictEqual(
      provider.shouldUpdateMarkdown(makeUri('/ws/b.md')),
      true,
    );
  });

  test('does not hijack an existing single preview panel', async function () {
    const panelP = makePanel();
    const panelB = makePanel();

    // A regular preview panel for x.md takes the shared single-preview slot.
    await initPreview(provider, panelP, '/ws/x.md', 'x');
    const sharedPanel = provider.getPreviews(makeUri('/ws/x.md'))[0];
    assert.strictEqual(sharedPanel, panelP);

    await initCustomEditorPreview('/ws/b.md', 'b', panelB);

    // The shared panel keeps showing its own document…
    assert.strictEqual(panelP.webview.html, '<html>x</html>');
    // …and the custom editor renders into its own panel.
    assert.strictEqual(panelB.webview.html, '<html>b</html>');
    // Updates for b.md go to the custom editor panel, not the shared one.
    assert.deepStrictEqual(provider.getPreviews(makeUri('/ws/b.md')), [panelB]);
  });

  test('does not re-render a pinned custom editor when the active editor switches', async function () {
    const panelA = makePanel();
    await initCustomEditorPreview('/ws/a.md', 'a', panelA);

    let renderCount = 0;
    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async ({ inputString }) => {
        renderCount++;
        return `<html>${inputString}</html>`;
      },
    }));

    // Switch the active text editor to the document the custom editor is
    // pinned to. With only custom editor panels open there is no shared
    // single-preview panel to follow the editor, and re-initializing the
    // custom editor here would reload its webview (losing scroll position
    // and code chunk state) on every editor switch.
    assert.ok(recorder.activeEditorHandlers.length > 0);
    for (const handler of recorder.activeEditorHandlers) {
      await handler({
        document: {
          uri: makeUri('/ws/a.md'),
          languageId: 'markdown',
          fileName: '/ws/a.md',
        },
      });
    }

    assert.strictEqual(renderCount, 0);
    assert.strictEqual(panelA.webview.html, '<html>a</html>');
  });
});

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionUri: makeUri('/ext'),
    extensionPath: '/ext',
    extensionMode: 1,
    globalState: {
      get: (_key, defaultValue) => defaultValue,
      update: async () => {},
    },
    workspaceState: {
      get: (_key, defaultValue) => defaultValue,
      update: async () => {},
    },
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
    viewColumn: 1,
    title: '',
    iconPath: null,
    options: {},
    webview: {
      html: '',
      options: {},
      asWebviewUri: (uri) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
    },
    reveal() {},
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

async function initPreview(provider, panel, fsPath, text) {
  const sourceUri = makeUri(fsPath);
  await provider.initPreview({
    sourceUri,
    document: { uri: sourceUri, getText: () => text },
    webviewPanel: panel,
    viewOptions: { viewColumn: 1 },
  });
}

async function initCustomEditorPreview(fsPath, text, panel) {
  const sourceUri = makeUri(fsPath);
  await provider.initPreview({
    sourceUri,
    document: { uri: sourceUri, getText: () => text },
    webviewPanel: panel,
    viewOptions: { viewColumn: 1, preserveFocus: true },
    isCustomEditor: true,
  });
}

function sourcePaths(provider) {
  return provider
    .getPreviewSourceStates()
    .map((state) => state.sourceUri && state.sourceUri.fsPath);
}
