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
} = require('./vscode-stub');

/**
 * On Windows a markdown file on a network share is `\\NAS\docs\a.md`. VS Code
 * keeps the server name's case in `Uri.fsPath` but lower-cases it in
 * `Uri.toString()` — and the string form is what the extension hands to the
 * preview webview, which sends it back as the first argument of every
 * message it posts. Matching such a URI against an editor's or a panel's by
 * `fsPath` answers "another file" (vscode-mpe#2451).
 */
let bundle;
let tmpFile;
let root;
let openPanels;
// the `sourceUri` the preview was handed in its config, as a string
let sourceUriGivenToTheWebview;

suite('preview of a file on a network share', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    const result = await esbuild.build({
      stdin: {
        contents: [
          "import * as vscode from 'vscode';",
          "export { initExtensionCommon } from './src/extension-common';",
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
  });

  setup(function () {
    openPanels = [];
    recorder.createdPanels.length = 0;
    sourceUriGivenToTheWebview = undefined;
    setConfiguration({ previewMode: 'Single Preview' });
    setActiveTextEditor(undefined);
    setVisibleTextEditors([]);
    setOpenTextDocumentResolver(undefined);
    setFileReader(undefined);
    setMarkdownEngine(() => makeEngine(() => '<html></html>'));
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

  test('restarts the preview when it is refreshed from the preview', async function () {
    openDocument('\\\\NAS01\\docs\\a.md', '# Title\n');
    let renders = 0;
    setMarkdownEngine(() =>
      makeEngine(() => `<html>render ${++renders}</html>`),
    );
    const panel = await openPreviewToTheSide();
    assert.strictEqual(panel.webview.html, '<html>render 1</html>');

    await runCommand('_crossnote.refreshPreview', sourceUriGivenToTheWebview);

    await waitFor(
      () => panel.webview.html === '<html>render 2</html>',
      'the preview was not restarted',
    );
  });

  test('reveals a line in the editor of the file when the preview scrolls to it', async function () {
    const { editor } = openDocument('\\\\NAS01\\docs\\a.md', 'a\nb\nc\n');
    await openPreviewToTheSide();

    await runCommand('_crossnote.revealLine', sourceUriGivenToTheWebview, 2.25);

    assert.strictEqual(editor.revealed.length, 1);
    // the third line
    assert.strictEqual(editor.revealed[0][0].start, 2);
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

    assert.deepStrictEqual(editor.edits, ['![diagram](/assets/diagram.png)']);
  });
});

/** The document of `fsPath`, open in an editor. */
function openDocument(fsPath, text) {
  const uri = bundle.vscode.Uri.file(fsPath);
  const lines = text.split('\n');
  const edits = [];
  const editor = {
    document: {
      uri,
      fileName: fsPath,
      languageId: 'markdown',
      isDirty: false,
      lineCount: lines.length,
      getText: () => text,
      lineAt: (line) => ({ text: lines[line] }),
    },
    selection: { active: { line: 0, character: 0 } },
    selections: [{ active: { line: 0, character: 0 } }],
    visibleRanges: [],
    revealed: [],
    revealRange(...args) {
      this.revealed.push(args);
    },
    edit(callback) {
      callback({
        insert(_position, inserted) {
          edits.push(inserted);
        },
      });
      return Promise.resolve(true);
    },
    edits,
  };
  setActiveTextEditor(editor);
  setVisibleTextEditors([editor]);
  setOpenTextDocumentResolver(async () => editor.document);
  setFileReader(async () => new TextEncoder().encode(text));
  return { editor };
}

/**
 * A crossnote engine that renders `template()` into the preview's page and
 * a document's text as its HTML.
 */
function makeEngine(template) {
  return {
    generateHTMLTemplateForPreview: async ({ config }) => {
      sourceUriGivenToTheWebview = config.sourceUri;
      return template();
    },
    parseMD: async (text) => ({
      html: text.replace(/^# (.*)$/gm, '<h1>$1</h1>'),
      tocHTML: '',
      JSAndCssFiles: [],
      yamlConfig: {},
    }),
    isPreviewInPresentationMode: false,
    clearCaches() {},
  };
}

/** Open the preview of the active editor to its side, as Ctrl+K V does. */
async function openPreviewToTheSide() {
  await runCommand('markdown-preview-enhanced.openPreviewToTheSide');
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

/** Resolve once `condition()` returns a value; reject after a second. */
function waitFor(condition, message) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000;
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
