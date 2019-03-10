import * as mume from "@shd101wyy/mume";
import { MarkdownEngine } from "@shd101wyy/mume";
import { tmpdir } from "os";
import * as path from "path";
import * as vscode from "vscode";
import { TextEditor, Uri } from "vscode";
import { MarkdownPreviewEnhancedConfig } from "./config";

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
export class MarkdownPreviewEnhancedView {
  private waiting: boolean = false;

  /**
   * The key is markdown file fsPath
   * value is MarkdownEngine
   */
  private engineMaps: { [key: string]: MarkdownEngine } = {};

  /**
   * The key is markdown file fspath
   * value is Preview (vscode.Webview) object
   */
  private previewMaps: { [key: string]: vscode.WebviewPanel } = {};

  private preview2EditorMap: Map<
    vscode.WebviewPanel,
    vscode.TextEditor
  > = new Map();

  private singlePreviewPanel: vscode.WebviewPanel;
  private singlePreviewPanelSourceUriTarget: Uri;

  /**
   * The key is markdown file fsPath
   * value is JSAndCssFiles
   */
  private jsAndCssFilesMaps: { [key: string]: string[] } = {};

  private config: MarkdownPreviewEnhancedConfig;

  public constructor(private context: vscode.ExtensionContext) {
    this.config = MarkdownPreviewEnhancedConfig.getCurrentConfig();

    mume
      .init() // init markdown-preview-enhanced
      .then(() => {
        mume.onDidChangeConfigFile(this.refreshAllPreviews.bind(this));
        MarkdownEngine.onModifySource(this.modifySource.bind(this));

        const extensionVersion = require(path.resolve(
          this.context.extensionPath,
          "./package.json",
        ))["version"];
        if (extensionVersion !== mume.configs.config["vscode_mpe_version"]) {
          mume.utility.updateExtensionConfig({
            vscode_mpe_version: extensionVersion,
          });
        }
      });
  }

