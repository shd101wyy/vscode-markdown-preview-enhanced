import path = require('path');
import { PreviewMode } from 'crossnote';
import * as os from 'os';
import * as vscode from 'vscode';
import * as packageJSON from '../package.json';
import { getMPEConfig } from './config';

/**
 * Format pathString if it is on Windows. Convert `c:\` like string to `C:\`
 * @param pathString
 */
/*
function formatPathIfNecessary(pathString: string) {
  if (process.platform === 'win32') {
    pathString = pathString.replace(
      /^([a-zA-Z])\:\\/,
      (_, $1) => `${$1.toUpperCase()}:\\`,
    );
  }
  return pathString;
}
*/

/**
 * Get the workspace folder uri of the given uri
 * @param uri
 */
export function getWorkspaceFolderUri(uri: vscode.Uri) {
  const workspace = vscode.workspace.getWorkspaceFolder(uri);
  if (workspace) {
    return workspace.uri;
  }

  const workspaces = vscode.workspace.workspaceFolders;
  if (workspaces) {
    for (let i = 0; i < workspaces.length; i++) {
      const workspace = workspaces[i];
      if (uri.fsPath.startsWith(workspace.uri.fsPath)) {
        return workspace.uri;
      }
    }
  }

  // Return the folder of uri
  return vscode.Uri.file(path.dirname(uri.fsPath));
}

function getGlobalConfigPath(): string {
  const configPath = getMPEConfig<string>('configPath');
  if (typeof configPath === 'string' && configPath && configPath !== '') {
    return configPath.replace(/^~/, os.homedir());
  }

  if (process.platform === 'win32') {
    return path.join(os.homedir(), './.crossnote');
  } else {
    if (
      typeof process.env.XDG_CONFIG_HOME === 'string' &&
      process.env.XDG_CONFIG_HOME !== ''
    ) {
      return path.resolve(process.env.XDG_CONFIG_HOME, './crossnote');
    } else {
      return path.resolve(os.homedir(), './.local/state/crossnote');
    }
  }
}
export const globalConfigPath = getGlobalConfigPath();

export function isMarkdownFile(document: vscode.TextDocument) {
  let flag =
    (document.languageId === 'markdown' || document.languageId === 'quarto') &&
    document.uri.scheme !== 'markdown-preview-enhanced'; // prevent processing of own documents

  if (!flag) {
    // Check file extension
    const markdownFileExtensions =
      getMPEConfig<string[]>('markdownFileExtensions') ?? [];
    const fileName = document.fileName;
    const ext = path.extname(fileName).toLowerCase();
    flag = markdownFileExtensions.includes(ext);
  }

  return flag;
}

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getTopVisibleLine(
  editor: vscode.TextEditor,
): number | undefined {
  if (!editor['visibleRanges'].length) {
    return undefined;
  }

  const firstVisiblePosition = editor['visibleRanges'][0].start;
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
  editor: vscode.TextEditor,
): number | undefined {
  if (!editor['visibleRanges'].length) {
    return undefined;
  }

  const firstVisiblePosition = editor['visibleRanges'][0].end;
  const lineNumber = firstVisiblePosition.line;
  let text = '';
  if (lineNumber < editor.document.lineCount) {
    text = editor.document.lineAt(lineNumber).text;
  }
  const progress = firstVisiblePosition.character / (text.length + 2);
  return lineNumber + progress;
}

export function isVSCodeWebExtension() {
  return process.env.IS_VSCODE_WEB_EXTENSION === 'true';
}

export function isVSCodewebExtensionDevMode() {
  return process.env.IS_VSCODE_WEB_EXTENSION_DEV_MODE === 'true';
}

export function getCrossnoteVersion() {
  return packageJSON.dependencies['crossnote'];
}

export function getPreviewMode() {
  return getMPEConfig<PreviewMode>('previewMode');
}

export function getEditorActiveCursorLine(editor: vscode.TextEditor) {
  return editor.selections[0].active.line ?? 0;
}
