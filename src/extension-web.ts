import * as vscode from 'vscode';
import { initExtensionCommon } from './extension-common';

export function activate(context: vscode.ExtensionContext) {
  // Init the extension-common module
  initExtensionCommon(context);
}
// This method is called when your extension is deactivated
export function deactivate() {}
