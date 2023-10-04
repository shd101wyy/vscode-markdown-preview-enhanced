import { Mutex } from 'async-mutex';
import {
  Notebook,
  PreviewMode,
  loadConfigsInDirectory,
  utility,
} from 'crossnote';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
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
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    const jsdelivrCdnHost =
      config.get<string>('jsdelivrCdnHost') ?? 'cdn.jsdelivr.net';
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
    if (filePath.startsWith('/http:/localhost:6789/')) {
      return filePath.replace(
        '/http:/localhost:6789/',
        'http://localhost:6789/',
      );
    } else if (filePath.startsWith('/https:/')) {
      return filePath.replace('/https:/', 'https://');
    } else {
      return preview.webview
        .asWebviewUri(vscode.Uri.file(filePath))
        .toString(true)
        .replace(/%3F/gi, '?')
        .replace(/%23/g, '#');
    }
  } else {
    if (!filePath.startsWith('file://')) {
      filePath = 'file:///' + filePath;
    }
    filePath = filePath.replace(/^file\:\/+/, 'file:///');
    return filePath;
  }
});

/**
 * key is `workspaceDir`
 * value is the `PreviewProvider`
 */
const WORKSPACE_PREVIEW_PROVIDER_MAP: Map<
  string, // workspaceDir fsPath
  PreviewProvider
