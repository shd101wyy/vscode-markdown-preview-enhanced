import { Mutex } from 'async-mutex';
import { ImageUploader, Notebook, PreviewMode, utility } from 'crossnote';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { streamTranslateBlock, streamTranslateDocument } from './ai-translator';
import {
  computeTranslationCacheKey,
  getBlockTranslation,
  getCachedTranslation,
  setBlockTranslation,
  setCachedTranslation,
} from './ai-translation-cache';
import { getMPEConfig } from './config';
import { hashBlock, splitMarkdownBlocks } from './markdown-blocks';
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
 * Commands the webview is allowed to dispatch to the extension host.
 * Any command received from the webview that is not in this set is
 * silently dropped.  This prevents a compromised webview from invoking
 * arbitrary `_crossnote.*` commands with attacker-controlled arguments
 * (blind command dispatch, GHSA-83c6-hcjv-pvmg).
 */
const WEBVIEW_MESSAGE_COMMANDS: Set<string> = new Set([
  'cacheCodeChunkResult',
  'chromeExport',
  'clickTag',
  'clickTagA',
  'clickTaskListCheckbox',
  'eBookExport',
  'graphViewReady',
  'htmlExport',
  'insertImageUrl',
  'markdownExport',
  'openChangelog',
  'openDocumentation',
  'openExternalEditor',
  'openFile',
  'openGraphView',
  'openInBrowser',
  'openIssues',
  'openSponsors',
  'pandocExport',
  'pasteImageFile',
  'princeExport',
  'refreshPreview',
  'revealLine',
  'restoreOriginal',
  'runAllCodeChunks',
  'runCodeChunk',
  'saveSetting',
  'setCodeBlockTheme',
  'setImageUploader',
  'setPreviewTheme',
  'setRevealjsTheme',
  'setZoomLevel',
  'showBacklinks',
  'toggleAlwaysShowBacklinksInPreview',
  'togglePreviewZenMode',
  'translateDocument',
  'updateMarkdown',
  'uploadImageFile',
  'webviewFinishLoading',
]);

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
   * Per-sourceUri AbortController for in-flight AI translations. Used to
   * cancel a translation when the source changes or the user requests a new one.
   */
  private readonly abortControllers: Map<string, AbortController> = new Map();

  /**
   * Per-sourceUri promise chain that serializes streaming preview refreshes
   * during incremental translation. Without this, concurrent block-completion
   * callbacks each grab a new renderRequestId, so a later-started refresh can
   * mark an earlier (content-richer) refresh stale and drop it, losing blocks
   * and producing out-of-order renders. The chain runs refreshes one at a
   * time, in completion order, each using the latest partial state.
   */
  private readonly refreshChains: Map<string, Promise<void>> = new Map();

  /**
   * Per-sourceUri debounce timers for auto-translate while in translation
   * mode. When `aiTranslationAutoUpdate` is on and the preview is showing a
   * translation, `update()` arms a 3s timer here instead of refreshing the
   * preview from the original text — after the user stops typing, it calls
   * `translateDocument`, which incrementally re-translates only changed
   * blocks (reusing the block cache) and aborts any in-flight translation.
   */
  private readonly autoTranslateTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * When non-empty, the preview is showing a TRANSLATED version of the source.
   * updateMarkdown (live update) checks this: if the uri has an override, it
   * uses the translated markdown instead of the editor's original content, so
   * live updates don't clobber the translation with the original text.
   * Cleared by restoreOriginal().
   */
  private readonly translatedMarkdownOverrides: Map<string, string> = new Map();

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
   * When true, the single preview does not follow the active text editor.
   */
  private static singlePreviewLocked = false;

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
    this.clearAutoTranslateTimer(sourceUri.toString());
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
    inputStringOverride,
  }: {
    sourceUri: vscode.Uri;
    document: vscode.TextDocument;
    webviewPanel?: vscode.WebviewPanel;
    cursorLine?: number;
    viewOptions: { viewColumn: vscode.ViewColumn; preserveFocus?: boolean };
    inputStringOverride?: string;
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
          inputStringOverride,
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
            inputStringOverride,
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
            const command = message?.command;
            const args = message?.args;
            if (
              typeof command !== 'string' ||
              !WEBVIEW_MESSAGE_COMMANDS.has(command)
            ) {
              return;
            }
            if (!Array.isArray(args)) {
              return;
            }
            // The handler is registered once per webview panel.  In single
            // preview mode the panel is reused across files, so the closure's
            // `sourceUri` goes stale after a switch — compare against the
            // panel's current target instead so legitimate `updateMarkdown`
            // edits are not dropped (and an attacker still can only write to
            // the file the preview currently represents).
            const expectedSourceUri =
              getPreviewMode() === PreviewMode.SinglePreview
                ? PreviewProvider.singlePreviewPanelSourceUriTarget
                : sourceUri;
            if (
              command === 'updateMarkdown' &&
              (typeof args[0] !== 'string' ||
                !expectedSourceUri ||
                Uri.parse(args[0]).toString() !== expectedSourceUri.toString())
            ) {
              return;
            }
            vscode.commands.executeCommand(`_crossnote.${command}`, ...args);
          },
          null,
          this.context.subscriptions,
        );

        // unregister previewPanel.
        previewPanel.onDidDispose(
          () => {
            PreviewProvider.singlePreviewLocked = false;
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

    const inputString = inputStringOverride ?? document.getText() ?? '';
    const engine = this.getEngine(sourceUri);
    try {
      // Tag this request so we can detect if a newer initPreview overtook us
      // before the (potentially slow) HTML generation finishes.
      const initRequestId = ++this.initRequestSeq;
      this.latestInitRequestByPreview.set(previewPanel, initRequestId);

      // Build lightbox head injection when enabled
      let head = '';
      if (getMPEConfig<boolean>('enableImageLightbox') ?? true) {
        const lightboxCssUri = previewPanel.webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            'media',
            'lightbox.css',
          ),
        );
        const lightboxJsUri = previewPanel.webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            'media',
            'lightbox.js',
          ),
        );
        head = `<link rel="stylesheet" href="${lightboxCssUri}"><script defer src="${lightboxJsUri}"></script>`;
      }

      const html = await engine.generateHTMLTemplateForPreview({
        inputString,
        config: {
          sourceUri: sourceUri.toString(),
          cursorLine: initialLine,
          isVSCode: true,
          scrollSync: getMPEConfig<boolean>('scrollSync'),
          imageUploader: getMPEConfig<ImageUploader>('imageUploader'),
          // v2 translation: tell the webview whether it's currently showing
          // the translated markdown, so the context-menu item can toggle
          // between "Translate" and "Show Original".
          isShowingTranslation: this.translatedMarkdownOverrides.has(
            sourceUri.toString(),
          ),
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
        head,
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
      previewPanel.webview.html = html;
    } catch (error) {
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
    this.autoTranslateTimers.forEach((timer) => clearTimeout(timer));
    this.autoTranslateTimers.clear();
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

  /**
   * Returns true if the single preview is currently locked.
   */
  public isSinglePreviewLocked(): boolean {
    return PreviewProvider.singlePreviewLocked;
  }

  /**
   * Lock the single preview to its current file and update its title.
   */
  public lockSinglePreview() {
    PreviewProvider.singlePreviewLocked = true;
    this.updateSinglePreviewTitle();
  }

  /**
   * Toggle lock on the single preview and update its title.
   * Returns the new lock state.
   */
  public toggleSinglePreviewLock(): boolean {
    PreviewProvider.singlePreviewLocked = !PreviewProvider.singlePreviewLocked;
    this.updateSinglePreviewTitle();
    return PreviewProvider.singlePreviewLocked;
  }

  private updateSinglePreviewTitle() {
    const panel = PreviewProvider.singlePreviewPanel;
    const sourceUri = PreviewProvider.singlePreviewPanelSourceUriTarget;
    if (panel && sourceUri) {
      const baseName = path.basename(sourceUri.fsPath);
      panel.title = PreviewProvider.singlePreviewLocked
        ? `Preview [Locked] ${baseName}`
        : `Preview ${baseName}`;
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

      // Prefer disk content when the buffer has no unsaved edits, so that
      // external file modifications (e.g. across the WSL boundary or by
      // notepad.exe) propagate to the preview even when VSCode did not
      // refresh its cached TextDocument. Reads happen after the stamp so the
      // existing stale-render guard below still discards us if a newer
      // updateMarkdown overtakes during the disk read.
      let text = document.getText();
      if (!document.isDirty) {
        try {
          const data = await vscode.workspace.fs.readFile(sourceUri);
          text = Buffer.from(data).toString('utf-8');
        } catch {
          // Fall back to the cached document content on read failure.
        }
      }

      // If we're showing a translation, use the translated markdown instead
      // of the editor's original content so live updates don't clobber it.
      const translationOverride = this.translatedMarkdownOverrides.get(
        sourceUri.toString(),
      );
      if (translationOverride !== undefined) {
        text = translationOverride;
      }
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

  private async refreshPreviewPanel(sourceUri: Uri | null) {
    if (!sourceUri) {
      return;
    }

    for (const [previewPanel, document] of this.previewToDocumentMap) {
      if (
        !previewPanel ||
        !isMarkdownFile(document) ||
        !document.uri ||
        document.uri.fsPath !== sourceUri.fsPath
      ) {
        continue;
      }

      // Force re-reading from disk so manual refresh works even when the file
      // was modified by an external editor (e.g. across the WSL boundary, or
      // by notepad.exe) and VSCode did not pick up the change. Skip when the
      // buffer has unsaved edits — those would otherwise be overwritten by
      // the older on-disk content.
      let inputStringOverride: string | undefined;
      if (!document.isDirty) {
        try {
          const data = await vscode.workspace.fs.readFile(sourceUri);
          inputStringOverride = Buffer.from(data).toString('utf-8');
        } catch {
          // Fall back to the cached document content on read failure.
        }
      }

      await this.initPreview({
        sourceUri,
        document,
        inputStringOverride,
        viewOptions: {
          viewColumn: previewPanel.viewColumn ?? vscode.ViewColumn.One,
          preserveFocus: true,
        },
      });
    }
  }

  public refreshPreview(sourceUri: Uri) {
    // If a translation is in-flight for this uri, abort it: the source changed,
    // so the in-flight translation is stale. The refresh below re-renders from
    // disk (the original source).
    this.abortControllers.get(sourceUri.toString())?.abort();
    this.abortControllers.delete(sourceUri.toString());
    // Clear any translation override — the source changed, so the cached
    // translation is no longer valid.
    this.translatedMarkdownOverrides.delete(sourceUri.toString());
    this.clearAutoTranslateTimer(sourceUri.toString());
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.clearCaches();
      // restart iframe
      this.refreshPreviewPanel(sourceUri);
    }
  }

  /**
   * Translate the document to Chinese and re-render the preview from the
   * translated markdown (v2 design). The translated markdown is fed back
   * through `initPreview`, so crossnote's full pipeline runs on it: TOC,
   * line-numbers, exports, and menu actions all work on the translated
   * content. A disk cache avoids re-calling the API on unchanged documents.
   */
  public async translateDocument(sourceUri: vscode.Uri) {
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === sourceUri.toString(),
    );
    if (!document) {
      return;
    }
    let markdown: string;
    try {
      markdown = document.getText() ?? (await this.readSourceFile(sourceUri));
    } catch {
      return;
    }
    if (!markdown.trim()) {
      return;
    }

    const providerId = getMPEConfig<string>('aiTranslationProvider') ?? '';
    const modelId = getMPEConfig<string>('aiTranslationModel') ?? '';
    if (!providerId || !modelId) {
      return;
    }

    // Fast path: whole-document cache hit (document unchanged since last
    // translation). Falls through to the incremental path otherwise.
    const cacheKey = computeTranslationCacheKey(markdown, providerId, modelId);
    const cached = getCachedTranslation(cacheKey);
    if (cached && cached.markdown) {
      this.translatedMarkdownOverrides.set(
        sourceUri.toString(),
        cached.markdown,
      );
      await this.rerenderWithMarkdown(sourceUri, document, cached.markdown);
      return;
    }

    // Incremental path: split into blocks, reuse cached translations for
    // unchanged blocks, and only translate changed blocks (one API call
    // per changed block, concurrently). Falls back to a whole-document
    // translation if anything goes wrong.
    const translatedMarkdown = await this.translateIncrementally(
      sourceUri,
      document,
      markdown,
      providerId,
      modelId,
    );
    if (translatedMarkdown === undefined) {
      return; // aborted or failed entirely
    }

    // Cache the assembled result for the whole-document fast path.
    setCachedTranslation(
      cacheKey,
      translatedMarkdown,
      providerId,
      modelId,
      markdown.length,
    );
    this.translatedMarkdownOverrides.set(
      sourceUri.toString(),
      translatedMarkdown,
    );
    await this.rerenderWithMarkdown(sourceUri, document, translatedMarkdown);
  }

  /**
   * Incremental translation: split `markdown` into blocks, reuse cached
   * block translations for unchanged blocks, and translate only the changed
   * blocks concurrently (one API call each). Returns the assembled translated
   * markdown, or `undefined` if aborted or if every changed block failed and
   * the whole-document fallback also failed.
   *
   * On any structural error (split failure, all-blocks-failed), falls back to
   * a single whole-document translation so the user always gets a result.
   */
  private async translateIncrementally(
    sourceUri: vscode.Uri,
    document: vscode.TextDocument,
    markdown: string,
    providerId: string,
    modelId: string,
  ): Promise<string | undefined> {
    let blocks: string[];
    try {
      blocks = splitMarkdownBlocks(markdown);
    } catch {
      blocks = [];
    }
    // If splitting produced nothing sensible, fall back to whole-document.
    if (blocks.length === 0) {
      return this.translateWholeFallback(sourceUri, markdown);
    }

    // Resolve each block: cache hit → reuse, miss → translate.
    const hashes = blocks.map((b) => hashBlock(b));
    const translated: string[] = new Array(blocks.length);
    const toTranslate: { index: number; block: string }[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const cachedBlock = getBlockTranslation(hashes[i]);
      if (cachedBlock !== undefined) {
        translated[i] = cachedBlock;
      } else {
        toTranslate.push({ index: i, block: blocks[i] });
      }
    }

    // Everything cached → assemble immediately, no API calls.
    if (toTranslate.length === 0) {
      return translated.join('\n\n');
    }

    // No block had a cached translation → this is a first translation (or the
    // whole document changed). Use a single whole-document streaming request
    // with periodic preview refresh, which also gives the AI full document
    // context for term consistency. Per-block translation only pays off when
    // some blocks are already cached.
    if (toTranslate.length === blocks.length) {
      const whole = await this.translateWholeDocumentStreaming(
        sourceUri,
        document,
        markdown,
      );
      if (whole !== undefined) {
        // Persist per-block translations so a later small edit can reuse them
        // via the incremental path (instead of re-translating the whole
        // document again). Split the translated markdown into blocks; only
        // store when the block count matches the source so block i's hash
        // (from the SOURCE block) maps to block i of the TRANSLATION. If the
        // AI restructured the document (different block count), skip caching
        // rather than store a misaligned mapping.
        try {
          const translatedBlocks = splitMarkdownBlocks(whole);
          if (translatedBlocks.length === blocks.length) {
            for (let i = 0; i < blocks.length; i++) {
              setBlockTranslation(
                hashes[i],
                translatedBlocks[i],
                providerId,
                modelId,
              );
            }
          }
        } catch {
          // best-effort
        }
      }
      return whole;
    }

    // Streaming partial render: `partialBlocks` holds the current
    // best-effort assembled document — cached translations where available,
    // original block text where not yet translated. It is refreshed into
    // the preview after each run completes, so the user sees translated
    // blocks appear incrementally.
    const partialBlocks = blocks.map((b, i) => translated[i] ?? b);

    // Group consecutive to-translate blocks into RUNS so that consecutive
    // changed blocks are sent as a single AI request (giving the model
    // context and reducing request count). A run is a maximal sequence of
    // to-translate blocks with contiguous indices; it is further split if it
    // exceeds the size cap (so a single request is never too large).
    const MAX_RUN_BYTES = 8192;
    const MAX_RUN_BLOCKS = 20;
    const runs: { startIndex: number; indices: number[]; blocks: string[] }[] =
      [];
    {
      let i = 0;
      while (i < toTranslate.length) {
        const runIndices: number[] = [];
        const runBlocks: string[] = [];
        let runBytes = 0;
        const start = toTranslate[i].index;
        let prevIndex = start - 1;
        while (i < toTranslate.length) {
          const { index, block } = toTranslate[i];
          // Must be contiguous with the previous block in this run, AND
          // stay under both caps (a single oversized block still goes alone).
          const contiguous = index === prevIndex + 1;
          const wouldExceedBytes =
            runBlocks.length > 0 && runBytes + block.length > MAX_RUN_BYTES;
          const wouldExceedBlocks = runBlocks.length >= MAX_RUN_BLOCKS;
          if (
            runBlocks.length > 0 &&
            (!contiguous || wouldExceedBytes || wouldExceedBlocks)
          ) {
            break;
          }
          runIndices.push(index);
          runBlocks.push(block);
          runBytes += block.length;
          prevIndex = index;
          i++;
        }
        runs.push({
          startIndex: start,
          indices: runIndices,
          blocks: runBlocks,
        });
      }
    }

    // Abort any prior in-flight translation for this uri.
    this.abortControllers.get(sourceUri.toString())?.abort();
    const controller = new AbortController();
    this.abortControllers.set(sourceUri.toString(), controller);

    const runCount = runs.length;
    const totalCount = blocks.length;
    const failureCount = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Translating ${runCount} run${runCount === 1 ? '' : 's'}/${totalCount} blocks…`,
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        let done = 0;
        let failures = 0;
        // Translate runs SEQUENTIALLY in document order (runs are built in
        // ascending index order), so the user sees the translation appear
        // from top to bottom. On each run's completion, split the translated
        // markdown back into its blocks, update partialBlocks / translated,
        // and refresh the preview.
        for (const run of runs) {
          if (controller.signal.aborted) {
            return failures;
          }
          const r = await streamTranslateBlock({
            block: run.blocks.join('\n\n'),
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            return failures;
          }
          done++;
          progress.report({
            message: `${done}/${runCount} runs`,
          });
          if (r.ok && r.markdown) {
            // Split the translated run back into blocks. If the AI preserved
            // the block structure (block count matches), align 1:1 with the
            // run's source blocks. If not, put the whole translation in the
            // first slot and clear the rest (markdown collapses the extra
            // blank lines, so this stays visually correct).
            let translatedRunBlocks: string[];
            try {
              translatedRunBlocks = splitMarkdownBlocks(r.markdown);
            } catch {
              translatedRunBlocks = [r.markdown];
            }
            if (translatedRunBlocks.length === run.indices.length) {
              for (let j = 0; j < run.indices.length; j++) {
                const idx = run.indices[j];
                partialBlocks[idx] = translatedRunBlocks[j];
                translated[idx] = translatedRunBlocks[j];
              }
            } else {
              // Mismatch: keep the run's translation as a single block at the
              // start index, blank the rest. Content is preserved; only the
              // per-block granularity is lost for this run.
              partialBlocks[run.startIndex] = r.markdown;
              translated[run.startIndex] = r.markdown;
              for (let j = 1; j < run.indices.length; j++) {
                partialBlocks[run.indices[j]] = '';
                translated[run.indices[j]] = '';
              }
            }
            // Refresh the preview with the updated partial document so the
            // newly translated run shows up immediately.
            await this.refreshPreviewWithMarkdown(
              sourceUri,
              document,
              partialBlocks.join('\n\n'),
            );
          } else {
            failures++;
          }
        }
        return failures;
      },
    );

    if (this.abortControllers.get(sourceUri.toString()) === controller) {
      this.abortControllers.delete(sourceUri.toString());
    }
    if (controller.signal.aborted) {
      return undefined;
    }

    // Persist successful block translations to the block cache. A block is
    // considered successful if translated[index] is a non-empty string.
    // Blank fallbacks (mismatch case) are not cached so the next attempt can
    // retry. The whole-run translation (first slot of a mismatched run) IS
    // cached under its source block hash — reusing it next time is correct
    // even though it covers multiple original blocks.
    for (const { index } of toTranslate) {
      if (translated[index] !== undefined && translated[index] !== '') {
        setBlockTranslation(
          hashes[index],
          translated[index],
          providerId,
          modelId,
        );
      }
    }

    // If every run failed, fall back to whole-document translation so the
    // user still gets a result (rather than a half-translated doc).
    if (failureCount === runCount) {
      return this.translateWholeFallback(sourceUri, markdown);
    }

    // Any untranslated (failed) slots fall back to the original block text so
    // the assembled document is still complete and well-formed.
    for (let i = 0; i < translated.length; i++) {
      if (translated[i] === undefined) {
        translated[i] = blocks[i];
      }
    }
    return translated.join('\n\n');
  }

  /**
   * Whole-document streaming translation with periodic preview refresh.
   * Used for first-time translation (no block cached) so the user sees the
   * translation appear progressively as the stream arrives, AND the AI gets
   * full document context for term consistency. The stream fires `onPartial`
   * (throttled to 500ms) with the accumulated partial translation, which we
   * render into the preview via refreshPreviewWithMarkdown. Returns the
   * complete translated markdown, or `undefined` if aborted / failed.
   */
  private async translateWholeDocumentStreaming(
    sourceUri: vscode.Uri,
    document: vscode.TextDocument,
    markdown: string,
  ): Promise<string | undefined> {
    this.abortControllers.get(sourceUri.toString())?.abort();
    const controller = new AbortController();
    this.abortControllers.set(sourceUri.toString(), controller);

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Translating…',
        cancellable: true,
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        return streamTranslateDocument({
          markdown,
          signal: controller.signal,
          onPartial: (partial) => {
            // Fire-and-forget: the per-uri refresh queue serializes and the
            // final initPreview is authoritative.
            void this.refreshPreviewWithMarkdown(
              sourceUri,
              document,
              partial,
            ).catch(() => {
              // best-effort
            });
          },
        });
      },
    );

    if (this.abortControllers.get(sourceUri.toString()) === controller) {
      this.abortControllers.delete(sourceUri.toString());
    }
    if (controller.signal.aborted) {
      return undefined;
    }
    if (!result.ok || !result.markdown) {
      return undefined;
    }
    return result.markdown;
  }

  /**
   * Whole-document fallback: a single streaming translation of the entire
   * markdown. Used when block splitting fails or every per-block translation
   * fails. Returns the translated markdown, or `undefined` if aborted or
   * failed.
   */
  private async translateWholeFallback(
    sourceUri: vscode.Uri,
    markdown: string,
  ): Promise<string | undefined> {
    this.abortControllers.get(sourceUri.toString())?.abort();
    const controller = new AbortController();
    this.abortControllers.set(sourceUri.toString(), controller);

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Translating…',
        cancellable: true,
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        return streamTranslateDocument({
          markdown,
          signal: controller.signal,
        });
      },
    );

    if (this.abortControllers.get(sourceUri.toString()) === controller) {
      this.abortControllers.delete(sourceUri.toString());
    }
    if (controller.signal.aborted) {
      return undefined;
    }
    if (!result.ok || !result.markdown) {
      return undefined;
    }
    return result.markdown;
  }

  /**
   * Cancel any pending auto-translate for `sourceUriString`. Called when the
   * user leaves translation mode (restoreOriginal) or the source is externally
   * refreshed, so a stray timer can't re-arm a translation after the override
   * was cleared.
   */
  private clearAutoTranslateTimer(sourceUriString: string) {
    const timer = this.autoTranslateTimers.get(sourceUriString);
    if (timer) {
      clearTimeout(timer);
      this.autoTranslateTimers.delete(sourceUriString);
    }
  }

  /**
   * Restore the original-language preview by re-running initPreview with the
   * document's actual (possibly unsaved) markdown.
   */
  public async restoreOriginal(sourceUri: vscode.Uri) {
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === sourceUri.toString(),
    );
    if (!document) {
      return;
    }
    // Clear the translation override so live updates use the original again.
    this.translatedMarkdownOverrides.delete(sourceUri.toString());
    this.abortControllers.get(sourceUri.toString())?.abort();
    this.abortControllers.delete(sourceUri.toString());
    this.clearAutoTranslateTimer(sourceUri.toString());
    await this.rerenderWithMarkdown(sourceUri, document, document.getText());
  }

  /**
   * Re-render the preview for `sourceUri` using `markdown` as the source
   * (instead of reading from disk). Mirrors what refreshPreviewPanel does,
   * but takes an explicit markdown override so we can feed translated markdown.
   */
  private async rerenderWithMarkdown(
    sourceUri: vscode.Uri,
    document: vscode.TextDocument,
    markdown: string,
  ): Promise<void> {
    const panels = this.getPreviews(sourceUri);
    if (!panels || panels.length === 0) {
      return;
    }
    const previewPanel = panels[0];
    await this.initPreview({
      sourceUri,
      document,
      inputStringOverride: markdown,
      viewOptions: {
        viewColumn: previewPanel.viewColumn ?? vscode.ViewColumn.Active,
        preserveFocus: true,
      },
    });
  }

  /**
   * Lightweight in-place refresh of the preview content for `sourceUri`:
   * parse `markdown` and postMessage `updateHtml` to the existing webview,
   * WITHOUT reloading the webview HTML (so React state, scroll position,
   * and the context-menu state are preserved). Used by the streaming
   * incremental-translation path so each newly-translated block can be
   * shown as it arrives. Mirrors the updateMarkdown parseMD+updateHtml
   * path but takes an explicit markdown string instead of reading the
   * document / disk.
   *
   * Refreshes are SERIALIZED per sourceUri via `refreshChains` so that
   * concurrent block-completion callbacks don't race: each refresh runs
   * one at a time, in the order they were queued, each rendering the
   * latest partial state. (A renderRequestId-style stale guard would be
   * wrong here because a later-STARTED but content-richer refresh would
   * mark an earlier one stale and drop it.)
   *
   * Best-effort: any error is swallowed (the final initPreview produces
   * the authoritative render).
   */
  private async refreshPreviewWithMarkdown(
    sourceUri: vscode.Uri,
    document: vscode.TextDocument,
    markdown: string,
  ): Promise<void> {
    const key = sourceUri.toString();
    const run = async (): Promise<void> => {
      try {
        const engine = this.getEngine(sourceUri);
        if (!engine) {
          return;
        }
        const previews = this.getPreviews(sourceUri);
        if (!previews || previews.length === 0) {
          return;
        }
        const preview = previews[0];
        const { html, tocHTML, yamlConfig } = await engine.parseMD(markdown, {
          isForPreview: true,
          useRelativeFilePath: false,
          hideFrontMatter: false,
          vscodePreviewPanel: preview,
        });
        // Aborted translation? Stop refreshing.
        if (
          !this.isSinglePreviewTarget(sourceUri) ||
          this.abortControllers.get(key)?.signal.aborted
        ) {
          return;
        }
        await this.postMessageToPreview(sourceUri, {
          command: 'updateHtml',
          markdown,
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
      } catch {
        // Best-effort streaming refresh; the final initPreview is authoritative.
      }
    };
    // Serialize: chain onto the per-uri tail. This guarantees refreshes run
    // one at a time, in queue order, so the webview always receives a
    // monotonically richer document (no out-of-order, no dropped blocks).
    const prev = this.refreshChains.get(key) ?? Promise.resolve();
    const next = prev.then(run, run);
    this.refreshChains.set(key, next);
    // Clean up the map entry once the chain is idle so it doesn't leak.
    next.finally(() => {
      if (this.refreshChains.get(key) === next) {
        this.refreshChains.delete(key);
      }
    });
    return next;
  }

  private async readSourceFile(sourceUri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(sourceUri);
    return Buffer.from(bytes).toString('utf8');
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

    // Auto-translate: when the preview is showing a translation and the
    // user enabled the toggle, debounce-retranslate changed blocks instead
    // of refreshing from the (now-edited) original text. Reuses the existing
    // incremental path + run-merging; translateDocument aborts any in-flight
    // translation, so rapid edits collapse into one fresh request.
    if (
      getMPEConfig<boolean>('aiTranslationAutoUpdate') &&
      this.translatedMarkdownOverrides.has(sourceUriString)
    ) {
      const existing = this.autoTranslateTimers.get(sourceUriString);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        this.autoTranslateTimers.delete(sourceUriString);
        void this.translateDocument(sourceUri);
      }, 3000);
      this.autoTranslateTimers.set(sourceUriString, timer);
      return;
    }
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
