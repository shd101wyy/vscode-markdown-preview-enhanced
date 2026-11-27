// For both node.js and browser environments
import { PreviewMode, utility } from 'crossnote';
import { SHA256 } from 'crypto-js';
import * as vscode from 'vscode';
import { setAiTranslatorContext, promptAndStoreApiKey } from './ai-translator';
import { WikilinkCompletionProvider } from './block-id-completion-provider';
import { WikilinkHoverProvider } from './wikilink-hover-provider';
import {
  WikilinkDocumentLinkProvider,
  openWikilinkTarget,
} from './wikilink-document-link-provider';
import {
  isExcludedFromAutoPreview,
  resolveAutoPreviewRouting,
} from './auto-preview-filter';
import { PreviewColorScheme, getMPEConfig, updateMPEConfig } from './config';
import {
  formatPreviewSourcePath,
  isMpePreviewTabInput,
} from './current-preview-source';
import { buildAndSaveWiki } from './crossnote-wiki';
import { customEditorProviderOptions } from './custom-editor-options';
import {
  getCenterPosition,
  getScreenRatio,
  getTopPositionForRatio,
} from './editor-screen-position';
import { findFragmentTargetLine } from './find-fragment-target-line';
import { pasteImageFile, uploadImageFile } from './image-helper';
import { parseLineFragment } from './line-fragment';
import { toggleTaskCheckboxLine } from './task-checkbox';
import NotebooksManager from './notebooks-manager';
import { PreviewCustomEditorProvider } from './preview-custom-editor-provider';
import {
  PreviewProvider,
  getActivePreviewSourceUri,
  getPreviewUri,
} from './preview-provider';
import { GraphViewProvider } from './graph-view-provider';
import {
  SIDE_PANEL_LEGACY_VIEW_ID,
  SIDE_PANEL_VIEW_ID,
  SidePanelPreviewProvider,
} from './side-panel-preview-provider';
import {
  createMissingMarkdownNote,
  getBottomVisibleLine,
  getEditorActiveCursorLine,
  getPreviewMode,
  getTopVisibleLine,
  getWorkspaceFolderUri,
  isMarkdownFile,
  isSameUri,
} from './utils';
import * as path from 'path';

