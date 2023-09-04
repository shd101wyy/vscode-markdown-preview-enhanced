import path = require('path');
import * as os from 'os';
import * as vscode from 'vscode';
import * as packageJSON from '../package.json';

/**
 * Format pathString if it is on Windows. Convert `c:\` like string to `C:\`
 * @param pathString
 */
function formatPathIfNecessary(pathString: string) {
  if (process.platform === 'win32') {
    pathString = pathString.replace(
      /^([a-zA-Z])\:\\/,
      (_, $1) => `${$1.toUpperCase()}:\\`,
    );
  }
  return pathString;
}

function getGlobalConfigPath(): string {
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
  return (
    document.languageId === 'markdown' &&
    document.uri.scheme !== 'markdown-preview-enhanced'
  ); // prevent processing of own documents
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
