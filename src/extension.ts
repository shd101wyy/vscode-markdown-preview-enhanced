// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as path from "path";
import * as vscode from "vscode";

import { utility } from "@shd101wyy/mume";

import { pasteImageFile, uploadImageFile } from "./image-helper";
import {
  getPreviewUri,
  isMarkdownFile,
  MarkdownPreviewEnhancedView,
  useSinglePreview,
} from "./preview-content-provider";

// this method is called when your extension iopenTextDocuments activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // assume only one preview supported.

  const contentProvider = new MarkdownPreviewEnhancedView(context);
  const contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider(
    "markdown-preview-enhanced",
    contentProvider,
  );

  function openPreview(uri?: vscode.Uri) {
    let resource = uri;
    if (!(resource instanceof vscode.Uri)) {
      if (vscode.window.activeTextEditor) {
        // we are relaxed and don't check for markdown files
        resource = vscode.window.activeTextEditor.document.uri;
      }
    }

    /*
		if (!(resource instanceof vscode.Uri)) {
			if (!vscode.window.activeTextEditor) {
				// this is most likely toggling the preview
				return vscode.commands.executeCommand('markdown.showSource');
			}
			// nothing found that could be shown or toggled
			return;
		}
		*/

    /*
		if (contentProvider.isPreviewOn(vscode.window.activeTextEditor)) {
			// return vscode.commands.executeCommand('workbench.action.closeActiveEditor', markdownURI)
		} else {

		}
		*/
    const previewUri = getPreviewUri(resource);
    return vscode.commands
      .executeCommand(
        "vscode.previewHtml",
        previewUri,
        vscode.ViewColumn.Two,
        useSinglePreview()
          ? "MPE Preview"
          : `Preview '${path.basename(resource.fsPath)}'`,
      )
      .then(
        (success) => {
          // contentProvider.update(previewUri)
          // the line above is changed to webviewFinishLoading function.
        },
        (reason) => {
          vscode.window.showErrorMessage(reason);
        },
      );
  }

  function toggleScrollSync() {
    const config = vscode.workspace.getConfiguration(
      "markdown-preview-enhanced",
    );
    const scrollSync = !config.get<boolean>("scrollSync");
    config.update("scrollSync", scrollSync, true).then(() => {
      contentProvider.updateConfiguration();
      if (scrollSync) {
        vscode.window.showInformationMessage("Scroll Sync is enabled");
      } else {
        vscode.window.showInformationMessage("Scroll Sync is disabled");
      }
    });
  }

  function toggleLiveUpdate() {
    const config = vscode.workspace.getConfiguration(
      "markdown-preview-enhanced",
    );
    const liveUpdate = !config.get<boolean>("liveUpdate");
    config.update("liveUpdate", liveUpdate, true).then(() => {
      contentProvider.updateConfiguration();
      if (liveUpdate) {
        vscode.window.showInformationMessage("Live Update is enabled");
      } else {
        vscode.window.showInformationMessage("Live Update is disabled");
      }
    });
  }

  function toggleBreakOnSingleNewLine() {
    const config = vscode.workspace.getConfiguration(
      "markdown-preview-enhanced",
    );
    const breakOnSingleNewLine = !config.get<boolean>("breakOnSingleNewLine");
    config
      .update("breakOnSingleNewLine", breakOnSingleNewLine, true)
      .then(() => {
        contentProvider.updateConfiguration();
        if (breakOnSingleNewLine) {
          vscode.window.showInformationMessage(
            "Break On Single New Line is enabled",
          );
        } else {
          vscode.window.showInformationMessage(
            "Break On Single New Line is disabled",
          );
        }
      });
  }

  function customizeCSS() {
    const globalStyleLessFile = utility.addFileProtocol(
      path.resolve(utility.extensionConfigDirectoryPath, "./style.less"),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(globalStyleLessFile),
    );
  }

  function openMermaidConfig() {
    const mermaidConfigFilePath = utility.addFileProtocol(
      path.resolve(utility.extensionConfigDirectoryPath, "./mermaid_config.js"),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(mermaidConfigFilePath),
    );
  }

  function openMathJaxConfig() {
    const mathjaxConfigFilePath = utility.addFileProtocol(
      path.resolve(utility.extensionConfigDirectoryPath, "./mathjax_config.js"),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(mathjaxConfigFilePath),
    );
  }

  function openPhantomJSConfig() {
    const phantomjsConfigFilePath = utility.addFileProtocol(
      path.resolve(
        utility.extensionConfigDirectoryPath,
        "./phantomjs_config.js",
      ),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(phantomjsConfigFilePath),
    );
  }

  function extendParser() {
    const parserConfigPath = utility.addFileProtocol(
      path.resolve(utility.extensionConfigDirectoryPath, "./parser.js"),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(parserConfigPath),
    );
  }

  function showUploadedImages() {
    const imageHistoryFilePath = utility.addFileProtocol(
      path.resolve(utility.extensionConfigDirectoryPath, "./image_history.md"),
    );
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(imageHistoryFilePath),
    );
  }

  function insertNewSlide() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(editor.selection.active, "<!-- slide -->\n");
      });
    }
  }

  function insertPagebreak() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(editor.selection.active, "<!-- pagebreak -->\n");
      });
    }
  }

  function createTOC() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(
          editor.selection.active,
          '\n<!-- @import "[TOC]" {cmd="toc" depthFrom=1 depthTo=6 orderedList=false} -->\n',
        );
      });
    }
  }

  function insertTable() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(
          editor.selection.active,
          `|   |   |
|---|---|
|   |   |
`,
        );
      });
    }
  }

  function openImageHelper() {
    contentProvider.openImageHelper(
      vscode.window.activeTextEditor.document.uri,
    );
  }

  function webviewFinishLoading(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.updateMarkdown(sourceUri);
  }

  /**
   * Insert imageUrl to markdown file
   * @param uri: markdown source uri
   * @param imageUrl: url of image to be inserted
   */
  function insertImageUrl(uri, imageUrl) {
    const sourceUri = vscode.Uri.parse(uri);

    vscode.window.visibleTextEditors
      .filter(
        (editor) =>
          isMarkdownFile(editor.document) &&
          editor.document.uri.fsPath === sourceUri.fsPath,
      )
      .forEach((editor) => {
        // const line = editor.selection.active.line
        editor.edit((textEditorEdit) => {
          textEditorEdit.insert(
            editor.selection.active,
            `![enter image description here](${imageUrl})`,
          );
        });
      });
  }

  function refreshPreview(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.refreshPreview(sourceUri);
  }

  function openInBrowser(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.openInBrowser(sourceUri);
  }

  function htmlExport(uri, offline) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.htmlExport(sourceUri, offline);
  }

  function chromeExport(uri, type) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.chromeExport(sourceUri, type);
  }

  function phantomjsExport(uri, type) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.phantomjsExport(sourceUri, type);
  }

  function princeExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.princeExport(sourceUri);
  }

  function eBookExport(uri, fileType) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.eBookExport(sourceUri, fileType);
  }

  function pandocExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.pandocExport(sourceUri);
  }

  function markdownExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.markdownExport(sourceUri);
  }

  /*
	function cacheSVG(uri, code, svg) {
		const sourceUri = vscode.Uri.parse(uri);
		contentProvider.cacheSVG(sourceUri, code, svg)
	}
	*/

  function cacheCodeChunkResult(uri, id, result) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.cacheCodeChunkResult(sourceUri, id, result);
  }

  function runCodeChunk(uri, codeChunkId) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.runCodeChunk(sourceUri, codeChunkId);
  }

  function runAllCodeChunks(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.runAllCodeChunks(sourceUri);
  }

  function runAllCodeChunksCommand() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const previewUri = getPreviewUri(textEditor.document.uri);
    if (!previewUri) {
      return;
    }

    vscode.commands.executeCommand(
      "_workbench.htmlPreview.postMessage",
      previewUri,
      {
        command: "runAllCodeChunks",
      },
    );
  }

  function runCodeChunkCommand() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const previewUri = getPreviewUri(textEditor.document.uri);
    if (!previewUri) {
      return;
    }

    vscode.commands.executeCommand(
      "_workbench.htmlPreview.postMessage",
      previewUri,
      {
        command: "runCodeChunk",
      },
    );
  }

  function syncPreview() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const previewUri = getPreviewUri(textEditor.document.uri);
    if (!previewUri) {
      return;
    }

    vscode.commands.executeCommand(
      "_workbench.htmlPreview.postMessage",
      previewUri,
      {
        command: "changeTextEditorSelection",
        line: textEditor.selections[0].active.line,
        forced: true,
      },
    );
  }

  function clickTagA(uri, href) {
    href = decodeURIComponent(href);
    if (
      [".pdf", ".xls", ".xlsx", ".doc", ".ppt", ".docx", ".pptx"].indexOf(
        path.extname(href),
      ) >= 0
    ) {
      utility.openFile(href);
    } else if (href.match(/^file\:\/\/\//)) {
      // openFilePath = href.slice(8) # remove protocol
      let openFilePath = utility.addFileProtocol(
        href.replace(/(\s*)[\#\?](.+)$/, ""),
      ); // remove #anchor and ?params...
      openFilePath = decodeURI(openFilePath);
      vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(openFilePath),
        vscode.ViewColumn.One,
      );
    } else {
      utility.openFile(href);
    }
  }

  function clickTaskListCheckbox(uri, dataLine) {
    const sourceUri = vscode.Uri.parse(uri);
    const visibleTextEditors = vscode.window.visibleTextEditors;
    for (let i = 0; i < visibleTextEditors.length; i++) {
      const editor = visibleTextEditors[i];
      if (editor.document.uri.fsPath === sourceUri.fsPath) {
        dataLine = parseInt(dataLine, 10);
        editor.edit((edit) => {
          let line = editor.document.lineAt(dataLine).text;
          if (line.match(/\[ \]/)) {
            line = line.replace("[ ]", "[x]");
          } else {
            line = line.replace(/\[[xX]\]/, "[ ]");
          }
          edit.replace(
            new vscode.Range(
              new vscode.Position(dataLine, 0),
              new vscode.Position(dataLine, line.length),
            ),
            line,
          );
        });
        break;
      }
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isMarkdownFile(document)) {
        // contentProvider.update(document.uri, true);
        contentProvider.updateMarkdown(document.uri, true);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isMarkdownFile(event.document)) {
        contentProvider.update(event.document.uri);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(() => {
      contentProvider.updateConfiguration();
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (isMarkdownFile(event.textEditor.document)) {
        const previewUri = getPreviewUri(event.textEditor.document.uri);
        vscode.commands.executeCommand(
          "_workbench.htmlPreview.postMessage",
          previewUri,
          {
            command: "changeTextEditorSelection",
            line: event.selections[0].active.line,
          },
        );
      }
    }),
  );

  if (vscode.window["onDidChangeTextEditorVisibleRanges"]) {
    context.subscriptions.push(
      // I don't know why it doesn't exist in the newest @types/vscode
      // But I see the official vscode markdown-preview extension uses it.
      vscode.window["onDidChangeTextEditorVisibleRanges"]((event)=> {
        const textEditor = event.textEditor as vscode.TextEditor;
        if (isMarkdownFile(textEditor.document)) {
          const previewUri = getPreviewUri(textEditor.document.uri);
          if (previewUri) {
            if (!event.textEditor["visibleRanges"].length) {
              return undefined;
            } else {
              const topLine = getTopVisibleLine(textEditor)
              const bottomLine = getBottomVisibleLine(textEditor)
              let midLine;
              if (topLine === 0) {
                midLine = 0
              } else if (bottomLine === textEditor.document.lineCount - 1) {
                midLine = bottomLine
              } else {
                midLine = Math.floor((topLine + bottomLine) / 2);
              }
              vscode.commands.executeCommand(
                "_workbench.htmlPreview.postMessage",
                previewUri,
                {
                  command: "changeTextEditorSelection",
                  line: midLine
                },
              );
            }
          }
        }
      })
    )
  }

  /**
   * Open preview automatically if the `automaticallyShowPreviewOfMarkdownBeingEdited` is on.
   * @param textEditor
   */
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((textEditor) => {
      if (textEditor && textEditor.document && textEditor.document.uri) {
        // console.log('onDidChangeActiveTextEditor', textEditor.document.uri)
        if (isMarkdownFile(textEditor.document)) {
          const sourceUri = textEditor.document.uri;
          /**
           * Is using single preview and the preview is on.
           * When we switched text editor, update preview to that text editor.
           */
          if (useSinglePreview() && contentProvider.isPreviewOn(sourceUri)) {
            contentProvider.initMarkdownEngine(sourceUri);
            contentProvider.updateMarkdown(sourceUri);
          }
        }
      } else {
        // console.log('onDidChangeActiveTextEditor', ' preview', textEditor)
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((textDocument) => {
      // console.log('onDidCloseTextDocument', textDocument.uri)
      if (
        textDocument &&
        textDocument.uri.scheme === "markdown-preview-enhanced"
      ) {
        contentProvider.destroyEngine(textDocument.uri);
      }
    }),
  );

  /*
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((textDocument)=> {
		// console.log('onDidOpenTextDocument', textDocument.uri)
	}))
	*/

  /*
	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(textEditors=> {
		// console.log('onDidChangeonDidChangeVisibleTextEditors ', textEditors)
	}))
	*/

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.openPreview",
      openPreview,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.toggleScrollSync",
      toggleScrollSync,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.toggleLiveUpdate",
      toggleLiveUpdate,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.toggleBreakOnSingleNewLine",
      toggleBreakOnSingleNewLine,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.openImageHelper",
      openImageHelper,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.runAllCodeChunks",
      runAllCodeChunksCommand,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.runCodeChunk",
      runCodeChunkCommand,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.syncPreview",
      syncPreview,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.customizeCss",
      customizeCSS,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.openMermaidConfig",
      openMermaidConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.openMathJaxConfig",
      openMathJaxConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.openPhantomJSConfig",
      openPhantomJSConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.extendParser",
      extendParser,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.showUploadedImages",
      showUploadedImages,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.insertNewSlide",
      insertNewSlide,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.insertTable",
      insertTable,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.insertPagebreak",
      insertPagebreak,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-preview-enhanced.createTOC",
      createTOC,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.revealLine", revealLine),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.insertImageUrl", insertImageUrl),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.pasteImageFile", pasteImageFile),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.uploadImageFile", uploadImageFile),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.refreshPreview", refreshPreview),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.openInBrowser", openInBrowser),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.htmlExport", htmlExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.chromeExport", chromeExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.phantomjsExport", phantomjsExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.princeExport", princeExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.eBookExport", eBookExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.pandocExport", pandocExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.markdownExport", markdownExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "_mume.webviewFinishLoading",
      webviewFinishLoading,
    ),
  );

  // context.subscriptions.push(vscode.commands.registerCommand('_mume.cacheSVG', cacheSVG))

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "_mume.cacheCodeChunkResult",
      cacheCodeChunkResult,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.runCodeChunk", runCodeChunk),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.runAllCodeChunks", runAllCodeChunks),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("_mume.clickTagA", clickTagA),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "_mume.clickTaskListCheckbox",
      clickTaskListCheckbox,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "_mume.showUploadedImageHistory",
      showUploadedImages,
    ),
  );

  context.subscriptions.push(contentProviderRegistration);
}