let editorScrollDelay = Date.now();
// Cursor moves made on the preview's behalf are not synced back to it.
let selectionSyncDelay = Date.now();
// Sources whose preview shows a selection: the editor's, highlighted, or
// one made in the preview itself. The next editor selection change clears it.
const previewsWithSelection = new Set<string>();

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
  setAiTranslatorContext(context);
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

  function isDocumentExcludedFromAutoPreview(
    document: vscode.TextDocument,
  ): boolean {
    return isExcludedFromAutoPreview({
      scheme: document.uri.scheme,
      fileName: document.fileName,
      exclusionSchemes:
        getMPEConfig<string[]>('disableAutoPreviewForUriSchemes') ?? [],
      exclusionPatterns:
        getMPEConfig<string[]>('disableAutoPreviewForFilePatterns') ?? [],
    });
  }

  const sidePanelProvider = new SidePanelPreviewProvider(
    context,
    isDocumentExcludedFromAutoPreview,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SIDE_PANEL_VIEW_ID,
      sidePanelProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
    vscode.window.registerWebviewViewProvider(
      SIDE_PANEL_LEGACY_VIEW_ID,
      sidePanelProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  /**
   * The file a preview is opened for, and the text its page reads.
   *
   * A command is given the file by a menu or by another extension, which can
   * be while no editor is open or while the active editor shows another file
   * (vscode-mpe#2494): the page then reads the file itself. While the active
   * editor shows the file, the page reads what the editor shows and follows
   * its cursor. Nothing is returned, and the user is told, when no file is
   * named.
   */
  async function resolvePreviewTarget(uri?: vscode.Uri): Promise<
    | {
        uri: vscode.Uri;
        document: vscode.TextDocument;
        cursorLine?: number;
      }
    | undefined
  > {
    const editor = vscode.window.activeTextEditor;
    const targetUri = uri ?? editor?.document.uri;
    if (!targetUri) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Open a markdown file first.'),
      );
      return undefined;
    }
    // A link to the open file may carry a fragment. A query names another
    // document: a revision of the file in the Git extension.
    const withoutFragment = (of: vscode.Uri) =>
      of.with({ fragment: '' }).toString();
    if (
      editor &&
      withoutFragment(editor.document.uri) === withoutFragment(targetUri)
    ) {
      return {
        uri: targetUri,
        document: editor.document,
        cursorLine: getEditorActiveCursorLine(editor),
      };
    }
    return {
      uri: targetUri,
      document: await vscode.workspace.openTextDocument(targetUri),
    };
  }

  function showPreviewError(error: unknown) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('MPE Preview failed: {message}', {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  async function openPreviewInSidePanel(uri?: vscode.Uri) {
    try {
      const target = await resolvePreviewTarget(uri);
      if (!target) {
        return;
      }
      if (!isMarkdownFile(target.document)) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Open a markdown file first.'),
        );
        return;
      }
      await sidePanelProvider.openPreview({
        sourceUri: target.uri,
        document: target.document,
        cursorLine: target.cursorLine,
        preserveFocus: true,
      });
    } catch (error) {
      console.error('[MPE] openPreviewInSidePanel failed:', error);
      showPreviewError(error);
    }
  }

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

  /**
   * Open the preview of a file in an editor group. A failure is shown to the
   * user, whichever command it comes from.
   */
  // `uri` cannot be optional: a required parameter follows it.
  async function openPreviewOfFile(
    uri: vscode.Uri | undefined,
    viewOptions: { viewColumn: vscode.ViewColumn; preserveFocus: boolean },
    { lock = false }: { lock?: boolean } = {},
  ) {
    try {
      const target = await resolvePreviewTarget(uri);
      if (!target) {
        return;
      }
      const previewProvider = await getPreviewContentProvider(target.uri);
      await previewProvider.initPreview({
        sourceUri: target.uri,
        document: target.document,
        cursorLine: target.cursorLine,
        viewOptions,
      });
      if (lock) {
        previewProvider.lockSinglePreview();
      }
    } catch (error) {
      console.error('[MPE] openPreviewOfFile failed:', error);
      showPreviewError(error);
    }
  }

  async function openPreviewToTheSide(uri?: vscode.Uri) {
    await openPreviewOfFile(uri, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
  }

  async function openPreview(uri?: vscode.Uri) {
    await openPreviewOfFile(uri, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    });
  }

  async function openLockedPreviewToTheSide(uri?: vscode.Uri) {
    await openPreviewOfFile(
      uri,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { lock: true },
    );
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
        ? vscode.l10n.t('Preview is locked to the current file.')
        : vscode.l10n.t(
            'Preview is unlocked and will follow the active editor.',
          ),
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
      vscode.window.showWarningMessage(vscode.l10n.t('No active editor.'));
      return;
    }
    if (!isMarkdownFile(editor.document)) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Block references only work in Markdown files.'),
      );
      return;
    }
    const doc = editor.document;
    const cursorLineNo = editor.selection.active.line;
    const lineText = doc.lineAt(cursorLineNo).text;
    if (!lineText.trim()) {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Place the cursor on the paragraph or list item you want to reference.',
        ),
      );
      return;
    }
    if (/^\s*#{1,6}\s/.test(lineText)) {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Headings already have anchor IDs. Use [[note#Heading]] to link to a heading.',
        ),
      );
      return;
    }
    if (isInFencedBlock(doc, cursorLineNo)) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('Cannot place a block ID inside a code fence.'),
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
        vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to insert block ID.'),
        );
        return;
      }
    }

    const noteName = path.basename(
      doc.fileName,
      path.extname(doc.fileName) || '.md',
    );
    const ref = `[[${noteName}#^${blockId}]]`;
    await vscode.env.clipboard.writeText(ref);
    vscode.window.showInformationMessage(
      vscode.l10n.t('Copied block reference: {ref}', { ref }),
    );
  }

  /**
   * Resolve the source of the focused preview, warning the user when it cannot
   * be determined.
   */
  function resolveCurrentPreviewSourceOrWarn(): vscode.Uri | undefined {
    const sourceUri = getActivePreviewSourceUri();
    if (!sourceUri) {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Focus the Markdown Preview Enhanced preview whose source you want to use, then run this command again.',
        ),
      );
      return undefined;
    }
    return sourceUri;
  }

  async function copyCurrentSourceRelativePath() {
    const sourceUri = resolveCurrentPreviewSourceOrWarn();
    if (!sourceUri) {
      return;
    }
    if (!vscode.workspace.getWorkspaceFolder(sourceUri)) {
      vscode.window.showWarningMessage(
        vscode.l10n.t(
          'The source of the focused Markdown preview is outside the workspace, so it has no workspace-relative path.',
        ),
      );
      return;
    }

    const relativePath = vscode.workspace.asRelativePath(sourceUri);
    await vscode.env.clipboard.writeText(relativePath);
    vscode.window.showInformationMessage(
      vscode.l10n.t('Copied relative source path: {path}', {
        path: relativePath,
      }),
    );
  }

  async function copyCurrentSourcePath() {
    const sourceUri = resolveCurrentPreviewSourceOrWarn();
    if (!sourceUri) {
      return;
    }

    const sourcePath = formatPreviewSourcePath(sourceUri);
    await vscode.env.clipboard.writeText(sourcePath);
    vscode.window.showInformationMessage(
      vscode.l10n.t('Copied source path: {path}', { path: sourcePath }),
    );
  }

  async function openCurrentPreviewSourceInEditor(closePreview: boolean) {
    const sourceUri = resolveCurrentPreviewSourceOrWarn();
    if (!sourceUri) {
      return;
    }

    let previewTab: vscode.Tab | undefined;
    if (closePreview) {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab || !isMpePreviewTabInput(activeTab.input)) {
        vscode.window.showWarningMessage(
          vscode.l10n.t(
            'The focused tab is not a Markdown Preview Enhanced preview, so there is no preview to close.',
          ),
        );
        return;
      }
      previewTab = activeTab;
    }

    await openSourceInEditor(sourceUri, previewTab?.group.viewColumn);

    if (previewTab) {
      const closed = await vscode.window.tabGroups.close(previewTab, true);
      if (!closed) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Unable to close the current Markdown preview.'),
        );
      }
    }
  }

  async function openCurrentSourceInEditor() {
    await openCurrentPreviewSourceInEditor(false);
  }

  async function openCurrentSourceInEditorAndClosePreview() {
    await openCurrentPreviewSourceInEditor(true);
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
      vscode.window.showInformationMessage(
        vscode.l10n.t('Scroll Sync is enabled'),
      );
    } else {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Scroll Sync is disabled'),
      );
    }
  }

  async function toggleLiveUpdate() {
    const liveUpdate = !getMPEConfig<boolean>('liveUpdate');
    await updateMPEConfig('liveUpdate', liveUpdate, true);
    if (liveUpdate) {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Live Update is enabled'),
      );
    } else {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Live Update is disabled'),
      );
    }
  }

  async function toggleBreakOnSingleNewLine() {
    const breakOnSingleNewLine = !getMPEConfig<boolean>('breakOnSingleNewLine');
    updateMPEConfig('breakOnSingleNewLine', breakOnSingleNewLine, true);
    if (breakOnSingleNewLine) {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Break On Single New Line is enabled'),
      );
    } else {
      vscode.window.showInformationMessage(
        vscode.l10n.t('Break On Single New Line is disabled'),
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
          isSameUri(editor.document.uri, sourceUri),
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

  async function translateDocument(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.translateDocument(sourceUri);
  }

  async function restoreOriginal(uri: string) {
    const sourceUri = vscode.Uri.parse(uri);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.restoreOriginal(sourceUri);
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
    const cursor = textEditor.selections[0].active;
    const topRatio = getScreenRatio(textEditor, cursor);
    const previewProvider = await getPreviewContentProvider(sourceUri);
    previewProvider.postMessageToPreview(sourceUri, {
      command: 'changeTextEditorSelection',
      line: cursor.line,
      ...(topRatio === undefined
        ? {}
        : { character: cursor.character, topRatio }),
      forced: true,
    });
  }

  /**
   * Mirrors the editor's selection as a highlight in its preview, or clears
   * the highlight once nothing is selected.
   */
  async function highlightSelectionInPreview(textEditor: vscode.TextEditor) {
    const sourceUri = textEditor.document.uri;
    const key = sourceUri.toString();
    const selection = textEditor.selection;
    const enabled =
      getMPEConfig<boolean>('highlightEditorSelectionInPreview') ?? true;
    if (!enabled || selection.isEmpty) {
      if (!previewsWithSelection.delete(key)) {
        return;
      }
    } else {
      previewsWithSelection.add(key);
    }
    const previewProvider = await getPreviewContentProvider(sourceUri);
    if (!previewProvider.isAnySurfaceShowing(sourceUri)) {
      // postMessageToPreview falls back to the single-preview panel for
      // an unknown source — painting this editor's selection into a
      // preview of a different file would highlight the wrong text.
      return;
    }
    previewProvider.postMessageToPreview(sourceUri, {
      command: 'highlightSourceSelection',
      selection:
        enabled && !selection.isEmpty
          ? {
              start: {
                line: selection.start.line,
                character: selection.start.character,
              },
              end: {
                line: selection.end.line,
                character: selection.end.character,
              },
            }
          : null,
    });
  }

  async function clickTaskListCheckbox(
    uri: string,
    dataLine: number,
    offset?: number,
  ) {
    if (
      typeof uri !== 'string' ||
      !Number.isInteger(dataLine) ||
      dataLine < 0
    ) {
      return;
    }
    const checkboxOffset = Number.isInteger(offset) ? offset : undefined;
    const sourceUri = vscode.Uri.parse(uri);
    const matches = (candidate: vscode.Uri) => isSameUri(candidate, sourceUri);

    const editor = vscode.window.visibleTextEditors.find((item) =>
      matches(item.document.uri),
    );
    let document =
      editor?.document ??
      vscode.workspace.textDocuments.find((item) => matches(item.uri));
    if (!document) {
      // The open-file fallback is the one path that acts on a URI the
      // webview named without any editor behind it; keep it inside the
      // markdown extensions, exactly like the updateMarkdown write path.
      const allowedExts =
        getMPEConfig<string[]>('markdownFileExtensions') ?? [];
      const ext = path.extname(sourceUri.path).toLowerCase();
      if (!ext || !allowedExts.includes(ext)) {
        return;
      }
      try {
        document = await vscode.workspace.openTextDocument(sourceUri);
      } catch {
        return;
      }
    }
    if (dataLine >= document.lineCount) {
      return;
    }

    const original = document.lineAt(dataLine).text;
    const next = toggleTaskCheckboxLine(original, checkboxOffset);
    if (next === undefined || next === original) {
      return;
    }
    const range = new vscode.Range(
      new vscode.Position(dataLine, 0),
      new vscode.Position(dataLine, original.length),
    );
    if (editor && editor.document === document) {
      await editor.edit((edit) => {
        edit.replace(range, next);
      });
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, next);
    await vscode.workspace.applyEdit(edit);
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
        vscode.l10n.t('Please open a folder before customizing CSS'),
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
        vscode.l10n.t('Please open a folder before customizing config script'),
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
        vscode.l10n.t('Please open a folder before extending parser'),
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
        vscode.l10n.t(
          'Please open a folder before customizing preview html head',
        ),
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
      // VSCode's webview resource URLs encode the source URI's authority
      // into the host as `file+<encoded-authority>.vscode-resource.vscode-cdn.net`.
      // Non-[a-z0-9-] chars in the authority are encoded as `-XXXX` (4-digit
      // hex char code; e.g. `.` -> `-002e`). Decode it back so that
      // workspaces on a remote host (WSL via \\wsl.localhost\, SSH-Remote)
      // keep their authority when handed to `vscode.Uri.parse`. The
      // catch-all replacement below strips the entire host, yielding a
      // broken `file:///Ubuntu/...` URI whose fsPath has no UNC prefix and
      // resolves to nothing on the local Windows filesystem.
      .replace(
        /^https:\/\/file\+([^./]*)\.vscode-resource\.vscode-cdn\.net\//,
        (_match, encodedAuthority: string) => {
          const authority = encodedAuthority.replace(
            /-([0-9a-f]{4})/gi,
            (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)),
          );
          return `${scheme}://${authority}/`;
        },
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

      // determine from link fragment to which line (or line range) to
      // jump.  Line references take precedence over heading/block-id
      // fragments: a heading id that is all digits is vanishingly rare,
      // while `[note](file.ts#L100)`-style links are common.
      const lineTarget = parseLineFragment(fileUri.fragment);
      const line = lineTarget ? lineTarget.startLine : -1;

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

      // Obsidian-style click-to-create: if the wikilink target is a
      // markdown file (per `markdownFileExtensions`) that doesn't
      // exist yet, write an empty stub so the editor below opens a
      // real file instead of falling through to `vscode.open` and
      // showing a "File not found" prompt.  No-op for other URI
      // types (URLs, attachments, missing-but-non-markdown).
      if (!fileExists && (await createMissingMarkdownNote(fileUri))) {
        fileExists = true;
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
          // if there was a line fragment, jump to it.  A range
          // (`#L100-L104`) selects the whole lines; a single line puts
          // the cursor at its start.
          if (lineTarget) {
            const lastLine = Math.min(
              lineTarget.endLine,
              editor.document.lineCount - 1,
            );
            let viewPos = vscode.TextEditorRevealType.InCenter;
            if (editor.selection.active.line === lineTarget.startLine) {
              viewPos = vscode.TextEditorRevealType.InCenterIfOutsideViewport;
            }
            const sel =
              lastLine > lineTarget.startLine
                ? new vscode.Selection(
                    lineTarget.startLine,
                    0,
                    lastLine,
                    editor.document.lineAt(lastLine).text.length,
                  )
                : new vscode.Selection(
                    lineTarget.startLine,
                    0,
                    lineTarget.startLine,
                    0,
                  );
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
        vscode.l10n.t('MPE: failed to look up tag #{tag}: {message}', {
          tag,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }

    const filePaths = Object.keys(notes);
    if (filePaths.length === 0) {
      vscode.window.showInformationMessage(
        vscode.l10n.t('No notes mention #{tag}.', { tag }),
      );
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
    // honoured (custom preview editor vs text editor).  Build the URI
    // via `vscode.Uri.file(...)` so backslashes in `picked.fsPath` on
    // Windows get converted to a proper `file:///C:/...` form;
    // template-string concat (`${scheme}://${picked.fsPath}`) would
    // produce a malformed `file://C:\foo\bar`.
    const pickedUri = vscode.Uri.file(picked.fsPath);
    await clickTagA({
      uri,
      href: encodeURIComponent(pickedUri.toString()),
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

  async function openCrossnote() {
    const url = 'https://github.com/shd101wyy/crossnote';
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
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

  async function openSourceInEditor(
    sourceUri: vscode.Uri,
    viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
  ) {
    const document = await vscode.workspace.openTextDocument(sourceUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn,
    });
  }

  async function openExternalEditor(uri: string) {
    await openSourceInEditor(vscode.Uri.parse(uri));
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

      const allowedExts =
        getMPEConfig<string[]>('markdownFileExtensions') ?? [];
      const ext = path.extname(sourceUri.path).toLowerCase();
      if (!ext || !allowedExts.includes(ext)) {
        return;
      }

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
      if (event.affectsConfiguration('markdown-preview-enhanced')) {
        notebooksManager.updateAllNotebooksConfig();
        if (
          event.affectsConfiguration(
            'markdown-preview-enhanced.automaticallyShowPreviewInSidePanel',
          ) &&
          getMPEConfig<boolean>('automaticallyShowPreviewInSidePanel')
        ) {
          void autoOpenPreviewForEditor(vscode.window.activeTextEditor);
        }
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
        if (Date.now() < selectionSyncDelay) {
          return;
        }

        await highlightSelectionInPreview(event.textEditor);

        const cursor = event.selections[0].active;
        // Where the cursor's row is on screen, counting wrapped rows; the
        // preview puts the same text at the same height.
        const screenRatio = getScreenRatio(event.textEditor, cursor);
        if (screenRatio !== undefined) {
          const previewProvider = await getPreviewContentProvider(
            event.textEditor.document.uri,
          );
          previewProvider.postMessageToPreview(event.textEditor.document.uri, {
            command: 'changeTextEditorSelection',
            line: cursor.line,
            character: cursor.character,
            topRatio: screenRatio,
          });
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
          (cursor.line - firstVisibleScreenRow) /
          (lastVisibleScreenRow - firstVisibleScreenRow);

        const previewProvider = await getPreviewContentProvider(
          event.textEditor.document.uri,
        );
        previewProvider.postMessageToPreview(event.textEditor.document.uri, {
          command: 'changeTextEditorSelection',
          line: cursor.line,
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

          const previewProvider = await getPreviewContentProvider(sourceUri);
          const atTop = topLine === 0;
          const atBottom =
            Math.floor(bottomLine) === textEditor.document.lineCount - 1;

          // Align the preview to the text in the middle of the editor.
          const center =
            atTop || atBottom ? undefined : getCenterPosition(textEditor);
          if (center) {
            previewProvider.postMessageToPreview(sourceUri, {
              command: 'changeTextEditorSelection',
              line: center.position.line,
              character: center.position.character,
              topRatio: center.ratio,
            });
            return;
          }

          let midLine;
          let topRatio;
          if (atTop) {
            midLine = 0;
          } else if (atBottom) {
            midLine = bottomLine;
          } else {
            midLine = Math.floor((topLine + bottomLine) / 2);
            // Where that line is in the editor, so the preview puts it at
            // the same height instead of its default.
            topRatio = (midLine - topLine) / (bottomLine - topLine);
          }
          previewProvider.postMessageToPreview(sourceUri, {
            command: 'changeTextEditorSelection',
            line: midLine,
            topRatio,
          });
        }
      }
    }),
  );

  /**
   * Open preview automatically when `automaticallyShowPreviewInSidePanel` or
   * `automaticallyShowPreviewOfMarkdownBeingEdited` is enabled.
   */
  async function autoOpenPreviewForEditor(
    editor: vscode.TextEditor | undefined,
  ) {
    if (!editor?.document?.uri) {
      return;
    }
    if (!isMarkdownFile(editor.document)) {
      return;
    }

    const excluded = isDocumentExcludedFromAutoPreview(editor.document);
    const sourceUri = editor.document.uri;
    const automaticallyShowPreviewInSidePanel =
      getMPEConfig<boolean>('automaticallyShowPreviewInSidePanel') ?? false;
    const automaticallyShowPreviewOfMarkdownBeingEdited =
      getMPEConfig<boolean>('automaticallyShowPreviewOfMarkdownBeingEdited') ??
      false;

    const routing = resolveAutoPreviewRouting({
      excluded,
      automaticallyShowPreviewInSidePanel,
      automaticallyShowPreviewOfMarkdownBeingEdited,
      sidePanelVisible: sidePanelProvider.isVisible(),
      sidePanelHasSource: sidePanelProvider.hasSource(),
      sidePanelLocked: sidePanelProvider.isLocked(),
    });

    if (routing.openOrUpdateSidePanel) {
      try {
        await sidePanelProvider.openPreview({
          sourceUri,
          document: editor.document,
          cursorLine: getEditorActiveCursorLine(editor),
          preserveFocus: true,
        });
      } catch (error) {
        console.error('[MPE] autoOpenSidePanel failed:', error);
      }
    }

    const previewMode = getPreviewMode();
    const previewProvider = await getPreviewContentProvider(sourceUri);
    if (previewProvider.isPanelPreviewOn(sourceUri)) {
      if (
        previewMode === PreviewMode.SinglePreview &&
        // Only the shared single-preview panel follows the active
        // editor. Custom editor panels are pinned to their documents —
        // when they are the only previews open there is nothing to
        // switch, and re-initializing them here would reload their
        // webview on every editor switch (vscode-mpe#2433).
        previewProvider.hasSinglePreviewPanel() &&
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
                previewProvider.getPanelPreviews(sourceUri)?.[0]?.viewColumn ??
                vscode.ViewColumn.One,
              preserveFocus: true,
            },
          });
        }
      } else if (
        previewMode === PreviewMode.MultiplePreviews &&
        routing.allowSplitEditorAutoOpen
      ) {
        // Only surface an already-open preview when the user has opted
        // into auto-showing previews without Side Panel auto-preview.
        const previews = previewProvider.getPanelPreviews(sourceUri);
        if (previews && previews.length > 0) {
          previews[0].reveal(/*vscode.ViewColumn.Two*/ undefined, true);
        }
      }
      // NOTE: For PreviewMode.PreviewsOnly, we don't need to do anything.
    } else if (routing.allowSplitEditorAutoOpen) {
      openPreviewToTheSide(sourceUri);
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(autoOpenPreviewForEditor),
  );

  if (vscode.window.tabGroups?.onDidChangeTabs) {
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        if (event.closed.length > 0) {
          // Only closes that actually involve the previewed source may
          // clear/switch the preview — a source opened from the Explorer
          // has no tab of its own and must survive unrelated closes.
          const closed = event.closed
            .map((tab) =>
              (tab.input as { uri?: vscode.Uri } | undefined)?.uri?.toString(),
            )
            .filter((uri): uri is string => !!uri);
          return sidePanelProvider.handleSourcePossiblyClosed(closed);
        }
      }),
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      return sidePanelProvider.handleSourcePossiblyClosed([
        document.uri.toString(),
      ]);
    }),
  );
  // The active editor can already be set before the handler above is
  // registered: when VS Code itself is launched by opening a markdown file
  // (double-click, `code file.md`), editor restoration races extension
  // activation, so the onDidChangeActiveTextEditor event for that editor
  // fires before the handler exists and is missed. Run the check once for
  // the editor that is already active. Fixes #2364.
  void autoOpenPreviewForEditor(vscode.window.activeTextEditor);

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
      'markdown-preview-enhanced.openPreviewInSidePanel',
      openPreviewInSidePanel,
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.toggleSidePanelPreviewLock',
      async () => {
        const locked = await sidePanelProvider.toggleLock();
        vscode.window.showInformationMessage(
          locked
            ? vscode.l10n.t('Side Panel preview is locked to the current file.')
            : vscode.l10n.t(
                'Side Panel preview is unlocked and will follow the active editor.',
              ),
        );
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.lockSidePanelPreview',
      async () => {
        await sidePanelProvider.setLocked(true);
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.unlockSidePanelPreview',
      async () => {
        await sidePanelProvider.setLocked(false);
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.refreshSidePanelPreview',
      async () => {
        await sidePanelProvider.refresh();
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openSidePanelSourceInEditor',
      async () => {
        await sidePanelProvider.openSourceInEditor();
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.popOutSidePanelPreviewToEditor',
      async () => {
        await sidePanelProvider.popOutToEditorTab();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.copyCurrentSourceRelativePath',
      copyCurrentSourceRelativePath,
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.copyCurrentSourcePath',
      copyCurrentSourcePath,
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openCurrentSourceInEditor',
      openCurrentSourceInEditor,
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openCurrentSourceInEditorAndClosePreview',
      openCurrentSourceInEditorAndClosePreview,
    ),
  );

  if (getMPEConfig<boolean>('enableWikiLinkSyntax')) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'markdown-preview-enhanced.copyBlockReference',
        copyBlockReference,
      ),
    );
  }

  // Wikilink autocomplete:
  // ...
  if (getMPEConfig<boolean>('enableWikiLinkSyntax')) {
    const wikilinkCompletionProvider = new WikilinkCompletionProvider(
      notebooksManager,
    );
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        [
          { language: 'markdown', scheme: 'file' },
          { language: 'markdown', scheme: 'untitled' },
          { language: 'quarto', scheme: 'file' },
          { language: 'quarto', scheme: 'untitled' },
          { language: 'prompt', scheme: 'file' },
          { language: 'prompt', scheme: 'untitled' },
          { language: 'instructions', scheme: 'file' },
          { language: 'instructions', scheme: 'untitled' },
          { language: 'chatagent', scheme: 'file' },
          { language: 'chatagent', scheme: 'untitled' },
          { language: 'skill', scheme: 'file' },
          { language: 'skill', scheme: 'untitled' },
        ],
        wikilinkCompletionProvider,
        '[',
        '#',
        '^',
      ),
      wikilinkCompletionProvider,
    );
  }

  // Hover preview for `[[Note]]`, `[[Note#Heading]]`, `[[Note^block]]`,
  // and the `![[…]]` embed forms.  The provider reads the target
  // file and returns a MarkdownString with the relevant fragment
  // (full file head, heading section, or block content).
  if (getMPEConfig<boolean>('enableWikiLinkSyntax')) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        [
          { language: 'markdown', scheme: 'file' },
          { language: 'markdown', scheme: 'untitled' },
          { language: 'quarto', scheme: 'file' },
          { language: 'quarto', scheme: 'untitled' },
          { language: 'prompt', scheme: 'file' },
          { language: 'prompt', scheme: 'untitled' },
          { language: 'instructions', scheme: 'file' },
          { language: 'instructions', scheme: 'untitled' },
          { language: 'chatagent', scheme: 'file' },
          { language: 'chatagent', scheme: 'untitled' },
          { language: 'skill', scheme: 'file' },
          { language: 'skill', scheme: 'untitled' },
        ],
        new WikilinkHoverProvider(notebooksManager),
      ),
    );
  }

  // Editor-side `Follow link` (alt+click / Ctrl+click) for
  // `[[Note]]` / `![[Note]]` wikilinks.  Standard
  // `[text](./Note.md)` links are already handled by VSCode's
  // built-in markdown link provider; we only emit links for the
  // wikilink shapes.  Click invokes `_crossnote.openWikilinkTarget`
  // which auto-creates missing markdown notes (Obsidian-style)
  // and jumps to fragment lines for `[[Note#Heading]]` /
  // `[[Note^block]]`.
  if (getMPEConfig<boolean>('enableWikiLinkSyntax')) {
    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(
        [
          { language: 'markdown', scheme: 'file' },
          { language: 'markdown', scheme: 'untitled' },
          { language: 'quarto', scheme: 'file' },
          { language: 'quarto', scheme: 'untitled' },
          { language: 'prompt', scheme: 'file' },
          { language: 'prompt', scheme: 'untitled' },
          { language: 'instructions', scheme: 'file' },
          { language: 'instructions', scheme: 'untitled' },
          { language: 'chatagent', scheme: 'file' },
          { language: 'chatagent', scheme: 'untitled' },
          { language: 'skill', scheme: 'file' },
          { language: 'skill', scheme: 'untitled' },
        ],
        new WikilinkDocumentLinkProvider(notebooksManager),
      ),
      vscode.commands.registerCommand(
        '_crossnote.openWikilinkTarget',
        (sourceUriString: string, wikilinkBody: string) =>
          openWikilinkTarget(sourceUriString, wikilinkBody, notebooksManager),
      ),
    );
  }

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
      '_crossnote.revealSourcePosition',
      revealSourcePosition,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.selectSourceRange',
      selectSourceRange,
    ),
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
    vscode.commands.registerCommand(
      '_crossnote.translateDocument',
      translateDocument,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.restoreOriginal',
      restoreOriginal,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.htmlExport', htmlExport),
  );

  // The preview context menu's "Export standalone HTML (wiki)" item. The
  // argument is the previewed note; the wiki itself covers the whole
  // workspace, which the save dialog defaults next to.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.exportStandaloneWiki',
      (uri: string) => buildAndSaveWiki(context, vscode.Uri.parse(uri)),
    ),
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
    vscode.commands.registerCommand('_crossnote.openCrossnote', openCrossnote),
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
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.setAiTranslationApiKey',
      async () => {
        await promptAndStoreApiKey();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.translateNow',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Open a markdown file first.'),
          );
          return;
        }
        const previewProvider = await getPreviewContentProvider(
          editor.document.uri,
        );
        previewProvider.translateDocument(editor.document.uri);
      },
    ),
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.showOriginalTranslation',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage(
            vscode.l10n.t('Open a markdown file first.'),
          );
          return;
        }
        const previewProvider = await getPreviewContentProvider(
          editor.document.uri,
        );
        previewProvider.restoreOriginal(editor.document.uri);
      },
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
      customEditorProviderOptions,
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
      if (isMarkdownFile(doc)) {
        await GraphViewProvider.refreshGraphData(doc.uri, true);
      }
    }),
  );

  // Update active file highlight in graph view when editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && isMarkdownFile(editor.document)) {
        await GraphViewProvider.sendActiveFile(editor.document.uri);
      }
    }),
  );
}