  private refreshAllPreviews() {
    // clear caches
    for (const key in this.engineMaps) {
      if (this.engineMaps.hasOwnProperty(key)) {
        const engine = this.engineMaps[key];
        if (engine) {
          // No need to resetConfig.
          // Otherwiser when user change settings like `previewTheme`, the preview won't change immediately.
          // engine.resetConfig();
          engine.clearCaches();
        }
      }
    }

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
   * modify markdown source, append `result` after corresponding code chunk.
   * @param codeChunkData
   * @param result
   * @param filePath
   */
  private async modifySource(
    codeChunkData: mume.CodeChunkData,
    result: string,
    filePath: string,
  ): Promise<string> {
    function insertResult(i: number, editor: TextEditor) {
      const lineCount = editor.document.lineCount;
      let start = 0;
      // find <!-- code_chunk_output -->
      for (let j = i + 1; j < i + 6 && j < lineCount; j++) {
        if (
          editor.document
            .lineAt(j)
            .text.startsWith("<!-- code_chunk_output -->")
        ) {
          start = j;
          break;
        }
      }
      if (start) {
        // found
        // TODO: modify exited output
        let end = start + 1;
        while (end < lineCount) {
          if (
            editor.document
              .lineAt(end)
              .text.startsWith("<!-- /code_chunk_output -->")
          ) {
            break;
          }
          end += 1;
        }

        // if output not changed, then no need to modify editor buffer
        let r = "";
        for (let i2 = start + 2; i2 < end - 1; i2++) {
          r += editor.document.lineAt(i2).text + "\n";
        }
        if (r === result + "\n") {
          return "";
        } // no need to modify output

        editor.edit((edit) => {
          edit.replace(
            new vscode.Range(
              new vscode.Position(start + 2, 0),
              new vscode.Position(end - 1, 0),
            ),
            result + "\n",
          );
        });
        return "";
      } else {
        editor.edit((edit) => {
          edit.insert(
            new vscode.Position(i + 1, 0),
            `\n<!-- code_chunk_output -->\n\n${result}\n\n<!-- /code_chunk_output -->\n`,
          );
        });
        return "";
      }
    }

    const visibleTextEditors = vscode.window.visibleTextEditors;
    for (let i = 0; i < visibleTextEditors.length; i++) {
      const editor = visibleTextEditors[i];
      if (this.formatPathIfNecessary(editor.document.uri.fsPath) === filePath) {
        let codeChunkOffset = 0;
        const targetCodeChunkOffset =
          codeChunkData.normalizedInfo.attributes["code_chunk_offset"];

        const lineCount = editor.document.lineCount;
        for (let i2 = 0; i2 < lineCount; i2++) {
          const line = editor.document.lineAt(i2);
          if (line.text.match(/^```(.+)\"?cmd\"?\s*[=\s}]/)) {
            if (codeChunkOffset === targetCodeChunkOffset) {
              i2 = i2 + 1;
              while (i2 < lineCount) {
                if (editor.document.lineAt(i2).text.match(/^\`\`\`\s*/)) {
                  break;
                }
                i2 += 1;
              }
              return insertResult(i2, editor);
            } else {
              codeChunkOffset++;
            }
          } else if (line.text.match(/\@import\s+(.+)\"?cmd\"?\s*[=\s}]/)) {
            if (codeChunkOffset === targetCodeChunkOffset) {
              return insertResult(i2, editor);
            } else {
              codeChunkOffset++;
            }
          }
        }
        break;
      }
    }
    return "";
  }

  /**
   * return markdown engine of sourceUri
   * @param sourceUri
   */
  public getEngine(sourceUri: Uri): MarkdownEngine {
    return this.engineMaps[sourceUri.fsPath];
  }

  /**
   * return markdown preview of sourceUri
   * @param sourceUri
   */
  public getPreview(sourceUri: Uri): vscode.WebviewPanel {
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
      return (this.previewMaps = {});
    } else {
      const previewPanel = this.getPreview(sourceUri);
      if (previewPanel) {
        this.preview2EditorMap.delete(previewPanel);
        delete this.previewMaps[sourceUri.fsPath];
      }
    }
  }

  /**
   * remove engine from this.engineMaps
   * @param sourceUri
   */
  public destroyEngine(sourceUri: Uri) {
    if (useSinglePreview()) {
      return (this.engineMaps = {});
    }
    const engine = this.getEngine(sourceUri);
    if (engine) {
      delete this.engineMaps[sourceUri.fsPath]; // destroy engine
    }
  }

  /**
   * Format pathString if it is on Windows. Convert `c:\` like string to `C:\`
   * @param pathString
   */
  private formatPathIfNecessary(pathString: string) {
    if (process.platform === "win32") {
      pathString = pathString.replace(
        /^([a-zA-Z])\:\\/,
        (_, $1) => `${$1.toUpperCase()}:\\`,
      );
    }
    return pathString;
  }

  private getProjectDirectoryPath(
    sourceUri: Uri,
    workspaceFolders: vscode.WorkspaceFolder[] = [],
  ) {
    const possibleWorkspaceFolders = workspaceFolders.filter(
      (workspaceFolder) => {
        return (
          path
            .dirname(sourceUri.path.toUpperCase())
            .indexOf(workspaceFolder.uri.path.toUpperCase()) >= 0
        );
      },
    );

    let projectDirectoryPath;
    if (possibleWorkspaceFolders.length) {
      // We pick the workspaceUri that has the longest path
      const workspaceFolder = possibleWorkspaceFolders.sort(
        (x, y) => y.uri.fsPath.length - x.uri.fsPath.length,
      )[0];
      projectDirectoryPath = workspaceFolder.uri.fsPath;
    } else {
      projectDirectoryPath = "";
    }

    return this.formatPathIfNecessary(projectDirectoryPath);
  }

  private getFilePath(sourceUri: Uri) {
    return this.formatPathIfNecessary(sourceUri.fsPath);
  }

  /**
   * Initialize MarkdownEngine for this markdown file
   */
  public initMarkdownEngine(sourceUri: Uri): MarkdownEngine {
    let engine = this.getEngine(sourceUri);
    if (!engine) {
      engine = new MarkdownEngine({
        filePath: this.getFilePath(sourceUri),
        projectDirectoryPath: this.getProjectDirectoryPath(
          sourceUri,
          vscode.workspace.workspaceFolders,
        ),
        config: this.config,
      });
      this.engineMaps[sourceUri.fsPath] = engine;
      this.jsAndCssFilesMaps[sourceUri.fsPath] = [];
    }
    return engine;
  }

  public async initPreview(sourceUri: vscode.Uri, editor: vscode.TextEditor) {
    const isUsingSinglePreview = useSinglePreview();
    let previewPanel: vscode.WebviewPanel;
    if (isUsingSinglePreview && this.singlePreviewPanel) {
      previewPanel = this.singlePreviewPanel;
      this.singlePreviewPanelSourceUriTarget = sourceUri;
    } else if (this.previewMaps[sourceUri.fsPath]) {
      previewPanel = this.previewMaps[sourceUri.fsPath];
    } else {
      const localResourceRoots = [
        vscode.Uri.file(this.context.extensionPath),
        vscode.Uri.file(mume.utility.extensionDirectoryPath),
        vscode.Uri.file(mume.utility.extensionConfigDirectoryPath),
        vscode.Uri.file(tmpdir()),
        vscode.Uri.file(
          this.getProjectDirectoryPath(
            sourceUri,
            vscode.workspace.workspaceFolders,
          ),
        ),
      ];

      previewPanel = vscode.window.createWebviewPanel(
        "markdown-preview-enhanced",
        `Preview ${path.basename(sourceUri.fsPath)}`,
        { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
        {
          enableFindWidget: true,
          localResourceRoots,
          enableScripts: true, // TODO: This might be set by enableScriptExecution config. But for now we just enable it.
        },
      );

      // register previewPanel message events
      previewPanel.webview.onDidReceiveMessage(
        (message) => {
          vscode.commands.executeCommand(
            `_mume.${message.command}`,
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
        // Hack: sometimes we only get 0. I couldn't find API to wait for editor getting loaded.
        setTimeout(() => {
          return resolve(editor.selections[0].active.line || 0);
        }, 100);
      });
    }

    const text = editor.document.getText();
    let engine = this.getEngine(sourceUri);
    if (!engine) {
      engine = this.initMarkdownEngine(sourceUri);
    }

    engine
      .generateHTMLTemplateForPreview({
        inputString: text,
        config: {
          sourceUri: sourceUri.toString(),
          initialLine,
          vscode: true,
        },
        isForVSCode: true,
        contentSecurityPolicy: "",
      })
      .then((html) => {
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
      const previewPanels = [];
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          const previewPanel = this.previewMaps[key];
          if (previewPanel) {
            previewPanels.push(previewPanel);
          }
        }
      }

      previewPanels.forEach((previewPanel) => previewPanel.dispose());
    }

    this.previewMaps = {};
    this.preview2EditorMap = new Map();
    this.engineMaps = {};
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
    if (!engine) {
      return;
    }

    const previewPanel = this.getPreview(sourceUri);
    if (!previewPanel) {
      return;
    }

    // presentation mode
    if (engine.isPreviewInPresentationMode) {
      return this.refreshPreview(sourceUri);
    }

    // not presentation mode
    vscode.workspace.openTextDocument(sourceUri).then((document) => {
      const text = document.getText();
      previewPanel.webview.postMessage({
        command: "startParsingMarkdown",
      });

      engine
        .parseMD(text, {
          isForPreview: true,
          useRelativeFilePath: false,
          hideFrontMatter: false,
          triggeredBySave,
          isForVSCodePreview: true,
        })
        .then(({ markdown, html, tocHTML, JSAndCssFiles, yamlConfig }) => {
          // check JSAndCssFiles
          if (
            JSON.stringify(JSAndCssFiles) !==
              JSON.stringify(this.jsAndCssFilesMaps[sourceUri.fsPath]) ||
            yamlConfig["isPresentationMode"]
          ) {
            this.jsAndCssFilesMaps[sourceUri.fsPath] = JSAndCssFiles;
            // restart iframe
            this.refreshPreview(sourceUri);
          } else {
            previewPanel.webview.postMessage({
              command: "updateHTML",
              html,
              tocHTML,
              totalLineCount: document.lineCount,
              sourceUri: sourceUri.toString(),
              id: yamlConfig.id || "",
              class: yamlConfig.class || "",
            });
          }
        });
    });
  }

  public refreshPreviewPanel(sourceUri: Uri) {
    this.preview2EditorMap.forEach((editor, previewPanel) => {
      if (
        previewPanel &&
        editor &&
        editor.document &&
        isMarkdownFile(editor.document) &&
        editor.document.uri &&
        editor.document.uri.fsPath === sourceUri.fsPath
      ) {
        this.initPreview(sourceUri, editor);
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
      engine.openInBrowser({}).catch((error) => {
        vscode.window.showErrorMessage(error);
      });
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
          vscode.window.showErrorMessage(error);
        });
    }
  }

  public chromeExport(sourceUri: Uri, type: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .chromeExport({ fileType: type, openFileAfterGeneration: true })
        .then((dest) => {
          vscode.window.showInformationMessage(
            `File ${path.basename(dest)} was created at path: ${dest}`,
          );
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
        });
    }
  }

  public phantomjsExport(sourceUri: Uri, type: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .phantomjsExport({ fileType: type, openFileAfterGeneration: true })
        .then((dest) => {
          if (dest.endsWith("?print-pdf")) {
            // presentation pdf
            vscode.window.showInformationMessage(
              `Please copy and open the link: { ${dest.replace(
                /\_/g,
                "\\_",
              )} } in Chrome then Print as Pdf.`,
            );
          } else {
            vscode.window.showInformationMessage(
              `File ${path.basename(dest)} was created at path: ${dest}`,
            );
          }
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
        });
    }
  }

  public princeExport(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .princeExport({ openFileAfterGeneration: true })
        .then((dest) => {
          if (dest.endsWith("?print-pdf")) {
            // presentation pdf
            vscode.window.showInformationMessage(
              `Please copy and open the link: { ${dest.replace(
                /\_/g,
                "\\_",
              )} } in Chrome then Print as Pdf.`,
            );
          } else {
            vscode.window.showInformationMessage(
              `File ${path.basename(dest)} was created at path: ${dest}`,
            );
          }
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
        });
    }
  }

  public eBookExport(sourceUri: Uri, fileType: string) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .eBookExport({ fileType, runAllCodeChunks: false })
        .then((dest) => {
          vscode.window.showInformationMessage(
            `eBook ${path.basename(dest)} was created as path: ${dest}`,
          );
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
        });
    }
  }

  public pandocExport(sourceUri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine
        .pandocExport({ openFileAfterGeneration: true })
        .then((dest) => {
          vscode.window.showInformationMessage(
            `Document ${path.basename(dest)} was created as path: ${dest}`,
          );
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
        });
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
          vscode.window.showErrorMessage(error);
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

  public updateConfiguration() {
    const newConfig = MarkdownPreviewEnhancedConfig.getCurrentConfig();
    if (!this.config.isEqualTo(newConfig)) {
      // if `singlePreview` setting is changed, close all previews.
      if (this.config.singlePreview !== newConfig.singlePreview) {
        this.closeAllPreviews(this.config.singlePreview);
        this.config = newConfig;
      } else {
        this.config = newConfig;
        for (const fsPath in this.engineMaps) {
          if (this.engineMaps.hasOwnProperty(fsPath)) {
            const engine = this.engineMaps[fsPath];
            engine.updateConfiguration(newConfig);
          }
        }

        // update all generated md documents
        this.refreshAllPreviews();
      }
    }
  }

  public openImageHelper(sourceUri: Uri) {
    if (sourceUri.scheme === "markdown-preview-enhanced") {
      return vscode.window.showWarningMessage("Please focus a markdown file.");
    } else if (!this.isPreviewOn(sourceUri)) {
      return vscode.window.showWarningMessage("Please open preview first.");
    } else {
      return this.previewPostMessage(sourceUri, {
        command: "openImageHelper",
      });
    }
  }
}

/**
 * check whehter to use only one preview or not
 */
export function useSinglePreview() {
  const config = vscode.workspace.getConfiguration("markdown-preview-enhanced");
  return config.get<boolean>("singlePreview");
}

export function getPreviewUri(uri: vscode.Uri) {
  if (uri.scheme === "markdown-preview-enhanced") {
    return uri;
  }

  let previewUri: Uri;
  if (useSinglePreview()) {
    previewUri = uri.with({
      scheme: "markdown-preview-enhanced",
      path: "single-preview.rendered",
    });
  } else {
    previewUri = uri.with({
      scheme: "markdown-preview-enhanced",
      path: uri.path + ".rendered",
      query: uri.toString(),
    });
  }
  return previewUri;
}

export function isMarkdownFile(document: vscode.TextDocument) {
  return (
    document.languageId === "markdown" &&
    document.uri.scheme !== "markdown-preview-enhanced"
  ); // prevent processing of own documents
}
