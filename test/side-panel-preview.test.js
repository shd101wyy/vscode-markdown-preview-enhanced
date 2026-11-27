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
  setActiveTextEditor,
  setVisibleTextEditors,
  setTabGroups,
  setOpenTextDocumentResolver,
  setExecuteCommandHandler,
} = require('./vscode-stub');

let bundle;
let tmpFile;
let sidePanelRegistration;
let viewInstance;

suite('side panel markdown preview', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "export * from './src/auto-preview-filter';",
          "export { initExtensionCommon } from './src/extension-common';",
          "export { PreviewProvider } from './src/preview-provider';",
          "export { SIDE_PANEL_VIEW_ID, SIDE_PANEL_LEGACY_VIEW_ID, SIDE_PANEL_LOCKED_CONTEXT, SIDE_PANEL_HAS_SOURCE_CONTEXT, DOES_NOT_SUPPORT_SECONDARY_SIDEBAR_CONTEXT } from './src/side-panel-preview-provider';",
          "export * as vscodeStub from 'vscode';",
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
    tmpFile = path.join(__dirname, '.side-panel-preview.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    setExecuteCommandHandler(undefined);
    setOpenTextDocumentResolver(undefined);
    setActiveTextEditor(undefined);
    setVisibleTextEditors([]);
    setTabGroups([]);
    setConfiguration({});
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  setup(async function () {
    recorder.reset();
    viewInstance = undefined;
    setActiveTextEditor(undefined);
    setVisibleTextEditors([]);
    setTabGroups([]);
    setOpenTextDocumentResolver(undefined);
    setExecuteCommandHandler(undefined);
    setWorkspaceFolderResolver((uri) => ({
      uri: makeUri(uri.fsPath.startsWith('/ws2') ? '/ws2' : '/ws'),
    }));
    setConfiguration({
      previewMode: 'Single Preview',
      automaticallyShowPreviewInSidePanel: true,
      automaticallyShowPreviewOfMarkdownBeingEdited: false,
      disableAutoPreviewForUriSchemes: ['vscode-notebook-cell'],
      disableAutoPreviewForFilePatterns: ['*.note.md'],
      scrollSync: true,
      liveUpdate: true,
    });
    setMarkdownEngine(() => ({
      generateHTMLTemplateForPreview: async ({ inputString }) =>
        `<html>${inputString}</html>`,
      // updateMarkdown renders through parseMD; echo the (already
      // checkbox-transformed) text as the html, like the real engine
      // would render the markdown it is handed.
      parseMD: async (text) => ({
        html: `<html>${text}</html>`,
        tocHTML: '',
        JSAndCssFiles: [],
        yamlConfig: {},
      }),
    }));

    await bundle.initExtensionCommon(makeExtensionContext());
    sidePanelRegistration = recorder.webviewViewProviders.get(
      bundle.SIDE_PANEL_VIEW_ID,
    );
    assert.ok(
      sidePanelRegistration,
      'SidePanelPreviewProvider must be registered',
    );
    const legacyRegistration = recorder.webviewViewProviders.get(
      bundle.SIDE_PANEL_LEGACY_VIEW_ID,
    );
    assert.ok(
      legacyRegistration,
      'SidePanelPreviewProvider must also be registered for legacy Activity Bar view',
    );
  });

  teardown(function () {
    if (viewInstance) {
      viewInstance.dispose();
      viewInstance = undefined;
    }
    setExecuteCommandHandler(undefined);
    setOpenTextDocumentResolver(undefined);
    setActiveTextEditor(undefined);
    setVisibleTextEditors([]);
    setTabGroups([]);
    setConfiguration({});
  });

  suite('auto-preview filtering and routing', function () {
    test('suppresses split-editor auto-open when automaticallyShowPreviewInSidePanel is true', function () {
      const routing = bundle.resolveAutoPreviewRouting({
        excluded: false,
        automaticallyShowPreviewInSidePanel: true,
        automaticallyShowPreviewOfMarkdownBeingEdited: true,
        sidePanelVisible: false,
        sidePanelHasSource: false,
        sidePanelLocked: false,
      });

      assert.deepStrictEqual(routing, {
        openOrUpdateSidePanel: true,
        allowSplitEditorAutoOpen: false,
      });
    });

    test('respects Side Panel lock while suppressing split-editor auto-open', function () {
      const routing = bundle.resolveAutoPreviewRouting({
        excluded: false,
        automaticallyShowPreviewInSidePanel: true,
        automaticallyShowPreviewOfMarkdownBeingEdited: true,
        sidePanelVisible: true,
        sidePanelHasSource: true,
        sidePanelLocked: true,
      });

      assert.deepStrictEqual(routing, {
        openOrUpdateSidePanel: false,
        allowSplitEditorAutoOpen: false,
      });
    });

    test('preserves split-editor auto-open when Side Panel auto-open is disabled', function () {
      const hiddenRouting = bundle.resolveAutoPreviewRouting({
        excluded: false,
        automaticallyShowPreviewInSidePanel: false,
        automaticallyShowPreviewOfMarkdownBeingEdited: true,
        sidePanelVisible: false,
        sidePanelHasSource: false,
        sidePanelLocked: false,
      });
      assert.deepStrictEqual(hiddenRouting, {
        openOrUpdateSidePanel: false,
        allowSplitEditorAutoOpen: true,
      });

      const visibleFollowingRouting = bundle.resolveAutoPreviewRouting({
        excluded: false,
        automaticallyShowPreviewInSidePanel: false,
        automaticallyShowPreviewOfMarkdownBeingEdited: true,
        sidePanelVisible: true,
        sidePanelHasSource: true,
        sidePanelLocked: false,
      });
      assert.deepStrictEqual(visibleFollowingRouting, {
        openOrUpdateSidePanel: true,
        allowSplitEditorAutoOpen: true,
      });
    });

    test('excludes configured URI schemes and case-insensitive file glob patterns', function () {
      assert.strictEqual(
        bundle.isExcludedFromAutoPreview({
          scheme: 'vscode-notebook-cell',
          fileName: '/ws/cell.md',
          exclusionSchemes: ['vscode-notebook-cell'],
          exclusionPatterns: ['*.note.md'],
        }),
        true,
      );
      assert.strictEqual(
        bundle.isExcludedFromAutoPreview({
          scheme: 'file',
          fileName: '/ws/Daily.NOTE.md',
          exclusionSchemes: ['vscode-notebook-cell'],
          exclusionPatterns: ['*.note.md'],
        }),
        true,
      );
      assert.strictEqual(
        bundle.isExcludedFromAutoPreview({
          scheme: 'file',
          fileName: '/ws/README.md',
          exclusionSchemes: ['vscode-notebook-cell'],
          exclusionPatterns: ['*.note.md'],
        }),
        false,
      );
    });

    test('detects Secondary Side Bar support from vscode.version', function () {
      assert.strictEqual(bundle.supportsSecondarySidebar('1.82.0'), false);
      assert.strictEqual(bundle.supportsSecondarySidebar('1.105.2'), false);
      assert.strictEqual(bundle.supportsSecondarySidebar('1.106.0'), true);
      assert.strictEqual(
        bundle.supportsSecondarySidebar('1.107.0-insider'),
        true,
      );
    });
  });

  suite('SidePanelPreviewProvider lifecycle', function () {
    test('queues unresolved preview, focuses Side Panel without stealing focus, and avoids duplicate split-editor tabs', async function () {
      setConfiguration({
        previewMode: 'Single Preview',
        automaticallyShowPreviewInSidePanel: true,
        automaticallyShowPreviewOfMarkdownBeingEdited: true,
      });

      let resolvedDuringFocus = false;
      setExecuteCommandHandler(async (id) => {
        if (id === `${bundle.SIDE_PANEL_VIEW_ID}.focus`) {
          resolvedDuringFocus = true;
          viewInstance = makeWebviewView();
          await sidePanelRegistration.provider.resolveWebviewView(viewInstance);
        }
      });

      await activateEditor(makeMarkdownEditor('/ws/readme.md', '# Hello'));

      const focusCall = recorder.executedCommands.find(
        (call) => call.id === `${bundle.SIDE_PANEL_VIEW_ID}.focus`,
      );
      assert.ok(focusCall, 'expected focus command to open Side Panel view');
      assert.deepStrictEqual(focusCall.args, [{ preserveFocus: true }]);
      assert.strictEqual(resolvedDuringFocus, true);
      assert.strictEqual(viewInstance.webview.html, '<html># Hello</html>');
      assert.strictEqual(viewInstance.description, 'readme.md');
      assert.strictEqual(recorder.createdPanels.length, 0);
      assert.strictEqual(
        latestContextValue(bundle.SIDE_PANEL_HAS_SOURCE_CONTEXT),
        true,
      );
    });

    test('keeps the last Markdown preview rendered when switching to a non-Markdown file', async function () {
      await resolveAndOpen('/ws/guide.md', '# Guide');

      await activateEditor({
        document: {
          uri: makeUri('/ws/app.ts'),
          languageId: 'typescript',
          fileName: '/ws/app.ts',
          getText: () => 'export const x = 1;',
        },
        selections: [{ active: { line: 0 } }],
        visibleRanges: [],
      });

      assert.strictEqual(viewInstance.webview.html, '<html># Guide</html>');
      assert.strictEqual(viewInstance.description, 'guide.md');
      assert.strictEqual(
        latestContextValue(bundle.SIDE_PANEL_HAS_SOURCE_CONTEXT),
        true,
      );
      assert.strictEqual(recorder.createdPanels.length, 0);
    });

    test('locks and unlocks Side Panel preview across Markdown file switches and tab close', async function () {
      const editorA = makeMarkdownEditor('/ws/a.md', '# Doc A');
      const editorB = makeMarkdownEditor('/ws/b.md', '# Doc B');

      setTabGroups([
        {
          tabs: [
            { input: new bundle.vscodeStub.TabInputText(editorA.document.uri) },
            { input: new bundle.vscodeStub.TabInputText(editorB.document.uri) },
          ],
        },
      ]);

      await resolveAndOpen('/ws/a.md', '# Doc A');

      const toggleCmd = recorder.commands.get(
        'markdown-preview-enhanced.toggleSidePanelPreviewLock',
      );
      assert.ok(toggleCmd);
      await toggleCmd();

      assert.strictEqual(viewInstance.description, '[Locked] a.md');
      assert.strictEqual(
        latestContextValue(bundle.SIDE_PANEL_LOCKED_CONTEXT),
        true,
      );

      // Switching to b.md while locked keeps Doc A pinned.
      await activateEditor(editorB);
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');
      assert.strictEqual(viewInstance.description, '[Locked] a.md');

      // Closing a.md while locked still preserves Doc A.
      setTabGroups([
        {
          tabs: [
            { input: new bundle.vscodeStub.TabInputText(editorB.document.uri) },
          ],
        },
      ]);
      await emitTabsClosed([editorA.document.uri]);
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');

      // Unlocking resumes following active Markdown editors.
      await toggleCmd();
      assert.strictEqual(
        latestContextValue(bundle.SIDE_PANEL_LOCKED_CONTEXT),
        false,
      );
      await activateEditor(editorB);
      assert.strictEqual(viewInstance.webview.html, '<html># Doc B</html>');
      assert.strictEqual(viewInstance.description, 'b.md');
    });

    test('clears Side Panel to empty state when the unlocked source Markdown tab closes', async function () {
      const editorA = makeMarkdownEditor('/ws/a.md', '# Doc A');
      setTabGroups([
        {
          tabs: [
            { input: new bundle.vscodeStub.TabInputText(editorA.document.uri) },
          ],
        },
      ]);

      await resolveAndOpen('/ws/a.md', '# Doc A');
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');

      setActiveTextEditor(undefined);
      setTabGroups([{ tabs: [] }]);
      await emitTabsClosed([editorA.document.uri]);

      assert.strictEqual(viewInstance.description, '');
      assert.strictEqual(
        latestContextValue(bundle.SIDE_PANEL_HAS_SOURCE_CONTEXT),
        false,
      );
      assert.ok(
        viewInstance.webview.html.includes('No Markdown preview open'),
        'expected empty-state placeholder HTML after closing unlocked source tab',
      );
    });

    test('an unrelated close does not clear a preview whose source has no tab', async function () {
      const editorA = makeMarkdownEditor('/ws/a.md', '# Doc A');
      const other = makeMarkdownEditor('/ws/other.md', '# Other');

      await resolveAndOpen('/ws/a.md', '# Doc A');
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');

      // Explorer-style: the previewed file has no editor tab of its own
      // and nothing else is active.
      setActiveTextEditor(undefined);
      setTabGroups([{ tabs: [] }]);

      // Some other file's tab closes — the preview must survive it.
      await emitTabsClosed([other.document.uri]);
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');
      assert.strictEqual(viewInstance.description, 'a.md');

      // But a close that does involve the previewed file still clears.
      await emitTabsClosed([editorA.document.uri]);
      assert.ok(
        viewInstance.webview.html.includes('No Markdown preview open'),
        'expected empty-state placeholder after the source itself closed',
      );
    });

    test('re-renders in full after its registration is dropped (no frozen fast path)', async function () {
      await resolveAndOpen('/ws/a.md', '# Doc A');
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A</html>');

      // The state a preview-mode switch leaves behind when it cannot
      // preserve the view: unregistered, stale HTML still installed.
      const provider = await bundle.PreviewProvider.getPreviewContentProvider(
        makeUri('/ws/a.md'),
        makeExtensionContext(),
      );
      provider.detachSidePanelView(viewInstance);

      // Re-opening the same file must take the full render path — taking
      // the scroll-message fast path here would freeze the stale HTML.
      const editorA2 = makeMarkdownEditor('/ws/a.md', '# Doc A2');
      await sidePanelRegistration.provider.openPreview({
        sourceUri: editorA2.document.uri,
        document: editorA2.document,
      });
      assert.strictEqual(viewInstance.webview.html, '<html># Doc A2</html>');
    });

    test('updateHtml carries the untransformed markdown for source mapping', async function () {
      const content = '- [ ] buy milk\n';
      await resolveAndOpen('/ws/a.md', content);

      // updateMarkdown prefers disk content when the buffer is clean.
      globalThis.__vscodeStubFsReadFile = async () =>
        new TextEncoder().encode(content);

      const provider = await bundle.PreviewProvider.getPreviewContentProvider(
        makeUri('/ws/a.md'),
        makeExtensionContext(),
      );
      await provider.updateMarkdown(makeUri('/ws/a.md'));

      // updateMarkdown's render is fire-and-forget; poll for the payload.
      const deadline = Date.now() + 5000;
      let updateMessage;
      while (Date.now() < deadline) {
        updateMessage = [...viewInstance.postedMessages]
          .reverse()
          .find((m) => m && m.command === 'updateHtml');
        if (updateMessage) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      assert.ok(updateMessage, 'expected an updateHtml message');
      // The source-mapping markdown keeps the editor's true columns …
      assert.strictEqual(updateMessage.markdown, content);
      // … while the rendered HTML carries the checkbox transform.
      assert.ok(
        String(updateMessage.html).includes('mpe-task-checkbox'),
        'expected the checkbox transform in the rendered html',
      );
    });

    test('switches cleanly across multi-root workspace folders without calling dispose() on WebviewView', async function () {
      await resolveAndOpen('/ws/a.md', '# WS1 Doc');
      const ws1Provider =
        await bundle.PreviewProvider.getPreviewContentProvider(
          makeUri('/ws/a.md'),
          makeExtensionContext(),
        );
      assert.deepStrictEqual(
        ws1Provider.getPreviewSourceStates().map((s) => s.sourceUri?.fsPath),
        ['/ws/a.md'],
      );

      await activateEditor(makeMarkdownEditor('/ws2/b.md', '# WS2 Doc'));

      assert.strictEqual(viewInstance.disposedCalled, false);
      assert.strictEqual(viewInstance.webview.html, '<html># WS2 Doc</html>');
      assert.strictEqual(viewInstance.description, 'b.md');
      assert.deepStrictEqual(ws1Provider.getPreviewSourceStates(), []);

      const ws2Provider =
        await bundle.PreviewProvider.getPreviewContentProvider(
          makeUri('/ws2/b.md'),
          makeExtensionContext(),
        );
      assert.deepStrictEqual(
        ws2Provider.getPreviewSourceStates().map((s) => s.sourceUri?.fsPath),
        ['/ws2/b.md'],
      );
      const roots = viewInstance.webview.options.localResourceRoots.map(
        (u) => u.fsPath,
      );
      assert.ok(
        roots.includes('/ws2'),
        `expected localResourceRoots to include /ws2, got ${JSON.stringify(roots)}`,
      );
    });

    test("is given a document that differs from the active editor's in its query only", async function () {
      // The Git extension names a revision of a file by the query of its URI.
      await resolveAndOpen('/ws/a.md', '# Doc A');
      const revision = makeUri('/ws/a.md').with({ query: 'ref=~1' });
      setOpenTextDocumentResolver(async () => ({
        uri: revision,
        languageId: 'markdown',
        fileName: '/ws/a.md',
        getText: () => '# Doc A, revised\n',
      }));
      const openCmd = recorder.commands.get(
        'markdown-preview-enhanced.openPreviewInSidePanel',
      );
      assert.ok(openCmd);
      await openCmd(revision);

      assert.strictEqual(
        viewInstance.webview.html,
        '<html># Doc A, revised\n</html>',
      );
    });

    test('falls back to the Activity Bar legacy view ID on VS Code versions before 1.106', async function () {
      globalThis.__vscodeStubVersion = '1.95.0';
      const legacyRegistration = recorder.webviewViewProviders.get(
        bundle.SIDE_PANEL_LEGACY_VIEW_ID,
      );
      setExecuteCommandHandler(async (id) => {
        if (id === `${bundle.SIDE_PANEL_LEGACY_VIEW_ID}.focus`) {
          viewInstance = makeWebviewView(bundle.SIDE_PANEL_LEGACY_VIEW_ID);
          await legacyRegistration.provider.resolveWebviewView(viewInstance);
        }
      });

      const editor = makeMarkdownEditor('/ws/legacy.md', '# Legacy Host');
      setActiveTextEditor(editor);
      const openCmd = recorder.commands.get(
        'markdown-preview-enhanced.openPreviewInSidePanel',
      );
      assert.ok(openCmd);
      await openCmd();

      const focusCall = recorder.executedCommands.find(
        (call) => call.id === `${bundle.SIDE_PANEL_LEGACY_VIEW_ID}.focus`,
      );
      assert.ok(
        focusCall,
        'expected legacy Activity Bar view focus command on VS Code 1.95.0',
      );
      assert.deepStrictEqual(focusCall.args, [{ preserveFocus: true }]);
      assert.strictEqual(
        latestContextValue(bundle.DOES_NOT_SUPPORT_SECONDARY_SIDEBAR_CONTEXT),
        true,
      );
      assert.strictEqual(
        viewInstance.webview.html,
        '<html># Legacy Host</html>',
      );
    });
  });
});

async function resolveAndOpen(fsPath, content) {
  viewInstance = makeWebviewView();
  await sidePanelRegistration.provider.resolveWebviewView(viewInstance);
  await activateEditor(makeMarkdownEditor(fsPath, content));
}

async function activateEditor(editor) {
  setActiveTextEditor(editor);
  for (const handler of recorder.activeEditorHandlers) {
    await handler(editor);
  }
}

async function emitTabsClosed(uris) {
  const closed = uris.map((uri) => ({
    input: new bundle.vscodeStub.TabInputText(uri),
  }));
  for (const handler of recorder.tabChangeHandlers) {
    await handler({ opened: [], closed, changed: [] });
  }
}

function latestContextValue(contextKey) {
  for (let i = recorder.executedCommands.length - 1; i >= 0; i--) {
    const call = recorder.executedCommands[i];
    if (call.id === 'setContext' && call.args[0] === contextKey) {
      return call.args[1];
    }
  }
  return undefined;
}

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
  return bundle.vscodeStub.Uri.file(fsPath);
}

function makeMarkdownEditor(fsPath, text) {
  const uri = makeUri(fsPath);
  return {
    document: {
      uri,
      languageId: 'markdown',
      fileName: fsPath,
      isDirty: false,
      lineCount: text.split('\n').length,
      getText: () => text,
    },
    selections: [{ active: { line: 0 } }],
    visibleRanges: [],
  };
}

function makeWebviewView(viewType = bundle.SIDE_PANEL_VIEW_ID) {
  const disposeHandlers = [];
  const postedMessages = [];
  const view = {
    viewType,
    title: 'Markdown Preview',
    description: '',
    visible: true,
    disposedCalled: false,
    postedMessages,
    webview: {
      html: '',
      options: {},
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri) => uri,
      onDidReceiveMessage: () => ({ dispose() {} }),
      postMessage: async (message) => {
        postedMessages.push(message);
        return true;
      },
    },
    show() {},
    onDidChangeVisibility: () => ({ dispose() {} }),
    onDidDispose(handler) {
      disposeHandlers.push(handler);
      return { dispose() {} };
    },
    dispose() {
      view.disposedCalled = true;
      disposeHandlers.forEach((handler) => handler());
    },
  };
  return view;
}