/**
 * Scrolls the editor so the source position lands `screenRatio` of the way
 * down it (0 = top, 1 = bottom), matching where the preview shows it.
 * With `moveCursor`, also puts the cursor there; focus stays in the preview.
 */
function revealSourcePosition(
  uri: string,
  line: number,
  character: number,
  screenRatio: number,
  moveCursor: boolean,
) {
  revealSourceRange(uri, line, character, line, character, screenRatio, {
    select: moveCursor,
  });
}

/**
 * Selects a source range in the editor, matching a selection made in the
 * preview, and scrolls so its start lands `screenRatio` of the way down.
 */
function selectSourceRange(
  uri: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  screenRatio: number,
) {
  revealSourceRange(
    uri,
    startLine,
    startCharacter,
    endLine,
    endCharacter,
    screenRatio,
    { select: true },
  );
}

function revealSourceRange(
  uri: string,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  screenRatio: number,
  { select }: { select: boolean },
) {
  if (
    ![startLine, startCharacter, endLine, endCharacter, screenRatio].every(
      Number.isFinite,
    )
  ) {
    return;
  }
  const sourceUri = vscode.Uri.parse(uri);
  const ratio = Math.min(Math.max(screenRatio, 0), 1);
  const toPosition = (line: number, character: number) =>
    new vscode.Position(
      Math.max(Math.floor(line), 0),
      Math.max(Math.floor(character), 0),
    );

  vscode.window.visibleTextEditors
    .filter(
      (editor) =>
        isMarkdownFile(editor.document) &&
        isSameUri(editor.document.uri, sourceUri),
    )
    .forEach((editor) => {
      const start = editor.document.validatePosition(
        toPosition(startLine, startCharacter),
      );
      const end = editor.document.validatePosition(
        toPosition(endLine, endCharacter),
      );
      editorScrollDelay = Date.now() + 500;
      if (select) {
        selectionSyncDelay = Date.now() + 500;
        editor.selection = new vscode.Selection(start, end);
        if (!start.isEqual(end)) {
          // The preview now shows its own selection of this text.
          previewsWithSelection.add(editor.document.uri.toString());
        }
      }
      const top = getTopPositionForRatio(editor, start, ratio);
      if (top) {
        editor.revealRange(
          new vscode.Range(top, top),
          vscode.TextEditorRevealType.AtTop,
        );
      } else {
        editor.revealRange(
          new vscode.Range(start, start),
          vscode.TextEditorRevealType.InCenter,
        );
      }
      editorScrollDelay = Date.now() + 500;
    });
}

function revealLine(uri: string, line: number) {
  const sourceUri = vscode.Uri.parse(uri);

  vscode.window.visibleTextEditors
    .filter(
      (editor) =>
        isMarkdownFile(editor.document) &&
        isSameUri(editor.document.uri, sourceUri),
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