> = new Map();

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
  private waiting: boolean = false;

  /**
   * Each PreviewProvider has a one notebook.
   */
  private notebook: Notebook;

  /**
   * VSCode extension context
   */
  private context: vscode.ExtensionContext;

  /**
   * The key is markdown file fspath
   * value is Preview (vscode.Webview) object
   */
  private previewMaps: { [key: string]: Set<vscode.WebviewPanel> } = {};

  private previewToDocumentMap: Map<
    vscode.WebviewPanel,
    vscode.TextDocument
  > = new Map();

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

  private async init(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ) {
    this.context = context;
    this.notebook = await this.getNotebooksManager().getNotebook(
      workspaceFolderUri,
    );
    return this;
  }

  private getNotebooksManager() {
    if (!PreviewProvider.notebooksManager) {
      PreviewProvider.notebooksManager = new NotebooksManager(this.context);
    }
    return PreviewProvider.notebooksManager;
  }

  public async updateCrossnoteConfig(directory: string, forceUpdate = false) {
    // If directory is globalConfigDirectory && ${workspaceDir}/.crossnote directory exists
    // then return without updating.
    if (
      directory === globalConfigPath &&
      (await this.notebook.fs.exists(
        path.join(this.notebook.notebookPath.fsPath, '.crossnote'),
      ))
    ) {
      return;
    }

    if ((await this.notebook.fs.exists(directory)) || forceUpdate) {
      const configs = await loadConfigsInDirectory(
        directory,
        this.notebook.fs,
        true,
      );
      this.notebook.updateConfig(configs);
    }
  }

  public static async getPreviewContentProvider(
    uri: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    const workspaceUri = getWorkspaceFolderUri(uri);

    // Acquire mutex
    let mutex: Mutex;
    if (WORKSPACE_MUTEX_MAP.has(workspaceUri.fsPath)) {
      const mutex_ = WORKSPACE_MUTEX_MAP.get(workspaceUri.fsPath);
      if (!mutex_) {
        throw new Error('Cannot find mutex');
      }
      mutex = mutex_;
    } else {
      mutex = new Mutex();
      WORKSPACE_MUTEX_MAP.set(workspaceUri.fsPath, mutex);
    }

    const release = await mutex.acquire();
    try {
      if (WORKSPACE_PREVIEW_PROVIDER_MAP.has(workspaceUri.fsPath)) {
        const provider = WORKSPACE_PREVIEW_PROVIDER_MAP.get(
          workspaceUri.fsPath,
        );
        if (!provider) {
          throw new Error('Cannot find preview provider');
        }
        release();
        return provider;
      } else {
        const provider = new PreviewProvider();
        await provider.init(context, workspaceUri);
        WORKSPACE_PREVIEW_PROVIDER_MAP.set(workspaceUri.fsPath, provider);
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
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          this.refreshPreviewPanel(vscode.Uri.file(key));
        }
      }
    }
  }

  private addPreviewToMap(sourceUri: Uri, previewPanel: vscode.WebviewPanel) {
    if (!this.previewMaps[sourceUri.fsPath]) {
      this.previewMaps[sourceUri.fsPath] = new Set();
    }
    this.previewMaps[sourceUri.fsPath].add(previewPanel);
  }

  private deletePreviewFromMap(
    sourceUri: Uri,
    previewPanel: vscode.WebviewPanel,
  ) {
    if (this.previewMaps[sourceUri.fsPath]) {
      this.previewMaps[sourceUri.fsPath].delete(previewPanel);
    }
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
      if (this.previewMaps[sourceUri.fsPath]) {
        return Array.from(this.previewMaps[sourceUri.fsPath]);
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
      this.previewMaps = {};
    } else {
      const previews = this.getPreviews(sourceUri);
      if (previews) {
        previews.forEach((preview) => {
          this.previewToDocumentMap.delete(preview);
          this.deletePreviewFromMap(sourceUri, preview);
        });
      }
    }
  }

  /**
   * TODO: Free memory
   */
  public destroyEngine(sourceUri: vscode.Uri) {}

  private getEngine(sourceUri: Uri) {
    return this.notebook.getNoteMarkdownEngine(sourceUri.fsPath);
  }

  public async initPreview({
    sourceUri,
    document,
    webviewPanel,
    activeLine,
    viewOptions,
  }: {
    sourceUri: vscode.Uri;
    document: vscode.TextDocument;
    webviewPanel?: vscode.WebviewPanel;
    activeLine?: number;
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
          activeLine,
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
            activeLine,
          }),
        ),
      );
      return;
    } else {
      const localResourceRoots = [
        vscode.Uri.file(this.context.extensionPath),
        vscode.Uri.file(utility.getCrossnoteBuildDirectory()),
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
        // @ts-ignore
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
      previewPanel.iconPath = vscode.Uri.file(
        path.join(this.context.extensionPath, 'media', 'preview.svg'),
      );

      // register previewPanel message events
      previewPanel.webview.onDidReceiveMessage(
        (message) => {
          // console.log('@ receiveMessage: ', message);
          vscode.commands.executeCommand(
            `_crossnote.${message.command}`,
            ...message.args,
          );
        },
        null,
        this.context.subscriptions,
      );

      // unregister previewPanel
      previewPanel.onDidDispose(
        () => {
          this.destroyPreview(sourceUri);
          this.destroyEngine(sourceUri);
        },
        null,
        this.context.subscriptions,
      );

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

    // init markdown engine
    let initialLine: number | undefined;
    if (document.uri.fsPath === sourceUri.fsPath) {
      initialLine = activeLine;
    }

    const inputString = document.getText() ?? '';
    const engine = this.getEngine(sourceUri);
    try {
      const html = await engine.generateHTMLTemplateForPreview({
        inputString,
        config: {
          sourceUri: sourceUri.toString(),
          initialLine,
          isVSCode: true,
          scrollSync: this.getNotebooksManager().config.scrollSync,
          imageUploader: this.getNotebooksManager().config.imageUploader,
        },
        contentSecurityPolicy: '',
        vscodePreviewPanel: previewPanel,
        isVSCodeWebExtension: isVSCodeWebExtension(),
      });
      console.log(
        '@ initPreview 1: ',
        previewPanel.active,
        previewPanel.visible,
      );
      previewPanel.webview.html = html;
    } catch (error) {
      //
      vscode.window.showErrorMessage(error.toString());
      console.error(error);
    }
  }

  /**
   * Close all previews
   */
  public closeAllPreviews(previewMode: PreviewMode) {
    if (previewMode === PreviewMode.SinglePreview) {
      if (PreviewProvider.singlePreviewPanel) {
        PreviewProvider.singlePreviewPanel.dispose();
      }
    } else {
      for (const key in this.previewMaps) {
        const previews = this.previewMaps[key];
        if (previews) {
          previews.forEach((preview) => preview.dispose());
        }
      }
    }

    this.previewMaps = {};
    this.previewToDocumentMap = new Map();
    // this.engineMaps = {};
    PreviewProvider.singlePreviewPanel = null;
    PreviewProvider.singlePreviewPanelSourceUriTarget = null;
  }

  public async postMessageToPreview(
    sourceUri: Uri,
    message: { command: string; [key: string]: any }, // TODO: Define a type for message
  ) {
    const previews = this.getPreviews(sourceUri);
    if (previews) {
      // console.log('@ postMessageToPreview: ', preview, message);
      for (let i = 0; i < previews.length; i++) {
        const preview = previews[i];
        if (preview.visible) {
          const result = await preview.webview.postMessage(message);
          if (!result) {
            vscode.window.showErrorMessage(
              `Failed to send message "${message.command}" to preview panel for ${sourceUri.fsPath}`,
            );
          }
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
    const engine = this.getEngine(sourceUri);
    const previews = this.getPreviews(sourceUri);
    if (!previews || !previews.length) {
      return;
    }

    // presentation mode
    if (engine.isPreviewInPresentationMode) {
      return this.refreshPreview(sourceUri);
    }

    // not presentation mode
    vscode.workspace.openTextDocument(sourceUri).then(async (document) => {
      const text = document.getText();
      await this.postMessageToPreview(sourceUri, {
        command: 'startParsingMarkdown',
      });

      const previews = this.getPreviews(sourceUri);
      if (!previews || !previews.length) {
        return;
      }
      engine
        .parseMD(text, {
          isForPreview: true,
          useRelativeFilePath: false,
          hideFrontMatter: false,
          triggeredBySave,
          vscodePreviewPanel: previews[0], // TODO:
        })
        .then(
          async ({ markdown, html, tocHTML, JSAndCssFiles, yamlConfig }) => {
            // check JSAndCssFiles
            if (
              JSON.stringify(JSAndCssFiles) !==
                JSON.stringify(this.jsAndCssFilesMaps[sourceUri.fsPath]) ||
              yamlConfig['isPresentationMode']
            ) {
              this.jsAndCssFilesMaps[sourceUri.fsPath] = JSAndCssFiles;
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
          },
        )
        .catch((error) => {
          vscode.window.showErrorMessage(error.toString());
        });
    });
  }

  public refreshPreviewPanel(sourceUri: Uri | null) {
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
          vscode.window.showErrorMessage(error.toString());
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
          vscode.window.showErrorMessage(error.toString());
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
            vscode.window.showErrorMessage(error.toString());
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
                  /\_/g,
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
            vscode.window.showErrorMessage(error.toString());
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
            vscode.window.showErrorMessage(error.toString());
          });
      }
    }
  }

  public pandocExport(sourceUri) {
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
            vscode.window.showErrorMessage(error.toString());
          });
      }
    }
  }

  public markdownExport(sourceUri) {
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
          vscode.window.showErrorMessage(error.toString());
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

  public runAllCodeChunks(sourceUri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.runCodeChunks().then(() => {
        this.updateMarkdown(sourceUri);
      });
    }
  }

  public update(sourceUri: Uri) {
    const previews = this.getPreviews(sourceUri);
    if (
      !this.getNotebooksManager().config.liveUpdate ||
      !previews ||
      !previews.length
    ) {
      return;
    }

    if (!this.waiting) {
      this.waiting = true;
      setTimeout(() => {
        this.waiting = false;
        // this._onDidChange.fire(uri);
        this.updateMarkdown(sourceUri);
      }, 300);
    }
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
