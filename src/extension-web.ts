import * as vscode from 'vscode';
import { initExtensionCommon } from './extension-common';

export function activate(context: vscode.ExtensionContext) {
  console.log('Enter extension-web.ts');

  // console.log(`typeof window: `, typeof window);
  console.log(`typeof global: `, typeof global);
  console.log(`typeof globalThis: `, typeof globalThis);

  // Init the extension-common module
  initExtensionCommon(context);
}
// This method is called when your extension is deactivated
export function deactivate() {}
