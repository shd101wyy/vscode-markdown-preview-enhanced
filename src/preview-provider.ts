import { Mutex } from 'async-mutex';
import { ImageUploader, Notebook, PreviewMode, utility } from 'crossnote';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { getMPEConfig } from './config';
import NotebooksManager from './notebooks-manager';
import {
  getCrossnoteVersion,
  getPreviewMode,
  getWorkspaceFolderUri,
  globalConfigPath,
  isMarkdownFile,
  isVSCodeWebExtension,
  isVSCodewebExtensionDevMode,
} from './utils';

if (isVSCodeWebExtension()) {
  console.debug('* Using crossnote version: ', getCrossnoteVersion());
  if (isVSCodewebExtensionDevMode()) {
    console.debug('* Now under the dev mode');
    console.debug('* Loading /crossnote directory at http://localhost:6789/');
    utility.setCrossnoteBuildDirectory('http://localhost:6789/');
  } else {
    const jsdelivrCdnHost =
      getMPEConfig<string>('jsdelivrCdnHost') ?? 'cdn.jsdelivr.net';
    utility.setCrossnoteBuildDirectory(
      `https://${jsdelivrCdnHost}/npm/crossnote@${getCrossnoteVersion()}/out/`,
    );
  }
} else {
  // NOTE: The __dirname is actually the out/native folder
  utility.setCrossnoteBuildDirectory(
    path.resolve(__dirname, '../../crossnote/'),
  );
}

utility.useExternalAddFileProtocolFunction((filePath, preview) => {
  if (preview) {
    // path.join('https://host/', './rel') → 'https:/host/rel' (single slash)
    // path.resolve('https://host/', './rel') → '/cwd/https:/host/rel' (abs path with embedded URL)
    // Both are detected by finding 'http(s):/' followed by a non-slash character anywhere in the path.
    const urlMatch = filePath.match(/(https?):\/([^/].*)/);
    if (urlMatch) {
      return `${urlMatch[1]}://${urlMatch[2]}`;
    }
    return preview.webview
      .asWebviewUri(vscode.Uri.file(filePath))
      .toString(true)
      .replace(/%3F/gi, '?')
      .replace(/%23/g, '#');
  } else {
    if (!filePath.startsWith('file://')) {
      filePath = 'file:///' + filePath;
    }
    filePath = filePath.replace(/^file:\/+/, 'file:///');
    return filePath;
  }
});

/**
 * key is workspaceUri.toString()
 * value is the `PreviewProvider`
 */
const WORKSPACE_PREVIEW_PROVIDER_MAP: Map<string, PreviewProvider> = new Map();

/**
 * key is workspaceUri.toString()
 * value is the `Mutex`
 */
const WORKSPACE_MUTEX_MAP: Map<string, Mutex> = new Map();

export function getAllPreviewProviders(): PreviewProvider[] {
  return Array.from(WORKSPACE_PREVIEW_PROVIDER_MAP.values());
}

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
/**
 * One workspace folder has one PreviewProvider
 */
export class PreviewProvider {
  private updateTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Sequence counter for initPreview requests.
   * Each call to initPreview increments this and tags the panel with the latest ID.
   * When the HTML generation finishes, we discard the result if a newer request has
   * already taken over (e.g. user switched files before rendering completed).
   */
  private initRequestSeq = 0;
  private latestInitRequestByPreview: WeakMap<vscode.WebviewPanel, number> =
    new WeakMap();

  /**
   * Sequence counter for updateMarkdown render requests (per sourceUri).
   * Prevents a slow parseMD from overwriting content that a newer request
   * already pushed to the webview.
   */
  private renderRequestSeq = 0;
  private latestRenderRequestBySourceUri: Map<string, number> = new Map();

  /**
   * Each PreviewProvider has a one notebook.
   */
  private notebook!: Notebook;

  /**
   * VSCode extension context
   */
  private context!: vscode.ExtensionContext;

  /**
   * The key is sourceUri.toString()
   * value is Preview (vscode.Webview) object
   */
  private previewMaps: Map<string, Set<vscode.WebviewPanel>> = new Map();
  private previewToDocumentMap: Map<vscode.WebviewPanel, vscode.TextDocument> =
    new Map();
  private initializedPreviews: Set<vscode.WebviewPanel> = new Set();

