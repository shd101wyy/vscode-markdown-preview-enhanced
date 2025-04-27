// For both node.js and browser environments
import { HeadingIdGenerator, PreviewMode, utility } from 'crossnote';
import { SHA256 } from 'crypto-js';
import * as vscode from 'vscode';
import { PreviewColorScheme, getMPEConfig, updateMPEConfig } from './config';
import { pasteImageFile, uploadImageFile } from './image-helper';
import NotebooksManager from './notebooks-manager';
import { PreviewCustomEditorProvider } from './preview-custom-editor-provider';
import { PreviewProvider, getPreviewUri } from './preview-provider';
import {
  getBottomVisibleLine,
  getEditorActiveCursorLine,
  getPreviewMode,
  getTopVisibleLine,
  getWorkspaceFolderUri,
  isMarkdownFile,
} from './utils';
import path = require('path');

let editorScrollDelay = Date.now();

// hide default vscode markdown preview buttons if necessary
const hideDefaultVSCodeMarkdownPreviewButtons = vscode.workspace
  .getConfiguration('markdown-preview-enhanced')
  .get<boolean>('hideDefaultVSCodeMarkdownPreviewButtons');
if (hideDefaultVSCodeMarkdownPreviewButtons) {
  vscode.commands.executeCommand(
    'setContext',
    'hasCustomMarkdownPreview',
    true,
  );
}

