// For both node.js and browser environments
import { utility } from 'crossnote';
import * as vscode from 'vscode';
import { PreviewColorScheme } from './config';
import { pasteImageFile, uploadImageFile } from './image-helper';
import {
  PreviewProvider,
  getAllPreviewProviders,
  getPreviewUri,
} from './preview-provider';
import {
  getBottomVisibleLine,
  getProjectDirectoryPath,
  getTopVisibleLine,
  isMarkdownFile,
} from './utils';
import path = require('path');

let editorScrollDelay = Date.now();

export function initExtensionCommon(context: vscode.ExtensionContext) {
  function getCurrentWorkingDirectory() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      return getProjectDirectoryPath(activeEditor.document.uri);
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      const workspaceFolderUri = workspaceFolders[0]?.uri;
      return getProjectDirectoryPath(workspaceFolderUri);
    }
  }

  async function getPreviewContentProvider(uri: vscode.Uri) {
    return await PreviewProvider.getPreviewContentProvider(uri, context);
  }

  async function openPreviewToTheSide(uri?: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!uri) {
      uri = editor.document.uri;
    }

    const previewProvider = await getPreviewContentProvider(uri);
    previewProvider.initPreview(uri, editor, {
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: true,
    });
  }

  async function openPreview(uri?: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!uri) {
      uri = editor.document.uri;
    }

    const previewProvider = await getPreviewContentProvider(uri);
    previewProvider.initPreview(uri, editor, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    });
  }

  function toggleScrollSync() {
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    const scrollSync = !config.get<boolean>('scrollSync');
    config.update('scrollSync', scrollSync, true).then(() => {
      const providers = getAllPreviewProviders();
      providers.forEach(provider => {
        provider.updateConfiguration();
      });
      if (scrollSync) {
        vscode.window.showInformationMessage('Scroll Sync is enabled');
      } else {
        vscode.window.showInformationMessage('Scroll Sync is disabled');
      }
    });
  }

  function toggleLiveUpdate() {
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    const liveUpdate = !config.get<boolean>('liveUpdate');
    config.update('liveUpdate', liveUpdate, true).then(() => {
      const providers = getAllPreviewProviders();
      providers.forEach(provider => {
        provider.updateConfiguration();
      });
      if (liveUpdate) {
        vscode.window.showInformationMessage('Live Update is enabled');
      } else {
        vscode.window.showInformationMessage('Live Update is disabled');
      }
    });
  }

  function toggleBreakOnSingleNewLine() {
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    const breakOnSingleNewLine = !config.get<boolean>('breakOnSingleNewLine');
    config
      .update('breakOnSingleNewLine', breakOnSingleNewLine, true)
      .then(() => {
        const providers = getAllPreviewProviders();
        providers.forEach(provider => {
          provider.updateConfiguration();
        });
        if (breakOnSingleNewLine) {
          vscode.window.showInformationMessage(
            'Break On Single New Line is enabled',
          );
        } else {
          vscode.window.showInformationMessage(
            'Break On Single New Line is disabled',
          );
        }
      });
  }

  function insertNewSlide() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit(textEdit => {
        textEdit.insert(editor.selection.active, '<!-- slide -->\n');
      });
    }
  }

  function insertPagebreak() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit(textEdit => {
        textEdit.insert(editor.selection.active, '<!-- pagebreak -->\n');
      });
    }
  }

  function createTOC() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit(textEdit => {
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
      editor.edit(textEdit => {
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

  async function openImageHelper() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const uri = editor.document.uri;
    const previewProvider = await getPreviewContentProvider(uri);
    previewProvider.openImageHelper(uri);
  }

  async function webviewFinishLoading(
    uri: string,
    {
      systemColorScheme,
    }: {
      systemColorScheme: 'light' | 'dark';
    },
  ) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.setSystemColorScheme(systemColorScheme);
    previewProvider.updateMarkdown(sourceUri);
  }

  /**
   * Insert imageUrl to markdown file
   * @param uri: markdown source uri
   * @param imageUrl: url of image to be inserted
   */
  function insertImageUrl(uri: string, imageUrl: string) {
    const sourceUri = vscode.Uri.parse(uri);
    vscode.window.visibleTextEditors
      .filter(
        editor =>
          isMarkdownFile(editor.document) &&
          editor.document.uri.fsPath === sourceUri.fsPath,
      )
      .forEach(editor => {
        // const line = editor.selection.active.line
        editor.edit(textEditorEdit => {
          textEditorEdit.insert(
            editor.selection.active,
            `![enter image description here](${imageUrl})`,
          );
        });
      });
  }

  async function refreshPreview(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.refreshPreview(sourceUri);
  }

  async function openInBrowser(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.openInBrowser(sourceUri);
  }

  async function htmlExport(uri, offline) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.htmlExport(sourceUri, offline);
  }

  async function chromeExport(uri, type) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.chromeExport(sourceUri, type);
  }

  async function princeExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.princeExport(sourceUri);
  }

  async function eBookExport(uri, fileType) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.eBookExport(sourceUri, fileType);
  }

  async function pandocExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.pandocExport(sourceUri);
  }

  async function markdownExport(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.markdownExport(sourceUri);
  }

  /*
	function cacheSVG(uri, code, svg) {
		const sourceUri = vscode.Uri.parse(uri);
		contentProvider.cacheSVG(sourceUri, code, svg)
	}
	*/

  async function cacheCodeChunkResult(uri, id, result) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.cacheCodeChunkResult(sourceUri, id, result);
  }

  async function runCodeChunk(uri, codeChunkId) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.runCodeChunk(sourceUri, codeChunkId);
  }

  async function runAllCodeChunks(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.runAllCodeChunks(sourceUri);
  }

  async function runAllCodeChunksCommand() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor?.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const sourceUri = textEditor.document.uri;
    const previewUri = getPreviewUri(sourceUri);
    if (!previewUri) {
      return;
    }

    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.previewPostMessage(sourceUri, {
      command: 'runAllCodeChunks',
    });
  }

  async function runCodeChunkCommand() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor?.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const sourceUri = textEditor.document.uri;
    const previewUri = getPreviewUri(sourceUri);
    if (!previewUri) {
      return;
    }
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.previewPostMessage(sourceUri, {
      command: 'runCodeChunk',
    });
  }

  async function syncPreview() {
    const textEditor = vscode.window.activeTextEditor;
    if (!textEditor?.document) {
      return;
    }
    if (!isMarkdownFile(textEditor.document)) {
      return;
    }

    const sourceUri = textEditor.document.uri;
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.previewPostMessage(sourceUri, {
      command: 'changeTextEditorSelection',
      line: textEditor.selections[0].active.line,
      forced: true,
    });
  }

  function clickTaskListCheckbox(uri, dataLine) {
    const sourceUri = vscode.Uri.parse(uri);
    const visibleTextEditors = vscode.window.visibleTextEditors;
    for (let i = 0; i < visibleTextEditors.length; i++) {
      const editor = visibleTextEditors[i];
      if (editor.document.uri.fsPath === sourceUri.fsPath) {
        dataLine = parseInt(dataLine, 10);
        editor.edit(edit => {
          let line = editor.document.lineAt(dataLine).text;
          if (line.match(/\[ \]/)) {
            line = line.replace('[ ]', '[x]');
          } else {
            line = line.replace(/\[[xX]\]/, '[ ]');
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

  function setPreviewTheme(uri, theme) {
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    config.update('previewTheme', theme, true);
  }

  function customizeCSSInWorkspace() {
    const styleLessFile = utility.addFileProtocol(
      path.resolve(getCurrentWorkingDirectory(), './.crossnote/style.less'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(styleLessFile),
    );
  }

  function openMermaidConfigInWorkspace() {
    const mermaidConfigFilePath = utility.addFileProtocol(
      path.resolve(getCurrentWorkingDirectory(), './.crossnote/mermaid.json'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(mermaidConfigFilePath),
    );
  }

  function openMathJaxConfigInWorkspace() {
    const mathjaxConfigFilePath = utility.addFileProtocol(
      path.resolve(
        getCurrentWorkingDirectory(),
        './.crossnote/mathjax_v3.json',
      ),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(mathjaxConfigFilePath),
    );
  }

  function openKaTeXConfigInWorkspace() {
    const katexConfigFilePath = utility.addFileProtocol(
      path.resolve(getCurrentWorkingDirectory(), './.crossnote/katex.json'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(katexConfigFilePath),
    );
  }

  function extendParserInWorkspace() {
    const parserConfigPath = utility.addFileProtocol(
      path.resolve(getCurrentWorkingDirectory(), './.crossnote/parser.mjs'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(parserConfigPath),
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (isMarkdownFile(document)) {
        const previewProvider = await getPreviewContentProvider(document.uri);
        previewProvider.updateMarkdown(document.uri, true);
      } else {
        // Check if there is change under `${workspaceDir}/.crossnote` directory
        // and the filename is in one of below
        // - style.less
        // - mermaid.json
        // - mathjax_v3.json
        // - katex.json
        // - parser.mjs
        // If so, refresh the preview of the workspace.
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          document.uri,
        );
        if (workspaceFolder) {
          const workspaceDir = workspaceFolder.uri.fsPath;
          const relativePath = path.relative(workspaceDir, document.uri.fsPath);
          if (
            relativePath.startsWith('.crossnote') &&
            [
              'style.less',
              'mermaid.json',
              'mathjax_v3.json',
              'katex.json',
              'parser.mjs',
            ].includes(path.basename(relativePath))
          ) {
            const provider = await getPreviewContentProvider(document.uri);
            await provider.updateCrossnoteConfig(
              path.join(workspaceDir, '.crossnote'),
            );
            provider.refreshAllPreviews();
          }
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async event => {
      if (isMarkdownFile(event.document)) {
        const previewProvider = await getPreviewContentProvider(
          event.document.uri,
        );
        previewProvider.update(event.document.uri);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(() => {
      const providers = getAllPreviewProviders();
      providers.forEach(provider => {
        provider.updateConfiguration();
      });
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async event => {
      if (isMarkdownFile(event.textEditor.document)) {
        const firstVisibleScreenRow = getTopVisibleLine(event.textEditor);
        const lastVisibleScreenRow = getBottomVisibleLine(event.textEditor);

        if (
          typeof firstVisibleScreenRow === 'undefined' ||
          typeof lastVisibleScreenRow === 'undefined'
        ) {
          return;
        }

        const topRatio =
          (event.selections[0].active.line - firstVisibleScreenRow) /
          (lastVisibleScreenRow - firstVisibleScreenRow);

        const previewProvider = await getPreviewContentProvider(
          event.textEditor.document.uri,
        );
        previewProvider.previewPostMessage(event.textEditor.document.uri, {
          command: 'changeTextEditorSelection',
          line: event.selections[0].active.line,
          topRatio,
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges(async event => {
      const textEditor = event.textEditor as vscode.TextEditor;
      if (Date.now() < editorScrollDelay) {
        return;
      }
      if (isMarkdownFile(textEditor.document)) {
        const sourceUri = textEditor.document.uri;
        if (!event.textEditor.visibleRanges.length) {
          return undefined;
        } else {
          const topLine = getTopVisibleLine(textEditor);
          const bottomLine = getBottomVisibleLine(textEditor);

          if (
            typeof topLine === 'undefined' ||
            typeof bottomLine === 'undefined'
          ) {
            return;
          }

          let midLine;
          if (topLine === 0) {
            midLine = 0;
          } else if (
            Math.floor(bottomLine) ===
            textEditor.document.lineCount - 1
          ) {
            midLine = bottomLine;
          } else {
            midLine = Math.floor((topLine + bottomLine) / 2);
          }
          const previewProvider = await getPreviewContentProvider(sourceUri);
          previewProvider.previewPostMessage(sourceUri, {
            command: 'changeTextEditorSelection',
            line: midLine,
          });
        }
      }
    }),
  );

  /**
   * Open preview automatically if the `automaticallyShowPreviewOfMarkdownBeingEdited` is on.
   * @param textEditor
   */
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async textEditor => {
      if (textEditor && textEditor.document && textEditor.document.uri) {
        if (isMarkdownFile(textEditor.document)) {
          const config = vscode.workspace.getConfiguration(
            'markdown-preview-enhanced',
          );
          const sourceUri = textEditor.document.uri;
          const automaticallyShowPreviewOfMarkdownBeingEdited = config.get<
            boolean
          >('automaticallyShowPreviewOfMarkdownBeingEdited');
          const isUsingSinglePreview = config.get<boolean>('singlePreview');
          /**
           * Is using single preview and the preview is on.
           * When we switched text ed()tor, update preview to that text editor.
           */
          const previewProvider = await getPreviewContentProvider(sourceUri);
          if (previewProvider.isPreviewOn(sourceUri)) {
            if (
              isUsingSinglePreview &&
              !previewProvider.previewHasTheSameSingleSourceUri(sourceUri)
            ) {
              previewProvider.initPreview(sourceUri, textEditor, {
                viewColumn:
                  previewProvider.getPreview(sourceUri)?.viewColumn ??
                  vscode.ViewColumn.One,
                preserveFocus: true,
              });
            } else if (!isUsingSinglePreview) {
              const previewPanel = previewProvider.getPreview(sourceUri);
              if (previewPanel) {
                previewPanel.reveal(vscode.ViewColumn.Two, true);
              }
            }
          } else if (automaticallyShowPreviewOfMarkdownBeingEdited) {
            openPreviewToTheSide(sourceUri);
          }
        }
      }
    }),
  );

  // Changed editor color theme
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(theme => {
      const config = vscode.workspace.getConfiguration(
        'markdown-preview-enhanced',
      );
      if (
        config.get<PreviewColorScheme>('previewColorScheme') ===
        PreviewColorScheme.editorColorScheme
      ) {
        const providers = getAllPreviewProviders();
        providers.forEach(provider => {
          provider.updateConfiguration(true);
        });
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
      'markdown-preview-enhanced.openPreviewToTheSide',
      openPreviewToTheSide,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openPreview',
      openPreview,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.toggleScrollSync',
      toggleScrollSync,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.toggleLiveUpdate',
      toggleLiveUpdate,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.toggleBreakOnSingleNewLine',
      toggleBreakOnSingleNewLine,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openImageHelper',
      openImageHelper,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.runAllCodeChunks',
      runAllCodeChunksCommand,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.runCodeChunk',
      runCodeChunkCommand,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.syncPreview',
      syncPreview,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.insertNewSlide',
      insertNewSlide,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.insertTable',
      insertTable,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.insertPagebreak',
      insertPagebreak,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.createTOC',
      createTOC,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.revealLine', revealLine),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.insertImageUrl',
      insertImageUrl,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.pasteImageFile',
      pasteImageFile,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.uploadImageFile',
      uploadImageFile,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.refreshPreview',
      refreshPreview,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.openInBrowser', openInBrowser),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.htmlExport', htmlExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.chromeExport', chromeExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.princeExport', princeExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.eBookExport', eBookExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.pandocExport', pandocExport),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.markdownExport',
      markdownExport,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.webviewFinishLoading',
      webviewFinishLoading,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.cacheCodeChunkResult',
      cacheCodeChunkResult,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.runCodeChunk', runCodeChunk),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.runAllCodeChunks',
      runAllCodeChunks,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.clickTaskListCheckbox',
      clickTaskListCheckbox,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.setPreviewTheme',
      setPreviewTheme,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.customizeCssInWorkspace',
      customizeCSSInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openMermaidConfigInWorkspace',
      openMermaidConfigInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openMathJaxConfigInWorkspace',
      openMathJaxConfigInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openKaTeXConfigInWorkspace',
      openKaTeXConfigInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.extendParserInWorkspace',
      extendParserInWorkspace,
    ),
  );
}

function revealLine(uri, line) {
  const sourceUri = vscode.Uri.parse(uri);

  vscode.window.visibleTextEditors
    .filter(
      editor =>
        isMarkdownFile(editor.document) &&
        editor.document.uri.fsPath === sourceUri.fsPath,
    )
    .forEach(editor => {
      const sourceLine = Math.min(
        Math.floor(line),
        editor.document.lineCount - 1,
      );
      const fraction = line - sourceLine;
      const text = editor.document.lineAt(sourceLine).text;
      const start = Math.floor(fraction * text.length);
      editorScrollDelay = Date.now() + 500;
      editor.revealRange(
        new vscode.Range(sourceLine, start, sourceLine + 1, 0),
        vscode.TextEditorRevealType.InCenter,
      );
      editorScrollDelay = Date.now() + 500;
    });
}
