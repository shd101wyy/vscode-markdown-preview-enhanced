import path = require('path');
import * as os from 'os';
import * as vscode from 'vscode';
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

export function getProjectDirectoryPath(uri: vscode.Uri): string {
  if (!uri) {
    return '';
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (workspaceFolder) {
    return formatPathIfNecessary(workspaceFolder.uri.fsPath);
  } else {
    return path.dirname(uri.fsPath);
  }
}

export function getGlobalConfigPath(): string {
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

// this method is called when your extension is deactivated
export function deactivate() {
  //
}
