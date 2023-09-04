import {
  Notebook,
  PreviewTheme,
  loadConfigsInDirectory,
  utility,
} from 'crossnote';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { MarkdownPreviewEnhancedConfig, PreviewColorScheme } from './config';
import {
  getCrossnoteVersion,
  getWorkspaceFolderUri,
  globalConfigPath,
  isMarkdownFile,
  isVSCodeWebExtension,
  isVSCodewebExtensionDevMode,
} from './utils';
import { wrapVSCodeFSAsApi } from './vscode-fs';

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

export function getAllPreviewProviders(): PreviewProvider[] {
  return Array.from(WORKSPACE_PREVIEW_PROVIDER_MAP.values());
}

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
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
  private previewMaps: { [key: string]: vscode.WebviewPanel } = {};

  private preview2EditorMap: Map<
    vscode.WebviewPanel,
    vscode.TextEditor
  > = new Map();

  private singlePreviewPanel: vscode.WebviewPanel | null;
  private singlePreviewPanelSourceUriTarget: Uri | null;

  /**
   * The key is markdown file fsPath
   * value is JSAndCssFiles
   */
  private jsAndCssFilesMaps: { [key: string]: string[] } = {};

  private config: MarkdownPreviewEnhancedConfig;

  private systemColorScheme: 'light' | 'dark' = 'light';

  public constructor() {
    // Please use `init` method to initialize this class.
  }

  private async init(
    context: vscode.ExtensionContext,
    workspaceDir: vscode.Uri,
  ) {
    this.context = context;
    this.config = MarkdownPreviewEnhancedConfig.getCurrentConfig();
    this.notebook = await Notebook.init({
      notebookPath: workspaceDir.fsPath,
      config: { ...this.config },
      fs: wrapVSCodeFSAsApi(workspaceDir.scheme),
    });

    // Check if ${workspaceDir}/.crossnote directory exists
    // If not, then use the global config.
    const crossnoteDir = vscode.Uri.joinPath(workspaceDir, './.crossnote');
    if (
      !(await this.notebook.fs.exists(crossnoteDir.fsPath)) &&
      !isVSCodeWebExtension()
    ) {
      try {
        const globalConfig = await loadConfigsInDirectory(
          globalConfigPath,
          this.notebook.fs,
          true,
        );
        this.notebook.updateConfig(globalConfig);
      } catch (error) {
        console.error(error);
      }
    }

    return this;
  }

  public async updateCrossnoteConfig(directory: string) {
    // If directory is globalConfigDirectory && ${workspaceDir}/.crossnote directory exists
    // then return without updating.
    if (
      directory === globalConfigPath &&
      (await this.notebook.fs.exists(
        path.join(this.notebook.notebookPath, '.crossnote'),
      ))
    ) {
      return;
    }

    if (await this.notebook.fs.exists(directory)) {
      const configs = await loadConfigsInDirectory(
        directory,
        this.notebook.fs,
        false,
      );
      this.notebook.updateConfig(configs);
    }
  }

  public static async getPreviewContentProvider(
    uri: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    const workspaceUri = getWorkspaceFolderUri(uri);
    if (WORKSPACE_PREVIEW_PROVIDER_MAP.has(workspaceUri.fsPath)) {
      const provider = WORKSPACE_PREVIEW_PROVIDER_MAP.get(workspaceUri.fsPath);
      if (!provider) {
        throw new Error('Cannot find preview provider');
      }
      return provider;
    } else {
      const provider = new PreviewProvider();
      await provider.init(context, workspaceUri);
      WORKSPACE_PREVIEW_PROVIDER_MAP.set(workspaceUri.fsPath, provider);
      return provider;
    }
  }

  public refreshAllPreviews() {
    // clear caches
    this.notebook.clearAllNoteMarkdownEngineCaches();

    // refresh iframes
    if (useSinglePreview()) {
      this.refreshPreviewPanel(this.singlePreviewPanelSourceUriTarget);
    } else {
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          this.refreshPreviewPanel(vscode.Uri.file(key));
        }
      }
    }
  }

  /**
   * return markdown preview of sourceUri
   * @param sourceUri
   */
  public getPreview(sourceUri: Uri): vscode.WebviewPanel | null {
    if (useSinglePreview()) {
      return this.singlePreviewPanel;
    } else {
      return this.previewMaps[sourceUri.fsPath];
    }
  }

  /**
   * check if the markdown preview is on for the textEditor
   * @param textEditor
   */
  public isPreviewOn(sourceUri: Uri) {
    if (useSinglePreview()) {
      return !!this.singlePreviewPanel;
    } else {
      return !!this.getPreview(sourceUri);
    }
  }

  public destroyPreview(sourceUri: Uri) {
    if (useSinglePreview()) {
      this.singlePreviewPanel = null;
      this.singlePreviewPanelSourceUriTarget = null;
      this.preview2EditorMap = new Map();
      this.previewMaps = {};
    } else {
      const previewPanel = this.getPreview(sourceUri);
      if (previewPanel) {
        this.preview2EditorMap.delete(previewPanel);
        delete this.previewMaps[sourceUri.fsPath];
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

  public async initPreview(
    sourceUri: vscode.Uri,
    editor: vscode.TextEditor,
    viewOptions: { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
  ) {
    const isUsingSinglePreview = useSinglePreview();
    let previewPanel: vscode.WebviewPanel;
    if (isUsingSinglePreview && this.singlePreviewPanel) {
      const oldResourceRoot = this.singlePreviewPanelSourceUriTarget
        ? getWorkspaceFolderUri(this.singlePreviewPanelSourceUriTarget)
        : undefined;
      const newResourceRoot = getWorkspaceFolderUri(sourceUri);
      if (oldResourceRoot?.fsPath !== newResourceRoot.fsPath) {
        this.singlePreviewPanel.dispose();
        return this.initPreview(sourceUri, editor, viewOptions);
      } else {
        previewPanel = this.singlePreviewPanel;
        this.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    } else if (this.previewMaps[sourceUri.fsPath]) {
      previewPanel = this.previewMaps[sourceUri.fsPath];
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

      previewPanel = vscode.window.createWebviewPanel(
        'markdown-preview-enhanced',
        `Preview ${path.basename(sourceUri.fsPath)}`,
        viewOptions,
        {
          enableFindWidget: true,
          localResourceRoots,
          enableScripts: true, // TODO: This might be set by enableScriptExecution config. But for now we just enable it.
        },
      );
      previewPanel.iconPath = vscode.Uri.file(
        path.join(this.context.extensionPath, 'media', 'preview.svg'),
      );

      // register previewPanel message events
      previewPanel.webview.onDidReceiveMessage(
        message => {
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

      if (isUsingSinglePreview) {
        this.singlePreviewPanel = previewPanel;
        this.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    }

    // register previewPanel
    this.previewMaps[sourceUri.fsPath] = previewPanel;
    this.preview2EditorMap.set(previewPanel, editor);

    // set title
    previewPanel.title = `Preview ${path.basename(sourceUri.fsPath)}`;

    // init markdown engine
    let initialLine: number | undefined;
    if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
      initialLine = await new Promise((resolve, reject) => {
        // HACK: sometimes we only get 0. I couldn't find API to wait for editor getting loaded.
        setTimeout(() => {
          return resolve(editor.selections[0].active.line || 0);
        }, 100);
      });
    }

    const text = editor.document.getText();
    const engine = this.getEngine(sourceUri);
    engine
      .generateHTMLTemplateForPreview({
        inputString: text,
        config: {
          sourceUri: sourceUri.toString(),
          initialLine: initialLine as number,
          vscode: true,
        },
        contentSecurityPolicy: '',
        vscodePreviewPanel: previewPanel,
        isVSCodeWebExtension: isVSCodeWebExtension(),
      })
      .then(html => {
        previewPanel.webview.html = html;
      });
  }

  /**
   * Close all previews
   */
  public closeAllPreviews(singlePreview: boolean) {
    if (singlePreview) {
      if (this.singlePreviewPanel) {
        this.singlePreviewPanel.dispose();
      }
    } else {
      const previewPanels: vscode.WebviewPanel[] = [];
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          const previewPanel = this.previewMaps[key];
          if (previewPanel) {
            previewPanels.push(previewPanel);
          }
        }
      }

      previewPanels.forEach(previewPanel => previewPanel.dispose());
    }

    this.previewMaps = {};
    this.preview2EditorMap = new Map();
    // this.engineMaps = {};
    this.singlePreviewPanel = null;
    this.singlePreviewPanelSourceUriTarget = null;
  }

  public previewPostMessage(sourceUri: Uri, message: any) {
    const preview = this.getPreview(sourceUri);
    if (preview) {
      preview.webview.postMessage(message);
    }
  }

  public previewHasTheSameSingleSourceUri(sourceUri: Uri) {
    if (!this.singlePreviewPanelSourceUriTarget) {
      return false;
    } else {
      return this.singlePreviewPanelSourceUriTarget.fsPath === sourceUri.fsPath;
    }
  }

  public updateMarkdown(sourceUri: Uri, triggeredBySave?: boolean) {
    const engine = this.getEngine(sourceUri);
    const previewPanel = this.getPreview(sourceUri);
    if (!previewPanel) {
      return;
    }

    // presentation mode
    if (engine.isPreviewInPresentationMode) {
      return this.refreshPreview(sourceUri);
    }

    // not presentation mode
    vscode.workspace.openTextDocument(sourceUri).then(document => {
      const text = document.getText();
      this.previewPostMessage(sourceUri, {
        command: 'startParsingMarkdown',
      });

      const preview = this.getPreview(sourceUri);

      engine
        .parseMD(text, {
          isForPreview: true,
          useRelativeFilePath: false,
          hideFrontMatter: false,
          triggeredBySave,
          vscodePreviewPanel: preview,
        })
        .then(({ markdown, html, tocHTML, JSAndCssFiles, yamlConfig }) => {
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
            this.previewPostMessage(sourceUri, {
              command: 'updateHTML',
              html,
              tocHTML,
              totalLineCount: document.lineCount,
              sourceUri: sourceUri.toString(),
              sourceScheme: sourceUri.scheme,
              id: yamlConfig.id || '',
              class:
                (yamlConfig.class || '') +
                ` ${
                  this.systemColorScheme === 'dark'
                    ? 'system-dark'
                    : 'system-ligtht'
                } ${
                  this.getEditorColorScheme() === 'dark'
                    ? 'editor-dark'
                    : 'editor-light'
                } ${isVSCodeWebExtension() ? 'vscode-web-extension' : ''}`,
            });
          }
        });
    });
  }

  public refreshPreviewPanel(sourceUri: Uri | null) {
    if (!sourceUri) {
      return;
    }

    this.preview2EditorMap.forEach((editor, previewPanel) => {
      if (
        previewPanel &&
        editor &&
        editor.document &&
        isMarkdownFile(editor.document) &&
        editor.document.uri &&
        editor.document.uri.fsPath === sourceUri.fsPath
      ) {
        this.initPreview(sourceUri, editor, {
          viewColumn: previewPanel.viewColumn ?? vscode.ViewColumn.One,
          preserveFocus: true,
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
        engine.openInBrowser({}).catch(error => {
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
        .then(dest => {
          vscode.window.showInformationMessage(
            `File ${path.basename(dest)} was created at path: ${dest}`,
          );
        })
        .catch(error => {
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
          .then(dest => {
            vscode.window.showInformationMessage(
              `File ${path.basename(dest)} was created at path: ${dest}`,
            );
          })
          .catch(error => {
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
          .then(dest => {
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
          .catch(error => {
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
          .then(dest => {
            vscode.window.showInformationMessage(
              `eBook ${path.basename(dest)} was created as path: ${dest}`,
            );
          })
          .catch(error => {
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
          .then(dest => {
            vscode.window.showInformationMessage(
              `Document ${path.basename(dest)} was created as path: ${dest}`,
            );
          })
          .catch(error => {
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
        .then(dest => {
          vscode.window.showInformationMessage(
            `Document ${path.basename(dest)} was created as path: ${dest}`,
          );
        })
        .catch(error => {
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
    if (!this.config.liveUpdate || !this.getPreview(sourceUri)) {
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

  private getEditorColorScheme(): 'light' | 'dark' {
    if (
      [
        vscode.ColorThemeKind.Light,
        vscode.ColorThemeKind.HighContrastLight,
      ].find(themeKind => {
        return vscode.window.activeColorTheme.kind === themeKind;
      })
    ) {
      return 'light';
    } else {
      return 'dark';
    }
  }

  public setSystemColorScheme(colorScheme: 'light' | 'dark') {
    if (this.systemColorScheme !== colorScheme) {
      this.systemColorScheme = colorScheme;
      if (
        this.config.previewColorScheme === PreviewColorScheme.systemColorScheme
      ) {
        this.updateConfiguration(true);
      }
    }
  }

  public updateConfiguration(forceUpdate = false) {
    const newConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();
    if (forceUpdate || !this.config.isEqualTo(newConfig)) {
      // if `singlePreview` setting is changed, close all previews.
      if (this.config.singlePreview !== newConfig.singlePreview) {
        this.closeAllPreviews(this.config.singlePreview);
        this.config = newConfig;
      } else {
        this.config = newConfig;

        const previewTheme = this.getPreviewTheme(
          newConfig.previewTheme,
          newConfig.previewColorScheme,
        );
        this.notebook.updateConfig({ ...newConfig, previewTheme });
        // update all generated md documents
        this.refreshAllPreviews();
      }
    }
  }

  private getPreviewThemeByLightOrDark(
    theme: PreviewTheme,
    color: 'light' | 'dark',
  ): PreviewTheme {
    switch (theme) {
      case 'atom-dark.css':
      case 'atom-light.css': {
        return color === 'light' ? 'atom-light.css' : 'atom-dark.css';
      }
      case 'github-dark.css':
      case 'github-light.css': {
        return color === 'light' ? 'github-light.css' : 'github-dark.css';
      }
      case 'one-light.css':
      case 'one-dark.css': {
        return color === 'light' ? 'one-light.css' : 'one-dark.css';
      }
      case 'solarized-light.css':
      case 'solarized-dark.css': {
        return color === 'light' ? 'solarized-light.css' : 'solarized-dark.css';
      }
      default: {
        return theme;
      }
    }
  }

  private getPreviewTheme(
    theme: PreviewTheme,
    colorScheme: PreviewColorScheme,
  ): PreviewTheme {
    if (colorScheme === PreviewColorScheme.editorColorScheme) {
      return this.getPreviewThemeByLightOrDark(
        theme,
        this.getEditorColorScheme(),
      );
    } else if (colorScheme === PreviewColorScheme.systemColorScheme) {
      return this.getPreviewThemeByLightOrDark(theme, this.systemColorScheme);
    } else {
      return theme;
    }
  }

  public openImageHelper(sourceUri: Uri) {
    if (sourceUri.scheme === 'markdown-preview-enhanced') {
      return vscode.window.showWarningMessage('Please focus a markdown file.');
    } else if (!this.isPreviewOn(sourceUri)) {
      return vscode.window.showWarningMessage('Please open preview first.');
    } else {
      return this.previewPostMessage(sourceUri, {
        command: 'openImageHelper',
      });
    }
  }
}

/**
 * check whehter to use only one preview or not
 */
export function useSinglePreview() {
  const config = vscode.workspace.getConfiguration('markdown-preview-enhanced');
  return config.get<boolean>('singlePreview');
}

export function getPreviewUri(uri: vscode.Uri) {
  if (uri.scheme === 'markdown-preview-enhanced') {
    return uri;
  }

  let previewUri: Uri;
  if (useSinglePreview()) {
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