  private static singlePreviewPanel: vscode.WebviewPanel | null;
  private static singlePreviewPanelSourceUriTarget: Uri | null;
  public static notebooksManager: NotebooksManager | null = null;

  /**
   * The key is markdown file fsPath
   * value is JSAndCssFiles
   */
  private jsAndCssFilesMaps: { [key: string]: string[] } = {};

  public constructor() {
    // Please use `init` method to initialize this class.
  }

  /**
   * Returns true if sourceUri is the current target for the single preview panel,
   * or if we are NOT in single-preview mode (multiple-previews always allowed).
   */
  private isSinglePreviewTarget(sourceUri: Uri): boolean {
    if (getPreviewMode() !== PreviewMode.SinglePreview) {
      return true;
    }
    const target = PreviewProvider.singlePreviewPanelSourceUriTarget;
    return !!target && target.fsPath === sourceUri.fsPath;
  }

  /**
   * Check whether updateMarkdown should proceed for the given sourceUri.
   * Returns false when in single-preview mode and sourceUri is no longer the target.
   */
  public shouldUpdateMarkdown(sourceUri: Uri): boolean {
    if (!this.isSinglePreviewTarget(sourceUri)) {
      return false;
    }
    const previews = this.getPreviews(sourceUri);
    return !!(previews && previews.length > 0);
  }

  private normalizeResourceList(resources: string[] | undefined): string[] {
    if (!resources?.length) {
      return [];
    }
    return Array.from(new Set(resources)).sort();
  }

  private async init(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ) {
    this.context = context;
    this.notebook =
      await this.getNotebooksManager().getNotebook(workspaceFolderUri);
    return this;
  }

  private getNotebooksManager() {
    if (!PreviewProvider.notebooksManager) {
      PreviewProvider.notebooksManager = new NotebooksManager(this.context);
    }
    return PreviewProvider.notebooksManager;
  }

  public static async getPreviewContentProvider(
    uri: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    const workspaceUri = getWorkspaceFolderUri(uri);

    // Acquire mutex
    let mutex: Mutex;
    const mutexKey = workspaceUri.toString();
    if (WORKSPACE_MUTEX_MAP.has(mutexKey)) {
      const mutex_ = WORKSPACE_MUTEX_MAP.get(mutexKey);
      if (!mutex_) {
        throw new Error('Cannot find mutex');
      }
      mutex = mutex_;
    } else {
      mutex = new Mutex();
      WORKSPACE_MUTEX_MAP.set(mutexKey, mutex);
    }

    const release = await mutex.acquire();
    try {
      if (WORKSPACE_PREVIEW_PROVIDER_MAP.has(mutexKey)) {
        const provider = WORKSPACE_PREVIEW_PROVIDER_MAP.get(mutexKey);
        if (!provider) {
          throw new Error('Cannot find preview provider');
        }
        release();
        return provider;
      } else {
        const provider = new PreviewProvider();
        await provider.init(context, workspaceUri);
        WORKSPACE_PREVIEW_PROVIDER_MAP.set(mutexKey, provider);
        release();
        return provider;
      }
    } catch (error) {
      release();
      throw error;
    }
  }

  public refreshAllPreviews() {
    // clear caches
    this.notebook.clearAllNoteMarkdownEngineCaches();

    // refresh iframes
    if (getPreviewMode() === PreviewMode.SinglePreview) {
      this.refreshPreviewPanel(
        PreviewProvider.singlePreviewPanelSourceUriTarget,
      );
    } else {
      for (const [sourceUriString] of this.previewMaps) {
        this.refreshPreviewPanel(vscode.Uri.parse(sourceUriString));
      }
    }
  }

  private addPreviewToMap(sourceUri: Uri, previewPanel: vscode.WebviewPanel) {
    let previews = this.previewMaps.get(sourceUri.toString());
    if (!previews) {
      previews = new Set();
      this.previewMaps.set(sourceUri.toString(), previews);
    }
    previews.add(previewPanel);
  }

  private deletePreviewFromMap(
    sourceUri: Uri,
    previewPanel: vscode.WebviewPanel,
  ) {
    this.previewMaps.get(sourceUri.toString())?.delete(previewPanel);
  }

