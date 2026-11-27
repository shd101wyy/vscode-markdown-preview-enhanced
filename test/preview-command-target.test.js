/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver,
  setMarkdownEngine,
  setConfiguration,
  setActiveTextEditor,
  setOpenTextDocumentResolver,
} = require('./vscode-stub');

/**
 * A preview command takes the file to preview as an optional argument: VS
 * Code passes the file of a menu, and another extension can pass any file
 * (vscode-mpe#2494). The commands used to return when no text editor was
 * open, and to preview the text of the active editor under the name of the
 * file they were given.
 */
let bundle;
let tmpFile;
/** What the page of the preview was given: its text and its config. */
let pages;

/** Each command, and the panel it opens: its column, and whether it is focused. */
const COMMANDS = [
  [
    'markdown-preview-enhanced.openPreview',
    'open',
    { column: 'One', focused: true },
  ],
  [
    'markdown-preview-enhanced.openPreviewToTheSide',
    'to the side',
    { column: 'Beside', focused: false },
  ],
  [
    'markdown-preview-enhanced.openLockedPreviewToTheSide',
    'locked to the side',
    { column: 'Beside', focused: false },
  ],
];

suite('the preview commands given a file', function () {
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
    tmpFile = path.join(__dirname, '.preview-command-target.bundle.cjs');
    fs.writeFileSync(tmpFile, result.outputFiles[0].text);
    bundle = require(tmpFile);
  });

  suiteTeardown(function () {
    setActiveTextEditor(undefined);
    setOpenTextDocumentResolver(undefined);
    setConfiguration({});
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  // The commands are registered by the activation, which the reset undoes.
  setup(async function () {
    recorder.reset();
    pages = [];
    setActiveTextEditor(undefined);
    setOpenTextDocumentResolver(async (uri) =>
      makeDocument(uri, `# ${path.basename(uri.fsPath)} from disk\n`),
    );
    setWorkspaceFolderResolver(() => ({
      uri: bundle.vscode.Uri.file('/ws'),
    }));
    setConfiguration({ previewMode: 'Multiple Previews' });
    setMarkdownEngine(makeEngine);
    await bundle.initExtensionCommon(makeExtensionContext());
  });

  teardown(function () {
    setActiveTextEditor(undefined);
    setOpenTextDocumentResolver(undefined);
    recorder.createdPanels.forEach((panel) => panel.dispose());
  });

  for (const [commandId, label, panel] of COMMANDS) {
    test(`a preview ${label} previews the file it is given when no editor is open`, async function () {
      const b = bundle.vscode.Uri.file('/ws/b.md');
      await runCommand(commandId, b);

      const page = thePage();
      assert.strictEqual(page.config.sourceUri, b.toString());
      assert.strictEqual(page.text, '# b.md from disk\n');
      assert.strictEqual(page.config.cursorLine, undefined);
      const created = recorder.createdPanels[0];
      assert.strictEqual(
        created.viewColumn,
        bundle.vscode.ViewColumn[panel.column],
      );
      assert.strictEqual(created.active, panel.focused);
    });

    test(`a preview ${label} previews another document of the open file's path, which its query names`, async function () {
      openEditor('/ws/a.md', '# a.md unsaved\n');
      // The Git extension names a revision of a file by the query of its URI.
      const revision = bundle.vscode.Uri.file('/ws/a.md').with({
        query: 'ref=~1',
      });
      setOpenTextDocumentResolver(async () =>
        makeDocument(revision, '# a.md at ~1\n'),
      );
      await runCommand(commandId, revision);

      const page = thePage();
      assert.strictEqual(page.config.sourceUri, revision.toString());
      assert.strictEqual(page.text, '# a.md at ~1\n');
      assert.strictEqual(page.config.cursorLine, undefined);
    });

    test(`a preview ${label} previews the file it is given, not the text of the active editor`, async function () {
      openEditor('/ws/a.md', '# a.md unsaved\n');
      const b = bundle.vscode.Uri.file('/ws/b.md');
      await runCommand(commandId, b);

      const page = thePage();
      assert.strictEqual(page.config.sourceUri, b.toString());
      assert.strictEqual(page.text, '# b.md from disk\n');
      assert.strictEqual(panelTitle(), 'Preview b.md');
    });

    test(`a preview ${label} of the open file previews what the editor shows, not the file`, async function () {
      openEditor('/ws/a.md', '# a.md unsaved\n');
      await runCommand(commandId);
      assert.strictEqual(thePage().text, '# a.md unsaved\n');

      // The file by its URI: the preview of it is open already, and the
      // same panel is rendered again.
      await runCommand(commandId, bundle.vscode.Uri.file('/ws/a.md'));
      assert.strictEqual(pages.at(-1).text, '# a.md unsaved\n');
      assert.strictEqual(recorder.createdPanels.length, 1);
    });

    test(`a preview ${label} follows the cursor of the editor that shows the file`, async function () {
      openEditor('/ws/a.md', '# Title\n\nparagraph\n', 2);
      await runCommand(commandId, bundle.vscode.Uri.file('/ws/a.md'));
      assert.strictEqual(thePage().config.cursorLine, 2);

      // No editor shows the file: the preview starts at the top.
      openEditor('/ws/c.md', '# c.md\n', 1);
      await runCommand(commandId, bundle.vscode.Uri.file('/ws/a.md'));
      assert.strictEqual(pages.at(-1).text, '# a.md from disk\n');
      assert.strictEqual(pages.at(-1).config.cursorLine, undefined);
    });

    test(`a preview ${label} is not opened, and the user is told, when no file is given and no editor is open`, async function () {
      await runCommand(commandId);
      assert.deepStrictEqual(recorder.warnings, [
        'Open a markdown file first.',
      ]);
      assert.strictEqual(recorder.createdPanels.length, 0);
    });
  }

  test('a link with a fragment to the open file previews what the editor shows', async function () {
    openEditor('/ws/a.md', '# a.md unsaved\n');
    const link = bundle.vscode.Uri.parse('file:///ws/a.md#heading');
    await runCommand('markdown-preview-enhanced.openPreviewToTheSide', link);

    assert.strictEqual(thePage().config.sourceUri, link.toString());
    assert.strictEqual(thePage().text, '# a.md unsaved\n');
  });

  test('a locked preview to the side is the one preview, and stays on its file', async function () {
    setConfiguration({
      previewMode: 'Single Preview',
      automaticallyShowPreviewOfMarkdownBeingEdited: true,
    });
    const b = bundle.vscode.Uri.file('/ws/b.md');
    await runCommand('markdown-preview-enhanced.openLockedPreviewToTheSide', b);
    assert.strictEqual(panelTitle(), 'Preview [Locked] b.md');

    // Another file becomes the one the editor shows: the preview stays.
    const { editor } = openEditor('/ws/c.md', '# c.md\n');
    for (const handler of recorder.activeEditorHandlers) {
      await handler(editor);
    }
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(recorder.createdPanels.length, 1);
  });

  for (const [commandId, label] of COMMANDS) {
    test(`a preview ${label} reports a file that cannot be opened, and opens no panel`, async function () {
      setOpenTextDocumentResolver(async () => {
        throw new Error('cannot open file');
      });
      await withoutLoggedErrors(() =>
        runCommand(commandId, bundle.vscode.Uri.file('/ws/none.md')),
      );

      assert.deepStrictEqual(recorder.errors, [
        'MPE Preview failed: cannot open file',
      ]);
      assert.strictEqual(recorder.createdPanels.length, 0);
    });
  }
});

