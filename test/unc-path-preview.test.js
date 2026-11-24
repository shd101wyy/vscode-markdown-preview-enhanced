/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver,
  setMarkdownEngine,
  setConfiguration,
  setActiveTextEditor,
  setVisibleTextEditors,
  setOpenTextDocumentResolver,
  setFileReader,
  setUploadedImageUrl,
} = require('./vscode-stub');

/**
 * On Windows a markdown file on a network share is `\\NAS\docs\a.md`. VS Code
 * keeps the server name's case in `Uri.fsPath` but lower-cases it in
 * `Uri.toString()` — and the string form is what the extension hands to the
 * preview webview, which sends it back as the first argument of every
 * message it posts. Matching such a URI against an editor's or a panel's by
 * `fsPath` answers "another file" (vscode-mpe#2451).
 *
 * Each case opens the document and its preview, then runs the commands the
 * way the webview does: positional arguments, with the `sourceUri` string
 * taken from the config the preview was handed.
 */
let bundle;
let tmpFile;
let root;
let openPanels;
let sourceUriGivenToTheWebview;
let cursorLineGivenToTheWebview;
let renders;

suite('preview of a file on a network share', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "import * as vscode from 'vscode';",
          "export { initExtensionCommon } from './src/extension-common';",
          "export { PreviewProvider, dispatchPreviewWebviewMessage } from './src/preview-provider';",
          'export { vscode };',
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
    tmpFile = path.join(__dirname, '.unc-path-preview.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mpe-unc-'));
    // The share is the workspace folder. It stands in for `\\NAS\docs` here:
    // pasting an image has to create a folder in it.
    setWorkspaceFolderResolver(() => ({ uri: bundle.vscode.Uri.file(root) }));
    await bundle.initExtensionCommon(makeExtensionContext());
  });

  suiteTeardown(function () {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
    fs.rmSync(root, { recursive: true, force: true });
    setWorkspaceFolderResolver(() => undefined);
    setConfiguration({});
    setMarkdownEngine();
  });

  setup(function () {
    openPanels = [];
    recorder.createdPanels.length = 0;
    sourceUriGivenToTheWebview = undefined;
    cursorLineGivenToTheWebview = undefined;
    renders = 0;
    setWorkspaceFolderResolver(() => ({
      uri: bundle.vscode.Uri.file(root),
    }));
    setConfiguration({ previewMode: 'Single Preview' });
    setActiveTextEditor(undefined);
    setVisibleTextEditors([]);
    setOpenTextDocumentResolver(undefined);
    setFileReader(undefined);
    setUploadedImageUrl(undefined);
    setMarkdownEngine(makeEngine);
  });

  teardown(function () {
    openPanels.forEach((panel) => panel.dispose());
  });

  test('a URI comes back from the webview with its server name lower-cased', function () {
    // The premise of this suite, as in VS Code's own Uri.
    const { Uri } = bundle.vscode;
    const inTheEditor = Uri.file('\\\\NAS01\\docs\\a.md');
    const fromTheWebview = Uri.parse(inTheEditor.toString());

    assert.strictEqual(inTheEditor.toString(), 'file://nas01/docs/a.md');
    assert.strictEqual(fromTheWebview.toString(), inTheEditor.toString());
    assert.notStrictEqual(fromTheWebview.fsPath, inTheEditor.fsPath);
  });

  test('renders the first preview (#2451)', async function () {
    openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    const panel = await openPreviewToTheSide();
    const posted = recordPostedMessages(panel);

    // The preview has loaded and asks for the document it was given.
    await runCommand('_crossnote.webviewFinishLoading', {
      uri: sourceUriGivenToTheWebview,
      systemColorScheme: 'light',
    });

    const message = await waitFor(
      () => posted.find((posted_) => posted_.command === 'updateHtml'),
      'the preview was never sent its first updateHtml',
    );
    assert.strictEqual(message.html, '<h1>Title</h1>\n');
  });

  test('sends an edit of a document that loads scripts to the preview instead of restarting it again', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    setMarkdownEngine(() => makeEngine(['a.js']));
    const panel = await openPreviewToTheSide();
    const posted = recordPostedMessages(panel);

    // The first render finds the script and restarts the preview for it.
    await runCommand('_crossnote.webviewFinishLoading', {
      uri: sourceUriGivenToTheWebview,
      systemColorScheme: 'light',
    });
    await waitFor(
      () => panel.webview.html === '<html>render 2</html>',
      'the preview was not restarted for its script',
    );

    // An edit updates through the editor's own URI, as onDidChangeTextDocument does.
    const provider = await bundle.PreviewProvider.getPreviewContentProvider(
      editor.document.uri,
      makeExtensionContext(),
    );
    setConfiguration({
      previewMode: 'Single Preview',
      liveUpdate: true,
      liveUpdateDebounceMs: 0,
    });
    provider.update(editor.document.uri);

    await waitFor(
      () => posted.find((posted_) => posted_.command === 'updateHtml'),
      'the edit was not sent to the preview',
    );
  });

  test('restarts the preview when it is refreshed from the preview', async function () {
    openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    const panel = await openPreviewToTheSide();
    assert.strictEqual(panel.webview.html, '<html>render 1</html>');

    await runCommand('_crossnote.refreshPreview', sourceUriGivenToTheWebview);

    await waitFor(
      () => panel.webview.html === '<html>render 2</html>',
      'the preview was not restarted',
    );
  });

  test('keeps the single preview panel when the next document comes from the same folder', async function () {
    // With no folder open, what the preview may load from is the document's
    // own folder, rebuilt from the fsPath — which keeps the server name's case.
    setWorkspaceFolderResolver(() => undefined);
    openDocument('\\\\NAS01\\docs\\a.md', 'a\n');
    await openPreviewToTheSide();
    await runCommand('_crossnote.refreshPreview', sourceUriGivenToTheWebview);
    await waitFor(
      () => recorder.createdPanels[0].webview.html === '<html>render 2</html>',
      'the preview was not restarted',
    );

    openDocument('\\\\NAS01\\docs\\b.md', 'b\n');
    await openPreviewToTheSide();

    assert.strictEqual(recorder.createdPanels.length, 1);
    assert.strictEqual(sourceUriGivenToTheWebview, 'file://nas01/docs/b.md');
  });

  test('reveals a line in the editor of the file when the preview scrolls to it', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', 'a\nb\nc\n');
    await openPreviewToTheSide();

    await runCommand('_crossnote.revealLine', sourceUriGivenToTheWebview, 2.25);

    assert.strictEqual(editor.revealed.length, 1);
    // the third line
    assert.strictEqual(editor.revealed[0][0].start, 2);
  });

  test('reveals and selects a position in the editor of the file when the preview is clicked', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', 'a\nb\nc\n');
    await openPreviewToTheSide();

    await runCommand(
      '_crossnote.revealSourcePosition',
      sourceUriGivenToTheWebview,
      1, // line
      0, // character
      0.5, // where it lands down the editor
      true, // move the cursor there
    );

    assert.strictEqual(editor.revealed.length, 1);
    assert.strictEqual(editor.selection.anchor.line, 1);
  });

  test('toggles a checkbox in the editor of the file', async function () {
    const { editor } = openDocument(
      '\\\\NAS01\\docs\\a.md',
      '- [ ] item one\n- [x] item two\n',
    );
    await openPreviewToTheSide();

    await runCommand(
      '_crossnote.clickTaskListCheckbox',
      sourceUriGivenToTheWebview,
      0,
    );

    assert.deepStrictEqual(editor.edits, [{ replace: '- [x] item one' }]);
  });

  test('pastes an image into the editor of the file', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    await openPreviewToTheSide();
    const image = path.join(root, 'diagram.png');
    fs.writeFileSync(image, 'png-bytes');
    // An absolute folder is resolved against the workspace folder, which
    // is a real directory here; a relative one against the document's own
    // directory, which is not.
    setConfiguration({
      previewMode: 'Single Preview',
      imageFolderPath: '/assets',
    });

    await runCommand(
      '_crossnote.pasteImageFile',
      sourceUriGivenToTheWebview,
      image,
    );
    await waitFor(
      () => editor.edits.length > 0,
      'the image link was never inserted',
    );
    const copied = path.join(root, 'assets', 'diagram.png');
    await waitFor(
      () =>
        fs.existsSync(copied) &&
        fs.readFileSync(copied).toString() === 'png-bytes',
      'the image was never copied next to the document',
    );

    assert.deepStrictEqual(editor.edits, [
      { insert: '![diagram](/assets/diagram.png)' },
    ]);
  });

  test('uploads an image and inserts its link into the editor of the file', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    await openPreviewToTheSide();
    const image = path.join(root, 'diagram.png');
    fs.writeFileSync(image, 'png-bytes');
    setUploadedImageUrl('https://cdn.example/diagram.png');

    await runCommand(
      '_crossnote.uploadImageFile',
      sourceUriGivenToTheWebview,
      image,
      'picgo',
    );

    const uploaded = await waitFor(
      () => editor.edits.find((edit) => edit.replace),
      'the uploaded link was never inserted',
    );
    assert.strictEqual(editor.edits.length, 2);
    assert.ok(editor.edits[0].insert.startsWith('![Uploading diagram.png'));
    // the placeholder is swapped for the link, the rest of the line kept
    assert.strictEqual(
      uploaded.replace,
      '![diagram](https://cdn.example/diagram.png)# Title',
    );
  });

  test('inserts an image link into the editor of the file', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    await openPreviewToTheSide();

    await runCommand(
      '_crossnote.insertImageUrl',
      sourceUriGivenToTheWebview,
      'https://cdn.example/diagram.png',
    );

    assert.deepStrictEqual(editor.edits, [
      {
        insert:
          '![enter image description here](https://cdn.example/diagram.png)',
      },
    ]);
  });

  test('lets the preview ask to write only the document it is showing', async function () {
    const { document } = openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    await openPreviewToTheSide();
    const { dispatchPreviewWebviewMessage } = bundle;
    const askToRewrite = (uri) =>
      dispatchPreviewWebviewMessage(
        { command: 'updateMarkdown', args: [uri, 'rewritten', 1] },
        () => document.uri,
      );

    // the URI the preview was given
    askToRewrite(sourceUriGivenToTheWebview);
    // another place in the document
    askToRewrite(`${sourceUriGivenToTheWebview}#L3`);
    // another document on the share
    askToRewrite('file://nas01/docs/other.md');

    assert.deepStrictEqual(
      recorder.executedCommands
        .filter((executed) => executed.id === '_crossnote.updateMarkdown')
        .map((executed) => executed.args[0]),
      [sourceUriGivenToTheWebview],
    );
  });

  test('still finds the editor and the preview of a document opened from a link with a fragment', async function () {
    setConfiguration({ previewMode: 'Previews Only' });
    // A local path: this case is about the fragment alone.
    const { editor, document } = openDocument(
      path.join(root, 'a.md'),
      '- [ ] a\nb\nc\n',
    );
    // A click on `[a](a.md#L3)` opens the preview with the link's target as
    // its source URI, the fragment included (see `clickTagA`).
    const provider = await bundle.PreviewProvider.getPreviewContentProvider(
      document.uri,
      makeExtensionContext(),
    );
    await provider.initPreview({
      sourceUri: document.uri.with({ fragment: 'L3' }),
      document,
      cursorLine: 2,
      viewOptions: { viewColumn: 1, preserveFocus: true },
    });
    const panel = trackLastCreatedPanel();
    assert.strictEqual(sourceUriGivenToTheWebview, `${document.uri}#L3`);
    // the preview starts at the line the link points at
    assert.strictEqual(cursorLineGivenToTheWebview, 2);

    await runCommand('_crossnote.revealLine', sourceUriGivenToTheWebview, 1);
    assert.strictEqual(editor.revealed.length, 1);

    await runCommand(
      '_crossnote.clickTaskListCheckbox',
      sourceUriGivenToTheWebview,
      0,
    );
    assert.deepStrictEqual(editor.edits, [{ replace: '- [x] a' }]);

    await runCommand('_crossnote.refreshPreview', sourceUriGivenToTheWebview);
    await waitFor(
      () => panel.webview.html === '<html>render 2</html>',
      'the preview was not restarted',
    );
  });
});