function revealLine(uri, line) {
  const sourceUri = vscode.Uri.parse(uri);

  vscode.window.visibleTextEditors
    .filter(
      (editor) =>
        isMarkdownFile(editor.document) &&
        editor.document.uri.fsPath === sourceUri.fsPath,
    )
    .forEach((editor) => {
      const sourceLine = Math.min(
        Math.floor(line),
        editor.document.lineCount - 1,
      );
      const fraction = line - sourceLine;
      const text = editor.document.lineAt(sourceLine).text;
      const start = Math.floor(fraction * text.length);
      editor.revealRange(
        new vscode.Range(sourceLine, start, sourceLine + 1, 0),
        vscode.TextEditorRevealType.InCenter,
      );
    });
}

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getTopVisibleLine(
	editor: vscode.TextEditor
): number | undefined {
	if (!editor["visibleRanges"].length) {
		return undefined;
	}

	const firstVisiblePosition = editor["visibleRanges"][0].start;
	const lineNumber = firstVisiblePosition.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = firstVisiblePosition.character / (line.text.length + 2);
	return lineNumber + progress;
}

/**
 * Get the bottom-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getBottomVisibleLine(
	editor: vscode.TextEditor
): number | undefined {
	if (!editor["visibleRanges"].length) {
		return undefined;
	}

	const firstVisiblePosition = editor["visibleRanges"][0].end;
	const lineNumber = firstVisiblePosition.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = firstVisiblePosition.character / (line.text.length + 2);
	return lineNumber + progress;
}



// this method is called when your extension is deactivated
export function deactivate() {
  //
}