async function runCommand(commandId, ...args) {
  const handler = recorder.commands.get(commandId);
  assert.ok(handler, `command ${commandId} is not registered`);
  await handler(...args);
}

/** Run `test` with what the extension logs kept out of the test output. */
async function withoutLoggedErrors(test) {
  const logged = console.error;
  console.error = () => {};
  try {
    await test();
  } finally {
    console.error = logged;
  }
}

/** The page the one preview of a test was given. */
function thePage() {
  assert.strictEqual(pages.length, 1, 'one preview was rendered');
  return pages[0];
}

function panelTitle() {
  const panel = recorder.createdPanels[0];
  assert.ok(panel, 'no preview panel was created');
  return panel.title;
}

/** An editor that shows `fsPath`, its cursor on `line` (the first by default). */
function openEditor(fsPath, text, line = 0) {
  const document = makeDocument(bundle.vscode.Uri.file(fsPath), text);
  const editor = {
    document,
    selections: [{ active: { line } }],
    visibleRanges: [],
  };
  setActiveTextEditor(editor);
  // What the file holds is another text, so that a page read from the disk
  // cannot pass for the text of the editor.
  setOpenTextDocumentResolver(async (uri) =>
    makeDocument(uri, `# ${path.basename(uri.fsPath)} from disk\n`),
  );
  return { editor, document };
}

function makeDocument(uri, text) {
  return {
    uri,
    fileName: uri.fsPath,
    languageId: 'markdown',
    isDirty: false,
    lineCount: text.split('\n').length,
    getText: () => text,
  };
}

/** A crossnote engine that writes the text it is handed into the page. */
function makeEngine() {
  return {
    generateHTMLTemplateForPreview: async ({ inputString, config }) => {
      pages.push({ text: inputString, config });
      return `<html>${inputString}</html>`;
    },
    parseMD: async (text) => ({
      html: text,
      tocHTML: '',
      JSAndCssFiles: [],
      yamlConfig: {},
    }),
    isPreviewInPresentationMode: false,
    clearCaches() {},
  };
}

function makeExtensionContext() {
  return {
    subscriptions: [],
    extensionUri: bundle.vscode.Uri.file('/ext'),
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
