/**
 * Minimal in-memory stand-ins for the `vscode` and `crossnote` modules, used to
 * bundle and exercise extension code that would otherwise only run inside an
 * Extension Host.
 *
 * The stubs record what the extension did (registered commands, clipboard
 * writes, warnings) so tests can assert on it.
 */

const recorder = {
  commands: new Map(),
  clipboard: { text: null },
  warnings: [],
  reset() {
    this.commands = new Map();
    this.clipboard = { text: null };
    this.warnings = [];
  },
};

const VSCODE_STUB_SOURCE = `
  const recorder = globalThis.__vscodeStubRecorder;
  const noop = () => {};
  const disposable = { dispose: noop };
  const event = () => disposable;

  class Uri {
    constructor(scheme, authority, path, query, fragment) {
      this.scheme = scheme;
      this.authority = authority;
      this.path = path;
      this.query = query || '';
      this.fragment = fragment || '';
    }
    static file(path) {
      return new Uri('file', '', path);
    }
    static parse(value) {
      const m = /^([a-z][a-z0-9+.-]*):\\/\\/([^/?#]*)([^?#]*)(?:\\?([^#]*))?(?:#(.*))?$/i.exec(value);
      return m ? new Uri(m[1], m[2], m[3], m[4], m[5]) : new Uri('file', '', value);
    }
    static joinPath(base, ...parts) {
      return new Uri(base.scheme, base.authority, [base.path, ...parts].join('/'));
    }
    get fsPath() {
      return this.path;
    }
    with(change) {
      return new Uri(
        change.scheme === undefined ? this.scheme : change.scheme,
        change.authority === undefined ? this.authority : change.authority,
        change.path === undefined ? this.path : change.path,
        change.query === undefined ? this.query : change.query,
        change.fragment === undefined ? this.fragment : change.fragment,
      );
    }
    toString() {
      return (
        this.scheme + '://' + this.authority + this.path +
        (this.query ? '?' + this.query : '') +
        (this.fragment ? '#' + this.fragment : '')
      );
    }
  }

  module.exports = {
    Uri,
    ViewColumn: { One: 1, Two: 2, Beside: -2 },
    window: {
      createWebviewPanel: () => {
        throw new Error('createWebviewPanel is not stubbed; pass a webviewPanel instead');
      },
      showErrorMessage: noop,
      showWarningMessage: (message) => recorder.warnings.push(message),
      showInformationMessage: noop,
      showQuickPick: async () => undefined,
      showInputBox: async () => undefined,
      createOutputChannel: () => ({ appendLine: noop, show: noop, dispose: noop }),
      createStatusBarItem: () => ({ show: noop, hide: noop, dispose: noop, text: '' }),
      registerWebviewPanelSerializer: () => disposable,
      registerCustomEditorProvider: () => disposable,
      withProgress: async (_options, task) => task({ report: noop }, { isCancellationRequested: false }),
      onDidChangeActiveTextEditor: event,
      onDidChangeTextEditorSelection: event,
      onDidChangeTextEditorVisibleRanges: event,
      onDidChangeTextEditorViewColumn: event,
      onDidChangeVisibleTextEditors: event,
      onDidChangeActiveColorTheme: event,
      onDidChangeWindowState: event,
      visibleTextEditors: [],
      activeTextEditor: undefined,
      activeColorTheme: { kind: 1 },
      tabGroups: { all: [], onDidChangeTabs: event, close: async () => true },
    },
    workspace: {
      workspaceFolders: [],
      textDocuments: [],
      getConfiguration: () => ({ get: () => undefined, update: async () => {} }),
      getWorkspaceFolder: (uri) => globalThis.__vscodeStubWorkspaceFolder(uri),
      asRelativePath: (uri) => globalThis.__vscodeStubRelativePath(uri),
      openTextDocument: async () => ({ getText: () => '', uri: Uri.file('/ws/a.md') }),
      applyEdit: async () => true,
      registerTextDocumentContentProvider: () => disposable,
      createFileSystemWatcher: () => ({ onDidCreate: event, onDidChange: event, onDidDelete: event, dispose: noop }),
      findFiles: async () => [],
      fs: { readFile: async () => new Uint8Array(), writeFile: async () => {}, stat: async () => ({}) },
      onDidChangeConfiguration: event,
      onDidSaveTextDocument: event,
      onDidChangeTextDocument: event,
      onDidCloseTextDocument: event,
      onDidOpenTextDocument: event,
      onDidChangeWorkspaceFolders: event,
      onDidCreateFiles: event,
      onDidDeleteFiles: event,
      onDidRenameFiles: event,
    },
    commands: {
      executeCommand: async () => {},
      registerCommand: (id, handler) => {
        recorder.commands.set(id, handler);
        return disposable;
      },
      registerTextEditorCommand: (id, handler) => {
        recorder.commands.set(id, handler);
        return disposable;
      },
    },
    env: {
      clipboard: {
        writeText: async (text) => {
          recorder.clipboard.text = text;
        },
        readText: async () => '',
      },
      openExternal: async () => true,
      uriScheme: 'vscode',
      appName: 'VS Code',
    },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    Selection: class { constructor(anchor, active) { this.anchor = anchor; this.active = active; } },
    EventEmitter: class { constructor() { this.event = event; } fire() {} dispose() {} },
    Disposable: class { static from() { return disposable; } dispose() {} },
    WorkspaceEdit: class { insert() {} replace() {} delete() {} },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    ColorThemeKind: { Light: 1, Dark: 2 },
    ProgressLocation: { Notification: 15 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    TabInputCustom: class {},
    TabInputText: class {},
  };
`;

