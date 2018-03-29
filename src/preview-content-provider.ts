import * as path from "path";
import * as vscode from "vscode";
import { Event, TextEditor, Uri } from "vscode";

import * as mume from "mume-with-litvis";
import { MarkdownEngine } from "mume-with-litvis";
import { MarkdownPreviewEnhancedConfig } from "./config";
import { updateLintingReport } from "./linting";

let singlePreviewSouceUri: Uri = null;

// http://www.typescriptlang.org/play/
// https://github.com/Microsoft/vscode/blob/master/extensions/markdown/media/main.js
// https://github.com/Microsoft/vscode/tree/master/extensions/markdown/src
// https://github.com/tomoki1207/gfm-preview/blob/master/src/gfmProvider.ts
// https://github.com/cbreeden/vscode-markdownit
export class MarkdownPreviewEnhancedView
  implements vscode.TextDocumentContentProvider {
  private privateOnDidChange = new vscode.EventEmitter<Uri>();
  private waiting: boolean = false;

  /**
   * The key is markdown file fsPath
   * value is MarkdownEngine
   */
  private engineMaps: { [key: string]: MarkdownEngine } = {};

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
        mume.MarkdownEngine.onUpdateLintingReport(updateLintingReport);

        const extensionVersion = require(path.resolve(
          this.context.extensionPath,
          "./package.json",
        ))["version"];
        if (extensionVersion !== mume.configs.config["vscode_mpe_version"]) {
          mume.utility.updateExtensionConfig({
            vscode_mpe_version: extensionVersion,
          });
          // openWelcomePage() // <== disable welcome page
        }
      });
  }

  private refreshAllPreviews() {
    // reset configs
    for (const key in this.engineMaps) {
      if (this.engineMaps.hasOwnProperty(key)) {
        this.engineMaps[key].resetConfig();
      }
    }

    // refresh iframes
    vscode.workspace.textDocuments.forEach((document) => {
      if (document.uri.scheme === "markdown-preview-enhanced") {
        this.privateOnDidChange.fire(document.uri);
      }
    });
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
      if (editor.document.uri.fsPath === filePath) {
        let codeChunkOffset = 0;
        const targetCodeChunkOffset =
          codeChunkData.normalizedInfo.attributes["code_chunk_offset"];

        const lineCount = editor.document.lineCount;
        for (let i2 = 0; i2 < lineCount; i2++) {
          const line = editor.document.lineAt(i2);
          if (line.text.match(/^```(.+)\"?cmd\"?\s*[:=]/)) {
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
          } else if (line.text.match(/\@import\s+(.+)\"?cmd\"?\s*[:=]/)) {
            if (codeChunkOffset === targetCodeChunkOffset) {
              // console.log('find code chunk' )
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
   * check if the markdown preview is on for the textEditor
   * @param textEditor
   */
  public isPreviewOn(sourceUri: Uri) {
    if (useSinglePreview()) {
      return Object.keys(this.engineMaps).length >= 1;
    }
    return this.getEngine(sourceUri);
  }

  /**
   * remove engine from this.engineMaps
   * @param previewUri
   */
  public destroyEngine(previewUri: Uri) {
    delete previewUri["markdown_source"];

    if (useSinglePreview()) {
      return (this.engineMaps = {});
    }
    const sourceUri = vscode.Uri.parse(previewUri.query);
    const engine = this.getEngine(sourceUri);
    if (engine) {
      // console.log('engine destroyed')
      this.engineMaps[sourceUri.fsPath] = null; // destroy engine
    }
  }

  /**
   * Initialize MarkdownEngine for this markdown file
   */
  public initMarkdownEngine(sourceUri: Uri): MarkdownEngine {
    let engine = this.getEngine(sourceUri);
    if (!engine) {
      engine = new MarkdownEngine({
        filePath: sourceUri.fsPath,
        projectDirectoryPath: vscode.workspace.rootPath,
        config: this.config,
      });
      this.engineMaps[sourceUri.fsPath] = engine;
      this.jsAndCssFilesMaps[sourceUri.fsPath] = [];
    }
    return engine;
  }

  public provideTextDocumentContent(previewUri: Uri): Thenable<string> {
    // console.log(sourceUri, uri, vscode.workspace.rootPath)

    let sourceUri: Uri;
    if (useSinglePreview()) {
      sourceUri = singlePreviewSouceUri;
    } else {
      sourceUri = vscode.Uri.parse(previewUri.query);
    }

    // console.log('open preview for source: ' + sourceUri.toString())

    let initialLine: number | undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.fsPath === sourceUri.fsPath) {
      initialLine = editor.selection.active.line;
    }

    return vscode.workspace.openTextDocument(sourceUri).then((document) => {
      const text = document.getText();
      let engine = this.getEngine(sourceUri);
      if (!engine) {
        engine = this.initMarkdownEngine(sourceUri);
      }

      return engine.generateHTMLTemplateForPreview({
        inputString: text,
        config: {
          previewUri: encodeURIComponent(previewUri.toString()),
          sourceUri: encodeURIComponent(sourceUri.toString()),
          initialLine,
          vscode: true,
        },
        // webviewScript: path.resolve(this.context.extensionPath, './out/src/webview.js') // use default webview.ts in mume
      });
    });
  }

  public updateMarkdown(sourceUri: Uri, triggeredBySave?: boolean) {
    const engine = this.getEngine(sourceUri);
    if (!engine) {
      return;
    }

    // presentation mode
    if (engine.isPreviewInPresentationMode) {
      return this.privateOnDidChange.fire(getPreviewUri(sourceUri));
    }

    // not presentation mode
    vscode.workspace.openTextDocument(sourceUri).then((document) => {
      const text = document.getText();

      vscode.commands.executeCommand(
        "_workbench.htmlPreview.postMessage",
        getPreviewUri(sourceUri),
        {
          command: "startParsingMarkdown",
        },
      );

      engine
        .parseMD(text, {
          isForPreview: true,
          useRelativeFilePath: false,
          hideFrontMatter: false,
          triggeredBySave,
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
            this.privateOnDidChange.fire(getPreviewUri(sourceUri));
          } else {
            vscode.commands.executeCommand(
              "_workbench.htmlPreview.postMessage",
              getPreviewUri(sourceUri),
              {
                command: "updateHTML",
                html,
                tocHTML,
                totalLineCount: document.lineCount,
                sourceUri: encodeURIComponent(sourceUri.toString()),
                id: yamlConfig.id || "",
                class: yamlConfig.class || "",
              },
            );
          }
        });
    });
  }

  public refreshPreview(sourceUri: Uri) {
    const engine = this.getEngine(sourceUri);
    if (engine) {
      engine.clearCaches();
      // restart iframe
      this.privateOnDidChange.fire(getPreviewUri(sourceUri));
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
      engine.runAllCodeChunks().then(() => {
        this.updateMarkdown(sourceUri);
      });
    }
  }

  get onDidChange(): Event<Uri> {
    return this.privateOnDidChange.event;
  }

  public update(sourceUri: Uri) {
    if (!this.config.liveUpdate) {
      return;
    }

    // console.log('update')
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
      this.config = newConfig;

      for (const fsPath in this.engineMaps) {
        if (this.engineMaps.hasOwnProperty(fsPath)) {
          const engine = this.engineMaps[fsPath];
          engine.updateConfiguration(newConfig);
        }
      }

      // update all generated md documents
      vscode.workspace.textDocuments.forEach((document) => {
        if (document.uri.scheme === "markdown-preview-enhanced") {
          // this.update(document.uri);
          this.privateOnDidChange.fire(document.uri);
        }
      });
    }
  }

  public openImageHelper(sourceUri: Uri) {
    if (sourceUri.scheme === "markdown-preview-enhanced") {
      return vscode.window.showWarningMessage("Please focus a markdown file.");
    } else if (!this.isPreviewOn(sourceUri)) {
      return vscode.window.showWarningMessage("Please open preview first.");
    } else {
      vscode.commands.executeCommand(
        "_workbench.htmlPreview.postMessage",
        getPreviewUri(sourceUri),
        {
          command: "openImageHelper",
        },
      );
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
    singlePreviewSouceUri = uri;
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

export function openWelcomePage() {
  const welcomeFilePath = mume.utility
    .addFileProtocol(path.resolve(__dirname, "../../docs/welcome.md"))
    .replace(/\\/g, "/");
  const uri = vscode.Uri.parse(welcomeFilePath);
  vscode.commands.executeCommand("vscode.open", uri).then(() => {
    vscode.commands.executeCommand(
      "markdown-preview-enhanced-with-litvis.openPreview",
      uri,
    );
  });
}