  /**
   * return markdown previews of sourceUri
   * @param sourceUri
   */
  public getPreviews(sourceUri: Uri): vscode.WebviewPanel[] | null | undefined {
    if (
      getPreviewMode() === PreviewMode.SinglePreview &&
      PreviewProvider.singlePreviewPanel
    ) {
      return [PreviewProvider.singlePreviewPanel];
    } else {
      const previews = this.previewMaps.get(sourceUri.toString());
      if (previews) {
        return Array.from(previews);
      } else {
        return null;
      }
    }
  }

  /**
   * check if the markdown preview is on for the textEditor
   * @param textEditor
   */
  public isPreviewOn(sourceUri: Uri) {
    if (getPreviewMode() === PreviewMode.SinglePreview) {
      return !!PreviewProvider.singlePreviewPanel;
    } else {
      const previews = this.getPreviews(sourceUri);
      return previews && previews.length > 0;
    }
  }

  public destroyPreview(sourceUri: Uri) {
    const previewMode = getPreviewMode();
    if (previewMode === PreviewMode.SinglePreview) {
      PreviewProvider.singlePreviewPanel = null;
      PreviewProvider.singlePreviewPanelSourceUriTarget = null;
      this.previewToDocumentMap = new Map();
      this.previewMaps = new Map();
      this.latestRenderRequestBySourceUri.clear();
    } else {
      const previews = this.getPreviews(sourceUri);
      if (previews) {
        previews.forEach((preview) => {
          this.previewToDocumentMap.delete(preview);
          this.deletePreviewFromMap(sourceUri, preview);
        });
      }
      this.latestRenderRequestBySourceUri.delete(sourceUri.toString());
    }
  }

  /**
   * TODO: Free memory
   */
  public destroyEngine(_sourceUri: vscode.Uri) {}

  private getEngine(sourceUri: Uri) {
    return this.notebook.getNoteMarkdownEngine(sourceUri.fsPath);
  }

