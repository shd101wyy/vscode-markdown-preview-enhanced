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
  executedCommands: [],
  webviewViewProviders: new Map(),
  clipboard: { text: null },
  warnings: [],
  activeEditorHandlers: [],
  tabChangeHandlers: [],
  closeDocumentHandlers: [],
  configurationChangeHandlers: [],
  createdPanels: [],
  shownDocuments: [],
  reset() {
    this.commands = new Map();
    this.executedCommands = [];
    this.webviewViewProviders = new Map();
    this.clipboard = { text: null };
    this.warnings = [];
    this.activeEditorHandlers = [];
    this.tabChangeHandlers = [];
    this.closeDocumentHandlers = [];
    this.configurationChangeHandlers = [];
    this.createdPanels = [];
    this.shownDocuments = [];
    globalThis.__vscodeStubVersion = '1.107.0';
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
      // Mirror vscode-uri: a Windows drive path becomes "/c:/…" (forward
      // slashes, leading slash, drive lowercased) and a UNC path such as
      // \\\\server\\share\\a.md becomes the authority "server" and the path
      // "/share/a.md", so toString/parse/fsPath roundtrip and crossnote's
      // own vscode-uri reads the same path.
      let p = String(path);
      if (/^[A-Za-z]:[\\\\/]/.test(p)) {
        p = '/' + p[0].toLowerCase() + p.slice(1).replace(/\\\\/g, '/');
      } else {
        const unc = /^[\\\\/]{2}([^\\\\/]+)([\\\\/][^]*)$/.exec(p);
        if (unc) {
          return new Uri('file', unc[1], unc[2].replace(/\\\\/g, '/'));
        }
      }
      return new Uri('file', '', p);
    }
    static parse(value) {
      const m = /^([a-z][a-z0-9+.-]*):\\/\\/([^/?#]*)([^?#]*)(?:\\?([^#]*))?(?:#(.*))?$/i.exec(value);
      return m ? new Uri(m[1], m[2], m[3], m[4], m[5]) : new Uri('file', '', value);
    }
    static joinPath(base, ...parts) {
      return new Uri(base.scheme, base.authority, [base.path, ...parts].join('/'));
    }
    get fsPath() {
      // Mirror vscode-uri: a UNC path is "//server/share/a.md" with the
      // server name as given — toString() below lower-cases it; the drive
      // of a "/c:/…" file path is lowercased and, on Windows, separators
      // become native — crossnote's vscode-uri produces the same fsPath,
      // so product code comparing paths from the two libraries agrees.
      if (this.scheme === 'file' && this.authority && this.path.length > 1) {
        return '//' + this.authority + this.path;
      }
      const drive = /^\\/([A-Za-z]:)(\\/.*)$/.exec(this.path);
      if (this.scheme === 'file' && drive) {
        const native = drive[1].toLowerCase() + drive[2];
        return process.platform === 'win32' ? native.replace(/\\//g, '\\\\') : native;
      }
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
      // Mirror vscode-uri: the authority is lower-cased — "file://NAS01/…"
      // prints as "file://nas01/…" — while fsPath keeps its case.
      return (
        this.scheme + '://' + this.authority.toLowerCase() + this.path +
        (this.query ? '?' + this.query : '') +
        (this.fragment ? '#' + this.fragment : '')
      );
    }
  }

  function createMockWebviewPanel(viewType, title, showOptions) {
    const disposeHandlers = [];
    const panel = {
      viewType,
      title,
      viewColumn: typeof showOptions === 'number' ? showOptions : (showOptions?.viewColumn ?? 1),
      active: !(showOptions && showOptions.preserveFocus),
      iconPath: null,
      options: {},
      webview: {
        html: '',
        options: {},
        cspSource: 'vscode-webview://mock',
        asWebviewUri: (uri) => uri,
        onDidReceiveMessage: () => disposable,
        postMessage: async () => true,
      },
      reveal: noop,
      onDidDispose(handler) {
        disposeHandlers.push(handler);
        return disposable;
      },
      dispose() {
        disposeHandlers.forEach((handler) => handler());
        disposeHandlers.length = 0;
      },
    };
    recorder.createdPanels.push(panel);
    return panel;
  }

  module.exports = {
    Uri,
    get version() {
      return globalThis.__vscodeStubVersion ?? '1.107.0';
    },
    ViewColumn: { One: 1, Two: 2, Beside: -2 },
    // Mirror vscode.l10n.t without a bundle: the source string is the
    // English text, with {name} placeholders substituted from the args
    // record (tests assert on the interpolated result).
    l10n: {
      t(message, args) {
        if (!args || typeof args !== 'object') {
          return message;
        }
        return message.replace(/\{(\w+)\}/g, (_, key) => String(args[key]));
      },
    },
    window: {
      createWebviewPanel: createMockWebviewPanel,
      showErrorMessage: noop,
      showWarningMessage: (message) => {
        recorder.warnings.push(message);
        return Promise.resolve(undefined);
      },
      showInformationMessage: noop,
      showQuickPick: async () => undefined,
      showInputBox: async () => undefined,
      showTextDocument: async (doc, options) => {
        recorder.shownDocuments.push({ doc, options });
        const editor = {
          document: doc,
          selection: undefined,
          selections: [{ active: { line: 0 } }],
          visibleRanges: [],
          revealRange: noop,
        };
        if (globalThis.__vscodeStubShowTextDocument) {
          return globalThis.__vscodeStubShowTextDocument(doc, editor);
        }
        return editor;
      },
      createOutputChannel: () => ({ appendLine: noop, show: noop, dispose: noop }),
      createStatusBarItem: () => ({ show: noop, hide: noop, dispose: noop, text: '' }),
      registerWebviewPanelSerializer: () => disposable,
      registerWebviewViewProvider: (viewId, provider, options) => {
        recorder.webviewViewProviders.set(viewId, { provider, options });
        return disposable;
      },
      registerCustomEditorProvider: () => disposable,
      withProgress: async (_options, task) => task({ report: noop }, { isCancellationRequested: false }),
      onDidChangeActiveTextEditor: (handler) => {
        recorder.activeEditorHandlers.push(handler);
        return disposable;
      },
      onDidChangeTextEditorSelection: event,
      onDidChangeTextEditorVisibleRanges: event,
      onDidChangeTextEditorViewColumn: event,
      onDidChangeVisibleTextEditors: event,
      onDidChangeActiveColorTheme: event,
      onDidChangeWindowState: event,
      get visibleTextEditors() {
        return globalThis.__vscodeStubVisibleTextEditors ?? [];
      },
      get activeTextEditor() {
        return globalThis.__vscodeStubActiveTextEditor;
      },
      set activeTextEditor(editor) {
        globalThis.__vscodeStubActiveTextEditor = editor;
      },
      activeColorTheme: { kind: 1 },
      tabGroups: {
        get all() {
          return globalThis.__vscodeStubTabGroups ?? [];
        },
        onDidChangeTabs: (handler) => {
          recorder.tabChangeHandlers.push(handler);
          return disposable;
        },
        close: async () => true,
      },
    },
    workspace: {
      get workspaceFolders() {
        return globalThis.__vscodeStubWorkspaceFolders ?? [];
      },
      get isTrusted() {
        return globalThis.__vscodeStubIsTrusted !== false;
      },
      textDocuments: [],
      getConfiguration: () => ({
        get: (section) => (globalThis.__vscodeStubConfiguration ?? {})[section],
        inspect: (section) => ({
          key: section,
          globalValue: (globalThis.__vscodeStubConfigurationScopes?.global ?? {})[section],
          workspaceValue: (globalThis.__vscodeStubConfigurationScopes?.workspace ?? {})[section],
        }),
        update: async () => {},
      }),
      getWorkspaceFolder: (uri) => globalThis.__vscodeStubWorkspaceFolder(uri),
      asRelativePath: (uri) => globalThis.__vscodeStubRelativePath(uri),
      openTextDocument: async (uri) => {
        if (globalThis.__vscodeStubOpenTextDocument) {
          return globalThis.__vscodeStubOpenTextDocument(uri);
        }
        return { getText: () => '', uri: uri || Uri.file('/ws/a.md') };
      },
      applyEdit: async () => true,
      registerTextDocumentContentProvider: () => disposable,
      createFileSystemWatcher: () => ({ onDidCreate: event, onDidChange: event, onDidDelete: event, dispose: noop }),
      findFiles: async () => [],
      fs: {
        readFile: async (uri) =>
          globalThis.__vscodeStubFsReadFile
            ? globalThis.__vscodeStubFsReadFile(uri)
            : new Uint8Array(),
        writeFile: async () => {},
        stat: async (uri) =>
          globalThis.__vscodeStubFsStat
            ? globalThis.__vscodeStubFsStat(uri)
            : ({}),
      },
      onDidChangeConfiguration: (handler) => {
        recorder.configurationChangeHandlers.push(handler);
        return disposable;
      },
      onDidSaveTextDocument: event,
      onDidChangeTextDocument: event,
      onDidCloseTextDocument: (handler) => {
        recorder.closeDocumentHandlers.push(handler);
        return disposable;
      },
      onDidOpenTextDocument: event,
      onDidChangeWorkspaceFolders: event,
      onDidCreateFiles: event,
      onDidDeleteFiles: event,
      onDidRenameFiles: event,
    },
    commands: {
      executeCommand: async (id, ...args) => {
        recorder.executedCommands.push({ id, args });
        if (globalThis.__vscodeStubExecuteCommand) {
          return globalThis.__vscodeStubExecuteCommand(id, ...args);
        }
      },
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
    Selection: class {
      constructor(anchorOrLine, activeOrChar, activeLine, activeCharacter) {
        if (typeof anchorOrLine === 'number') {
          this.anchor = { line: anchorOrLine, character: activeOrChar };
          this.active = { line: activeLine, character: activeCharacter };
        } else {
          this.anchor = anchorOrLine;
          this.active = activeOrChar;
        }
      }
    },
    DocumentLink: class { constructor(range, target) { this.range = range; this.target = target; } },
    Hover: class { constructor(contents, range) { this.contents = contents; this.range = range; } },
    MarkdownString: class {
      constructor(value = '') { this.value = value; }
      appendMarkdown(text) { this.value += text; return this; }
    },
    TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
    EventEmitter: class { constructor() { this.event = event; } fire() {} dispose() {} },
    Disposable: class { static from() { return disposable; } dispose() {} },
    WorkspaceEdit: class { insert() {} replace() {} delete() {} },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    ColorThemeKind: { Light: 1, Dark: 2 },
    ProgressLocation: { Notification: 15 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    TabInputCustom: class { constructor(uri, viewType) { this.uri = uri; this.viewType = viewType; } },
    TabInputText: class { constructor(uri) { this.uri = uri; } },
    TabInputTextDiff: class { constructor(original, modified) { this.original = original; this.modified = modified; } },
  };
`;

const CROSSNOTE_STUB_SOURCE = `
  module.exports = {
    Notebook: {
      init: async ({ notebookPath, fs }) => ({
        notebookPath,
        notes: {},
        config: {},
        fs: { ...fs, exists: async () => false },
        updateConfig: () => {},
        refreshNotesIfNotLoaded: async () => {
          globalThis.__vscodeStubNotebookRefreshes.push('ifNotLoaded');
          return {};
        },
        refreshNotesIncremental: async () => {
          globalThis.__vscodeStubNotebookRefreshes.push('incremental');
          return {};
        },
        getNoteBacklinks: async () => [],
        getNotesReferringToTag: async () => ({}),
        getAllTags: async () => [],
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
    matter: (text) => {
      if (globalThis.__crossnoteStubMatter) {
        return globalThis.__crossnoteStubMatter(text);
      }
      return { content: text };
    },
    findFragmentTargetLine: (text, fragment) => {
      if (globalThis.__crossnoteStubFindFragmentTargetLine) {
        return globalThis.__crossnoteStubFindFragmentTargetLine(text, fragment);
      }
      return -1;
    },
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
globalThis.__vscodeStubWorkspaceFolders = [];
globalThis.__vscodeStubRelativePath = (uri) => String(uri);
globalThis.__vscodeStubNotebookRefreshes = [];
globalThis.__vscodeStubConfiguration = {};
globalThis.__vscodeStubConfigurationScopes = { global: {}, workspace: {} };
globalThis.__vscodeStubIsTrusted = true;
globalThis.__vscodeStubActiveTextEditor = undefined;
globalThis.__vscodeStubVisibleTextEditors = [];
globalThis.__vscodeStubTabGroups = [];
globalThis.__vscodeStubOpenTextDocument = undefined;
globalThis.__vscodeStubExecuteCommand = undefined;
globalThis.__vscodeStubFsReadFile = undefined;
globalThis.__vscodeStubFsStat = undefined;
globalThis.__vscodeStubVersion = '1.107.0';
globalThis.__crossnoteStubEngine = () => ({
  generateHTMLTemplateForPreview: async () => '<html></html>',
});

module.exports = {
  recorder,
  stubPlugin,
  setWorkspaceFolderResolver(fn) {
    globalThis.__vscodeStubWorkspaceFolder = fn;
  },
  setWorkspaceFolders(folders) {
    globalThis.__vscodeStubWorkspaceFolders = folders;
  },
  setRelativePathResolver(fn) {
    globalThis.__vscodeStubRelativePath = fn;
  },
  setMarkdownEngine(fn) {
    globalThis.__crossnoteStubEngine = fn;
  },
  setConfiguration(config) {
    globalThis.__vscodeStubConfiguration = config;
  },
  /**
   * Settings as VS Code would report them per scope. The merged view `get()`
   * returns follows, workspace over user, so a test cannot set the two out of
   * step with each other.
   */
  setConfigurationScopes({ global = {}, workspace = {} } = {}) {
    globalThis.__vscodeStubConfigurationScopes = { global, workspace };
    globalThis.__vscodeStubConfiguration = { ...global, ...workspace };
  },
  setWorkspaceTrusted(trusted) {
    globalThis.__vscodeStubIsTrusted = trusted;
  },
  setActiveTextEditor(editor) {
    globalThis.__vscodeStubActiveTextEditor = editor;
  },
  setVisibleTextEditors(editors) {
    globalThis.__vscodeStubVisibleTextEditors = editors;
  },
  setTabGroups(groups) {
    globalThis.__vscodeStubTabGroups = groups;
  },
  setOpenTextDocumentResolver(fn) {
    globalThis.__vscodeStubOpenTextDocument = fn;
  },
  setFileReader(fn) {
    globalThis.__vscodeStubFsReadFile = fn;
  },
  setExecuteCommandHandler(fn) {
    globalThis.__vscodeStubExecuteCommand = fn;
  },
};