export async function initExtensionCommon(context: vscode.ExtensionContext) {
  const notebooksManager = new NotebooksManager(context);
  await notebooksManager.updateWorkbenchEditorAssociationsBasedOnPreviewMode();
  PreviewProvider.notebooksManager = notebooksManager;

  function getCurrentWorkingDirectory() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      return getWorkspaceFolderUri(activeEditor.document.uri);
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      const workspaceFolderUri = workspaceFolders[0]?.uri;
      return workspaceFolderUri;
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
    previewProvider.initPreview({
      sourceUri: uri,
      document: editor.document,
      cursorLine: getEditorActiveCursorLine(editor),
      viewOptions: {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
      },
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
    previewProvider.initPreview({
      sourceUri: uri,
      document: editor.document,
      cursorLine: getEditorActiveCursorLine(editor),
      viewOptions: {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      },
    });
  }

  async function toggleScrollSync() {
    const scrollSync = !getMPEConfig<boolean>('scrollSync');
    await updateMPEConfig('scrollSync', scrollSync, true);
    if (scrollSync) {
      vscode.window.showInformationMessage('Scroll Sync is enabled');
    } else {
      vscode.window.showInformationMessage('Scroll Sync is disabled');
    }
  }

  async function toggleLiveUpdate() {
    const liveUpdate = !getMPEConfig<boolean>('liveUpdate');
    await updateMPEConfig('liveUpdate', liveUpdate, true);
    if (liveUpdate) {
      vscode.window.showInformationMessage('Live Update is enabled');
    } else {
      vscode.window.showInformationMessage('Live Update is disabled');
    }
  }

  async function toggleBreakOnSingleNewLine() {
    const breakOnSingleNewLine = !getMPEConfig<boolean>('breakOnSingleNewLine');
    updateMPEConfig('breakOnSingleNewLine', breakOnSingleNewLine, true);
    if (breakOnSingleNewLine) {
      vscode.window.showInformationMessage(
        'Break On Single New Line is enabled',
      );
    } else {
      vscode.window.showInformationMessage(
        'Break On Single New Line is disabled',
      );
    }
  }

  function insertNewSlide() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(editor.selection.active, '<!-- slide -->\n\n');
      });
    }
  }

  function insertPagebreak() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document && editor.edit) {
      editor.edit((textEdit) => {
        textEdit.insert(editor.selection.active, '<!-- pagebreak -->\n\n');
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

  async function openImageHelper() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const uri = editor.document.uri;
    const previewProvider = await getPreviewContentProvider(uri);
    previewProvider.openImageHelper(uri);
  }

  async function webviewFinishLoading({
    uri,
    systemColorScheme,
  }: {
    uri: string;
    systemColorScheme: 'light' | 'dark';
  }) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    notebooksManager.setSystemColorScheme(systemColorScheme);
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
    previewProvider.postMessageToPreview(sourceUri, {
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
    previewProvider.postMessageToPreview(sourceUri, {
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
    previewProvider.postMessageToPreview(sourceUri, {
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
        editor.edit((edit) => {
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
    updateMPEConfig('previewTheme', theme, true);
  }

  function togglePreviewZenMode(uri) {
    updateMPEConfig(
      'enablePreviewZenMode',
      !getMPEConfig<boolean>('enablePreviewZenMode'),
      true,
    );
  }

  function setCodeBlockTheme(uri, theme) {
    updateMPEConfig('codeBlockTheme', theme, true);
  }

  function setRevealjsTheme(uri, theme) {
    updateMPEConfig('revealjsTheme', theme, true);
  }

  function setImageUploader(imageUploader) {
    updateMPEConfig('imageUploader', imageUploader, true);
  }

  function openConfigFileInWorkspace(
    workspaceUri: vscode.Uri,
    filePath: vscode.Uri,
  ) {
    vscode.workspace.fs.stat(filePath).then(
      () => {
        vscode.commands.executeCommand('vscode.open', filePath);
      },
      async () => {
        await notebooksManager.updateNotebookConfig(workspaceUri, true);
        vscode.commands.executeCommand('vscode.open', filePath);
      },
    );
  }

  function customizeCSSInWorkspace() {
    const currentWorkingDirectory = getCurrentWorkingDirectory();
    if (!currentWorkingDirectory) {
      return vscode.window.showErrorMessage(
        'Please open a folder before customizing CSS',
      );
    }
    const styleLessFile = vscode.Uri.joinPath(
      currentWorkingDirectory,
      './.crossnote/style.less',
    );

    openConfigFileInWorkspace(currentWorkingDirectory, styleLessFile);
  }

  function openConfigScriptInWorkspace() {
    const currentWorkingDirectory = getCurrentWorkingDirectory();
    if (!currentWorkingDirectory) {
      return vscode.window.showErrorMessage(
        'Please open a folder before customizing config script',
      );
    }

    const configScriptPath = vscode.Uri.joinPath(
      currentWorkingDirectory,
      './.crossnote/config.js',
    );

    openConfigFileInWorkspace(currentWorkingDirectory, configScriptPath);
  }

  function extendParserInWorkspace() {
    const currentWorkingDirectory = getCurrentWorkingDirectory();
    if (!currentWorkingDirectory) {
      return vscode.window.showErrorMessage(
        'Please open a folder before extending parser',
      );
    }

    const parserConfigPath = vscode.Uri.joinPath(
      currentWorkingDirectory,
      './.crossnote/parser.js',
    );

    openConfigFileInWorkspace(currentWorkingDirectory, parserConfigPath);
  }

  function customizePreviewHtmlHeadInWorkspace() {
    const currentWorkingDirectory = getCurrentWorkingDirectory();
    if (!currentWorkingDirectory) {
      return vscode.window.showErrorMessage(
        'Please open a folder before customizing preview html head',
      );
    }

    const headHtmlPath = vscode.Uri.joinPath(
      currentWorkingDirectory,
      './.crossnote/head.html',
    );

    openConfigFileInWorkspace(currentWorkingDirectory, headHtmlPath);
  }

  async function clickTagA({
    uri,
    href,
    scheme,
  }: {
    uri: string;
    href: string;
    scheme: string;
  }) {
    href = decodeURIComponent(href);
    href = href
      .replace(/^vscode\-resource:\/\//, '')
      .replace(/^vscode\-webview\-resource:\/\/(.+?)\//, '')
      .replace(/^file\/\/\//, '${scheme}:///')
      .replace(
        /^https:\/\/file\+\.vscode-resource.vscode-cdn.net\//,
        `${scheme}:///`,
      )
      .replace(/^https:\/\/.+\.vscode-cdn.net\//, `${scheme}:///`)
      .replace(
        /^https?:\/\/(.+?)\.vscode-webview-test.com\/vscode-resource\/file\/+/,
        `${scheme}:///`,
      )
      .replace(
        /^https?:\/\/file(.+?)\.vscode-webview\.net\/+/,
        `${scheme}:///`,
      );
    if (
      ['.pdf', '.xls', '.xlsx', '.doc', '.ppt', '.docx', '.pptx'].indexOf(
        path.extname(href),
      ) >= 0
    ) {
      try {
        utility.openFile(href);
      } catch (error) {
        vscode.window.showErrorMessage(error);
      }
    } else if (href.startsWith(`${scheme}://`)) {
      // openFilePath = href.slice(8) # remove protocol
      const openFilePath = decodeURI(href);
      const fileUri = vscode.Uri.parse(openFilePath);

      // determine from link fragment to which line to jump
      let line = -1;
      const found = fileUri.fragment.match(/^L(\d+)/);
      if (found) {
        line = parseInt(found[1], 10);
        if (line > 0) {
          line = line - 1;
        }
      }

      // find if there is already opened such file
      // and remember in which view column it is
      let col = vscode.ViewColumn.One;
      tgrLoop: for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
          if (tab.input instanceof vscode.TabInputText) {
            if (tab.input.uri.path === fileUri.path) {
              col = tabGroup.viewColumn;
              break tgrLoop;
            }
          }
        }
      }

      //  open file if needed, if not we will use already opened editor
      // (by specifying view column in which it is already shown)
      let fileExists = false;
      try {
        fileExists = !!(await vscode.workspace.fs.stat(fileUri));
      } catch (error) {
        fileExists = false;
      }

      if (fileExists) {
        const previewMode = getPreviewMode();
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(
            openFilePath
              .split('#')
              .slice(0, -1)
              .join('#') || openFilePath,
          ),
        );
        // Open custom editor
        if (
          previewMode === PreviewMode.PreviewsOnly &&
          isMarkdownFile(document)
        ) {
          /*
          // NOTE: This doesn't work for the `line`
          // so we use the `initPreview` instead.  
          const options: vscode.TextDocumentShowOptions = {
            selection: new vscode.Selection(line, 0, line, 0),
            viewColumn: vscode.ViewColumn.Active,
          };
          vscode.commands.executeCommand(
            'vscode.openWith',
            fileUri,
            'markdown-preview-enhanced',
            options,
          );
          */
          const previewProvider = await getPreviewContentProvider(fileUri);
          previewProvider.initPreview({
            sourceUri: fileUri,
            document,
            cursorLine: line,
            viewOptions: {
              viewColumn: vscode.ViewColumn.Active,
              preserveFocus: true,
            },
          });
        } else {
          // Open fileUri
          const editor = await vscode.window.showTextDocument(document, {
            viewColumn: col,
          });
          // if there was line fragment, jump to line
          if (line >= 0) {
            let viewPos = vscode.TextEditorRevealType.InCenter;
            if (editor.selection.active.line === line) {
              viewPos = vscode.TextEditorRevealType.InCenterIfOutsideViewport;
            }
            const sel = new vscode.Selection(line, 0, line, 0);
            editor.selection = sel;
            editor.revealRange(sel, viewPos);
          } else if (fileUri.fragment) {
            // Normal fragment
            // Find heading with this id
            const headingIdGenerator = new HeadingIdGenerator();
            const text = editor.document.getText();
            const lines = text.split('\n');
            let i = 0;
            for (i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.match(/^#+\s+/)) {
                const heading = line.replace(/^#+\s+/, '');
                const headingId = headingIdGenerator.generateId(heading);
                if (headingId === fileUri.fragment) {
                  // Reveal editor line
                  let viewPos = vscode.TextEditorRevealType.InCenter;
                  if (editor.selection.active.line === i) {
                    viewPos =
                      vscode.TextEditorRevealType.InCenterIfOutsideViewport;
                  }
                  const sel = new vscode.Selection(i, 0, i, 0);
                  editor.selection = sel;
                  editor.revealRange(sel, viewPos);
                  break;
                }
              }
            }
          }
        }
      } else {
        vscode.commands.executeCommand(
          'vscode.open',
          fileUri,
          vscode.ViewColumn.One,
        );
      }
    } else if (href.match(/^https?:\/\//)) {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(href));
    } else {
      utility.openFile(href);
    }
  }

  async function openChangelog() {
    const url =
      'https://github.com/shd101wyy/vscode-markdown-preview-enhanced/releases';
    return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
  }

  async function openDocumentation() {
    const url = 'https://shd101wyy.github.io/markdown-preview-enhanced/';
    return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
  }

  async function openIssues() {
    const url =
      'https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues';
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
  }

  async function openSponsors() {
    const url = 'https://github.com/sponsors/shd101wyy/';
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
  }

  async function openExternalEditor(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const document = await vscode.workspace.openTextDocument(sourceUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  async function showBacklinks({
    uri,
    forceRefreshingNotes,
    backlinksSha,
  }: {
    uri: string;
    forceRefreshingNotes: boolean;
    backlinksSha: string;
  }) {
    const sourceUri = vscode.Uri.parse(uri);
    const backlinks = await notebooksManager.getNoteBacklinks(
      sourceUri,
      forceRefreshingNotes,
    );
    const sha = SHA256(JSON.stringify(backlinks)).toString();
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.postMessageToPreview(sourceUri, {
      command: 'backlinks',
      sourceUri: sourceUri.toString(),
      backlinks: sha !== backlinksSha ? backlinks : null,
      hasUpdate: sha !== backlinksSha,
    });
  }

  async function updateMarkdown(uri: string, markdown: string) {
    try {
      const sourceUri = vscode.Uri.parse(uri);
      // Write markdown to file
      await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(markdown));
      // Update preview
      const previewProvider = await getPreviewContentProvider(sourceUri);
      previewProvider.updateMarkdown(sourceUri);
    } catch (error) {
      vscode.window.showErrorMessage(error);
      console.error(error);
    }
  }

  async function toggleAlwaysShowBacklinksInPreview(uri, flag) {
    updateMPEConfig('alwaysShowBacklinksInPreview', flag, true);
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (isMarkdownFile(document)) {
        const previewProvider = await getPreviewContentProvider(document.uri);
        previewProvider.updateMarkdown(document.uri, true);
      } else {
        // Check if there is change under `${workspaceDir}/.crossnote` directory
        // and the filename is in one of below
        // - style.less
        // - config.js
        // - parser.js
        // - head.html
        // If so, refresh the preview of the workspace.
        const workspaceUri = getWorkspaceFolderUri(document.uri);
        const workspaceDir = workspaceUri.fsPath;
        const relativePath = path.relative(workspaceDir, document.uri.fsPath);
        if (
          relativePath.startsWith('.crossnote') &&
          ['style.less', 'config.js', 'parser.js', 'head.html'].includes(
            path.basename(relativePath),
          )
        ) {
          const provider = await getPreviewContentProvider(document.uri);
          await notebooksManager.updateNotebookConfig(workspaceUri);
          provider.refreshAllPreviews();
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles(async ({ files }) => {
      for (const file of files) {
        // Check if there is change under `${workspaceDir}/.crossnote` directory
        // and filename is in one of below
        // - style.less
        // - config.js
        // - parser.js
        // - head.html
        // If so, refresh the preview of the workspace.
        const workspaceUri = getWorkspaceFolderUri(file);
        const workspaceDir = workspaceUri.fsPath;
        const relativePath = path.relative(workspaceDir, file.fsPath);
        if (
          relativePath.startsWith('.crossnote') &&
          ['style.less', 'config.js', 'parser.js', 'head.html'].includes(
            path.basename(relativePath),
          )
        ) {
          const provider = await getPreviewContentProvider(file);
          await notebooksManager.updateNotebookConfig(workspaceUri);
          provider.refreshAllPreviews();
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (isMarkdownFile(event.document)) {
        const previewProvider = await getPreviewContentProvider(
          event.document.uri,
        );
        previewProvider.update(event.document.uri);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      // console.log(
      //   'onDidChangeConfiguration: ',
      //   event.affectsConfiguration('markdown-preview-enhanced'),
      // );
      if (event.affectsConfiguration('markdown-preview-enhanced')) {
        notebooksManager.updateAllNotebooksConfig();
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      if (isMarkdownFile(event.textEditor.document)) {
        const previewMode = getPreviewMode();
        if (previewMode === PreviewMode.PreviewsOnly) {
          return;
        }

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
        previewProvider.postMessageToPreview(event.textEditor.document.uri, {
          command: 'changeTextEditorSelection',
          line: event.selections[0].active.line,
          topRatio,
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges(async (event) => {
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
          previewProvider.postMessageToPreview(sourceUri, {
            command: 'changeTextEditorSelection',
            line: midLine,
          });
        }
      }
    }),
  );

  /**
   * Open preview automatically if the `automaticallyShowPreviewOfMarkdownBeingEdited` is on.
   */
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      // Check if editor and document exist
      if (editor && editor.document && editor.document.uri) {
        // Get the list of schemes to exclude from the configuration
        const exclusionSchemes =
          getMPEConfig<string[]>('disableAutoPreviewForUriSchemes') ?? [];

        // Check if the current document's scheme should be excluded
        for (const scheme of exclusionSchemes) {
          if (editor.document.uri.scheme.startsWith(scheme)) {
            return; // Don't trigger preview if scheme matches exclusion list
          }
        }

        // Original check: Proceed only if it's considered a Markdown file
        if (isMarkdownFile(editor.document)) {
          const sourceUri = editor.document.uri;
          const automaticallyShowPreviewOfMarkdownBeingEdited = getMPEConfig<
            boolean
          >('automaticallyShowPreviewOfMarkdownBeingEdited');
          const previewMode = getPreviewMode();
          /**
           * Is using single preview and the preview is on.
           * When we switched text ed()tor, update preview to that text editor.
           */
          const previewProvider = await getPreviewContentProvider(sourceUri);
          if (previewProvider.isPreviewOn(sourceUri)) {
            if (
              previewMode === PreviewMode.SinglePreview &&
              !previewProvider.previewHasTheSameSingleSourceUri(sourceUri)
            ) {
              previewProvider.initPreview({
                sourceUri,
                document: editor.document,
                cursorLine: getEditorActiveCursorLine(editor),
                viewOptions: {
                  viewColumn:
                    previewProvider.getPreviews(sourceUri)?.at(0)?.viewColumn ??
                    vscode.ViewColumn.One,
                  preserveFocus: true,
                },
              });
            } else if (previewMode === PreviewMode.MultiplePreviews) {
              const previews = previewProvider.getPreviews(sourceUri);
              if (previews && previews.length > 0) {
                previews[0].reveal(/*vscode.ViewColumn.Two*/ undefined, true);
              }
            }
            // NOTE: For PreviewMode.PreviewsOnly, we don't need to do anything.
          } else if (automaticallyShowPreviewOfMarkdownBeingEdited) {
            openPreviewToTheSide(sourceUri);
          }
        }
      }
    }),
  );

  // Changed editor color theme
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      if (
        getMPEConfig<PreviewColorScheme>('previewColorScheme') ===
        PreviewColorScheme.editorColorScheme
      ) {
        notebooksManager.updateAllNotebooksConfig();
      }
    }),
  );

  /*
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      // console.log('onDidOpenTextDocument: ', document.uri.fsPath);
    }),
  );
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
      '_crossnote.togglePreviewZenMode',
      togglePreviewZenMode,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.setCodeBlockTheme',
      setCodeBlockTheme,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.setRevealjsTheme',
      setRevealjsTheme,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.setImageUploader',
      setImageUploader,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.openChangelog', openChangelog),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.openDocumentation',
      openDocumentation,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.openIssues', openIssues),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.openSponsors', openSponsors),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.openExternalEditor',
      openExternalEditor,
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
      'markdown-preview-enhanced.openConfigScriptInWorkspace',
      openConfigScriptInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.extendParserInWorkspace',
      extendParserInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.customizePreviewHtmlHeadInWorkspace',
      customizePreviewHtmlHeadInWorkspace,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.clickTagA', clickTagA),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.showBacklinks', showBacklinks),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.updateMarkdown',
      updateMarkdown,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.toggleAlwaysShowBacklinksInPreview',
      toggleAlwaysShowBacklinksInPreview,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'markdown-preview-enhanced',
      new PreviewCustomEditorProvider(context),
    ),
  );
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
      editorScrollDelay = Date.now() + 500;
      editor.revealRange(
        new vscode.Range(sourceLine, start, sourceLine + 1, 0),
        vscode.TextEditorRevealType.InCenter,
      );
      editorScrollDelay = Date.now() + 500;
    });
}