  public async initPreview({
    sourceUri,
    document,
    webviewPanel,
    cursorLine,
    viewOptions,
  }: {
    sourceUri: vscode.Uri;
    document: vscode.TextDocument;
    webviewPanel?: vscode.WebviewPanel;
    cursorLine?: number;
    viewOptions: { viewColumn: vscode.ViewColumn; preserveFocus?: boolean };
  }): Promise<void> {
    const previewMode = getPreviewMode();
    let previewPanel: vscode.WebviewPanel;
    const previews = this.getPreviews(sourceUri);
    if (
      previewMode === PreviewMode.SinglePreview &&
      PreviewProvider.singlePreviewPanel
    ) {
      const oldResourceRoot = PreviewProvider.singlePreviewPanelSourceUriTarget
        ? getWorkspaceFolderUri(
            PreviewProvider.singlePreviewPanelSourceUriTarget,
          )
        : undefined;
      const newResourceRoot = getWorkspaceFolderUri(sourceUri);
      if (oldResourceRoot?.fsPath !== newResourceRoot.fsPath) {
        const singlePreview = PreviewProvider.singlePreviewPanel;
        PreviewProvider.singlePreviewPanel = null;
        PreviewProvider.singlePreviewPanelSourceUriTarget = null;
        singlePreview.dispose();
        return await this.initPreview({
          sourceUri,
          document,
          viewOptions,
          cursorLine,
        });
      } else {
        previewPanel = PreviewProvider.singlePreviewPanel;
        PreviewProvider.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    } else if (previews && previews.length > 0 && !webviewPanel) {
      await Promise.all(
        previews.map((preview) =>
          this.initPreview({
            sourceUri,
            document,
            webviewPanel: preview,
            viewOptions,
            cursorLine,
          }),
        ),
      );
      return;
    } else {
      const buildDir = utility.getCrossnoteBuildDirectory();
      const localResourceRoots = [
        vscode.Uri.file(this.context.extensionPath),
        // Skip CDN/HTTP URLs — only add file-system paths to localResourceRoots
        ...(buildDir.startsWith('http') ? [] : [vscode.Uri.file(buildDir)]),
        vscode.Uri.file(globalConfigPath),
        vscode.Uri.file(tmpdir()),
      ];
      const workspaceUri = getWorkspaceFolderUri(sourceUri);
      if (workspaceUri) {
        localResourceRoots.push(workspaceUri);
      }

      if (webviewPanel) {
        previewPanel = webviewPanel;
        previewPanel.webview.options = {
          enableScripts: true,
          localResourceRoots,
        };
        // @ts-expect-error retainContextWhenHidden is not in type definitions
        previewPanel.options.retainContextWhenHidden = true;
      } else {
        previewPanel = vscode.window.createWebviewPanel(
          'markdown-preview-enhanced',
          `Preview ${path.basename(sourceUri.fsPath)}`,
          viewOptions,
          {
            enableFindWidget: true,
            localResourceRoots,
            enableScripts: true, // TODO: This might be set by enableScriptExecution config. But for now we just enable it.
            retainContextWhenHidden: true,
          },
        );
      }

      // set icon
      // NOTE: This doesn't work for custom editor.
      previewPanel.iconPath = vscode.Uri.joinPath(
        this.context.extensionUri,
        'media',
        'preview.svg',
      );

      // NOTE: We only register for the webview event listeners once.
      if (!this.initializedPreviews.has(previewPanel)) {
        this.initializedPreviews.add(previewPanel);

        // register previewPanel message events.
        previewPanel.webview.onDidReceiveMessage(
          (message) => {
            // Relay zoom commands back to
            // the webview so crossnote's React handler stays in sync.
            // Part of the Ctrl+wheel zoom customization.
            if (
              message.command === 'zommIn' ||
              message.command === 'zoomOut' ||
              message.command === 'resetZoom'
            ) {
              previewPanel.webview.postMessage(message);
              return;
            }

            // console.log('@ receiveMessage: ', message, previewPanel);
            vscode.commands.executeCommand(
              `_crossnote.${message.command}`,
              ...message.args,
            );
          },
          null,
          this.context.subscriptions,
        );

        // unregister previewPanel.
        previewPanel.onDidDispose(
          () => {
            this.destroyPreview(sourceUri);
            this.destroyEngine(sourceUri);
            this.initializedPreviews.delete(previewPanel);
          },
          null,
          this.context.subscriptions,
        );
      }

      if (previewMode === PreviewMode.SinglePreview) {
        PreviewProvider.singlePreviewPanel = previewPanel;
        PreviewProvider.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    }

    // register previewPanel
    this.addPreviewToMap(sourceUri, previewPanel);
    this.previewToDocumentMap.set(previewPanel, document);

    // set title
    previewPanel.title = `Preview ${path.basename(sourceUri.fsPath)}`;

    // init markdown engine.
    let initialLine: number | undefined;
    if (document.uri.fsPath === sourceUri.fsPath) {
      initialLine = cursorLine;
    }

    const inputString = document.getText() ?? '';
    const engine = this.getEngine(sourceUri);
    try {
      // Tag this request so we can detect if a newer initPreview overtook us
      // before the (potentially slow) HTML generation finishes.
      const initRequestId = ++this.initRequestSeq;
      this.latestInitRequestByPreview.set(previewPanel, initRequestId);

      const html = await engine.generateHTMLTemplateForPreview({
        inputString,
        config: {
          sourceUri: sourceUri.toString(),
          cursorLine: initialLine,
          isVSCode: true,
          scrollSync: getMPEConfig<boolean>('scrollSync'),
          imageUploader: getMPEConfig<ImageUploader>('imageUploader'),
        },
        contentSecurityPolicy: '',
        vscodePreviewPanel: previewPanel,
        isVSCodeWebExtension: isVSCodeWebExtension(),
        // In the web extension, this.filePath is just the path component of a
        // virtual URI (e.g. '/LICENSE.md'), so the default <base> tag would be
        // malformed. The React webview already appends the correct <base> tag at
        // runtime using the full sourceUri, so we can safely omit it here.
        // For the native extension the default base tag is harmless, but we keep
        // consistent behaviour and let React own it in both cases.
        head: '',
      });

      // If a newer initPreview call has taken over this panel, or the panel was
      // disposed, or (in single-preview mode) this URI is no longer the target,
      // discard this stale result.
      if (
        this.latestInitRequestByPreview.get(previewPanel) !== initRequestId ||
        !this.initializedPreviews.has(previewPanel) ||
        !this.isSinglePreviewTarget(sourceUri)
      ) {
        return;
      }

      // ──────────────────────────────────────────────────────────────
      // VS Code-style context menu customization:
      // Reskins the react-contexify right-click menu to look and feel
      // like a native VS Code menu:
      //  - Compact sizing (smaller min-width, tighter padding/margins)
      //  - VS Code theme colors (background, foreground, selection,
      //    separator, border) via --vscode-menu-* CSS variables
      //  - VS Code UI font family and size
      // Works by overriding contexify CSS custom properties on :root
      // via inline styles, which beat the <style> tags that
      // react-contexify injects at runtime.
      // ──────────────────────────────────────────────────────────────
      const compactMenuScript = `<script>
(function() {
  var root = document.documentElement;
  root.style.setProperty('--contexify-menu-minWidth', '160px');
  root.style.setProperty('--contexify-itemContent-padding', '4px 8px');
  root.style.setProperty('--contexify-separator-margin', '3px');

  // Theme: map VS Code menu colors to contexify variables so the
  // context menu always matches the VS Code theme, not the preview theme.
  root.style.setProperty('--contexify-menu-bgColor', 'var(--vscode-menu-background)');
  root.style.setProperty('--contexify-separator-color', 'var(--vscode-menu-separatorBackground)');
  root.style.setProperty('--contexify-item-color', 'var(--vscode-menu-foreground)');
  root.style.setProperty('--contexify-activeItem-color', 'var(--vscode-menu-selectionForeground)');
  root.style.setProperty('--contexify-activeItem-bgColor', 'var(--vscode-menu-selectionBackground)');
  root.style.setProperty('--contexify-rightSlot-color', 'var(--vscode-menu-foreground)');
  root.style.setProperty('--contexify-arrow-color', 'var(--vscode-menu-foreground)');

  // Font: match VS Code's UI font size and family.
  var style = document.createElement('style');
  style.textContent = '.contexify { font-size: var(--vscode-font-size); font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif; border: 1px solid var(--vscode-menu-border, transparent); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.16); }';
  document.head.appendChild(style);
})();
</script>`;

      // ──────────────────────────────────────────────────────────────
      // Ctrl+wheel zoom customization:
      // Adds Ctrl+mouse-wheel zoom to the preview webview using the
      // CSS `zoom` property (doesn't break position:fixed or cause
      // scrollbars). Fixed UI elements (.fixed) and context menus
      // (.contexify, top-level only) get a counter-zoom so they stay
      // at their original size; nested submenus are skipped to avoid
      // double counter-zooming. A MutationObserver reapplies the
      // counter-zoom when new elements are added to the DOM.
      // NOTE: crossnote checks for "zommIn" (typo in upstream).
      // ──────────────────────────────────────────────────────────────
      const wheelZoomScript = `<script>
(function() {
  var _origAcquire = window.acquireVsCodeApi;
  var _cachedApi;
  if (_origAcquire) {
    window.acquireVsCodeApi = function() {
      if (!_cachedApi) _cachedApi = _origAcquire();
      return _cachedApi;
    };
  }

  var zoomLevel = 1;

  function applyCounterZoom() {
    var counterZoom = 1 / zoomLevel;
    var els = document.querySelectorAll('.fixed, .contexify');
    for (var i = 0; i < els.length; i++) {
      // Skip nested .contexify (submenus inside a parent menu) —
      // they inherit the parent's counter-zoom automatically.
      if (els[i].classList.contains('contexify') &&
          els[i].parentElement &&
          els[i].parentElement.closest('.contexify')) {
        els[i].style.zoom = '';
        continue;
      }
      els[i].style.zoom = counterZoom;
    }
  }

  new MutationObserver(function() {
    if (zoomLevel !== 1) applyCounterZoom();
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        zoomLevel = Math.min(zoomLevel * 1.1, 5);
      } else {
        zoomLevel = Math.max(zoomLevel / 1.1, 0.2);
      }
      document.body.style.zoom = zoomLevel;
      applyCounterZoom();
      try {
        var api = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null;
        if (api) {
          var cmd = e.deltaY < 0 ? 'zommIn' : 'zoomOut';
          api.postMessage({ command: cmd, args: [] });
        }
      } catch (_) {}
    }
  }, { passive: false, capture: true });
})();
</script>`;

      // Inject customizations into the webview HTML.
      previewPanel.webview.html = html.replace(
        '</body>',
        compactMenuScript + wheelZoomScript + '</body>',
      );
    } catch (error) {
      vscode.window.showErrorMessage(String(error));
      console.error(error);
    }
  }

  /**
   * Close all previews.
   */
  public closeAllPreviews(previewMode: PreviewMode) {
    if (previewMode === PreviewMode.SinglePreview) {
      if (PreviewProvider.singlePreviewPanel) {
        PreviewProvider.singlePreviewPanel.dispose();
      }
    } else {
      for (const [sourceUriString] of this.previewMaps) {
        const previews = this.previewMaps.get(sourceUriString);
        if (previews) {
          previews.forEach((preview) => preview.dispose());
        }
      }
    }

    this.previewMaps = new Map();
    this.previewToDocumentMap = new Map();
    // Clear all pending update timeouts
    this.updateTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.updateTimeouts.clear();
    this.latestRenderRequestBySourceUri.clear();
    // this.engineMaps = {};
    PreviewProvider.singlePreviewPanel = null;
    PreviewProvider.singlePreviewPanelSourceUriTarget = null;
  }

  public async postMessageToPreview(
    sourceUri: Uri,
    message: { command: string; [key: string]: any }, // TODO: Define a type for message.
  ) {
    const previews = this.getPreviews(sourceUri);
    if (previews) {
      for (let i = 0; i < previews.length; i++) {
        const preview = previews[i];
        try {
          const result = await preview.webview.postMessage(message);
          if (!result) {
            console.error(
              `Failed to send message "${message.command}" to preview panel for ${sourceUri.fsPath}`,
            );
          }
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  public previewHasTheSameSingleSourceUri(sourceUri: Uri) {
    if (!PreviewProvider.singlePreviewPanelSourceUriTarget) {
      return false;
    } else {
      return (
        PreviewProvider.singlePreviewPanelSourceUriTarget.fsPath ===
        sourceUri.fsPath
      );
    }
  }

  public updateMarkdown(sourceUri: Uri, triggeredBySave?: boolean) {
    // Don't update if single-preview is pointing at a different file
    if (!this.isSinglePreviewTarget(sourceUri)) {
      return;
    }

    const engine = this.getEngine(sourceUri);
    const previews = this.getPreviews(sourceUri);
    // console.log('updateMarkdown: ', previews?.length);
    if (!previews || !previews.length) {
      return;
    }

    // presentation mode
    if (engine.isPreviewInPresentationMode) {
      return this.refreshPreview(sourceUri);
    }

    // not presentation mode — run async but guard against stale renders
    (async () => {
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(sourceUri);
      } catch (error) {
        console.error(error);
        return;
      }

      // Check again after the await in case the user switched files
      if (!this.isSinglePreviewTarget(sourceUri)) {
        return;
      }

      // Stamp this render so we can discard overtaken results
      const renderRequestId = ++this.renderRequestSeq;
      this.latestRenderRequestBySourceUri.set(
        sourceUri.toString(),
        renderRequestId,
      );

      const text = document.getText();
      await this.postMessageToPreview(sourceUri, {
        command: 'startParsingMarkdown',
      });

      const currentPreviews = this.getPreviews(sourceUri);
      if (!currentPreviews || !currentPreviews.length) {
        return;
      }

      let lastError: unknown = undefined;
      for (let i = 0; i < currentPreviews.length; i++) {
        try {
          const preview = currentPreviews[i];
          const {
            html,
            tocHTML,
            JSAndCssFiles: jsAndCssFiles,
            yamlConfig,
          } = await engine.parseMD(text, {
            isForPreview: true,
            useRelativeFilePath: false,
            hideFrontMatter: false,
            triggeredBySave,
            vscodePreviewPanel: preview,
          });

          // Discard if a newer render has taken over for this sourceUri or the
          // single-preview target changed while parseMD was running
          if (!this.isSinglePreviewTarget(sourceUri)) {
            return;
          }
          if (
            this.latestRenderRequestBySourceUri.get(sourceUri.toString()) !==
            renderRequestId
          ) {
            return;
          }

          // check jsAndCssFiles
          const normalizedResources = this.normalizeResourceList(jsAndCssFiles);
          const previousResources = this.normalizeResourceList(
            this.jsAndCssFilesMaps[sourceUri.fsPath],
          );
          if (
            JSON.stringify(normalizedResources) !==
              JSON.stringify(previousResources) ||
            yamlConfig['isPresentationMode']
          ) {
            this.jsAndCssFilesMaps[sourceUri.fsPath] = normalizedResources;
            // restart iframe
            this.refreshPreview(sourceUri);
          } else {
            await this.postMessageToPreview(sourceUri, {
              command: 'updateHtml',
              markdown: text,
              html,
              tocHTML,
              totalLineCount: document.lineCount,
              sourceUri: sourceUri.toString(),
              sourceScheme: sourceUri.scheme,
              id: yamlConfig.id || '',
              class:
                (yamlConfig.class || '') +
                ` ${
                  this.getNotebooksManager().systemColorScheme === 'dark'
                    ? 'system-dark'
                    : 'system-ligtht'
                } ${
                  this.getNotebooksManager().getEditorColorScheme() === 'dark'
                    ? 'editor-dark'
                    : 'editor-light'
                } ${isVSCodeWebExtension() ? 'vscode-web-extension' : ''}`,
            });
          }
          return;
        } catch (error) {
          lastError = error;
          continue;
        }
      }

      if (lastError) {
        vscode.window.showErrorMessage(String(lastError));
        console.error(lastError);
      }
    })();
  }

  private refreshPreviewPanel(sourceUri: Uri | null) {
    if (!sourceUri) {
      return;
    }

    this.previewToDocumentMap.forEach(async (document, previewPanel) => {
      if (
        previewPanel &&
        isMarkdownFile(document) &&
        document.uri &&
        document.uri.fsPath === sourceUri.fsPath
      ) {
        await this.initPreview({
          sourceUri,
          document,
          viewOptions: {
            viewColumn: previewPanel.viewColumn ?? vscode.ViewColumn.One,
            preserveFocus: true,
          },
        });
      }
    });
  }

  public refreshPreview(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.clearCaches();
      // restart iframe
      this.refreshPreviewPanel(sourceUri);
    }
  }

  public openInBrowser(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      if (isVSCodeWebExtension()) {
        vscode.window.showErrorMessage(`Not supported in MPE web extension.`);
      } else {
        engine.openInBrowser({}).catch((error) => {
          vscode.window.showErrorMessage(String(error));
        });
      }
    }
  }

  public htmlExport(sourceUri: Uri, offline: boolean) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .htmlExport({ offline })
        .then((dest) => {
          vscode.window.showInformationMessage(
            `File ${path.basename(dest)} was created at path: ${dest}`,
          );
        })
        .catch((error) => {
          vscode.window.showErrorMessage(String(error));
        });
    }
  }

  public chromeExport(sourceUri: Uri, type: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      if (isVSCodeWebExtension()) {
        vscode.window.showErrorMessage(`Not supported in MPE web extension.`);
      } else {
        engine
          .chromeExport({ fileType: type, openFileAfterGeneration: true })
          .then((dest) => {
            vscode.window.showInformationMessage(
              `File ${path.basename(dest)} was created at path: ${dest}`,
            );
          })
          .catch((error) => {
            vscode.window.showErrorMessage(String(error));
          });
      }
    }
  }