/**
 * The document of `fsPath`, open in an editor. Edits the extension makes are
 * recorded and applied to the document's text.
 */
function openDocument(fsPath, text) {
  const uri = bundle.vscode.Uri.file(fsPath);
  const lines = text.split('\n');
  const position = (line, character) => ({
    line: Math.max(line, 0),
    character: Math.max(character, 0),
    isEqual(other) {
      return other.line === this.line && other.character === this.character;
    },
  });
  const edits = [];
  const document = {
    uri,
    fileName: fsPath,
    languageId: 'markdown',
    isDirty: false,
    get lineCount() {
      return lines.length;
    },
    getText: () => lines.join('\n'),
    lineAt: (line) => ({
      text: lines[Math.min(Math.max(line, 0), lines.length - 1)],
    }),
    validatePosition: (given) => position(given.line, given.character),
  };
  const editor = {
    document,
    selection: { active: position(0, 0) },
    selections: [{ active: position(0, 0) }],
    options: { tabSize: 4 },
    visibleRanges: [],
    revealed: [],
    revealRange(...args) {
      this.revealed.push(args);
    },
    edit(callback) {
      callback({
        insert(at, inserted) {
          edits.push({ insert: inserted });
          lines[at.line] =
            lines[at.line].slice(0, at.character) +
            inserted +
            lines[at.line].slice(at.character);
        },
        replace(range, replacement) {
          edits.push({ replace: replacement });
          lines[range.start.line] = replacement;
        },
      });
      return Promise.resolve(true);
    },
    edits,
  };
  setActiveTextEditor(editor);
  setVisibleTextEditors([editor]);
  setOpenTextDocumentResolver(async () => document);
  setFileReader(async () => new TextEncoder().encode(text));
  return { editor, document };
}

