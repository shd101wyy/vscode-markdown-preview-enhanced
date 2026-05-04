// For both node.js and browser environments
import { PreviewMode, utility } from 'crossnote';
import { SHA256 } from 'crypto-js';
import * as vscode from 'vscode';
import { WikilinkCompletionProvider } from './block-id-completion-provider';
import { WikilinkHoverProvider } from './wikilink-hover-provider';
import { PreviewColorScheme, getMPEConfig, updateMPEConfig } from './config';
import { findFragmentTargetLine } from './find-fragment-target-line';
import { pasteImageFile, uploadImageFile } from './image-helper';
import NotebooksManager from './notebooks-manager';
import { PreviewCustomEditorProvider } from './preview-custom-editor-provider';
import { PreviewProvider, getPreviewUri } from './preview-provider';
import { GraphViewProvider } from './graph-view-provider';
import {
  getBottomVisibleLine,
  getEditorActiveCursorLine,
  getPreviewMode,
  getTopVisibleLine,
  getWorkspaceFolderUri,
  isMarkdownFile,
} from './utils';
import * as path from 'path';

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
  try {
    await notebooksManager.updateWorkbenchEditorAssociationsBasedOnPreviewMode();
  } catch (error) {
    console.warn(
      '[Markdown Preview Enhanced] Could not update editor associations (may be expected in web context):',
      error,
    );
  }
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

    try {
      const previewProvider = await getPreviewContentProvider(uri);
      await previewProvider.initPreview({
        sourceUri: uri,
        document: editor.document,
        cursorLine: getEditorActiveCursorLine(editor),
        viewOptions: {
          viewColumn: vscode.ViewColumn.Two,
          preserveFocus: true,
        },
      });
    } catch (error) {
      console.error('[MPE] openPreviewToTheSide failed:', error);
      vscode.window.showErrorMessage(
        `MPE Preview failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

  async function openLockedPreviewToTheSide(uri?: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!uri) {
      uri = editor.document.uri;
    }

    try {
      const previewProvider = await getPreviewContentProvider(uri);
      await previewProvider.initPreview({
        sourceUri: uri,
        document: editor.document,
        cursorLine: getEditorActiveCursorLine(editor),
        viewOptions: {
          viewColumn: vscode.ViewColumn.Two,
          preserveFocus: true,
        },
      });
      previewProvider.lockSinglePreview();
    } catch (error) {
      console.error('[MPE] openLockedPreviewToTheSide failed:', error);
      vscode.window.showErrorMessage(
        `MPE Preview failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function togglePreviewLock(uri?: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const previewProvider = await getPreviewContentProvider(
      uri ?? editor.document.uri,
    );
    const locked = previewProvider.toggleSinglePreviewLock();
    vscode.window.showInformationMessage(
      locked
        ? 'Preview is locked to the current file.'
        : 'Preview is unlocked and will follow the active editor.',
    );
  }

  /**
   * Append a unique `^id` block-id marker to the line under the cursor (if
   * one isn't already there) and copy `[[note#^id]]` to the clipboard.
   * Mirrors Obsidian's "Copy block link" command — pair with crossnote's
   * already-shipped `^id` rendering and `[[note^id]]` resolution.
   */
  async function copyBlockReference() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor.');
      return;
    }
    if (!isMarkdownFile(editor.document)) {
      vscode.window.showWarningMessage(
        'Block references only work in Markdown files.',
      );
      return;
    }
    const doc = editor.document;
    const cursorLineNo = editor.selection.active.line;
    const lineText = doc.lineAt(cursorLineNo).text;
    if (!lineText.trim()) {
      vscode.window.showWarningMessage(
        'Place the cursor on the paragraph or list item you want to reference.',
      );
      return;
    }
    if (/^\s*#{1,6}\s/.test(lineText)) {
      vscode.window.showWarningMessage(
        'Headings already have anchor IDs. Use [[note#Heading]] to link to a heading.',
      );
      return;
    }
    if (isInFencedBlock(doc, cursorLineNo)) {
      vscode.window.showWarningMessage(
        'Cannot place a block ID inside a code fence.',
      );
      return;
    }

    // Reuse existing trailing ^id if present, otherwise generate one that
    // doesn't collide with any ^id elsewhere in the document.
    const trailingMatch = lineText.match(/\s+\^([a-zA-Z0-9_-]+)\s*$/);
    let blockId: string;
    if (trailingMatch) {
      blockId = trailingMatch[1];
    } else {
      blockId = generateUniqueBlockId(doc.getText());
      const ok = await editor.edit((edit) => {
        edit.insert(doc.lineAt(cursorLineNo).range.end, ` ^${blockId}`);
      });
      if (!ok) {
        vscode.window.showErrorMessage('Failed to insert block ID.');
        return;
      }
    }

    const noteName = path.basename(
      doc.fileName,
      path.extname(doc.fileName) || '.md',
    );
    const ref = `[[${noteName}#^${blockId}]]`;
    await vscode.env.clipboard.writeText(ref);
    vscode.window.showInformationMessage(`Copied block reference: ${ref}`);
  }

  function generateUniqueBlockId(text: string): string {
    const existing = new Set<string>();
    const re = /\s\^([a-zA-Z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      existing.add(m[1]);
    }
    // 6-char base36 — ~2.2B keyspace, comfortable for any document size.
    // Loop in case of collision; in practice we exit on the first try.
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
      if (!existing.has(id)) {
        return id;
      }
    }
    // Pathological fallback: timestamped id.
    return `b${Date.now().toString(36)}`;
  }

  function isInFencedBlock(doc: vscode.TextDocument, lineNo: number): boolean {
    let inBacktickFence = false;
    let inColonFence = false;
    for (let i = 0; i <= lineNo; i++) {
      const line = doc.lineAt(i).text;
      const backtickMatch = /^\s*(`{3,}|~{3,})/.exec(line);
      const colonMatch = /^\s*(:{3,})/.exec(line);
      if (backtickMatch && !inColonFence) {
        inBacktickFence = !inBacktickFence;
      } else if (colonMatch && !inBacktickFence) {
        // A bare ::: closes; ::: with info after opens.  We don't try to
        // tell apart code-language fences from div fences here — either
        // way a block ID inside a colon fence is a usage error.
        const rest = line.slice(colonMatch.index + colonMatch[1].length).trim();
        if (rest.length > 0) {
          inColonFence = true;
        } else if (inColonFence) {
          inColonFence = false;
        }
      }
    }
    return inBacktickFence || inColonFence;
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
    // Guard against stale webviewFinishLoading callbacks from a previous file
    // (can happen when the user switches files before the webview finishes loading)
    if (!previewProvider.shouldUpdateMarkdown(sourceUri)) {
      return;
    }
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

  async function openInBrowser(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.openInBrowser(sourceUri);
  }

  async function htmlExport(uri: string, offline: boolean) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.htmlExport(sourceUri, offline);
  }

  async function chromeExport(uri: string, type: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.chromeExport(sourceUri, type);
  }

  async function princeExport(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.princeExport(sourceUri);
  }

  async function eBookExport(uri: string, fileType: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.eBookExport(sourceUri, fileType);
  }

  async function pandocExport(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.pandocExport(sourceUri);
  }

  async function markdownExport(uri: string) {
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

  async function cacheCodeChunkResult(uri: string, id: string, result: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.cacheCodeChunkResult(sourceUri, id, result);
  }

  async function runCodeChunk(uri: string, codeChunkId: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.runCodeChunk(sourceUri, codeChunkId);
  }

  async function runAllCodeChunks(uri: string) {
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

  function clickTaskListCheckbox(uri: string, dataLine: number) {
    const sourceUri = vscode.Uri.parse(uri);
    const visibleTextEditors = vscode.window.visibleTextEditors;
    for (let i = 0; i < visibleTextEditors.length; i++) {
      const editor = visibleTextEditors[i];
      if (editor.document.uri.fsPath === sourceUri.fsPath) {
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

  function setPreviewTheme(_uri: string, theme: string) {
    updateMPEConfig('previewTheme', theme, true);
  }

  function togglePreviewZenMode(_uri: string) {
    updateMPEConfig(
      'enablePreviewZenMode',
      !getMPEConfig<boolean>('enablePreviewZenMode'),
      true,
    );
  }

  function setCodeBlockTheme(_uri: string, theme: string) {
    updateMPEConfig('codeBlockTheme', theme, true);
  }

  function setRevealjsTheme(_uri: string, theme: string) {
    updateMPEConfig('revealjsTheme', theme, true);
  }

  function setImageUploader(imageUploader: string) {
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
    uri: _uri,
    href,
    scheme,
  }: {
    uri: string;
    href: string;
    scheme: string;
  }) {
    href = decodeURIComponent(href);
    href = href
      .replace(/^vscode-resource:\/\//, '')
      .replace(/^vscode-webview-resource:\/\/(.+?)\//, '')
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
        vscode.window.showErrorMessage(String(error));
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
      let fileExists: boolean;
      try {
        fileExists = !!(await vscode.workspace.fs.stat(fileUri));
      } catch {
        fileExists = false;
      }

      if (fileExists) {
        const previewMode = getPreviewMode();
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.parse(
            openFilePath.split('#').slice(0, -1).join('#') || openFilePath,
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
            // Normal fragment.  Try, in order:
            //   1. Block-id reference (^abc) — match the LAST `^id` in
            //      the fragment so combined `Heading^abc` works too.
            //   2. Heading-id reference — match by HeadingIdGenerator.
            const targetLine = findFragmentTargetLine(
              editor.document.getText(),
              fileUri.fragment,
            );
            if (targetLine >= 0) {
              let viewPos = vscode.TextEditorRevealType.InCenter;
              if (editor.selection.active.line === targetLine) {
                viewPos = vscode.TextEditorRevealType.InCenterIfOutsideViewport;
              }
              const sel = new vscode.Selection(targetLine, 0, targetLine, 0);
              editor.selection = sel;
              editor.revealRange(sel, viewPos);
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

  async function clickTag({
    uri,
    tag,
    scheme,
  }: {
    uri: string;
    tag: string;
    scheme: string;
  }) {
    if (!tag) {
      return;
    }
    // Use crossnote's global tag index (TagReferenceMap) to find every
    // note that mentions `#tag`.  This is exactly the data the
    // Obsidian "Tags" pane works off — backlinks for files, separate
    // tag index for tags.
    const contextUri = uri ? vscode.Uri.parse(uri) : undefined;
    if (!contextUri) {
      return;
    }
    let notes: import('crossnote').Notes;
    try {
      notes = await notebooksManager.getNotesReferringToTag(contextUri, tag);
    } catch (error) {
      console.error('[MPE] clickTag lookup failed:', error);
      vscode.window.showErrorMessage(
        `MPE: failed to look up tag #${tag}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const filePaths = Object.keys(notes);
    if (filePaths.length === 0) {
      vscode.window.showInformationMessage(`No notes mention #${tag}.`);
      return;
    }

    type Item = vscode.QuickPickItem & { fsPath: string };
    const items: Item[] = filePaths.sort().map((relPath) => {
      const note = notes[relPath];
      const fsPath = vscode.Uri.joinPath(
        note.notebookPath,
        note.filePath,
      ).fsPath;
      return {
        label: note.title || relPath,
        description: relPath,
        fsPath,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Notes mentioning #${tag} (${items.length})`,
      matchOnDescription: true,
    });
    if (!picked) {
      return;
    }
    // Open the picked note via the existing clickTagA pipeline so the
    // file gets revealed in the right column and the previewMode is
    // honoured (custom preview editor vs text editor).
    await clickTagA({
      uri,
      href: encodeURIComponent(`${scheme}://${picked.fsPath}`),
      scheme,
    });
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
      vscode.window.showErrorMessage(String(error));
      console.error(error);
    }
  }

  async function toggleAlwaysShowBacklinksInPreview(
    _uri: string,
    flag: boolean,
  ) {
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
          // Check if the file matches any exclusion pattern
          const exclusionPatterns = (
            getMPEConfig<string[]>('disableAutoPreviewForFilePatterns') ?? []
          ).filter((p): p is string => typeof p === 'string');
          const fileName = path.basename(editor.document.fileName);
          const excluded = exclusionPatterns.some((pattern) => {
            // Simple wildcard matching: convert "*.note.md" to a regex
            const escaped = pattern
              .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '.*');
            return new RegExp(`^${escaped}$`, 'i').test(fileName);
          });

          const sourceUri = editor.document.uri;
          const automaticallyShowPreviewOfMarkdownBeingEdited =
            getMPEConfig<boolean>(
              'automaticallyShowPreviewOfMarkdownBeingEdited',
            );
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
              // Don't switch a locked preview to a different file
              if (previewProvider.isSinglePreviewLocked()) {
                return;
              }
              // Skip auto-switching single preview to an excluded file
              if (!excluded) {
                await previewProvider.initPreview({
                  sourceUri,
                  document: editor.document,
                  cursorLine: getEditorActiveCursorLine(editor),
                  viewOptions: {
                    viewColumn:
                      previewProvider.getPreviews(sourceUri)?.[0]?.viewColumn ??
                      vscode.ViewColumn.One,
                    preserveFocus: true,
                  },
                });
              }
            } else if (previewMode === PreviewMode.MultiplePreviews) {
              const previews = previewProvider.getPreviews(sourceUri);
              if (previews && previews.length > 0) {
                previews[0].reveal(/*vscode.ViewColumn.Two*/ undefined, true);
              }
            }
            // NOTE: For PreviewMode.PreviewsOnly, we don't need to do anything.
          } else if (automaticallyShowPreviewOfMarkdownBeingEdited) {
            // Skip auto-opening preview for an excluded file
            if (!excluded) {
              openPreviewToTheSide(sourceUri);
            }
          }
        }
      }
    }),
  );

  // Changed editor color theme
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((_theme) => {
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
      'markdown-preview-enhanced.openLockedPreviewToTheSide',
      openLockedPreviewToTheSide,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.togglePreviewLock',
      togglePreviewLock,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.copyBlockReference',
      copyBlockReference,
    ),
  );

  // Wikilink autocomplete:
  //   - `[[…` / `![[…`  → list workspace notes (and images for `![[`)
  //   - `[[Note#…`       → list headings in Note
  //   - `[[Note^…`       → list ^block-id markers in Note
  // The trigger characters open the suggestion list; the partial text
  // after each further filters it.  Provider routes by context.
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'markdown', scheme: 'file' },
        { language: 'markdown', scheme: 'untitled' },
      ],
      new WikilinkCompletionProvider(notebooksManager),
      '[',
      '#',
      '^',
    ),
  );

  // Hover preview for `[[Note]]`, `[[Note#Heading]]`, `[[Note^block]]`,
  // and the `![[…]]` embed forms.  The provider reads the target
  // file and returns a MarkdownString with the relevant fragment
  // (full file head, heading section, or block content).
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: 'markdown', scheme: 'file' },
        { language: 'markdown', scheme: 'untitled' },
      ],
      new WikilinkHoverProvider(),
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
    vscode.commands.registerCommand('_crossnote.clickTag', clickTag),
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

  // Graph view
  GraphViewProvider.notebooksManager = notebooksManager;
  GraphViewProvider.init(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openGraphView',
      async () => {
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        await GraphViewProvider.openGraphView(context, activeUri);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.openGraphView',
      async (sourceUri: string) => {
        const uri = vscode.Uri.parse(sourceUri);
        await GraphViewProvider.openGraphView(context, uri);
      },
    ),
  );

  // Refresh graph view when any markdown document is saved (force-rebuild relations)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.languageId === 'markdown') {
        await GraphViewProvider.refreshGraphData(doc.uri, true);
      }
    }),
  );

  // Update active file highlight in graph view when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && editor.document.languageId === 'markdown') {
        await GraphViewProvider.sendActiveFile(editor.document.uri);
      }
    }),
  );
}

function revealLine(uri: string, line: number) {
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