  public princeExport(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      if (isVSCodeWebExtension()) {
        vscode.window.showErrorMessage(`Not supported in MPE web extension.`);
      } else {
        engine
          .princeExport({ openFileAfterGeneration: true })
          .then((dest) => {
            if (dest.endsWith('?print-pdf')) {
              // presentation pdf
              vscode.window.showInformationMessage(
                `Please copy and open the link: { ${dest.replace(
                  /_/g,
                  '\\_',
                )} } in Chrome then Print as Pdf.`,
              );
            } else {
              vscode.window.showInformationMessage(
                `File ${path.basename(dest)} was created at path: ${dest}`,
              );
            }
          })
          .catch((error) => {
            vscode.window.showErrorMessage(String(error));
          });
      }
    }
  }

  public eBookExport(sourceUri: Uri, fileType: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      if (isVSCodeWebExtension()) {
        vscode.window.showErrorMessage(`Not supported in MPE web extension.`);
      } else {
        engine
          .eBookExport({ fileType, runAllCodeChunks: false })
          .then((dest) => {
            vscode.window.showInformationMessage(
              `eBook ${path.basename(dest)} was created as path: ${dest}`,
            );
          })
          .catch((error) => {
            vscode.window.showErrorMessage(String(error));
          });
      }
    }
  }

  public pandocExport(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      if (isVSCodeWebExtension()) {
        vscode.window.showErrorMessage(`Not supported in MPE web extension.`);
      } else {
        engine
          .pandocExport({ openFileAfterGeneration: true })
          .then((dest) => {
            vscode.window.showInformationMessage(
              `Document ${path.basename(dest)} was created as path: ${dest}`,
            );
          })
          .catch((error) => {
            vscode.window.showErrorMessage(String(error));
          });
      }
    }
  }

  public markdownExport(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .markdownExport({})
        .then((dest) => {
          vscode.window.showInformationMessage(
            `Document ${path.basename(dest)} was created as path: ${dest}`,
          );
        })
        .catch((error) => {
          vscode.window.showErrorMessage(String(error));
        });
    }
  }

  /*
  public cacheSVG(sourceUri: Uri, code:string, svg:string) {
    const engine = this.getEngine(sourceUri)
    if (engine) {
      engine.cacheSVG(code, svg)
    }
  }
  */

  public cacheCodeChunkResult(sourceUri: Uri, id: string, result: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.cacheCodeChunkResult(id, result);
    }
  }

  public runCodeChunk(sourceUri: Uri, codeChunkId: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.runCodeChunk(codeChunkId).then(() => {
        this.updateMarkdown(sourceUri);
      });
    }
  }

  public runAllCodeChunks(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.runCodeChunks().then(() => {
        this.updateMarkdown(sourceUri);
      });
    }
  }

  public update(sourceUri: Uri) {
    const previews = this.getPreviews(sourceUri);
    if (!getMPEConfig<boolean>('liveUpdate') || !previews || !previews.length) {
      return;
    }

    const sourceUriString = sourceUri.toString();
    const debounceMs = getMPEConfig<number>('liveUpdateDebounceMs') ?? 300;

    // Clear existing timeout for this sourceUri (proper debounce behavior)
    const existingTimeout = this.updateTimeouts.get(sourceUriString);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.updateTimeouts.delete(sourceUriString);
    }

    // If debounce is 0, update immediately without timeout
    if (debounceMs === 0) {
      this.updateMarkdown(sourceUri);
      return;
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.updateTimeouts.delete(sourceUriString);
      this.updateMarkdown(sourceUri);
    }, debounceMs);

    this.updateTimeouts.set(sourceUriString, timeout);
  }

  public async openImageHelper(sourceUri: Uri) {
    if (sourceUri.scheme === 'markdown-preview-enhanced') {
      return vscode.window.showWarningMessage('Please focus a markdown file.');
    } else if (!this.isPreviewOn(sourceUri)) {
      return vscode.window.showWarningMessage('Please open preview first.');
    } else {
      return await this.postMessageToPreview(sourceUri, {
        command: 'openImageHelper',
      });
    }
  }
}

export function getPreviewUri(uri: vscode.Uri) {
  if (uri.scheme === 'markdown-preview-enhanced') {
    return uri;
  }

  let previewUri: Uri;
  if (getPreviewMode() === PreviewMode.SinglePreview) {
    previewUri = uri.with({
      scheme: 'markdown-preview-enhanced',
      path: 'single-preview.rendered',
    });
  } else {
    previewUri = uri.with({
      scheme: 'markdown-preview-enhanced',
      path: uri.path + '.rendered',
      query: uri.toString(),
    });
  }
  return previewUri;
}