/**
 * A crossnote engine that renders a document's text as its HTML, a counting
 * page into the preview, and reports `jsAndCssFiles` for every document.
 */
function makeEngine(jsAndCssFiles = []) {
  return {
    generateHTMLTemplateForPreview: async ({ config }) => {
      sourceUriGivenToTheWebview = config.sourceUri;
      cursorLineGivenToTheWebview = config.cursorLine;
      return `<html>render ${++renders}</html>`;
    },
    parseMD: async (text) => ({
      html: text.replace(/^# (.*)$/gm, '<h1>$1</h1>'),
      tocHTML: '',
      JSAndCssFiles: jsAndCssFiles,
      yamlConfig: {},
    }),
    isPreviewInPresentationMode: false,
    clearCaches() {},
  };
}

/** Open the preview of the active editor to its side, as Ctrl+K V does. */
async function openPreviewToTheSide() {
  await runCommand('markdown-preview-enhanced.openPreviewToTheSide');
  return trackLastCreatedPanel();
}

function trackLastCreatedPanel() {
  const panel = recorder.createdPanels.at(-1);
  assert.ok(panel, 'no preview panel was created');
  openPanels.push(panel);
  return panel;
}

function recordPostedMessages(panel) {
  const posted = [];
  panel.webview.postMessage = async (message) => {
    posted.push(message);
    return true;
  };
  return posted;
}

/**
 * Run a command the way the preview webview asks for it, with positional
 * arguments.
 */
async function runCommand(commandId, ...args) {
  const handler = recorder.commands.get(commandId);
  assert.ok(handler, `command ${commandId} is not registered`);
  await handler(...args);
}

/** Resolve once `condition()` returns a value; reject after three seconds. */
function waitFor(condition, message) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 3000;
    const poll = () => {
      const value = condition();
      if (value) {
        return resolve(value);
      }
      if (Date.now() > deadline) {
        return reject(new Error(`Timed out waiting until ${message}`));
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionUri: bundle.vscode.Uri.file('/ext'),
    extensionPath: '/ext',
    extensionMode: 1,
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
  };
}