const CROSSNOTE_STUB_SOURCE = `
  module.exports = {
    Notebook: {
      init: async ({ notebookPath, fs }) => ({
        notebookPath,
        config: {},
        fs: { ...fs, exists: async () => false },
        updateConfig: () => {},
        getNoteMarkdownEngine: () => globalThis.__crossnoteStubEngine(),
        clearAllNoteMarkdownEngineCaches: () => {},
      }),
    },
    PreviewMode: {
      SinglePreview: 'Single Preview',
      MultiplePreviews: 'Multiple Previews',
      PreviewsOnly: 'Previews Only',
    },
    utility: {
      getCrossnoteBuildDirectory: () => '/tmp/crossnote',
      setCrossnoteBuildDirectory: () => {},
      useExternalAddFileProtocolFunction: () => {},
      addFileProtocol: (value) => value,
      escapeString: (value) => value,
      unescapeString: (value) => value,
    },
    ImageUploader: {},
    getDefaultNotebookConfig: () => ({}),
    loadConfigsInDirectory: async () => ({}),
  };
`;

/** esbuild plugin that resolves `vscode` and `crossnote` to the stubs above. */
function stubPlugin() {
  return {
    name: 'vscode-crossnote-stub',
    setup(build) {
      build.onResolve({ filter: /^(vscode|crossnote)$/ }, (args) => ({
        path: args.path,
        namespace: 'extension-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'extension-stub' }, (args) => ({
        contents:
          args.path === 'vscode' ? VSCODE_STUB_SOURCE : CROSSNOTE_STUB_SOURCE,
        loader: 'js',
      }));
    },
  };
}

globalThis.__vscodeStubRecorder = recorder;
globalThis.__vscodeStubWorkspaceFolder = () => undefined;
globalThis.__vscodeStubRelativePath = (uri) => String(uri);
globalThis.__crossnoteStubEngine = () => ({
  generateHTMLTemplateForPreview: async () => '<html></html>',
});

module.exports = {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver(fn) {
    globalThis.__vscodeStubWorkspaceFolder = fn;
  },
  setRelativePathResolver(fn) {
    globalThis.__vscodeStubRelativePath = fn;
  },
  setMarkdownEngine(fn) {
    globalThis.__crossnoteStubEngine = fn;
  },
};
