/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const {
  stubPlugin,
  setWorkspaceFolderResolver,
  setMarkdownEngine,
  setConfiguration,
  setActiveTextEditor,
  setCreateWebviewPanel,
} = require('./vscode-stub');

let bundle;
let tmpFile;
let createdPanels;

function makeUri(fsPath, scheme = 'file') {
  return {
    scheme,
    authority: '',
    path: fsPath,
    query: '',
    fragment: '',
    fsPath,
    with() {
      return this;
    },
    toString() {
      return `${scheme}://${fsPath}`;
    },
  };
}

function makeEditor(fsPath, { languageId = 'markdown', scheme = 'file' } = {}) {
  const uri = makeUri(fsPath, scheme);
  return {
    document: {
      uri,
      fileName: fsPath,
      languageId,
      isDirty: false,
      lineCount: 1,
      getText: () => '# Hello',
      lineAt: () => ({ text: '# Hello' }),
    },
    selection: { active: { line: 0, character: 0 } },
    selections: [{ active: { line: 0, character: 0 } }],
    visibleRanges: [],
  };
}

function makePanel(viewType, title) {
  const disposeHandlers = [];
  const panel = {
    viewType,
    title,
    active: false,
    viewColumn: 2,
    webview: {
      html: '',
      cspSource: 'vscode-webview://test',
      asWebviewUri: (u) => u,
      onDidReceiveMessage: () => ({ dispose() {} }),
      postMessage: async () => true,
    },
    onDidDispose: (fn) => {
      disposeHandlers.push(fn);
      return { dispose() {} };
    },
    reveal: () => {},
    dispose: () => {
      disposeHandlers.forEach((fn) => fn());
    },
  };
  createdPanels.push(panel);
  return panel;
}

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionPath: '/ext',
    extensionUri: makeUri('/ext'),
    globalState: { get: () => undefined, update: async () => {} },
    secrets: {
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
    },
  };
}

suite('auto-preview on activation (#2364)', function () {
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
    tmpFile = path.join(__dirname, '.auto-preview-activation.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(function () {
    createdPanels = [];
    setWorkspaceFolderResolver(() => ({ uri: makeUri('/ws') }));
    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async ({ inputString }) =>
        `<html>${inputString}</html>`,
    }));
    setCreateWebviewPanel((viewType, title) => makePanel(viewType, title));
    setActiveTextEditor(undefined);
    setConfiguration({});
  });

  teardown(function () {
    createdPanels.forEach((panel) => panel.dispose());
    setActiveTextEditor(undefined);
    setCreateWebviewPanel(undefined);
    setConfiguration({});
  });

  test('opens preview for an already-active markdown editor at activation', async function () {
    setConfiguration({
      previewMode: 'Single Preview',
      automaticallyShowPreviewOfMarkdownBeingEdited: true,
    });
    setActiveTextEditor(makeEditor('/ws/startup.md'));

    await bundle.initExtensionCommon(makeExtensionContext());

    assert.strictEqual(createdPanels.length, 1);
    assert.strictEqual(createdPanels[0].title, 'Preview startup.md');
    assert.strictEqual(createdPanels[0].webview.html, '<html># Hello</html>');
  });

  test('does not auto-open when automaticallyShowPreviewOfMarkdownBeingEdited is off', async function () {
    setConfiguration({
      previewMode: 'Single Preview',
      automaticallyShowPreviewOfMarkdownBeingEdited: false,
    });
    setActiveTextEditor(makeEditor('/ws/startup.md'));

    await bundle.initExtensionCommon(makeExtensionContext());

    assert.strictEqual(createdPanels.length, 0);
  });

  test('respects exclusion patterns and URI schemes for initial active editor', async function () {
    setConfiguration({
      previewMode: 'Single Preview',
      automaticallyShowPreviewOfMarkdownBeingEdited: true,
      disableAutoPreviewForFilePatterns: ['*.skip.md'],
      disableAutoPreviewForUriSchemes: ['untitled'],
    });

    setActiveTextEditor(makeEditor('/ws/draft.skip.md'));
    await bundle.initExtensionCommon(makeExtensionContext());
    assert.strictEqual(createdPanels.length, 0);

    setActiveTextEditor(makeEditor('/Untitled-1.md', { scheme: 'untitled' }));
    await bundle.initExtensionCommon(makeExtensionContext());
    assert.strictEqual(createdPanels.length, 0);
  });
});
