import * as vscode from 'vscode';
import { initExtensionCommon } from './extension-common';

export async function activate(context: vscode.ExtensionContext) {
  try {
    await initExtensionCommon(context);
  } catch (error) {
    console.error('[Markdown Preview Enhanced] Failed to activate:', error);
    vscode.window.showErrorMessage(
      `Markdown Preview Enhanced failed to activate: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Do not re-throw — VS Code will mark extension as failed if we throw,
    // which prevents any partial command registration from working.
  }
}
// This method is called when your extension is deactivated
export function deactivate() {}
